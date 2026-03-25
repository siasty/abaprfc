import { isRfcError, describeRfcError } from './RfcErrorHandler';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfiguration, getFullConfiguration, repoPath } from './Configuration';
import { FmFileWriter } from './fileSystem';
import { refreshAbapExplorer } from '../extension';
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
                    functionGroup
                });

                writer.openInEditor(mainFile);
                refreshAbapExplorer();

                const fgInfo = functionGroup ? ` (Function Group: ${functionGroup})` : '';
                vscode.window.showInformationMessage(
                    `$(check) ${funcName} downloaded from ${dest}${fgInfo}`
                );

            } catch (err) {
                console.error('downloadFunctionModule:', err);
                vscode.window.showErrorMessage(`Download failed: ${err}`);
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

