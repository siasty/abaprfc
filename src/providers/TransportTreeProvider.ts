import * as vscode from 'vscode';
import * as path from 'path';
import { getConfiguration, getFullConfiguration } from '../helper/Configuration';
import { createPythonProxy } from '../helper/PythonBridge';
import { isRfcError } from '../helper/RfcErrorHandler';
import { abapLogger } from '../helper/AbapLogger';
import { TransportRequest } from '../models/transportModel';
import { context } from '../extension';

type NodeKind = 'dest' | 'transport' | 'object';

// ── Tree item ─────────────────────────────────────────────────────────────────

export class TransportNode extends vscode.TreeItem {
    constructor(
        public readonly kind: NodeKind,
        label: string,
        public readonly dest: string,
        public readonly trkorr?: string,
        description?: string,
        collapsible = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsible);
        this.description = description;
        this.contextValue = kind;
    }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class TransportTreeProvider implements vscode.TreeDataProvider<TransportNode> {

    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<TransportNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /** Cache per dest: list of open transports */
    private transportCache = new Map<string, TransportRequest[]>();
    /** Cache per trkorr: list of transport objects */
    private objectCache = new Map<string, any[]>();

    refresh(): void {
        this.transportCache.clear();
        this.objectCache.clear();
        this._onDidChangeTreeData.fire();
    }

    refreshDest(dest: string): void {
        this.transportCache.delete(dest);
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TransportNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TransportNode): Promise<TransportNode[]> {
        if (!element) {
            return this.buildDestNodes();
        }
        if (element.kind === 'dest') {
            return this.buildTransportNodes(element.dest);
        }
        if (element.kind === 'transport' && element.trkorr) {
            return this.buildObjectNodes(element.dest, element.trkorr);
        }
        return [];
    }

    // ── Level 1: destinations ────────────────────────────────────────────────

    private buildDestNodes(): TransportNode[] {
        const configs = getConfiguration();
        if (!Array.isArray(configs) || configs.length === 0) {
            const hint = new TransportNode('dest', 'No SAP connections configured', '', undefined, undefined);
            hint.iconPath = new vscode.ThemeIcon('info');
            return [hint];
        }
        return configs.map(c => {
            const node = new TransportNode(
                'dest', c.dest, c.dest, undefined, c.ashost,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            node.iconPath = new vscode.ThemeIcon('server');
            node.tooltip = `${c.user}@${c.ashost}  client ${c.client}`;
            return node;
        });
    }

    // ── Level 2: open transport requests ─────────────────────────────────────

    private async buildTransportNodes(dest: string): Promise<TransportNode[]> {
        if (!this.transportCache.has(dest)) {
            await this.fetchTransports(dest);
        }
        const trs = this.transportCache.get(dest) ?? [];
        if (trs.length === 0) {
            const none = new TransportNode('transport', 'No open transports', dest);
            none.iconPath = new vscode.ThemeIcon('info');
            return [none];
        }
        return trs.map(tr => {
            const node = new TransportNode(
                'transport', tr.trkorr, dest, tr.trkorr,
                tr.description,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            node.iconPath = new vscode.ThemeIcon('package');
            node.tooltip = `Owner: ${tr.owner}  |  ${categoryLabel(tr.category)}`;
            return node;
        });
    }

    private async fetchTransports(dest: string): Promise<void> {
        try {
            const config = await getFullConfiguration(dest, context);
            if (!config) {
                this.transportCache.set(dest, []);
                return;
            }
            const pyFile = path.join(__dirname, '..', 'py', 'abap_write.py');
            const sapWriter = createPythonProxy(pyFile, 'SAPWriter', config);
            const result = await sapWriter.getOpenTransports(config.user as string);

            if (isRfcError(result)) {
                abapLogger.warn('TransportTree', `getOpenTransports failed for ${dest}: ${result['msg_v1']}`);
                this.transportCache.set(dest, []);
                return;
            }

            const rows: any[] = result['ET_CHANGE_REQUESTS'] ?? [];
            const trs: TransportRequest[] = rows.map(r => ({
                trkorr:      r['TRKORR']  ?? '',
                description: r['AS4TEXT'] ?? '',
                owner:       r['AS4USER'] ?? '',
                category:    r['TRSTATUS'] ?? ''
            }));
            this.transportCache.set(dest, trs);
        } catch (err) {
            abapLogger.error('TransportTree.fetchTransports', err);
            this.transportCache.set(dest, []);
        }
    }

    // ── Level 3: objects inside a transport ───────────────────────────────────

    private async buildObjectNodes(dest: string, trkorr: string): Promise<TransportNode[]> {
        if (!this.objectCache.has(trkorr)) {
            await this.fetchObjects(dest, trkorr);
        }
        const objects = this.objectCache.get(trkorr) ?? [];
        if (objects.length === 0) {
            const none = new TransportNode('object', 'No objects in transport', dest);
            none.iconPath = new vscode.ThemeIcon('info');
            return [none];
        }
        return objects.map(obj => {
            const pgmid   = (obj['PGMID']    ?? '').trim();
            const type    = (obj['OBJECT']   ?? '').trim();
            const name    = (obj['OBJ_NAME'] ?? '').trim();
            const label   = name;
            const node = new TransportNode('object', label, dest, trkorr, type);
            node.iconPath = objectIcon(type);
            node.tooltip  = `${pgmid}/${type}: ${name}`;
            return node;
        });
    }

    private async fetchObjects(dest: string, trkorr: string): Promise<void> {
        try {
            const config = await getFullConfiguration(dest, context);
            if (!config) {
                this.objectCache.set(trkorr, []);
                return;
            }
            const pyFile = path.join(__dirname, '..', 'py', 'abap_write.py');
            const sapWriter = createPythonProxy(pyFile, 'SAPWriter', config);
            const result = await sapWriter.getTransportObjects(trkorr);

            if (isRfcError(result)) {
                abapLogger.warn('TransportTree', `getTransportObjects failed for ${trkorr}: ${result['msg_v1']}`);
                this.objectCache.set(trkorr, []);
                return;
            }

            this.objectCache.set(trkorr, result['OBJECTS'] ?? []);
        } catch (err) {
            abapLogger.error('TransportTree.fetchObjects', err);
            this.objectCache.set(trkorr, []);
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryLabel(cat: string): string {
    switch (cat) {
        case 'K': return 'Workbench';
        case 'C': return 'Customizing';
        case 'T': return 'Transport of copies';
        default:  return cat || '—';
    }
}

function objectIcon(objType: string): vscode.ThemeIcon {
    switch (objType) {
        case 'PROG': return new vscode.ThemeIcon('file-code');
        case 'FUGR': return new vscode.ThemeIcon('symbol-method');
        case 'TABL': return new vscode.ThemeIcon('database');
        case 'DTEL': return new vscode.ThemeIcon('symbol-field');
        case 'DOMA': return new vscode.ThemeIcon('symbol-enum');
        case 'CLAS': return new vscode.ThemeIcon('symbol-class');
        case 'INTF': return new vscode.ThemeIcon('symbol-interface');
        case 'MSAG': return new vscode.ThemeIcon('comment');
        case 'ENQU': return new vscode.ThemeIcon('lock');
        default:     return new vscode.ThemeIcon('symbol-misc');
    }
}
