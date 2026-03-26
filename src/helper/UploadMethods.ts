import { isRfcError } from './RfcErrorHandler';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getFullConfiguration, repoPath } from './Configuration';
import { selectTransport } from './TransportMethods';
import { readObjectMeta } from './fileSystem';
import { diagnosticCollection } from '../extension';
import { SAP_SOURCE_SCHEME } from '../providers/SapSourceProvider';
import { resolveAbapPath } from '../utils/pathUtils';
import { abapLogger } from './AbapLogger';
import { createPythonProxy } from './PythonBridge';
import { AbapObjectMeta, ABAP_META_FILE } from '../models/abapObjectMeta';

const pyWriteFile = path.join(__dirname, '../../src/py', 'abap_write.py');

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Upload the currently active .abap file to SAP via Transport Request.
 * Flow: detect file → read metadata → syntax check → select TR → write → assign TR.
 * Handles both PROG (programs/includes) and FUNC (function modules).
 */
export async function uploadCurrentFile(context: vscode.ExtensionContext): Promise<void> {
    const fileInfo = getActiveAbapFile();
    if (!fileInfo) {
        return;
    }

    const { filePath, dest, programName, objectDir } = fileInfo;

    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`No configuration found for destination ${dest}.`);
        return;
    }

    const source = readFileAsRfcLines(filePath);
    if (!source) {
        return;
    }

    // Determine SAP object type from metadata (fall back to PROG for legacy files)
    const meta = readObjectMeta(objectDir);
    const objectType  = meta?.objectType ?? 'PROG';
    const trObjectName = objectType === 'FUNC'
        ? (meta?.functionGroup ?? programName)
        : programName;

    // Confirm before overwriting SAP source
    const confirmed = await vscode.window.showWarningMessage(
        `Upload ${programName} to ${dest}? This will overwrite the current SAP version.`,
        { modal: true },
        'Upload'
    );
    if (confirmed !== 'Upload') {
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
                const sapWriter = createPythonProxy(pyWriteFile, 'SAPWriter', ABAPSYS);

                // 1. Syntax check
                progress.report({ message: 'Running syntax check...' });
                const syntaxOk = await runSyntaxCheck(sapWriter, programName, source, filePath);
                if (syntaxOk === undefined) {
                    return;
                }

                // 2. Select / create Transport Request
                progress.report({ message: 'Selecting transport...' });
                const trkorr = await selectTransport(dest, sapWriter, ABAPSYS.user);
                if (!trkorr) {
                    vscode.window.showWarningMessage('Upload cancelled — no transport selected.');
                    return;
                }

                // 3. Write source
                progress.report({ message: `Writing to SAP (TR: ${trkorr})...` });
                const writeMethod = objectType === 'FUNC' ? 'updateFunctionModule' : 'updateProgram';
                const writeResult = await sapWriter[writeMethod](programName, source, trkorr);

                if (isRfcError(writeResult)) {
                    vscode.window.showErrorMessage(
                        `Upload failed: ${writeResult['msg_v1'] || writeResult['type']}`
                    );
                    return;
                }

                // 4. Assign object to TR
                progress.report({ message: 'Assigning to transport...' });
                const assignResult = await sapWriter.insertObjectToTransport(trkorr, trObjectName);

                if (isRfcError(assignResult)) {
                    vscode.window.showWarningMessage(
                        `${programName} written but TR assignment failed: ${assignResult['msg_v1']}. ` +
                        `Check TR ${trkorr} manually. ` +
                        (objectType === 'FUNC'
                            ? `(Function group "${trObjectName}" must be assigned to TR.)`
                            : '')
                    );
                    return;
                }

                // 5. Update local metadata with upload info
                await updateMetaAfterUpload(objectDir, meta, trkorr);

                diagnosticCollection.delete(vscode.Uri.file(filePath));
                abapLogger.info('uploadCurrentFile', `${programName} → ${dest} TR:${trkorr}`);
                vscode.window.showInformationMessage(
                    `$(check) ${programName} uploaded to ${dest}, TR: ${trkorr}`
                );

            } catch (err) {
                abapLogger.error('uploadCurrentFile', err);
                vscode.window.showErrorMessage(`Upload error: ${err instanceof Error ? err.message : err}`);
            }
        }
    );
}

/**
 * Open the VS Code diff editor comparing the local file with the SAP version.
 * SAP source is fetched via the SapSourceProvider virtual document.
 */
export async function diffWithSap(_context: vscode.ExtensionContext): Promise<void> {
    const fileInfo = getActiveAbapFile();
    if (!fileInfo) {
        return;
    }

    const { filePath, dest, programName } = fileInfo;

    // SAP side: virtual document fetched live from RFC
    const sapUri = vscode.Uri.parse(
        `${SAP_SOURCE_SCHEME}:/${dest}/${programName}`
    );
    // Local side: actual file on disk
    const localUri = vscode.Uri.file(filePath);

    await vscode.commands.executeCommand(
        'vscode.diff',
        sapUri,
        localUri,
        `SAP ↔ Local: ${programName} [${dest}]`
    );
}

/**
 * Run a standalone syntax check on the currently active .abap file.
 * Errors are shown as VS Code diagnostics (red/yellow squigglies).
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
                const sapWriter = createPythonProxy(pyWriteFile, 'SAPWriter', ABAPSYS);
                const result = await sapWriter.syntaxCheckProgram(programName, source);

                if (isRfcError(result)) {
                    vscode.window.showErrorMessage(
                        `Syntax check RFC error: ${result['msg_v1'] || result['type']}`
                    );
                    return;
                }

                applyDiagnostics(filePath, result['SYNTAX_ERRORS'] ?? []);

                const errors = (result['SYNTAX_ERRORS'] ?? []) as any[];
                if (errors.length === 0) {
                    vscode.window.showInformationMessage(`$(check) ${programName}: no syntax errors.`);
                } else {
                    const errCount  = errors.filter(e => e['MSGTYP'] !== 'W').length;
                    const warnCount = errors.length - errCount;
                    const parts = [
                        errCount  > 0 ? `${errCount} error(s)`   : '',
                        warnCount > 0 ? `${warnCount} warning(s)` : ''
                    ].filter(Boolean).join(', ');
                    vscode.window.showWarningMessage(`$(warning) ${programName}: ${parts}.`);
                }

            } catch (err) {
                abapLogger.error('syntaxCheckCurrentFile', err);
                vscode.window.showErrorMessage(`Syntax check error: ${err instanceof Error ? err.message : err}`);
            }
        }
    );
}

// ── Shared helper (exported for onSave handler) ───────────────────────────────

export interface AbapFileInfo {
    filePath:   string;
    dest:       string;
    programName: string;
    /** Directory containing the ABAP object (program or FM root). */
    objectDir:  string;
}

/**
 * Parses the active editor's file path into SAP context.
 * Returns undefined and shows a warning if the file is not in the ABAP workspace.
 *
 * Path patterns:
 *   repos/{DEST}/{NAME}/{name}.abap          → main program / FM
 *   repos/{DEST}/{NAME}/INCLUDES/{incl}.abap → include (also a PROG object)
 */
export function getActiveAbapFile(): AbapFileInfo | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor.');
        return undefined;
    }
    return parseAbapFilePath(editor.document.fileName);
}

export function parseAbapFilePath(filePath: string): AbapFileInfo | undefined {
    const result = resolveAbapPath(filePath, repoPath);
    if (!result.ok) {
        vscode.window.showWarningMessage(result.reason);
        return undefined;
    }
    const { dest, programName, objectDir } = result.value;
    return { filePath, dest, programName, objectDir };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function readFileAsRfcLines(filePath: string): Array<{ LINE: string }> | undefined {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.split('\n').map(line => ({ LINE: line.replace(/\r$/, '') }));
    } catch (err) {
        vscode.window.showErrorMessage(`Cannot read file: ${err}`);
        return undefined;
    }
}

async function runSyntaxCheck(
    sapWriter: any,
    programName: string,
    source: Array<{ LINE: string }>,
    filePath: string
): Promise<boolean | undefined> {

    const result = await sapWriter.syntaxCheckProgram(programName, source);

    if (isRfcError(result)) {
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

    const errCount  = errors.filter(e => e['MSGTYP'] !== 'W').length;
    const warnCount = errors.length - errCount;
    const summary = [
        errCount  > 0 ? `${errCount} error(s)`   : '',
        warnCount > 0 ? `${warnCount} warning(s)` : ''
    ].filter(Boolean).join(', ');

    const choice = await vscode.window.showWarningMessage(
        `Syntax check: ${summary} in ${programName}. Upload anyway?`,
        'Upload Anyway', 'Cancel'
    );
    return choice === 'Upload Anyway' ? false : undefined;
}

function applyDiagnostics(filePath: string, syntaxErrors: any[]): void {
    const uri = vscode.Uri.file(filePath);
    if (syntaxErrors.length === 0) {
        diagnosticCollection.delete(uri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = syntaxErrors.map(err => {
        const line     = Math.max(0, (parseInt(err['LINE'] ?? err['ROW'] ?? '1', 10) || 1) - 1);
        const range    = new vscode.Range(line, 0, line, Number.MAX_VALUE);
        const severity = (err['MSGTYP'] ?? 'E') === 'W'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error;
        const message  = err['ERRMSG'] ?? err['MSG'] ?? err['TEXT'] ?? 'Syntax error';
        const word     = err['WORD'] ? ` (near: "${err['WORD']}")` : '';
        return new vscode.Diagnostic(range, `${message}${word}`, severity);
    });

    diagnosticCollection.set(uri, diagnostics);
}

/** Update .abapobj sidecar with upload timestamp and TR number. */
async function updateMetaAfterUpload(
    objectDir: string,
    existingMeta: AbapObjectMeta | undefined,
    trkorr: string,
): Promise<void> {
    try {
        const metaPath = path.join(objectDir, ABAP_META_FILE);
        const base = existingMeta ?? {} as AbapObjectMeta;
        const updated: AbapObjectMeta = {
            ...base,
            lastUploadedAt: new Date().toISOString(),
            lastTrkorr: trkorr,
        };
        await fs.promises.writeFile(metaPath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
        abapLogger.warn('updateMetaAfterUpload', `Could not update metadata: ${err}`);
    }
}

