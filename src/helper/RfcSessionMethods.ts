import * as vscode from 'vscode';
import { context, preloadTransportExplorer } from '../extension';
import { abapLogger } from './AbapLogger';
import { getFullConfiguration } from './Configuration';
import {
    connectPythonSession,
    disconnectPythonSession,
    isPythonSessionConnected,
} from './PythonBridge';

export async function connectSavedSession(dest: string): Promise<void> {
    const config = await getFullConfiguration(dest, context);
    if (!config) {
        vscode.window.showErrorMessage(`Configuration for ${dest} not found.`);
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Connecting RFC session to ${dest}`,
            cancellable: false
        },
        async () => {
            try {
                await connectPythonSession(dest, config);
                try {
                    await preloadTransportExplorer(dest);
                } catch (refreshErr) {
                    abapLogger.error('connectSavedSession.preloadTransportExplorer', refreshErr);
                }
                refreshViews();
                vscode.window.showInformationMessage(`RFC session connected: ${dest}.`);
            } catch (err) {
                abapLogger.error('connectSavedSession', err);
                vscode.window.showErrorMessage(
                    `RFC session connect failed: ${err instanceof Error ? err.message : err}`
                );
            }
        }
    );
}

export async function disconnectSavedSession(dest: string): Promise<void> {
    if (!isPythonSessionConnected(dest)) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Disconnecting RFC session from ${dest}`,
            cancellable: false
        },
        async () => {
            try {
                await disconnectPythonSession(dest);
                refreshViews();
                vscode.window.showInformationMessage(`RFC session disconnected: ${dest}.`);
            } catch (err) {
                abapLogger.error('disconnectSavedSession', err);
                vscode.window.showErrorMessage(
                    `RFC session disconnect failed: ${err instanceof Error ? err.message : err}`
                );
            }
        }
    );
}

function refreshViews(): void {
    void vscode.commands.executeCommand('abapRfcSystemsView.refresh');
    void vscode.commands.executeCommand('abapTransportExplorer.refresh');
}
