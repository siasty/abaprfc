import * as vscode from 'vscode';
import { checkConfigurationFile, openAbapWorkspace } from './helper/Configuration';
import { registerCommands } from './commands/register';
import { AbapTreeProvider } from './providers/AbapTreeProvider';

export let context: vscode.ExtensionContext;

let treeProvider: AbapTreeProvider;
export let diagnosticCollection: vscode.DiagnosticCollection;

export function refreshAbapExplorer(): void {
    treeProvider?.refresh();
}

export function activate(ctx: vscode.ExtensionContext): void {
    context = ctx;

    checkConfigurationFile();

    // Diagnostics collection for syntax check results
    diagnosticCollection = vscode.languages.createDiagnosticCollection('abaprfc-syntax');
    ctx.subscriptions.push(diagnosticCollection);

    // Tree view
    treeProvider = new AbapTreeProvider();
    ctx.subscriptions.push(
        vscode.window.registerTreeDataProvider('abapRfcExplorer', treeProvider)
    );

    // Tree view title bar buttons
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abapRfcExplorer.refresh', () => {
            treeProvider.refresh();
        })
    );

    // Workspace command
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abaprfc.openWorkspace', () => {
            openAbapWorkspace();
        })
    );

    registerCommands(ctx);
}

export function deactivate(): void { }
