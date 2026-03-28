import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ChildProcessWithoutNullStreams, execFileSync, spawn } from 'child_process';
import { abapLogger } from './AbapLogger';

const bridgeScript = path.join(__dirname, '../../src/py', 'bridge.py');
const sessionBridgeScript = path.join(__dirname, '../../src/py', 'session_bridge.py');

interface PythonBridgePayload {
    scriptPath: string;
    className: string;
    constructorArgs: any[];
    method: string;
    args: any[];
}

interface SerializedPythonError {
    type: string;
    message: string | string[];
    code?: string;
    key?: string;
    msg_class?: string;
    msg_type?: string;
    msg_number?: string;
    msg_v1?: string;
    traceback?: string[];
}

interface PythonBridgeSuccess {
    ok: true;
    result: any;
}

interface PythonBridgeFailure {
    ok: false;
    error: SerializedPythonError;
}

type PythonBridgeResponse = PythonBridgeSuccess | PythonBridgeFailure;

interface BridgeOptions {
    preferSession?: boolean;
}

interface SessionInfo {
    dest: string;
    sessionId: string;
    fingerprint: string;
    connectedAt: number;
}

interface SessionBridgeRequest {
    id: string;
    action: 'connect' | 'disconnect' | 'call' | 'dispose';
    sessionId?: string;
    connectionConfig?: any;
    payload?: PythonBridgePayload;
}

interface SessionBridgeSuccess {
    id: string;
    ok: true;
    result: any;
}

interface SessionBridgeFailure {
    id: string;
    ok: false;
    error: SerializedPythonError;
}

type SessionBridgeResponse = SessionBridgeSuccess | SessionBridgeFailure;

const activeSessionsByDest = new Map<string, SessionInfo>();
const activeSessionsByFingerprint = new Map<string, SessionInfo>();
const sessionChangeEmitter = new vscode.EventEmitter<void>();

let sessionWorker: PersistentSessionWorker | undefined;

export const onDidChangePythonSessions = sessionChangeEmitter.event;

export function createPythonProxy(
    scriptPath: string,
    className: string,
    constructorArg: any,
    options?: BridgeOptions
): any {
    const bridgeOptions = hasBridgeOptions(options) ? [options] : [];
    return new Proxy({}, {
        get(_target, prop) {
            if (prop === 'then') {
                return undefined;
            }
            return async (...args: any[]) => {
                return callPythonMethod(
                    scriptPath,
                    className,
                    constructorArg,
                    String(prop),
                    ...args,
                    ...bridgeOptions
                );
            };
        }
    });
}

export async function callPythonMethod(
    scriptPath: string,
    className: string,
    constructorArg: any,
    method: string,
    ...rawArgs: any[]
): Promise<any> {
    const options = extractBridgeOptions(rawArgs);
    const args = options ? rawArgs.slice(0, -1) : rawArgs;
    const payload: PythonBridgePayload = {
        scriptPath,
        className,
        constructorArgs: [constructorArg],
        method,
        args
    };

    const session = options?.preferSession === false
        ? undefined
        : findSessionForConnection(constructorArg);

    if (session) {
        try {
            return await getSessionWorker().send({
                action: 'call',
                sessionId: session.sessionId,
                payload
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            abapLogger.error(
                'PythonBridge',
                new Error(
                    `Python session bridge call failed for ${className}.${method} using ${path.basename(scriptPath)}: ${message}`
                )
            );
            throw err;
        }
    }

    const pythonPath = resolvePythonPath();
    const sdkLibPath = resolveSapNwRfcSdkLibPath();

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

export async function connectPythonSession(dest: string, connectionConfig: any): Promise<void> {
    const fingerprint = getConnectionFingerprint(connectionConfig);
    if (!fingerprint) {
        throw new Error(`Connection ${dest} is missing required RFC parameters.`);
    }

    if (activeSessionsByDest.has(dest)) {
        await disconnectPythonSession(dest);
    }

    const sessionId = `${dest}:${Date.now()}`;
    await getSessionWorker().send({
        action: 'connect',
        sessionId,
        connectionConfig
    });

    const info: SessionInfo = {
        dest,
        sessionId,
        fingerprint,
        connectedAt: Date.now()
    };

    activeSessionsByDest.set(dest, info);
    activeSessionsByFingerprint.set(fingerprint, info);
    sessionChangeEmitter.fire();
}

export async function disconnectPythonSession(dest: string): Promise<void> {
    const session = activeSessionsByDest.get(dest);
    if (!session) {
        return;
    }

    try {
        await getSessionWorker().send({
            action: 'disconnect',
            sessionId: session.sessionId
        });
    } finally {
        removeSession(session);
        sessionChangeEmitter.fire();
    }
}

export function isPythonSessionConnected(dest: string): boolean {
    return activeSessionsByDest.has(dest);
}

export function getPythonSessionConnectedAt(dest: string): number | undefined {
    return activeSessionsByDest.get(dest)?.connectedAt;
}

export async function disposePythonSessions(): Promise<void> {
    try {
        if (sessionWorker) {
            await sessionWorker.stop();
        }
    } finally {
        sessionWorker = undefined;
        clearAllSessions();
    }
}

function extractBridgeOptions(args: any[]): BridgeOptions | undefined {
    if (args.length === 0) {
        return undefined;
    }

    const last = args[args.length - 1];
    if (!last || typeof last !== 'object' || Array.isArray(last)) {
        return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(last, 'preferSession')) {
        return undefined;
    }

    return last as BridgeOptions;
}

function hasBridgeOptions(options: BridgeOptions | undefined): options is BridgeOptions {
    return !!options && Object.prototype.hasOwnProperty.call(options, 'preferSession');
}

function findSessionForConnection(connectionConfig: any): SessionInfo | undefined {
    const fingerprint = getConnectionFingerprint(connectionConfig);
    if (!fingerprint) {
        return undefined;
    }
    return activeSessionsByFingerprint.get(fingerprint);
}

function getConnectionFingerprint(connectionConfig: any): string | undefined {
    if (!connectionConfig || typeof connectionConfig !== 'object') {
        return undefined;
    }

    const ashost = String(connectionConfig.ashost ?? '').trim().toLowerCase();
    const user = String(connectionConfig.user ?? '').trim().toUpperCase();
    const sysnr = String(connectionConfig.sysnr ?? '').trim();
    const client = String(connectionConfig.client ?? '').trim();
    const lang = String(connectionConfig.lang ?? '').trim().toUpperCase();

    if (!ashost || !user || !sysnr || !client) {
        return undefined;
    }

    return [ashost, sysnr, client, user, lang].join('|');
}

function getSessionWorker(): PersistentSessionWorker {
    if (!sessionWorker) {
        sessionWorker = new PersistentSessionWorker(
            resolvePythonPath(),
            resolveSapNwRfcSdkLibPath(),
            () => {
                sessionWorker = undefined;
                clearAllSessions();
            }
        );
    }
    return sessionWorker;
}

function removeSession(session: SessionInfo): void {
    activeSessionsByDest.delete(session.dest);

    const indexed = activeSessionsByFingerprint.get(session.fingerprint);
    if (indexed?.sessionId === session.sessionId) {
        activeSessionsByFingerprint.delete(session.fingerprint);
    }
}

function clearAllSessions(): void {
    const hadSessions = activeSessionsByDest.size > 0 || activeSessionsByFingerprint.size > 0;
    activeSessionsByDest.clear();
    activeSessionsByFingerprint.clear();
    if (hadSessions) {
        sessionChangeEmitter.fire();
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
        const env = buildPythonEnv(sdkLibPath);
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

function buildPythonEnv(sdkLibPath?: string): NodeJS.ProcessEnv {
    const env = {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
    } as NodeJS.ProcessEnv;

    if (sdkLibPath) {
        env.ABAPRFC_NWRFC_LIB = sdkLibPath;
        env.PATH = `${sdkLibPath}${path.delimiter}${env.PATH ?? ''}`;
    }

    return env;
}

function formatPythonBridgeFailure(stdout: string, stderr: string, code: number | null): Error {
    const rawStdout = stdout.trim();
    const rawStderr = stderr.trim();

    if (rawStdout) {
        try {
            const parsed = JSON.parse(rawStdout) as PythonBridgeFailure;
            if (parsed && parsed.ok === false) {
                return formatSerializedPythonError(parsed.error, code);
            }
        } catch {
            // Ignore invalid JSON and fall back to the raw bridge output.
        }
    }

    return new Error(rawStderr || rawStdout || `Python bridge failed with exit code ${code}.`);
}

function formatSerializedPythonError(error: SerializedPythonError, code?: number | null): Error {
    const message = Array.isArray(error.message)
        ? error.message.join(' ')
        : error.message;

    return new Error(`${error.type}: ${message || `Python bridge failed with exit code ${code}.`}`);
}

class PersistentSessionWorker {
    private child: ChildProcessWithoutNullStreams | undefined;
    private buffer = '';
    private nextRequestId = 1;
    private readonly pending = new Map<string, {
        resolve: (value: any) => void;
        reject: (reason?: unknown) => void;
    }>();

    constructor(
        private readonly pythonPath: string,
        private readonly sdkLibPath: string | undefined,
        private readonly onShutdown: () => void
    ) {}

    async send(
        request: Omit<SessionBridgeRequest, 'id'>
    ): Promise<any> {
        this.ensureStarted();

        return new Promise<any>((resolve, reject) => {
            const id = String(this.nextRequestId++);
            this.pending.set(id, { resolve, reject });

            this.child?.stdin.write(`${JSON.stringify({ ...request, id })}\n`, 'utf8');
        });
    }

    async stop(): Promise<void> {
        if (!this.child) {
            return;
        }

        try {
            await this.send({ action: 'dispose' });
        } catch {
            // Ignore dispose failures during shutdown.
        }

        const child = this.child;
        child.stdin.end();

        await new Promise<void>(resolve => {
            child.once('close', () => resolve());
            setTimeout(() => {
                if (!child.killed) {
                    child.kill();
                }
                resolve();
            }, 300);
        });
    }

    private ensureStarted(): void {
        if (this.child) {
            return;
        }

        const child = spawn(this.pythonPath, [sessionBridgeScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: buildPythonEnv(this.sdkLibPath)
        });

        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');

        child.stdout.on('data', chunk => {
            this.handleStdout(String(chunk));
        });

        child.stderr.on('data', chunk => {
            const text = String(chunk).trim();
            if (text) {
                abapLogger.warn('PythonSessionWorker', text);
            }
        });

        child.on('error', err => {
            this.rejectAllPending(err);
        });

        child.on('close', code => {
            this.child = undefined;
            this.buffer = '';
            this.rejectAllPending(
                new Error(`Python session worker stopped with exit code ${code}.`)
            );
            this.onShutdown();
        });

        this.child = child;
    }

    private handleStdout(chunk: string): void {
        this.buffer += chunk;

        let newlineIndex = this.buffer.indexOf('\n');
        while (newlineIndex >= 0) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);

            if (line) {
                this.handleResponseLine(line);
            }

            newlineIndex = this.buffer.indexOf('\n');
        }
    }

    private handleResponseLine(line: string): void {
        let response: SessionBridgeResponse;
        try {
            response = JSON.parse(line) as SessionBridgeResponse;
        } catch (err) {
            this.rejectAllPending(
                new Error(`Python session worker returned invalid JSON: ${line}`)
            );
            return;
        }

        const pending = this.pending.get(response.id);
        if (!pending) {
            return;
        }

        this.pending.delete(response.id);

        if (response.ok) {
            pending.resolve(response.result);
            return;
        }

        pending.reject(formatSerializedPythonError(response.error));
    }

    private rejectAllPending(reason: unknown): void {
        for (const [id, pending] of this.pending.entries()) {
            this.pending.delete(id);
            pending.reject(reason);
        }
    }
}
