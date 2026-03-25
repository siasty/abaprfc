import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getConfiguration } from '../helper/Configuration';

const repoPath = path.join(os.homedir(), 'AbapRfc', 'repos');

type ItemType = 'destination' | 'program' | 'folder' | 'file';

export class AbapTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: ItemType,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly fsPath: string,
        description?: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.tooltip = fsPath;

        switch (itemType) {
            case 'destination':
                this.contextValue = 'destination';
                this.iconPath = new vscode.ThemeIcon('server');
                break;
            case 'program':
                this.contextValue = 'program';
                this.iconPath = new vscode.ThemeIcon('file-code');
                break;
            case 'folder':
                this.contextValue = 'folder';
                this.iconPath = new vscode.ThemeIcon('folder-opened');
                break;
            case 'file':
                this.contextValue = 'file';
                this.resourceUri = vscode.Uri.file(fsPath);
                this.command = {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(fsPath)]
                };
                break;
        }
    }
}

export class AbapTreeProvider implements vscode.TreeDataProvider<AbapTreeItem> {

    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<AbapTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AbapTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AbapTreeItem): AbapTreeItem[] {
        if (!element) {
            return this.buildDestinations();
        }
        switch (element.itemType) {
            case 'destination': return this.buildPrograms(element.fsPath);
            case 'program':     return this.buildProgramEntries(element.fsPath);
            case 'folder':      return this.buildFiles(element.fsPath);
            default:            return [];
        }
    }

    // ── root level: configured SAP systems ──────────────────────────────────

    private buildDestinations(): AbapTreeItem[] {
        const configs = getConfiguration();
        if (!configs || !Array.isArray(configs)) {
            return [];
        }

        return configs.map((c: any) => {
            const destPath = path.join(repoPath, c.dest);
            const hasContent = fs.existsSync(destPath) &&
                fs.readdirSync(destPath).some(e =>
                    fs.statSync(path.join(destPath, e)).isDirectory()
                );

            return new AbapTreeItem(
                c.dest,
                'destination',
                hasContent
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed,
                destPath,
                c.ashost
            );
        });
    }

    // ── second level: downloaded programs ───────────────────────────────────

    private buildPrograms(destPath: string): AbapTreeItem[] {
        if (!fs.existsSync(destPath)) {
            return [];
        }

        return fs.readdirSync(destPath, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(e => new AbapTreeItem(
                e.name,
                'program',
                vscode.TreeItemCollapsibleState.Collapsed,
                path.join(destPath, e.name)
            ));
    }

    // ── third level: files and subfolders inside a program ──────────────────

    private buildProgramEntries(programPath: string): AbapTreeItem[] {
        if (!fs.existsSync(programPath)) {
            return [];
        }

        const entries = fs.readdirSync(programPath, { withFileTypes: true });
        const items: AbapTreeItem[] = [];

        // .abap files first, then subdirectories
        for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const fullPath = path.join(programPath, e.name);
            if (e.isFile() && e.name.endsWith('.abap')) {
                items.push(new AbapTreeItem(
                    e.name,
                    'file',
                    vscode.TreeItemCollapsibleState.None,
                    fullPath
                ));
            } else if (e.isDirectory()) {
                items.push(new AbapTreeItem(
                    e.name,
                    'folder',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    fullPath
                ));
            }
        }

        return items;
    }

    // ── leaf level: files inside a subfolder (e.g. INCLUDES) ────────────────

    private buildFiles(folderPath: string): AbapTreeItem[] {
        if (!fs.existsSync(folderPath)) {
            return [];
        }

        return fs.readdirSync(folderPath, { withFileTypes: true })
            .filter(e => e.isFile() && e.name.endsWith('.abap'))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(e => new AbapTreeItem(
                e.name,
                'file',
                vscode.TreeItemCollapsibleState.None,
                path.join(folderPath, e.name)
            ));
    }
}
