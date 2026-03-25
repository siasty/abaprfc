import * as vscode from 'vscode';
import { command, abapRfcCommands } from './abapcomands';
import { openSampleWizard } from '../helper/Configuration';
import { getZetProgram } from '../helper/ProgramsMethods';
import { uploadCurrentFile, syntaxCheckCurrentFile } from '../helper/UploadMethods';
import { context } from '../extension';

export class RfcCommands {

    @command(abapRfcCommands.addConnection)
    private static async addConnection(_ctx: vscode.ExtensionContext) {
        return openSampleWizard(context);
    }

    @command(abapRfcCommands.getProgram)
    private static async getProgram(_ctx: vscode.ExtensionContext) {
        return getZetProgram(context);
    }

    @command(abapRfcCommands.uploadProgram)
    private static async uploadProgram(_ctx: vscode.ExtensionContext) {
        return uploadCurrentFile(context);
    }

    @command(abapRfcCommands.syntaxCheck)
    private static async syntaxCheck(_ctx: vscode.ExtensionContext) {
        return syntaxCheckCurrentFile(context);
    }
}
