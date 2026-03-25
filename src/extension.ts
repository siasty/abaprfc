import * as vscode from 'vscode';
import { checkConfigurationFile, openAbapWorkspace } from './helper/Configuration';
import { registerCommands } from './commands/register';
import { AbapTreeProvider } from './providers/AbapTreeProvider';
import { SapSourceProvider, SAP_SOURCE_SCHEME } from './providers/SapSourceProvider';
import { AbapStyleProvider } from './providers/AbapStyleProvider';
import { syntaxCheckCurrentFile, parseAbapFilePath } from './helper/UploadMethods';

export let context: vscode.ExtensionContext;

let treeProvider: AbapTreeProvider;
export let diagnosticCollection: vscode.DiagnosticCollection;
export let styleProvider: AbapStyleProvider;

export function refreshAbapExplorer(): void {
    treeProvider?.refresh();
}

export function activate(ctx: vscode.ExtensionContext): void {
    context = ctx;

    checkConfigurationFile();

    // Diagnostics collection for syntax check results
    diagnosticCollection = vscode.languages.createDiagnosticCollection('abaprfc-syntax');
    ctx.subscriptions.push(diagnosticCollection);

    // Diagnostics collection for Clean ABAP style check
    const styleDiagnostics = vscode.languages.createDiagnosticCollection('abaprfc-style');
    ctx.subscriptions.push(styleDiagnostics);
    styleProvider = new AbapStyleProvider(styleDiagnostics);

    // Tree view
    treeProvider = new AbapTreeProvider();
    ctx.subscriptions.push(
        vscode.window.registerTreeDataProvider('abapRfcExplorer', treeProvider)
    );

    // Virtual document provider for SAP source (used by diff command)
    ctx.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            SAP_SOURCE_SCHEME,
            new SapSourceProvider(ctx)
        )
    );

    // Auto syntax check on save
    ctx.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            if (!doc.fileName.endsWith('.abap')) {
                return;
            }
            const cfg = vscode.workspace.getConfiguration('abaprfc');
            if (cfg.get<boolean>('syntaxCheckOnSave', false)) {
                if (parseAbapFilePath(doc.fileName)) {
                    await syntaxCheckCurrentFile(ctx);
                }
            }
            if (cfg.get<boolean>('styleCheckOnSave', false)) {
                styleProvider.checkDocument(doc);
            }
        })
    );

    // Style check on open
    ctx.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => {
            const cfg = vscode.workspace.getConfiguration('abaprfc');
            if (cfg.get<boolean>('styleCheckOnSave', false)) {
                styleProvider.checkDocument(doc);
            }
        })
    );

    // Built-in commands registered directly (need provider instances)
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abapRfcExplorer.refresh', () => {
            treeProvider.refresh();
        })
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abaprfc.openWorkspace', () => {
            openAbapWorkspace();
        })
    );

    registerCommands(ctx);
}

export function deactivate(): void { }
