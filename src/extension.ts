
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "abaprfc" is now active!');

	let disposable = vscode.commands.registerCommand('abaprfc.helloWorld', () => {
		const noderfc = require("node-rfc");
		const client = new noderfc.Client({ dest: "ABAP" });

		vscode.window.showInformationMessage('Hello World from abaprfc!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
