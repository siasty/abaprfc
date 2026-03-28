import * as path from 'path';
import * as vscode from 'vscode';
import { context } from '../extension';
import { getConfiguration, getFullConfiguration } from '../helper/Configuration';
import { abapLogger } from '../helper/AbapLogger';
import { createPythonProxy } from '../helper/PythonBridge';
import { describeRfcError, isRfcError } from '../helper/RfcErrorHandler';
import { TransportRequest } from '../models/transportModel';

type NodeKind = 'dest' | 'transport' | 'object';

const pyWriteFile = path.join(__dirname, '../../src/py', 'abap_write.py');

export class TransportNode extends vscode.TreeItem {
    constructor(
        public readonly kind: NodeKind,
        label: string,
        public readonly dest: string,
        public readonly transport?: TransportRequest,
        description?: string,
        collapsible = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsible);
        this.description = description;
        this.contextValue = kind;
    }

    get trkorr(): string | undefined {
        return this.transport?.trkorr;
    }
}

export class TransportTreeProvider implements vscode.TreeDataProvider<TransportNode> {
    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<TransportNode | undefined | null | void>();

    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private transportCache = new Map<string, TransportRequest[]>();
    private transportErrorCache = new Map<string, string>();
    private objectCache = new Map<string, any[]>();
    private objectErrorCache = new Map<string, string>();

    refresh(): void {
        this.transportCache.clear();
        this.transportErrorCache.clear();
        this.objectCache.clear();
        this.objectErrorCache.clear();
        this._onDidChangeTreeData.fire();
    }

    refreshDest(dest: string): void {
        this.transportCache.delete(dest);
        this.transportErrorCache.delete(dest);
        this._onDidChangeTreeData.fire();
    }

    async preloadDest(dest: string): Promise<void> {
        this.transportCache.delete(dest);
        this.transportErrorCache.delete(dest);
        this.objectCache.clear();
        this.objectErrorCache.clear();
        await this.fetchTransports(dest);
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
            return this.buildRootTransportNodes(element.dest);
        }

        if (element.kind === 'transport' && element.trkorr) {
            const childTransports = await this.buildChildTransportNodes(element.dest, element.trkorr);
            if (childTransports.length > 0) {
                return childTransports;
            }
            return this.buildObjectNodes(element.dest, element.trkorr);
        }

        return [];
    }

    private buildDestNodes(): TransportNode[] {
        const configs = getConfiguration();
        if (!Array.isArray(configs) || configs.length === 0) {
            const hint = new TransportNode('dest', 'No SAP connections configured', '');
            hint.iconPath = new vscode.ThemeIcon('info');
            return [hint];
        }

        return configs.map((c: any) => {
            const node = new TransportNode(
                'dest',
                c.dest,
                c.dest,
                undefined,
                c.ashost,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            node.iconPath = new vscode.ThemeIcon('server');
            node.tooltip = `${c.user}@${c.ashost}  client ${c.client}`;
            return node;
        });
    }

    private async buildRootTransportNodes(dest: string): Promise<TransportNode[]> {
        await this.ensureTransports(dest);

        const error = this.transportErrorCache.get(dest);
        if (error) {
            const failed = new TransportNode(
                'transport',
                'Failed to load transports',
                dest,
                undefined,
                'See AbapRfc logs'
            );
            failed.iconPath = new vscode.ThemeIcon('error');
            failed.tooltip = error;
            return [failed];
        }

        const transports = this.transportCache.get(dest) ?? [];
        if (transports.length === 0) {
            const none = new TransportNode('transport', 'No open transports', dest);
            none.iconPath = new vscode.ThemeIcon('info');
            return [none];
        }

        const knownTrkorr = new Set(transports.map(tr => tr.trkorr));
        const roots = transports.filter(tr => !tr.parentTrkorr || !knownTrkorr.has(tr.parentTrkorr));

        return roots
            .sort((a, b) => a.trkorr.localeCompare(b.trkorr))
            .map(tr => this.createTransportNode(dest, tr));
    }

    private async buildChildTransportNodes(dest: string, parentTrkorr: string): Promise<TransportNode[]> {
        await this.ensureTransports(dest);

        const transports = this.transportCache.get(dest) ?? [];
        return transports
            .filter(tr => tr.parentTrkorr === parentTrkorr)
            .sort((a, b) => a.trkorr.localeCompare(b.trkorr))
            .map(tr => this.createTransportNode(dest, tr));
    }

    private createTransportNode(dest: string, tr: TransportRequest): TransportNode {
        const node = new TransportNode(
            'transport',
            tr.trkorr,
            dest,
            tr,
            transportSummary(tr),
            vscode.TreeItemCollapsibleState.Collapsed
        );

        node.iconPath = tr.parentTrkorr
            ? new vscode.ThemeIcon('symbol-method')
            : new vscode.ThemeIcon('package');
        node.tooltip = transportTooltip(tr);
        return node;
    }

    private async ensureTransports(dest: string): Promise<void> {
        if (!this.transportCache.has(dest)) {
            await this.fetchTransports(dest);
        }
    }

    private async fetchTransports(dest: string): Promise<void> {
        try {
            const config = await getFullConfiguration(dest, context);
            if (!config) {
                const message = `Configuration not found for ${dest}.`;
                this.transportErrorCache.set(dest, message);
                this.transportCache.set(dest, []);
                abapLogger.warn('TransportTree', message);
                vscode.window.showErrorMessage(`Transports [${dest}]: configuration not found.`);
                return;
            }

            abapLogger.info('TransportTree', `Fetching transports for ${dest} (user: ${config.user})`);
            const sapWriter = createPythonProxy(pyWriteFile, 'SAPWriter', config);
            const result = await sapWriter.getOpenTransports(config.user as string);

            abapLogger.info('TransportTree', `Raw result keys: ${JSON.stringify(Object.keys(result ?? {}))}`);

            if (isRfcError(result)) {
                const message = describeRfcError(result);
                abapLogger.warn('TransportTree', `getOpenTransports error [${dest}]: ${message}`);
                this.transportErrorCache.set(dest, message);
                this.transportCache.set(dest, []);
                vscode.window.showErrorMessage(`Transports [${dest}]: ${message}`);
                return;
            }

            const rows: any[] = result['ET_CHANGE_REQUESTS'] ?? [];
            const transports = rows.map(row => mapTransportRow(row));

            abapLogger.info('TransportTree', `Found ${transports.length} transport(s) for ${dest}`);
            this.transportErrorCache.delete(dest);
            this.transportCache.set(dest, transports);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            abapLogger.error('TransportTree.fetchTransports', err);
            this.transportErrorCache.set(dest, message);
            this.transportCache.set(dest, []);
            vscode.window.showErrorMessage(`Transports [${dest}]: ${message}`);
        }
    }

    private async buildObjectNodes(dest: string, trkorr: string): Promise<TransportNode[]> {
        if (!this.objectCache.has(trkorr)) {
            await this.fetchObjects(dest, trkorr);
        }

        const error = this.objectErrorCache.get(trkorr);
        if (error) {
            const failed = new TransportNode(
                'object',
                'Failed to load transport objects',
                dest,
                undefined,
                'See AbapRfc logs'
            );
            failed.iconPath = new vscode.ThemeIcon('error');
            failed.tooltip = error;
            return [failed];
        }

        const objects = this.objectCache.get(trkorr) ?? [];
        if (objects.length === 0) {
            const none = new TransportNode('object', 'No objects in transport', dest);
            none.iconPath = new vscode.ThemeIcon('info');
            return [none];
        }

        return objects.map(obj => {
            const pgmid = String(obj['PGMID'] ?? '').trim();
            const type = String(obj['OBJECT'] ?? '').trim();
            const name = String(obj['OBJ_NAME'] ?? '').trim();
            const label = name;
            const description = type;
            const node = new TransportNode('object', label, dest, undefined, description);
            node.iconPath = objectIcon(type);
            node.tooltip = `${pgmid}/${type}: ${name}`;
            return node;
        });
    }

    private async fetchObjects(dest: string, trkorr: string): Promise<void> {
        try {
            const config = await getFullConfiguration(dest, context);
            if (!config) {
                this.objectErrorCache.set(trkorr, `Configuration not found for ${dest}.`);
                this.objectCache.set(trkorr, []);
                return;
            }

            abapLogger.info('TransportTree', `Fetching objects for ${trkorr}`);
            const sapWriter = createPythonProxy(pyWriteFile, 'SAPWriter', config);
            const result = await sapWriter.getTransportObjects(trkorr);

            if (isRfcError(result)) {
                const message = describeRfcError(result);
                abapLogger.warn('TransportTree', `getTransportObjects error [${trkorr}]: ${message}`);
                this.objectErrorCache.set(trkorr, message);
                this.objectCache.set(trkorr, []);
                vscode.window.showErrorMessage(`Transport objects [${trkorr}]: ${message}`);
                return;
            }

            const objects = result['OBJECTS'] ?? [];
            abapLogger.info('TransportTree', `Found ${objects.length} object(s) in ${trkorr}`);
            this.objectErrorCache.delete(trkorr);
            this.objectCache.set(trkorr, objects);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            abapLogger.error('TransportTree.fetchObjects', err);
            this.objectErrorCache.set(trkorr, message);
            this.objectCache.set(trkorr, []);
            vscode.window.showErrorMessage(`Transport objects [${trkorr}]: ${message}`);
        }
    }
}

function mapTransportRow(row: any): TransportRequest {
    return {
        trkorr: String(row['TRKORR'] ?? '').trim(),
        description: transportDescription(row),
        owner: String(row['AS4USER'] ?? '').trim(),
        category: String(row['TRFUNCTION'] ?? '').trim(),
        targetSystem: String(row['TARSYSTEM'] ?? '').trim(),
        status: String(row['TRSTATUS'] ?? '').trim(),
        parentTrkorr: String(row['STRKORR'] ?? '').trim(),
    };
}

function transportSummary(tr: TransportRequest): string {
    const parts: string[] = [];

    const category = categoryLabel(tr.category);
    if (category) {
        parts.push(category);
    }

    if (tr.targetSystem) {
        parts.push(tr.targetSystem);
    }

    if (tr.status) {
        parts.push(statusLabel(tr.status));
    }

    return parts.join(' | ');
}

function transportDescription(row: any): string {
    const status = statusLabel(String(row['TRSTATUS'] ?? '').trim());
    const parent = String(row['STRKORR'] ?? '').trim();
    const targetSystem = String(row['TARSYSTEM'] ?? '').trim();
    const parts: string[] = [];

    if (targetSystem) {
        parts.push(targetSystem);
    }
    if (status) {
        parts.push(status);
    }
    if (parent) {
        parts.push(`Parent ${parent}`);
    }

    return parts.join(' | ');
}

function transportTooltip(tr: TransportRequest): string {
    const parts = [
        `Owner: ${tr.owner || '?'}`,
        categoryLabel(tr.category),
    ];

    if (tr.targetSystem) {
        parts.push(`Target: ${tr.targetSystem}`);
    }
    if (tr.status) {
        parts.push(`Status: ${statusLabel(tr.status)}`);
    }
    if (tr.parentTrkorr) {
        parts.push(`Parent: ${tr.parentTrkorr}`);
    }

    return parts.join('  |  ');
}

function categoryLabel(cat: string): string {
    switch (cat) {
        case 'K':
            return 'Workbench Request';
        case 'W':
            return 'Customizing Request';
        case 'C':
            return 'Relocation Without Package Change';
        case 'O':
            return 'Relocation With Package Change';
        case 'E':
            return 'Relocation of Complete Package';
        case 'T':
            return 'Transport of copies';
        case 'S':
            return 'Development/Correction';
        case 'R':
            return 'Repair';
        case 'X':
            return 'Unclassified Task';
        case 'Q':
            return 'Customizing Task';
        case 'G':
            return 'Piece List for CTS Project';
        case 'M':
            return 'Client Transport Request';
        case 'P':
            return 'Piece List for Upgrade';
        case 'D':
            return 'Piece List for Support Package';
        case 'F':
            return 'Piece List';
        case 'L':
            return 'Deletion transport';
        default:
            return cat || '';
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case 'D':
            return 'Modifiable';
        case 'L':
            return 'Modifiable, Protected';
        case 'O':
            return 'Release Started';
        case 'R':
            return 'Released';
        case 'N':
            return 'Released (Import Protected)';
        default:
            return status || '';
    }
}

function objectIcon(objType: string): vscode.ThemeIcon {
    switch (objType) {
        case 'PROG':
            return new vscode.ThemeIcon('file-code');
        case 'FUGR':
            return new vscode.ThemeIcon('symbol-method');
        case 'TABL':
            return new vscode.ThemeIcon('database');
        case 'DTEL':
            return new vscode.ThemeIcon('symbol-field');
        case 'DOMA':
            return new vscode.ThemeIcon('symbol-enum');
        case 'CLAS':
            return new vscode.ThemeIcon('symbol-class');
        case 'INTF':
            return new vscode.ThemeIcon('symbol-interface');
        case 'MSAG':
            return new vscode.ThemeIcon('comment');
        case 'ENQU':
            return new vscode.ThemeIcon('lock');
        case 'INDX':
            return new vscode.ThemeIcon('symbol-array');
        default:
            return new vscode.ThemeIcon('symbol-misc');
    }
}
