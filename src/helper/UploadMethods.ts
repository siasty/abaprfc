import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getFullConfiguration, repoPath } from './Configuration';
import { selectTransport } from './TransportMethods';
import { diagnosticCollection } from '../extension';

const pyWriteFile = path.join(__dirname, '../../src/py', 'abap_write.py');

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Upload the currently active .abap file to SAP via Transport Request.
 * Full flow: detect file → syntax check → select TR → write → assign TR.
 */
export async function uploadCurrentFile(context: vscode.ExtensionContext): Promise<void> {
    const fileInfo = getActiveAbapFile();
    if (!fileInfo) {
        return;
    }

    const { filePath, dest, programName } = fileInfo;

    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`No configuration found for destination ${dest}.`);
        return;
    }

    const source = readFileAsRfcLines(filePath);
    if (!source) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Uploading ${programName} to ${dest}`,
            cancellable: false
        },
        async (progress) => {
            try {
                const nodecallspython = require('node-calls-python');
                const py = nodecallspython.interpreter;

                const pymodule = await py.import(pyWriteFile);
                const sapWriter = await py.create(pymodule, 'SAPWriter', ABAPSYS);

                // 1. Syntax check
                progress.report({ message: 'Running syntax check...' });
                const syntaxOk = await runSyntaxCheck(
                    py, sapWriter, programName, source, filePath
                );
                if (syntaxOk === undefined) {
                    return; // user cancelled after errors
                }

                // 2. Select / create Transport Request
                progress.report({ message: 'Selecting transport request...' });
                const trkorr = await selectTransport(dest, sapWriter, ABAPSYS.user);
                if (!trkorr) {
                    vscode.window.showWarningMessage('Upload cancelled — no transport selected.');
                    return;
                }

                // 3. Write source to SAP
                progress.report({ message: `Writing to SAP (TR: ${trkorr})...` });
                const writeResult = await py.call(
                    sapWriter, 'updateProgram', programName, source, trkorr
                );

                if (isRfcError(writeResult)) {
                    vscode.window.showErrorMessage(
                        `Upload failed: ${writeResult['msg_v1'] || writeResult['type']}`
                    );
                    return;
                }

                // 4. Assign object to TR
                progress.report({ message: 'Assigning to transport...' });
                const assignResult = await py.call(
                    sapWriter, 'insertObjectToTransport', trkorr, programName
                );

                if (isRfcError(assignResult)) {
                    // Object may already be in TR — treat as warning, not error
                    vscode.window.showWarningMessage(
                        `${programName} written but TR assignment failed: ${assignResult['msg_v1']}. ` +
                        `Check TR ${trkorr} manually.`
                    );
                    return;
                }

                // Clear syntax diagnostics on success
                diagnosticCollection.delete(vscode.Uri.file(filePath));

                vscode.window.showInformationMessage(
                    `$(check) ${programName} uploaded to ${dest}, TR: ${trkorr}`
                );

            } catch (err) {
                console.error('uploadCurrentFile:', err);
                vscode.window.showErrorMessage(`Upload error: ${err}`);
            }
        }
    );
}

/**
 * Run a standalone syntax check on the currently active .abap file.
 * Errors are shown as VS Code diagnostics (red squigglies) in the editor.
 */
export async function syntaxCheckCurrentFile(context: vscode.ExtensionContext): Promise<void> {
    const fileInfo = getActiveAbapFile();
    if (!fileInfo) {
        return;
    }

    const { filePath, dest, programName } = fileInfo;

    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`No configuration found for destination ${dest}.`);
        return;
    }

    const source = readFileAsRfcLines(filePath);
    if (!source) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Syntax check: ${programName}`,
            cancellable: false
        },
        async () => {
            try {
                const nodecallspython = require('node-calls-python');
                const py = nodecallspython.interpreter;

                const pymodule = await py.import(pyWriteFile);
                const sapWriter = await py.create(pymodule, 'SAPWriter', ABAPSYS);

                const result = await py.call(sapWriter, 'syntaxCheckProgram', programName, source);

                if (isRfcError(result)) {
                    vscode.window.showErrorMessage(
                        `Syntax check RFC error: ${result['msg_v1'] || result['type']}`
                    );
                    return;
                }

                applyDiagnostics(filePath, result['SYNTAX_ERRORS'] ?? []);

                const errorCount = (result['SYNTAX_ERRORS'] ?? []).length;
                if (errorCount === 0) {
                    vscode.window.showInformationMessage(
                        `$(check) ${programName}: no syntax errors.`
                    );
                } else {
                    vscode.window.showWarningMessage(
                        `$(warning) ${programName}: ${errorCount} syntax issue(s) found.`
                    );
                }

            } catch (err) {
                console.error('syntaxCheckCurrentFile:', err);
                vscode.window.showErrorMessage(`Syntax check error: ${err}`);
            }
        }
    );
}

// ── Internal ─────────────────────────────────────────────────────────────────

interface AbapFileInfo {
    filePath: string;
    dest: string;
    programName: string;  // uppercase, no extension
}

/**
 * Parses the active editor file path to extract SAP destination and object name.
 *
 * Expected structures:
 *   repos/{DEST}/{PROGRAM}/{program}.abap        → main program
 *   repos/{DEST}/{PROGRAM}/INCLUDES/{incl}.abap  → include (also a PROG object in SAP)
 */
function getActiveAbapFile(): AbapFileInfo | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return undefined;
    }

    const filePath = editor.document.fileName;
    if (!filePath.endsWith('.abap')) {
        vscode.window.showWarningMessage('Active file is not an .abap file.');
        return undefined;
    }

    const normalizedRepo = repoPath.replace(/\\/g, '/');
    const normalizedFile = filePath.replace(/\\/g, '/');

    if (!normalizedFile.startsWith(normalizedRepo)) {
        vscode.window.showWarningMessage(
            'Active file is not inside the ABAP RFC workspace.\n' +
            `Expected: ${repoPath}`
        );
        return undefined;
    }

    // Strip repo prefix and split into segments
    const relative = normalizedFile.slice(normalizedRepo.length + 1);
    const segments = relative.split('/');

    // segments[0] = DEST, segments[1] = PROGRAM, segments[2+] = file or INCLUDES/file
    if (segments.length < 3) {
        vscode.window.showWarningMessage('Cannot determine SAP destination from file path.');
        return undefined;
    }

    const dest = segments[0].toUpperCase();
    const programName = path.basename(filePath, '.abap').toUpperCase();

    return { filePath, dest, programName };
}

/** Read a local .abap file and convert to RFC source line format. */
function readFileAsRfcLines(filePath: string): Array<{ LINE: string }> | undefined {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content
            .split('\n')
            .map(line => ({ LINE: line.replace(/\r$/, '') }));
    } catch (err) {
        vscode.window.showErrorMessage(`Cannot read file: ${err}`);
        return undefined;
    }
}

/**
 * Run syntax check and apply diagnostics.
 * Returns true if clean, false if errors (user chose to continue), undefined if cancelled.
 */
async function runSyntaxCheck(
    py: any,
    sapWriter: any,
    programName: string,
    source: Array<{ LINE: string }>,
    filePath: string
): Promise<boolean | undefined> {

    const result = await py.call(sapWriter, 'syntaxCheckProgram', programName, source);

    if (isRfcError(result)) {
        // RFC itself failed (e.g. auth) — warn and let user decide
        const cont = await vscode.window.showWarningMessage(
            `Syntax check unavailable: ${result['msg_v1'] || result['type']}. Upload anyway?`,
            'Upload Anyway', 'Cancel'
        );
        return cont === 'Upload Anyway' ? false : undefined;
    }

    const errors: any[] = result['SYNTAX_ERRORS'] ?? [];
    applyDiagnostics(filePath, errors);

    if (errors.length === 0) {
        return true;
    }

    const errorCount = errors.filter(e => e['MSGTYP'] === 'E').length;
    const warnCount  = errors.length - errorCount;
    const summary = [
        errorCount > 0 ? `${errorCount} error(s)` : '',
        warnCount  > 0 ? `${warnCount} warning(s)` : ''
    ].filter(Boolean).join(', ');

    const choice = await vscode.window.showWarningMessage(
        `Syntax check: ${summary} in ${programName}. Upload anyway?`,
        'Upload Anyway',
        'Cancel'
    );

    return choice === 'Upload Anyway' ? false : undefined;
}

/**
 * Convert RFC SYNTAX_ERRORS table rows to VS Code Diagnostics
 * and attach them to the file in the diagnostic collection.
 */
function applyDiagnostics(filePath: string, syntaxErrors: any[]): void {
    const uri = vscode.Uri.file(filePath);

    if (syntaxErrors.length === 0) {
        diagnosticCollection.delete(uri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = syntaxErrors.map(err => {
        const line = Math.max(0, (parseInt(err['LINE'] ?? err['ROW'] ?? '1', 10) || 1) - 1);
        const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
        const severity = (err['MSGTYP'] ?? 'E') === 'W'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error;
        const message = err['ERRMSG'] ?? err['MSG'] ?? err['TEXT'] ?? 'Syntax error';
        const word = err['WORD'] ? ` (near: "${err['WORD']}")` : '';
        return new vscode.Diagnostic(range, `${message}${word}`, severity);
    });

    diagnosticCollection.set(uri, diagnostics);
}

const RFC_ERROR_TYPES = new Set([
    'ABAPApplicationError', 'ABAPRuntimeError',
    'CommunicationError', 'LogonError', 'RFCError'
]);

function isRfcError(data: any): boolean {
    return data && typeof data === 'object' && RFC_ERROR_TYPES.has(data['type']);
}
