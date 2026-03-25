
import * as vscode from 'vscode';
import * as path from 'path';
import { checkConfigurationFile, getConfiguration } from './helper/Configuration';
import { registerCommands } from "./commands/register";
export let context: vscode.ExtensionContext;

export function activate(ctx: vscode.ExtensionContext) {
    context = ctx;

	checkConfigurationFile();

	registerCommands(context);

    

}

// this method is called when your extension is deactivated
export function deactivate() { }
