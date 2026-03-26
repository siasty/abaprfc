import { isRfcError } from './RfcErrorHandler';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfiguration, getFullConfiguration, repoPath } from './Configuration';
import { FmFileWriter } from './fileSystem';
import { refreshAbapExplorer } from '../extension';
import { abapLogger } from './AbapLogger';
import { createPythonProxy } from './PythonBridge';

const pyReadFile = path.join(__dirname, '../../src/py', 'abap.py');

// ── Public entry point ────────────────────────────────────────────────────────

export async function getFunctionModule(context: vscode.ExtensionContext): Promise<void> {
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
        placeHolder: 'Function module name (must start with Z or Y)',
        validateInput: validateFmName
    });
    if (!input) {
        return;
    }

    await downloadFunctionModule(pick.label.toUpperCase(), input.toUpperCase(), context);
}

/**
 * Search SAP for function modules matching a wildcard pattern (e.g. Z_MY*).
 * Shows results in a Quick Pick; user can pick one to download immediately.
 */
export async function searchAndDownloadFM(context: vscode.ExtensionContext): Promise<void> {
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
        prompt: 'Use * as wildcard.',
    });
    if (!pattern) { return; }

    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`No configuration for ${dest}.`);
        return;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Searching FMs in ${dest}...`, cancellable: false },
        async () => {
            try {
                const sap = createPythonProxy(pyReadFile, 'SAP', ABAPSYS);
                const result = await sap.searchFunctionModules(pattern);

                if (isRfcError(result)) {
                    vscode.window.showErrorMessage(`Search failed: ${result['msg_v1'] || result['type']}`);
                    return;
                }

                const fms: Array<{ FUNCNAME: string; GROUPNAME: string }> = result['FUNCTIONS'] ?? [];
                if (fms.length === 0) {
                    vscode.window.showInformationMessage(`No function modules found matching "${pattern}".`);
                    return;
                }

                const fmPick = await vscode.window.showQuickPick(
                    fms.map(f => ({
                        label: f.FUNCNAME,
                        description: `Group: ${f.GROUPNAME}`,
                        funcName: f.FUNCNAME,
                    })),
                    { placeHolder: `${fms.length} FM(s) found — select to download`, matchOnDescription: true }
                );
                if (fmPick) {
                    await downloadFunctionModule(dest, fmPick.funcName, context);
                }
            } catch (err) {
                abapLogger.error('searchAndDownloadFM', err);
                vscode.window.showErrorMessage(`Search error: ${err instanceof Error ? err.message : err}`);
            }
        }
    );
}

// ── Internal ──────────────────────────────────────────────────────────────────

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

async function downloadFunctionModule(
    dest: string,
    funcName: string,
    context: vscode.ExtensionContext
): Promise<void> {
    const ABAPSYS = await getFullConfiguration(dest, context);
    if (!ABAPSYS) {
        vscode.window.showErrorMessage(`Configuration for ${dest} not found.`);
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading FM ${funcName} from ${dest}`,
            cancellable: false
        },
        async () => {
            try {
                const sap = createPythonProxy(pyReadFile, 'SAP', ABAPSYS);

                const exists = await sap.checkFunctionExist(funcName);
                if (!exists) {
                    vscode.window.showWarningMessage(`Function module ${funcName} not found in ${dest}.`);
                    return;
                }

                const data = await sap.getFunctionModule(funcName);

                if (isRfcError(data)) {
                    vscode.window.showErrorMessage(
                        `Failed to read ${funcName}: ${data['msg_v1'] || data['type']}`
                    );
                    return;
                }

                const functionGroup: string = data['FUNCTION_GROUP'] ?? '';
                const source: Array<{ LINE: string }> = data['SOURCE'] ?? [];

                const writer = new FmFileWriter(path.join(repoPath, dest), funcName);
                const mainFile = await writer.writeFmSource(funcName, source);

                await writer.writeMeta({
                    objectType: 'FUNC',
                    name: funcName,
                    dest,
                    functionGroup,
                    downloadedAt: new Date().toISOString(),
                });

                writer.openInEditor(mainFile);
                refreshAbapExplorer();

                const fgInfo = functionGroup ? ` (Function Group: ${functionGroup})` : '';
                vscode.window.showInformationMessage(
                    `$(check) ${funcName} downloaded from ${dest}${fgInfo}`
                );

            } catch (err) {
                abapLogger.error('downloadFunctionModule', err);
                vscode.window.showErrorMessage(`Download failed: ${err instanceof Error ? err.message : err}`);
            }
        }
    );
}

function validateFmName(name: string | undefined): string | undefined {
    if (!name) {
        return 'Function module name is required';
    }
    const first = name.toUpperCase().charAt(0);
    if (first !== 'Z' && first !== 'Y') {
        return 'Function module name must start with "Z" or "Y"';
    }
    return undefined;
}

