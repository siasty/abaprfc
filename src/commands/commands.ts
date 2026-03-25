import * as vscode from 'vscode';
import { command, abapRfcCommands } from './abapcomands';
import { openSampleWizard } from '../helper/Configuration';
import { getZetProgram } from '../helper/ProgramsMethods';
import { getFunctionModule } from '../helper/FunctionModuleMethods';
import { uploadCurrentFile, syntaxCheckCurrentFile, diffWithSap } from '../helper/UploadMethods';
import { context, styleProvider } from '../extension';

export class RfcCommands {

    @command(abapRfcCommands.addConnection)
    private static async addConnection(_ctx: vscode.ExtensionContext) {
        return openSampleWizard(context);
    }

    @command(abapRfcCommands.getProgram)
    private static async getProgram(_ctx: vscode.ExtensionContext) {
        return getZetProgram(context);
    }

    @command(abapRfcCommands.getFunction)
    private static async getFunction(_ctx: vscode.ExtensionContext) {
        return getFunctionModule(context);
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
}
