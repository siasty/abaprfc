import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execFileSync, spawn } from 'child_process';
import { abapLogger } from './AbapLogger';

const bridgeScript = path.join(__dirname, '../../src/py', 'bridge.py');

interface PythonBridgePayload {
    scriptPath: string;
    className: string;
    constructorArgs: any[];
    method: string;
    args: any[];
}

interface PythonBridgeSuccess {
    ok: true;
    result: any;
}

interface PythonBridgeFailure {
    ok: false;
    error: {
        type: string;
        message: string | string[];
        code?: string;
        key?: string;
        msg_class?: string;
        msg_type?: string;
        msg_number?: string;
        msg_v1?: string;
        traceback?: string[];
    };
}

type PythonBridgeResponse = PythonBridgeSuccess | PythonBridgeFailure;

export function createPythonProxy(scriptPath: string, className: string, constructorArg: any): any {
    return new Proxy({}, {
        get(_target, prop) {
            if (prop === 'then') {
                return undefined;
            }
            return async (...args: any[]) => {
                return callPythonMethod(scriptPath, className, constructorArg, String(prop), ...args);
            };
        }
    });
}

export async function callPythonMethod(
    scriptPath: string,
    className: string,
    constructorArg: any,
    method: string,
    ...args: any[]
): Promise<any> {
    const pythonPath = resolvePythonPath();
    const sdkLibPath = resolveSapNwRfcSdkLibPath();
    const payload: PythonBridgePayload = {
        scriptPath,
        className,
        constructorArgs: [constructorArg],
        method,
        args
    };

    try {
        const response = await runPythonBridge(pythonPath, payload, sdkLibPath);
        if (!response.ok) {
            return response.error;
        }
        return response.result;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        abapLogger.error(
            'PythonBridge',
            new Error(
                `Python bridge call failed for ${className}.${method} using ${path.basename(scriptPath)}: ${message}`
            )
        );
        throw err;
    }
}

function resolvePythonPath(): string {
    const configPython = vscode.workspace.getConfiguration('abaprfc').get<string>('pythonPath');
    const configured = resolveConfiguredPythonPath(configPython);
    if (configured) {
        return configured;
    }

    const vscodePython = vscode.workspace.getConfiguration('python').get<string>('defaultInterpreterPath');
    const configuredFromPythonExt = resolveConfiguredPythonPath(vscodePython);
    if (configuredFromPythonExt) {
        return configuredFromPythonExt;
    }

    const candidates = process.platform === 'win32'
        ? ['python.exe', 'python3.exe', 'py.exe']
        : ['python3', 'python'];

    for (const candidate of candidates) {
        const found = findExecutableInPath(candidate);
        if (found) {
            return found;
        }
    }

    for (const candidate of getCommonPythonLocations()) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    const storePythonAlias = getWindowsStorePythonAliasFromRegistry();
    if (storePythonAlias) {
        return storePythonAlias;
    }

    throw new Error(
        'Python interpreter not found. Install Python 3.8+ or set "abaprfc.pythonPath".'
    );
}

function resolveConfiguredPythonPath(configValue?: string): string | undefined {
    const trimmed = (configValue ?? '').trim();
    if (!trimmed) {
        return undefined;
    }

    if (fs.existsSync(trimmed)) {
        return trimmed;
    }

    if (looksLikeWindowsAppsAlias(trimmed)) {
        return trimmed;
    }

    if (!path.isAbsolute(trimmed)) {
        const direct = findExecutableInPath(trimmed);
        if (direct) {
            return direct;
        }

        if (process.platform === 'win32' && !trimmed.toLowerCase().endsWith('.exe')) {
            const withExe = findExecutableInPath(`${trimmed}.exe`);
            if (withExe) {
                return withExe;
            }
        }

        // Allow explicit command names like "python" or "py"
        return trimmed;
    }

    return undefined;
}

function findExecutableInPath(executable: string): string | undefined {
    const pathValue = process.env.PATH || process.env.Path || '';
    const pathEntries = pathValue.split(path.delimiter).filter(Boolean);

    for (const entry of pathEntries) {
        const candidate = path.join(entry, executable);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function getCommonPythonLocations(): string[] {
    if (process.platform !== 'win32') {
        return [];
    }

    const localAppData = process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local');
    return [
        path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe'),
        path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
        path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
    ];
}

function getWindowsStorePythonAliasFromRegistry(): string | undefined {
    if (process.platform !== 'win32') {
        return undefined;
    }

    try {
        const output = execFileSync(
            'reg.exe',
            ['query', 'HKCU\\Software\\Python\\PythonCore', '/s'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        );

        if (!/InstallPath/i.test(output)) {
            return undefined;
        }

        const localAppData = process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Local');
        const aliasPath = path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe');
        return looksLikeWindowsAppsAlias(aliasPath) ? aliasPath : undefined;
    } catch {
        return undefined;
    }
}

function looksLikeWindowsAppsAlias(candidate: string): boolean {
    return process.platform === 'win32' &&
        candidate.toLowerCase().includes(`${path.sep}windowsapps${path.sep}`) &&
        candidate.toLowerCase().endsWith(`${path.sep}python.exe`);
}

function resolveSapNwRfcSdkLibPath(): string | undefined {
    const configured = vscode.workspace.getConfiguration('abaprfc').get<string>('sapNwRfcSdkPath');
    if (configured) {
        const normalized = normalizeSdkLibPath(configured);
        if (normalized) {
            return normalized;
        }
    }

    const commonLocations = process.platform === 'win32'
        ? [
            'C:\\nwrfcsdk\\lib',
            'C:\\SAP\\nwrfcsdk\\lib',
            'C:\\Program Files\\SAP\\nwrfcsdk\\lib',
            'C:\\Program Files (x86)\\SAP\\nwrfcsdk\\lib'
        ]
        : [];

    for (const candidate of commonLocations) {
        if (fs.existsSync(path.join(candidate, 'sapnwrfc.dll'))) {
            return candidate;
        }
    }

    return undefined;
}

function normalizeSdkLibPath(inputPath: string): string | undefined {
    const trimmed = inputPath.trim();
    if (!trimmed) {
        return undefined;
    }

    const asGiven = path.normalize(trimmed);
    if (fs.existsSync(path.join(asGiven, 'sapnwrfc.dll'))) {
        return asGiven;
    }

    const asLibDir = path.join(asGiven, 'lib');
    if (fs.existsSync(path.join(asLibDir, 'sapnwrfc.dll'))) {
        return asLibDir;
    }

    return undefined;
}

async function runPythonBridge(
    pythonPath: string,
    payload: PythonBridgePayload,
    sdkLibPath?: string
): Promise<PythonBridgeResponse> {
    return new Promise<PythonBridgeResponse>((resolve, reject) => {
        const env = {
            ...process.env,
            PYTHONIOENCODING: 'utf-8'
        } as NodeJS.ProcessEnv;

        if (sdkLibPath) {
            env.ABAPRFC_NWRFC_LIB = sdkLibPath;
            env.PATH = `${sdkLibPath}${path.delimiter}${env.PATH ?? ''}`;
        }

        const child = spawn(pythonPath, [bridgeScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env
        });

        let stdout = '';
        let stderr = '';

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        child.stdout.on('data', chunk => {
            stdout += chunk;
        });

        child.stderr.on('data', chunk => {
            stderr += chunk;
        });

        child.on('error', err => {
            reject(err);
        });

        child.on('close', code => {
            if (code !== 0) {
                reject(formatPythonBridgeFailure(stdout, stderr, code));
                return;
            }

            try {
                const parsed = JSON.parse(stdout) as PythonBridgeResponse;
                resolve(parsed);
            } catch {
                reject(new Error(
                    `Python bridge returned invalid JSON. ${stderr.trim() || stdout.trim()}`
                ));
            }
        });

        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
    });
}

function formatPythonBridgeFailure(stdout: string, stderr: string, code: number | null): Error {
    const rawStdout = stdout.trim();
    const rawStderr = stderr.trim();

    if (rawStdout) {
        try {
            const parsed = JSON.parse(rawStdout) as PythonBridgeFailure;
            if (parsed && parsed.ok === false) {
                const message = Array.isArray(parsed.error.message)
                    ? parsed.error.message.join(' ')
                    : parsed.error.message;
                return new Error(`${parsed.error.type}: ${message || `Python bridge failed with exit code ${code}.`}`);
            }
        } catch {
            // Ignore invalid JSON and fall back to the raw bridge output.
        }
    }

    return new Error(rawStderr || rawStdout || `Python bridge failed with exit code ${code}.`);
}
