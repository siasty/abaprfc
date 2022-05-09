
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

	let disposable = vscode.commands.registerCommand('abaprfc.helloWorld', async () => {


		const nodecallspython = require("node-calls-python");

		let py = nodecallspython.interpreter;
		let pyfile = path.join(__dirname, "abap.py");


		py.import(pyfile).then(async function (pymodule: any) {

			let ABAPSYS = getConfiguration('ABAP');
			let sap = await py.create(pymodule, "SAP", ABAPSYS);
			let result = await py.call(sap, "connection");

			console.log(result);
		});

		vscode.window.showInformationMessage('Hello World from abaprfc!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
