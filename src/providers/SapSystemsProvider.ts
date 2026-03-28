import * as vscode from 'vscode';
import { getConfiguration } from '../helper/Configuration';
import { getPythonSessionConnectedAt, isPythonSessionConnected } from '../helper/PythonBridge';

export class SapSystemTreeItem extends vscode.TreeItem {
    constructor(
        public readonly dest: string,
        public readonly host: string,
        public readonly user: string,
        public readonly client: string,
        public readonly sysnr: string
    ) {
        super(dest, vscode.TreeItemCollapsibleState.None);
        const connected = isPythonSessionConnected(dest);
        const connectedAt = getPythonSessionConnectedAt(dest);

        this.contextValue = connected ? 'sapSystemConnected' : 'sapSystemDisconnected';
        this.description = connected ? `${host}  session` : host;
        this.tooltip = [
            `Destination: ${dest}`,
            `Host: ${host}`,
            `User: ${user}`,
            `Client: ${client}`,
            `System: ${sysnr}`,
            `RFC Session: ${connected ? 'Active' : 'Inactive'}`,
            connectedAt ? `Connected at: ${new Date(connectedAt).toLocaleString()}` : ''
        ].filter(Boolean).join('\n');
        this.iconPath = connected
            ? new vscode.ThemeIcon('plug')
            : new vscode.ThemeIcon('server');
    }
}

export class SapSystemsProvider implements vscode.TreeDataProvider<SapSystemTreeItem> {

    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<SapSystemTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SapSystemTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SapSystemTreeItem): SapSystemTreeItem[] {
        if (element) {
            return [];
        }

        const configs = getConfiguration();
        if (!configs || !Array.isArray(configs)) {
            return [];
        }

        return configs
            .slice()
            .sort((a, b) => String(a.dest).localeCompare(String(b.dest)))
            .map((c: any) => new SapSystemTreeItem(
                c.dest,
                c.ashost,
                c.user,
                c.client,
                c.sysnr
            ));
    }
}
