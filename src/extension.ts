
import * as vscode from 'vscode';
import * as path from 'path';
import { checkConfigurationFile, getConfiguration } from './helper/Configuration';
import { registerCommands } from "./commands/register";
export let context: vscode.ExtensionContext;

export function activate(ctx: vscode.ExtensionContext) {
    context = ctx;

	const rootPath = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

	checkConfigurationFile();
   
	registerCommands(context);

    

}

// this method is called when your extension is deactivated
export function deactivate() { }
