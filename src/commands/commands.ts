import * as vscode from 'vscode';
import { command, abapRfcCommands } from "./abapcomands";
import { openSampleWizard } from '../helper/Configuration';
import { getZetProgram } from '../helper/ProgramsMethods';
import { context } from '../extension';

export class RfcCommands {

    @command(abapRfcCommands.addConnection)
    private static async openSampleWizard(ctx: vscode.ExtensionContext) {
        return openSampleWizard(context);
    }
    @command(abapRfcCommands.getProgram)
    private static async getZetProgram(ctx: vscode.ExtensionContext) {
        return getZetProgram(context);
    }

}