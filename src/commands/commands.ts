import * as vscode from 'vscode';
import { command, abapRfcCommands } from './abapcomands';
import { openSampleWizard, editSavedConnection, testSavedConnection, getConfiguration } from '../helper/Configuration';
import { getZetProgram } from '../helper/ProgramsMethods';
import { getFunctionModule } from '../helper/FunctionModuleMethods';
import { uploadCurrentFile, syntaxCheckCurrentFile, diffWithSap } from '../helper/UploadMethods';
import { searchAndDownloadProgram } from '../helper/ProgramsMethods';
import { searchAndDownloadFM } from '../helper/FunctionModuleMethods';
import { openCreateTransportWizard } from '../helper/TransportMethods';
import { context, styleProvider } from '../extension';
import { abapLogger } from '../helper/AbapLogger';

export class RfcCommands {

    @command(abapRfcCommands.addConnection)
    private static async addConnection(_ctx: vscode.ExtensionContext) {
        return openSampleWizard(context);
    }

    @command(abapRfcCommands.editConnection)
    private static async editConnection(item?: { dest?: string; label?: string }) {
        const dest = await pickDestination(item);
        if (!dest) {
            return;
        }
        return editSavedConnection(dest, context);
    }

    @command(abapRfcCommands.testConnection)
    private static async testConnection(item?: { dest?: string; label?: string }) {
        const dest = await pickDestination(item);
        if (!dest) {
            return;
        }
        return testSavedConnection(dest, context);
    }

    @command(abapRfcCommands.createTransport)
    private static async createTransport(item?: { dest?: string; label?: string }) {
        const dest = await pickDestination(item);
        if (!dest) {
            return;
        }
        return openCreateTransportWizard(dest);
    }

    @command(abapRfcCommands.getProgram)
    private static async getProgram(_ctx: vscode.ExtensionContext) {
        return getZetProgram(context);
    }

    @command(abapRfcCommands.getFunction)
    private static async getFunction(_ctx: vscode.ExtensionContext) {
        return getFunctionModule(context);
    }

    @command(abapRfcCommands.searchProgram)
    private static async searchProgram(_ctx: vscode.ExtensionContext) {
        return searchAndDownloadProgram(context);
    }

    @command(abapRfcCommands.searchFunction)
    private static async searchFunction(_ctx: vscode.ExtensionContext) {
        return searchAndDownloadFM(context);
    }

    @command(abapRfcCommands.uploadProgram)
    private static async uploadProgram(_ctx: vscode.ExtensionContext) {
        return uploadCurrentFile(context);
    }

    @command(abapRfcCommands.syntaxCheck)
    private static async syntaxCheck(_ctx: vscode.ExtensionContext) {
        return syntaxCheckCurrentFile(context);
    }

    @command(abapRfcCommands.diffWithSap)
    private static async diffWithSap(_ctx: vscode.ExtensionContext) {
        return diffWithSap(context);
    }

    @command(abapRfcCommands.styleCheck)
    private static async styleCheck(_ctx: vscode.ExtensionContext) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document.fileName.endsWith('.abap')) {
            vscode.window.showWarningMessage('AbapRfc: Open an .abap file to run style check.');
            return;
        }
        styleProvider.checkDocument(editor.document);
        const summary = styleProvider.getSummary(editor.document);
        vscode.window.showInformationMessage(summary);
    }

    @command(abapRfcCommands.showLogs)
    private static async showLogs(_ctx: vscode.ExtensionContext) {
        abapLogger.show();
    }
}

async function pickDestination(
    item?: { dest?: string; label?: string }
): Promise<string | undefined> {
    const fromItem = item?.dest ?? item?.label;
    if (fromItem) {
        return fromItem;
    }

    const configs = getConfiguration();
    if (!configs || !Array.isArray(configs) || configs.length === 0) {
        vscode.window.showWarningMessage('No SAP connections configured. Use "AbapRfc: Add SAP Connection" first.');
        return undefined;
    }

    const pick = await vscode.window.showQuickPick(
        configs
            .slice()
            .sort((a, b) => String(a.dest).localeCompare(String(b.dest)))
            .map((c: any) => ({
                label: c.dest,
                description: c.ashost
            })),
        { placeHolder: 'Select SAP system' }
    );

    return pick?.label;
}
