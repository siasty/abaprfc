import * as vscode from 'vscode';
import { checkConfigurationFile, openAbapWorkspace } from './helper/Configuration';
import { registerCommands } from './commands/register';
import { AbapTreeProvider } from './providers/AbapTreeProvider';
import { SapSystemsProvider } from './providers/SapSystemsProvider';
import { TransportTreeProvider } from './providers/TransportTreeProvider';
import { SapSourceProvider, SAP_SOURCE_SCHEME } from './providers/SapSourceProvider';
import { AbapStyleProvider } from './providers/AbapStyleProvider';
import { syntaxCheckCurrentFile, parseAbapFilePath } from './helper/UploadMethods';
import { abapLogger } from './helper/AbapLogger';

export let context: vscode.ExtensionContext;

let treeProvider: AbapTreeProvider;
let systemsProvider: SapSystemsProvider;
let transportTreeProvider: TransportTreeProvider;
export let diagnosticCollection: vscode.DiagnosticCollection;
export let styleProvider: AbapStyleProvider;

export function refreshAbapExplorer(): void {
    treeProvider?.refresh();
}

export function refreshSapSystemsView(): void {
    systemsProvider?.refresh();
}

export function refreshTransportExplorer(): void {
    transportTreeProvider?.refresh();
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

    // Tree view — downloaded objects
    treeProvider = new AbapTreeProvider();
    systemsProvider = new SapSystemsProvider();
    ctx.subscriptions.push(
        vscode.window.registerTreeDataProvider('abapRfcExplorer', treeProvider),
        vscode.window.registerTreeDataProvider('abapRfcSystemsView', systemsProvider)
    );

    // Tree view — transport requests
    transportTreeProvider = new TransportTreeProvider();
    ctx.subscriptions.push(
        vscode.window.registerTreeDataProvider('abapTransportExplorer', transportTreeProvider)
    );

    // Virtual document provider for SAP source (used by diff command)
    ctx.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            SAP_SOURCE_SCHEME,
            new SapSourceProvider(ctx)
        )
    );

    // Debounce timer for syntax-check-on-save (avoids RFC floods on rapid saves)
    let syntaxCheckTimer: NodeJS.Timeout | undefined;

    // Auto syntax check + style check on save
    ctx.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((doc) => {
            if (!doc.fileName.endsWith('.abap')) {
                return;
            }
            const cfg = vscode.workspace.getConfiguration('abaprfc');

            if (cfg.get<boolean>('syntaxCheckOnSave', false)) {
                if (syntaxCheckTimer) {
                    clearTimeout(syntaxCheckTimer);
                }
                syntaxCheckTimer = setTimeout(async () => {
                    try {
                        if (parseAbapFilePath(doc.fileName)) {
                            await syntaxCheckCurrentFile(ctx);
                        }
                    } catch (err) {
                        abapLogger.error('onSave.syntaxCheck', err);
                    }
                }, 800);
            }

            if (cfg.get<boolean>('styleCheckOnSave', false)) {
                try {
                    styleProvider.checkDocument(doc);
                } catch (err) {
                    abapLogger.error('onSave.styleCheck', err);
                }
            }
        })
    );

    // Style check on open
    ctx.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => {
            const cfg = vscode.workspace.getConfiguration('abaprfc');
            if (cfg.get<boolean>('styleCheckOnSave', false)) {
                try {
                    styleProvider.checkDocument(doc);
                } catch (err) {
                    abapLogger.error('onOpen.styleCheck', err);
                }
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
        vscode.commands.registerCommand('abapRfcSystemsView.refresh', () => {
            systemsProvider.refresh();
        })
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abapTransportExplorer.refresh', () => {
            transportTreeProvider.refresh();
        })
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('abaprfc.openWorkspace', () => {
            openAbapWorkspace();
        })
    );

    registerCommands(ctx);
}

export function deactivate(): void {
    abapLogger.dispose();
}
