import { isRfcError } from './RfcErrorHandler';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { getConfiguration, getFullConfiguration, repoPath } from './Configuration';
import { AbapFileWriter } from './fileSystem';
import { refreshAbapExplorer } from '../extension';
import { abapLogger, loadPythonBridge } from './AbapLogger';

const pyfile = path.join(__dirname, '../../src/py', 'abap.py');

export async function getZetProgram(context: vscode.ExtensionContext): Promise<void> {
    const items = buildDestinationList();
    if (items.length === 0) {
        vscode.window.showWarningMessage('No SAP connections configured. Use "AbapRfc: Add SAP Connection" first.');
        return;
    }

    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select SAP System' });
    if (!pick) {
        return;
    }

    const input = await vscode.window.showInputBox({
        placeHolder: 'Program name (must start with Z)',
        validateInput: validateProgramName
    });
    if (!input) {
        return;
    }

    await downloadProgram(pick.label.toUpperCase(), input.toUpperCase(), context);
}

/**
 * Search SAP for programs matching a wildcard pattern (e.g. Z_MY*).
 * Shows results in a Quick Pick; user can pick one to download immediately.
 */
export async function searchAndDownloadProgram(context: vscode.ExtensionContext): Promise<void> {
    const items = buildDestinationList();
    if (items.length === 0) {
        vscode.window.showWarningMessage('No SAP connections configured.');
        return;
    }
    const destPick = await vscode.window.showQuickPick(items, { placeHolder: 'Select SAP System' });
    if (!destPick) { return; }
    const dest = destPick.label.toUpperCase();

    const pattern = await vscode.window.showInputBox({
        placeHolder: 'Search pattern, e.g. Z_MY* or ZMY*',
        prompt: 'Use * as wildcard. Results limited to 100.',
    });
    if (!pattern) { return; }

    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`No configuration for ${dest}.`);
        return;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Searching programs in ${dest}...`, cancellable: false },
        async () => {
            try {
                const py = loadPythonBridge().interpreter;
                const pymodule = await py.import(pyfile);
                const sap = await py.create(pymodule, 'SAP', ABAPSYS);
                const result = await py.call(sap, 'searchPrograms', pattern);

                if (isRfcError(result)) {
                    vscode.window.showErrorMessage(`Search failed: ${result['msg_v1'] || result['type']}`);
                    return;
                }

                const programs: Array<{ NAME: string; SUBC: string }> = result['PROGRAMS'] ?? [];
                if (programs.length === 0) {
                    vscode.window.showInformationMessage(`No programs found matching "${pattern}".`);
                    return;
                }

                const subtypeLabel: Record<string, string> = {
                    '1': 'Executable', 'M': 'Module Pool', 'F': 'Function Group',
                    'K': 'Class', 'J': 'Interface', 'S': 'Subroutine Pool',
                };

                const programPick = await vscode.window.showQuickPick(
                    programs.map(p => ({
                        label: p.NAME,
                        description: subtypeLabel[p.SUBC] ?? p.SUBC,
                        name: p.NAME,
                    })),
                    { placeHolder: `${programs.length} program(s) found — select to download`, matchOnDescription: true }
                );
                if (programPick) {
                    await downloadProgram(dest, programPick.name, context);
                }
            } catch (err) {
                abapLogger.error('searchAndDownloadProgram', err);
                vscode.window.showErrorMessage(`Search error: ${err instanceof Error ? err.message : err}`);
            }
        }
    );
}

// ── Internal ─────────────────────────────────────────────────────────────────

function buildDestinationList(): vscode.QuickPickItem[] {
    const configs = getConfiguration();
    if (!Array.isArray(configs)) {
        return [];
    }
    return configs.map((c: any) => ({
        label: c.dest,
        description: c.ashost
    }));
}

async function downloadProgram(
    dest: string,
    name: string,
    context: vscode.ExtensionContext
): Promise<void> {
    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`Configuration for ${dest} not found.`);
        return;
    }

    ensureRepoDir(dest);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading ${name} from ${dest}`,
            cancellable: false
        },
        async () => {
            try {
                const py = loadPythonBridge().interpreter;

                const pymodule = await py.import(pyfile);
                const sap = await py.create(pymodule, 'SAP', ABAPSYS);

                const exists = await py.call(sap, 'checkProgramExist', name);
                if (!exists) {
                    vscode.window.showWarningMessage(`Program ${name} not found in ${dest}.`);
                    return;
                }

                const data = handleRfcErrors(
                    await py.call(sap, 'getZetReadProgram', name)
                );
                if (!data) {
                    return;
                }

                const progInf = data['PROG_INF'];
                if (!progInf || !progInf.PROGNAME) {
                    vscode.window.showErrorMessage(`Unexpected SAP response: PROG_INF missing for ${name}.`);
                    abapLogger.warn('downloadProgram', `PROG_INF missing in response for ${name}`);
                    return;
                }
                const progName: string = progInf.PROGNAME;
                const writer = new AbapFileWriter(path.join(repoPath, dest), name);
                const mainFile = await writer.writeSource(progName, data['SOURCE'] ?? []);

                await writer.writeMeta({
                    objectType: 'PROG',
                    name: progName,
                    dest,
                    downloadedAt: new Date().toISOString(),
                });

                if (Array.isArray(data['INCLUDE_TAB']) && data['INCLUDE_TAB'].length > 0) {
                    for (const item of data['INCLUDE_TAB']) {
                        const src = handleRfcErrors(
                            await py.call(sap, 'getZetReadProgram', item['INCLNAME'].toUpperCase())
                        );
                        if (src) {
                            await writer.writeInclude(item['INCLNAME'], src['SOURCE']);
                        }
                    }
                }

                writer.openInEditor(mainFile);
                refreshAbapExplorer();

            } catch (err) {
                abapLogger.error('downloadProgram', err);
                vscode.window.showErrorMessage(`Download failed: ${err instanceof Error ? err.message : err}`);
            }
        }
    );
}

function ensureRepoDir(dest: string): void {
    fs.mkdirSync(path.join(repoPath, dest), { recursive: true });
}

function validateProgramName(name: string | undefined): string | undefined {
    if (!name || name.toUpperCase().charAt(0) !== 'Z') {
        return 'Program name must start with "Z"';
    }
    return undefined;
}

function showRfcError(error: any): void {
    vscode.window.showErrorMessage(
        `${error['type']} [${error['code']}]: ${error['msg_v1']} (${error['key']})`
    );
}

/** Returns data if valid, or shows error and returns null. */
function handleRfcErrors(data: any): any | null {
    if (!data || typeof data !== 'object') {
        return null;
    }
    if (isRfcError(data)) {
        showRfcError(data);
        return null;
    }
    return data;
}
