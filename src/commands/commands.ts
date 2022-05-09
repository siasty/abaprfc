import * as vscode from 'vscode';
import { command, abapRfcCommands } from "./abapcomands";
import { openSampleWizard } from '../helper/Configuration';
import { context } from '../extension';

export class RfcCommands {

    @command(abapRfcCommands.addConnection)
    private static async openSampleWizard(ctx: vscode.ExtensionContext) {
        return openSampleWizard(context);
    }


}