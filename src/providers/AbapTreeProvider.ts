import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getConfiguration } from '../helper/Configuration';
import { readObjectMeta } from '../helper/fileSystem';

const repoPath = path.join(os.homedir(), 'AbapRfc', 'repos');

type ItemType = 'destination' | 'object' | 'folder' | 'file';

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
            case 'object':
                // Icon set later by buildObjects() based on .abapobj metadata
                this.contextValue = 'abapObject';
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
            case 'destination': return this.buildObjects(element.fsPath);
            case 'object':      return this.buildObjectEntries(element.fsPath);
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

    // ── second level: downloaded ABAP objects (programs, FMs, …) ────────────

    private buildObjects(destPath: string): AbapTreeItem[] {
        if (!fs.existsSync(destPath)) {
            return [];
        }

        return fs.readdirSync(destPath, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(e => {
                const objPath = path.join(destPath, e.name);
                const meta = readObjectMeta(objPath);
                const item = new AbapTreeItem(
                    e.name,
                    'object',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    objPath,
                    meta?.objectType === 'FUNC' ? meta.functionGroup : undefined
                );

                // Icon based on object type
                if (meta?.objectType === 'FUNC') {
                    item.iconPath = new vscode.ThemeIcon('symbol-method');
                    item.tooltip = `Function Module: ${e.name}\nFunction Group: ${meta.functionGroup ?? '—'}`;
                } else {
                    item.iconPath = new vscode.ThemeIcon('file-code');
                    item.tooltip = `Program: ${e.name}`;
                }

                return item;
            });
    }

    // ── third level: files and subfolders inside an object ──────────────────

    private buildObjectEntries(objectPath: string): AbapTreeItem[] {
        if (!fs.existsSync(objectPath)) {
            return [];
        }

        const items: AbapTreeItem[] = [];

        for (const e of fs.readdirSync(objectPath, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))) {

            // Skip hidden metadata file
            if (e.name === '.abapobj') {
                continue;
            }

            const fullPath = path.join(objectPath, e.name);
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
