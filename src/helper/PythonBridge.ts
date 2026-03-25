import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { spawn } from 'child_process';

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
    const payload: PythonBridgePayload = {
        scriptPath,
        className,
        constructorArgs: [constructorArg],
        method,
        args
    };

    const response = await runPythonBridge(pythonPath, payload);
    if (!response.ok) {
        return response.error;
    }
    return response.result;
}

function resolvePythonPath(): string {
    const configPython = vscode.workspace.getConfiguration('abaprfc').get<string>('pythonPath');
    if (configPython && fs.existsSync(configPython)) {
        return configPython;
    }

    const vscodePython = vscode.workspace.getConfiguration('python').get<string>('defaultInterpreterPath');
    if (vscodePython && vscodePython !== 'python' && fs.existsSync(vscodePython)) {
        return vscodePython;
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

    throw new Error(
        'Python interpreter not found. Install Python 3.8+ or set "abaprfc.pythonPath".'
    );
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

async function runPythonBridge(
    pythonPath: string,
    payload: PythonBridgePayload
): Promise<PythonBridgeResponse> {
    return new Promise<PythonBridgeResponse>((resolve, reject) => {
        const child = spawn(pythonPath, [bridgeScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8'
            }
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
                reject(new Error(
                    stderr.trim() ||
                    stdout.trim() ||
                    `Python bridge failed with exit code ${code}.`
                ));
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
