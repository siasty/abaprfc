import * as vscode from 'vscode';
import { checkConfigurationFile, openAbapWorkspace } from './helper/Configuration';
import { registerCommands } from './commands/register';
import { AbapTreeProvider } from './providers/AbapTreeProvider';

export let context: vscode.ExtensionContext;

let treeProvider: AbapTreeProvider;

export function refreshAbapExplorer(): void {
    treeProvider?.refresh();
}

export function activate(ctx: vscode.ExtensionContext): void {
    context = ctx;

    checkConfigurationFile();

    // Tree view
    treeProvider = new AbapTreeProvider();
    ctx.subscriptions.push(
        vscode.window.registerTreeDataProvider('abapRfcExplorer', treeProvider)
    );

    // Refresh button in tree view title bar
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abapRfcExplorer.refresh', () => {
            treeProvider.refresh();
        })
    );

    // Open workspace command
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abaprfc.openWorkspace', () => {
            openAbapWorkspace();
        })
    );

    registerCommands(ctx);
}

export function deactivate(): void { }
