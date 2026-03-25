import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { getConfiguration, getFullConfiguration, repoPath } from './Configuration';
import { AbapFileWriter } from './fileSystem';
import { refreshAbapExplorer } from '../extension';

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
                const nodecallspython = require('node-calls-python');
                const py = nodecallspython.interpreter;

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

                const progName: string = data['PROG_INF'].PROGNAME;
                const writer = new AbapFileWriter(path.join(repoPath, dest), name);
                const mainFile = await writer.writeSource(progName, data['SOURCE']);

                await writer.writeMeta({ objectType: 'PROG', name: progName, dest });

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
                console.error(err);
                vscode.window.showErrorMessage(`Download failed: ${err}`);
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

const RFC_ERROR_TYPES = new Set([
    'ABAPApplicationError', 'ABAPRuntimeError',
    'CommunicationError', 'LogonError', 'RFCError'
]);

/** Returns data if valid, or shows error and returns null. */
function handleRfcErrors(data: any): any | null {
    if (!data || typeof data !== 'object') {
        return null;
    }
    if (RFC_ERROR_TYPES.has(data['type'])) {
        showRfcError(data);
        return null;
    }
    return data;
}
