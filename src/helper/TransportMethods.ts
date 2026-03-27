import * as path from 'path';
import * as vscode from 'vscode';
import {
    BUTTONS,
    PerformFinishResponse,
    SEVERITY,
    ValidatorResponseItem,
    WebviewWizard,
    WizardDefinition,
} from '@redhat-developer/vscode-wizard';
import { context } from '../extension';
import { TransportRequest } from '../models/transportModel';
import { abapLogger } from './AbapLogger';
import { getFullConfiguration } from './Configuration';
import { createPythonProxy } from './PythonBridge';
import { describeRfcError, isRfcError } from './RfcErrorHandler';

const GLOBAL_STATE_KEY = 'abaprfc.lastTR';
const CREATE_NEW = '$(add)  Create new transport request...';
const pyWriteFile = path.join(__dirname, '../../src/py', 'abap_write.py');

const sessionCache = new Map<string, string>();

type RequestTypeCode = 'K' | 'W' | 'T' | 'C' | 'O' | 'E';

interface RequestTypeOption {
    code: RequestTypeCode;
    label: string;
}

interface CreateTransportInput {
    requestType: string;
    description: string;
}

interface CreateTransportResult {
    ok: boolean;
    trkorr?: string;
    error?: string;
}

const REQUEST_TYPE_OPTIONS: RequestTypeOption[] = [
    { code: 'K', label: 'Workbench Request' },
    { code: 'W', label: 'Customizing Request' },
    { code: 'T', label: 'Transport of Copies' },
    { code: 'C', label: 'Relocation Without Package Change' },
    { code: 'O', label: 'Relocation With Package Change' },
    { code: 'E', label: 'Relocation of Complete Package' },
];

const REQUEST_TYPE_PROVIDER = {
    getItems(): RequestTypeOption[] {
        return REQUEST_TYPE_OPTIONS;
    },
    getValueItem(item: RequestTypeOption): string {
        return item.code;
    },
    getLabelItem(item: RequestTypeOption): string {
        return item.label;
    }
};

function getPersistedTR(dest: string): string | undefined {
    const store: Record<string, string> = context?.globalState.get(GLOBAL_STATE_KEY) ?? {};
    return store[dest];
}

function persistTR(dest: string, trkorr: string): void {
    const store: Record<string, string> = context?.globalState.get(GLOBAL_STATE_KEY) ?? {};
    store[dest] = trkorr;
    context?.globalState.update(GLOBAL_STATE_KEY, store);
}

export async function selectTransport(
    dest: string,
    sapWriter: any,
    userId: string
): Promise<string | undefined> {
    const cached = sessionCache.get(dest) ?? getPersistedTR(dest);

    if (cached) {
        const reuse = await vscode.window.showQuickPick(
            [
                { label: `$(history)  ${cached}`, description: 'Last used transport', trkorr: cached },
                { label: '$(list-unordered)  Choose different transport...', description: '', trkorr: '' }
            ],
            { placeHolder: `Active transport for ${dest}` }
        );

        if (!reuse) {
            return undefined;
        }
        if (reuse.trkorr) {
            return reuse.trkorr;
        }
    }

    return pickOrCreateTransport(dest, sapWriter, userId);
}

export function clearTransportCache(dest: string): void {
    sessionCache.delete(dest);
}

export async function openCreateTransportWizard(dest: string): Promise<void> {
    const config = await getFullConfiguration(dest, context);
    if (!config) {
        vscode.window.showErrorMessage(`Configuration not found for ${dest}.`);
        return;
    }

    const owner = String(config.user ?? '').trim().toUpperCase();
    const client = String(config.client ?? '').trim();

    if (!owner || !client) {
        vscode.window.showErrorMessage(
            `Transport creation requires owner and client in SAP connection ${dest}.`
        );
        return;
    }

    const wizard = new WebviewWizard(
        `CreateTransport_${dest}_${Date.now()}`,
        `CreateTransport_${dest}`,
        context,
        createTransportWizardDefinition(dest, owner, client),
        new Map()
    );

    wizard.open();
}

async function pickOrCreateTransport(
    dest: string,
    sapWriter: any,
    userId: string
): Promise<string | undefined> {
    const openTRs = await fetchOpenTransports(sapWriter, userId);

    const items: vscode.QuickPickItem[] = [
        ...openTRs.map(tr => ({
            label: `$(tag)  ${tr.trkorr}`,
            description: tr.description,
            detail: transportDetail(tr)
        })),
        { label: CREATE_NEW, description: '' }
    ];

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: openTRs.length > 0
            ? `Select transport request for ${dest}`
            : `No open transports found for ${userId} - create a new one`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!pick) {
        return undefined;
    }

    if (pick.label === CREATE_NEW) {
        return createNewTransport(dest);
    }

    const trkorr = pick.label.replace('$(tag)  ', '').trim();
    sessionCache.set(dest, trkorr);
    persistTR(dest, trkorr);
    return trkorr;
}

async function createNewTransport(dest: string): Promise<string | undefined> {
    const requestType = await promptForRequestType();
    if (!requestType) {
        return undefined;
    }

    const description = await vscode.window.showInputBox({
        prompt: `${requestTypeLabel(requestType)} description`,
        placeHolder: 'e.g. My ABAP changes',
        validateInput: value => (!value || value.trim() === '') ? 'Description is required' : undefined
    });

    if (!description) {
        return undefined;
    }

    const result = await vscode.window.withProgress<CreateTransportResult>(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Creating ${requestTypeLabel(requestType)} in ${dest}`,
            cancellable: false
        },
        async () => createTransportRequest(dest, {
            requestType,
            description
        })
    );

    if (!result.ok || !result.trkorr) {
        vscode.window.showErrorMessage(`Failed to create transport: ${result.error || 'Unknown error'}`);
        return undefined;
    }

    afterTransportCreated(dest, result.trkorr, requestType);
    return result.trkorr;
}

async function fetchOpenTransports(sapWriter: any, userId: string): Promise<TransportRequest[]> {
    try {
        const result = await sapWriter.getOpenTransports(userId);

        if (isRfcError(result)) {
            return [];
        }

        const rows: any[] = result['ET_CHANGE_REQUESTS'] ?? [];
        return rows.map(row => ({
            trkorr: String(row['TRKORR'] ?? '').trim(),
            description: transportDescription(row),
            owner: String(row['AS4USER'] ?? '').trim(),
            category: String(row['TRFUNCTION'] ?? '').trim(),
            status: String(row['TRSTATUS'] ?? '').trim(),
            parentTrkorr: String(row['STRKORR'] ?? '').trim(),
        }));
    } catch {
        return [];
    }
}

function createTransportWizardDefinition(
    dest: string,
    owner: string,
    client: string
): WizardDefinition {
    return {
        title: `Create Transport Request: ${dest}`,
        description: 'Creates a new SAP transport request for the selected system and refreshes the Transports view after success.',
        pages: [
            {
                id: 'createTransportPage',
                hideWizardPageHeader: true,
                fields: [
                    {
                        id: 'system',
                        label: 'System',
                        description: 'Destination where the request will be created.',
                        type: 'textbox',
                        initialValue: dest,
                        properties: { disabled: true }
                    },
                    {
                        id: 'owner',
                        label: 'Owner',
                        description: 'SAP user taken from the saved connection.',
                        type: 'textbox',
                        initialValue: owner,
                        properties: { disabled: true }
                    },
                    {
                        id: 'client',
                        label: 'Source Client',
                        description: 'Source client taken from the saved connection.',
                        type: 'textbox',
                        initialValue: client,
                        properties: { disabled: true }
                    },
                    {
                        id: 'requestType',
                        label: 'Request Type',
                        description: 'Common request categories available in SE09/SE10.',
                        type: 'select',
                        initialValue: 'K',
                        optionProvider: REQUEST_TYPE_PROVIDER
                    },
                    {
                        id: 'description',
                        label: 'Short Description',
                        description: 'This text will be visible as the transport description in SAP.',
                        type: 'textarea',
                        initialValue: '',
                        placeholder: 'e.g. ABAP changes for billing validation',
                        focus: true,
                        properties: { rows: 3 }
                    }
                ],
                validator: (parameters: any) => {
                    const items: ValidatorResponseItem[] = [];
                    const requestType = normalizeRequestType(parameters.requestType);
                    const description = String(parameters.description ?? '').trim();

                    if (!requestType) {
                        items.push({
                            severity: SEVERITY.ERROR,
                            template: { id: 'requestType', content: 'Select a valid request type.' }
                        });
                    }

                    if (!description) {
                        items.push({
                            severity: SEVERITY.ERROR,
                            template: { id: 'description', content: 'Short description is required.' }
                        });
                    }

                    return { items };
                }
            }
        ],
        buttons: [{ id: BUTTONS.FINISH, label: 'Create Transport' }],
        workflowManager: {
            canFinish(_wizard: WebviewWizard, data: any): boolean {
                return !!(
                    normalizeRequestType(data.requestType) &&
                    String(data.description ?? '').trim()
                );
            },
            async performFinish(_wizard: WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
                const requestType = normalizeRequestType(data.requestType);
                const description = String(data.description ?? '').trim();

                if (!requestType || !description) {
                    return { close: false, success: false, returnObject: null, templates: [] };
                }

                const result = await vscode.window.withProgress<CreateTransportResult>(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Creating ${requestTypeLabel(requestType)} in ${dest}`,
                        cancellable: false
                    },
                    async () => createTransportRequest(dest, {
                        requestType,
                        description
                    })
                );

                if (!result.ok || !result.trkorr) {
                    vscode.window.showErrorMessage(`Failed to create transport: ${result.error || 'Unknown error'}`);
                    return { close: false, success: false, returnObject: null, templates: [] };
                }

                afterTransportCreated(dest, result.trkorr, requestType);
                return {
                    close: true,
                    success: true,
                    returnObject: { trkorr: result.trkorr },
                    templates: []
                };
            }
        }
    };
}

async function createTransportRequest(
    dest: string,
    input: CreateTransportInput
): Promise<CreateTransportResult> {
    const config = await getFullConfiguration(dest, context);
    if (!config) {
        return { ok: false, error: `Configuration not found for ${dest}.` };
    }

    const description = input.description.trim();
    const requestType = normalizeRequestType(input.requestType);
    const owner = String(config.user ?? '').trim().toUpperCase();
    const client = String(config.client ?? '').trim();

    if (!description) {
        return { ok: false, error: 'Short description is required.' };
    }

    if (!requestType) {
        return { ok: false, error: 'Unsupported transport request type.' };
    }

    try {
        abapLogger.info(
            'TransportCreate',
            `Creating ${requestType} for ${dest} (owner: ${owner || '?'}, client: ${client || '?'})`
        );

        const sapWriter = createPythonProxy(pyWriteFile, 'SAPWriter', config);
        const result = await sapWriter.createTransport(description, requestType, owner, client);

        if (isRfcError(result)) {
            const message = describeRfcError(result);
            abapLogger.warn('TransportCreate', `Create transport failed [${dest}]: ${message}`);
            return { ok: false, error: message };
        }

        const trkorr = String(result['EV_TRKORR'] ?? result['REQUEST'] ?? '').trim();
        if (!trkorr) {
            const sapMessage = String(result['MESSAGE'] ?? '').trim();
            const retcode = String(result['RETCODE'] ?? '').trim();
            const error = sapMessage || (
                retcode
                    ? `SAP did not return a transport number (RETCODE ${retcode}).`
                    : 'SAP did not return a transport number.'
            );
            abapLogger.warn('TransportCreate', `Create transport returned no number [${dest}]: ${error}`);
            return { ok: false, error };
        }

        sessionCache.set(dest, trkorr);
        persistTR(dest, trkorr);
        abapLogger.info('TransportCreate', `Created ${trkorr} in ${dest}`);
        return { ok: true, trkorr };
    } catch (err) {
        abapLogger.error('TransportCreate', err);
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}

function afterTransportCreated(dest: string, trkorr: string, requestType: string): void {
    void vscode.commands.executeCommand('abapTransportExplorer.refresh');
    vscode.window.showInformationMessage(
        `${requestTypeLabel(requestType)} ${trkorr} created in ${dest}.`
    );
}

async function promptForRequestType(): Promise<string | undefined> {
    const pick = await vscode.window.showQuickPick(
        REQUEST_TYPE_OPTIONS.map(option => ({
            label: option.label,
            description: option.code,
            requestType: option.code
        })),
        {
            placeHolder: 'Select transport request type'
        }
    );

    return pick?.requestType;
}

function normalizeRequestType(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim().toUpperCase();
    return REQUEST_TYPE_OPTIONS.some(option => option.code === normalized as RequestTypeCode)
        ? normalized
        : undefined;
}

function requestTypeLabel(code: string): string {
    const match = REQUEST_TYPE_OPTIONS.find(option => option.code === code);
    return match?.label ?? code;
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
            return cat || '-';
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
            return status || '-';
    }
}

function transportDescription(row: any): string {
    const status = String(row['TRSTATUS'] ?? '').trim();
    const parent = String(row['STRKORR'] ?? '').trim();
    const parts: string[] = [];

    if (status) {
        parts.push(statusLabel(status));
    }
    if (parent) {
        parts.push(`Parent ${parent}`);
    }

    return parts.join(' | ');
}

function transportDetail(tr: TransportRequest): string {
    const parts = [
        `Owner: ${tr.owner || '?'}`,
        `Category: ${categoryLabel(tr.category)}`
    ];

    if (tr.status) {
        parts.push(`Status: ${statusLabel(tr.status)}`);
    }
    if (tr.parentTrkorr) {
        parts.push(`Parent: ${tr.parentTrkorr}`);
    }

    return parts.join('  |  ');
}
