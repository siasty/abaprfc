import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AbapRfcConfigModel } from '../models/abapConfigModel';
import { createPythonProxy } from './PythonBridge';
import { describeRfcError, isRfcError } from './RfcErrorHandler';
import {
    BUTTONS,
    SEVERITY,
    ValidatorResponseItem,
    WebviewWizard,
    WizardDefinition,
    PerformFinishResponse
} from '@redhat-developer/vscode-wizard';

const abapRoot        = path.join(os.homedir(), 'AbapRfc');
const configPath      = path.join(abapRoot, 'abapConfig.json');
const workspacePath   = path.join(abapRoot, 'abaprfc.code-workspace');
export const repoPath = path.join(abapRoot, 'repos');
const pyReadFile      = path.join(__dirname, '../../src/py', 'abap.py');

const SECRET_KEY_PREFIX = 'abaprfc.passwd.';

let _configCache: any[] | null = null;

type ConnectionFormData = {
    dest: string;
    ashost: string;
    user: string;
    passwd: string;
    sysnr: string;
    client: string;
    lang: string;
};

function invalidateCache(): void {
    _configCache = null;
}

export async function openSampleWizard(context: vscode.ExtensionContext): Promise<void> {
    const wiz = singlePageAllControls(context);
    wiz.open();
}

export async function editSavedConnection(
    dest: string,
    context: vscode.ExtensionContext
): Promise<void> {
    const existing = await getEditableConnection(dest, context);
    if (!existing) {
        vscode.window.showErrorMessage(`Destination ${dest} not found.`);
        return;
    }

    const wiz = new WebviewWizard(
        `EditConnection_${dest}`,
        `EditConnection_${dest}`,
        context,
        editPageDefinition(dest, existing, context),
        new Map()
    );
    wiz.open();
}

export async function testSavedConnection(
    dest: string,
    context: vscode.ExtensionContext
): Promise<void> {
    const existing = await getEditableConnection(dest, context);
    if (!existing) {
        vscode.window.showErrorMessage(`Destination ${dest} not found.`);
        return;
    }

    const connectionError = await runConnectionTestWithProgress(
        `Testing SAP connection ${dest}`,
        existing
    );

    if (connectionError) {
        vscode.window.showErrorMessage(`Connection test failed: ${connectionError}`);
        return;
    }

    vscode.window.showInformationMessage(`Connection to ${dest} successful.`);
}

export async function checkConfigurationFile(): Promise<void> {
    try {
        fs.mkdirSync(abapRoot, { recursive: true });
        await createFileIfMissing(configPath);
    } catch (ex) {
        console.error('checkConfigurationFile:', ex);
    }
}

export function getConfiguration(dest?: string): any | undefined {
    if (_configCache === null) {
        _configCache = readConfigFromFile();
    }
    return dest
        ? _configCache.find((i: { dest: string }) => i.dest === dest)
        : _configCache;
}

export async function getFullConfiguration(
    dest: string,
    context: vscode.ExtensionContext
): Promise<any | undefined> {
    const config = getConfiguration(dest);
    if (!config) {
        return undefined;
    }

    const passwd = await context.secrets.get(`${SECRET_KEY_PREFIX}${dest}`);
    return toRfcConfiguration({ ...config, passwd: passwd ?? '' });
}

export async function openAbapWorkspace(): Promise<void> {
    if (!fs.existsSync(workspacePath)) {
        vscode.window.showWarningMessage(
            'ABAP workspace file not found. Add a SAP connection first.'
        );
        return;
    }

    await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(workspacePath)
    );
}

function readConfigFromFile(): any[] {
    try {
        const data = fs.readFileSync(configPath, 'utf-8');
        if (!data || data.trim() === '') {
            return [];
        }
        return JSON.parse(data);
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error('getConfiguration:', err.message);
        }
        return [];
    }
}

async function setConfiguration(
    data: ConnectionFormData,
    context: vscode.ExtensionContext
): Promise<boolean> {
    const normalized = normalizeConnectionData(data);
    const { passwd, ...fields } = normalized;

    const model = new AbapRfcConfigModel(
        fields.dest,
        fields.ashost,
        fields.user,
        fields.sysnr,
        fields.client,
        fields.lang
    );

    const existing: AbapRfcConfigModel[] = getConfiguration() ?? [];
    existing.push(model);

    await context.secrets.store(`${SECRET_KEY_PREFIX}${model.dest}`, passwd);

    const ok = await updateJsonFile(configPath, JSON.stringify(existing));
    if (ok) {
        invalidateCache();
        await updateWorkspaceFile(existing);
    }
    return ok;
}

async function updateConfiguration(
    existingDest: string,
    data: ConnectionFormData,
    context: vscode.ExtensionContext
): Promise<boolean> {
    const normalized = normalizeConnectionData({ ...data, dest: existingDest });
    const configs: AbapRfcConfigModel[] = getConfiguration() ?? [];
    const index = configs.findIndex(c => c.dest === existingDest);
    if (index === -1) {
        return false;
    }

    configs[index] = new AbapRfcConfigModel(
        normalized.dest,
        normalized.ashost,
        normalized.user,
        normalized.sysnr,
        normalized.client,
        normalized.lang
    );

    await context.secrets.store(`${SECRET_KEY_PREFIX}${existingDest}`, normalized.passwd);

    const ok = await updateJsonFile(configPath, JSON.stringify(configs));
    if (ok) {
        invalidateCache();
        await updateWorkspaceFile(configs);
    }
    return ok;
}

async function updateJsonFile(filePath: string, data: string): Promise<boolean> {
    try {
        await fs.promises.writeFile(filePath, data, 'utf-8');
        return true;
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error('updateJsonFile:', err.message);
        }
        return false;
    }
}

async function updateWorkspaceFile(configs: AbapRfcConfigModel[]): Promise<void> {
    try {
        const folders = configs.map(c => {
            const destPath = path.join(repoPath, c.dest);
            fs.mkdirSync(destPath, { recursive: true });
            return { name: c.dest, path: destPath };
        });

        const wsContent = {
            folders,
            settings: {
                'files.associations': { '*.abap': 'abap' }
            }
        };

        await fs.promises.writeFile(
            workspacePath,
            JSON.stringify(wsContent, null, 2),
            'utf-8'
        );
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error('updateWorkspaceFile:', err.message);
        }
    }
}

async function createFileIfMissing(filePath: string): Promise<void> {
    try {
        await fs.promises.access(filePath);
    } catch {
        await fs.promises.writeFile(filePath, '', 'utf-8');
    }
}

async function getEditableConnection(
    dest: string,
    context: vscode.ExtensionContext
): Promise<ConnectionFormData | undefined> {
    const config = getConfiguration(dest);
    if (!config) {
        return undefined;
    }

    const passwd = await context.secrets.get(`${SECRET_KEY_PREFIX}${dest}`);
    return normalizeConnectionData({
        ...config,
        passwd: passwd ?? ''
    });
}

function editPageDefinition(
    dest: string,
    existing: ConnectionFormData,
    context: vscode.ExtensionContext
): WizardDefinition {
    return {
        title: `Edit SAP Connection: ${dest}`,
        description: 'Leave the password field empty to keep the current password. Click "Test & Save" to verify and update.',
        pages: [
            {
                id: 'editPage',
                hideWizardPageHeader: true,
                fields: [
                    { id: 'ashost', label: 'ashost', description: 'Host address',                            type: 'textbox', initialValue: existing.ashost },
                    { id: 'user',   label: 'user',   description: 'User name',                              type: 'textbox', initialValue: existing.user   },
                    { id: 'passwd', label: 'passwd', description: 'Password (empty = keep current)',        type: 'textbox', initialValue: ''               },
                    { id: 'sysnr',  label: 'sysnr',  description: 'System number (2 digits, e.g. 00)',     type: 'textbox', initialValue: existing.sysnr   },
                    { id: 'client', label: 'client', description: 'Client number (3 digits, e.g. 100)',    type: 'textbox', initialValue: existing.client   },
                    { id: 'lang',   label: 'lang',   description: 'Language (2 letters, e.g. EN)',          type: 'textbox', initialValue: existing.lang    },
                ],
                validator: (parameters: any) => {
                    const items: ValidatorResponseItem[] = [];

                    if (!parameters.ashost || parameters.ashost.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'ashost', content: 'SAP host address is required.' } });
                    }
                    if (!parameters.user || parameters.user.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'user', content: 'User name is required.' } });
                    }
                    if (!parameters.sysnr || !/^\d{2}$/.test(parameters.sysnr)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'sysnr', content: 'System number must be exactly 2 digits, e.g. 00.' } });
                    }
                    if (!parameters.client || !/^\d{3}$/.test(parameters.client)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'client', content: 'Client must be exactly 3 digits, e.g. 100.' } });
                    }
                    if (!parameters.lang || !/^[A-Za-z]{2}$/.test(parameters.lang)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'lang', content: 'Language must be exactly 2 letters, e.g. EN.' } });
                    }

                    return { items };
                }
            }
        ],
        buttons: [{ id: BUTTONS.FINISH, label: 'Test & Save' }],
        workflowManager: {
            canFinish(_wizard: WebviewWizard, data: any): boolean {
                return !!(
                    data.ashost?.trim() &&
                    data.user?.trim() &&
                    /^\d{2}$/.test(data.sysnr ?? '') &&
                    /^\d{3}$/.test(data.client ?? '') &&
                    /^[A-Za-z]{2}$/.test(data.lang ?? '')
                );
            },
            async performFinish(_wizard: WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
                const updated = normalizeConnectionData({
                    dest,
                    ashost:  data.ashost,
                    user:    data.user,
                    passwd:  (data.passwd ?? '').trim() === '' ? existing.passwd : data.passwd,
                    sysnr:   data.sysnr,
                    client:  data.client,
                    lang:    data.lang
                });

                const connectionError = await runConnectionTestWithProgress(
                    `Testing SAP connection ${dest}`,
                    updated
                );
                if (connectionError) {
                    vscode.window.showErrorMessage(`Connection test failed: ${connectionError}`);
                    return { close: false, success: false, returnObject: null, templates: [] };
                }

                const saved = await updateConfiguration(dest, updated, context);
                if (saved) {
                    refreshViews();
                    vscode.window.showInformationMessage(`Destination ${dest} updated.`);
                    return { close: true, success: true, returnObject: null, templates: [] };
                }

                vscode.window.showErrorMessage(`Could not update destination ${dest}.`);
                return { close: false, success: false, returnObject: null, templates: [] };
            }
        }
    };
}

async function runConnectionTestWithProgress(
    title: string,
    data: ConnectionFormData
): Promise<string | undefined> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false
        },
        async () => testSapConnection(data)
    );
}

async function testSapConnection(data: ConnectionFormData): Promise<string | undefined> {
    try {
        const sap = createPythonProxy(pyReadFile, 'SAP', toRfcConfiguration(data));
        const result = await sap.testConnection();
        if (isRfcError(result)) {
            return describeRfcError(result);
        }
        return undefined;
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

function toRfcConfiguration(data: Partial<ConnectionFormData>): any {
    return {
        ashost: String(data.ashost ?? '').trim(),
        user: String(data.user ?? '').trim(),
        passwd: String(data.passwd ?? ''),
        sysnr: String(data.sysnr ?? '').trim(),
        client: String(data.client ?? '').trim(),
        lang: String(data.lang ?? '').trim().toUpperCase()
    };
}

function normalizeConnectionData(data: Partial<ConnectionFormData>): ConnectionFormData {
    return {
        dest: String(data.dest ?? '').trim(),
        ashost: String(data.ashost ?? '').trim(),
        user: String(data.user ?? '').trim(),
        passwd: String(data.passwd ?? ''),
        sysnr: String(data.sysnr ?? '').trim(),
        client: String(data.client ?? '').trim(),
        lang: String(data.lang ?? '').trim().toUpperCase()
    };
}

function refreshViews(): void {
    void vscode.commands.executeCommand('abapRfcExplorer.refresh');
    void vscode.commands.executeCommand('abapRfcSystemsView.refresh');
}

function singlePageAllControls(context: vscode.ExtensionContext): WebviewWizard {
    const def = singlePageAddConfiguration(context);
    return new WebviewWizard('ConfigPage', 'ConfigPage', context, def, new Map());
}

function singlePageAddConfiguration(context: vscode.ExtensionContext): WizardDefinition {
    return {
        title: 'Create SAP system connection',
        description: ' ',
        pages: [
            {
                id: 'page1',
                hideWizardPageHeader: true,
                fields: [
                    { id: 'dest',   label: 'dest',   description: 'Destination name',  type: 'textbox', initialValue: '' },
                    { id: 'ashost', label: 'ashost', description: 'Host address',       type: 'textbox', initialValue: '' },
                    { id: 'user',   label: 'user',   description: 'User name',          type: 'textbox', initialValue: '' },
                    { id: 'passwd', label: 'passwd', description: 'Password',           type: 'textbox', initialValue: '' },
                    { id: 'sysnr',  label: 'sysnr',  description: 'System number',      type: 'textbox', initialValue: '' },
                    { id: 'client', label: 'client', description: 'Client number',      type: 'textbox', initialValue: '' },
                    { id: 'lang',   label: 'lang',   description: 'Language (e.g. EN)', type: 'textbox', initialValue: '' },
                ],
                validator: (parameters: any) => {
                    const items: ValidatorResponseItem[] = [];

                    if (!parameters.dest || parameters.dest.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'dest', content: 'Destination name is required.' } });
                    } else if (!/^[A-Za-z0-9_]+$/.test(parameters.dest)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'dest', content: 'Only letters, digits and underscores allowed.' } });
                    } else {
                        const configs = getConfiguration();
                        if (Array.isArray(configs)) {
                            for (const c of configs) {
                                if (parameters.dest === c.dest) {
                                    items.push({ severity: SEVERITY.ERROR, template: { id: 'dest', content: 'Destination already exists!' } });
                                }
                            }
                        }
                    }

                    if (!parameters.ashost || parameters.ashost.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'ashost', content: 'SAP host address is required.' } });
                    }

                    if (!parameters.user || parameters.user.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'user', content: 'User name is required.' } });
                    }

                    if (!parameters.passwd || parameters.passwd.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'passwd', content: 'Password is required.' } });
                    }

                    if (!parameters.sysnr || !/^\d{2}$/.test(parameters.sysnr)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'sysnr', content: 'System number must be exactly 2 digits, e.g. 00.' } });
                    }

                    if (!parameters.client || !/^\d{3}$/.test(parameters.client)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'client', content: 'Client must be exactly 3 digits, e.g. 100.' } });
                    }

                    if (!parameters.lang || !/^[A-Za-z]{2}$/.test(parameters.lang)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'lang', content: 'Language must be exactly 2 letters, e.g. EN.' } });
                    }

                    return { items };
                }
            }
        ],
        buttons: [{ id: BUTTONS.FINISH, label: 'Save' }],
        workflowManager: {
            canFinish(_wizard: WebviewWizard, data: any): boolean {
                return data.dest !== '' && data.dest !== ' ' && data.dest !== undefined;
            },
            async performFinish(_wizard: WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
                const normalized = normalizeConnectionData(data);
                const connectionError = await runConnectionTestWithProgress(
                    `Testing SAP connection ${normalized.dest}`,
                    normalized
                );

                if (connectionError) {
                    vscode.window.showErrorMessage(`Connection test failed: ${connectionError}`);
                    return { close: false, success: false, returnObject: null, templates: [] };
                }

                const saved = await setConfiguration(normalized, context);
                if (saved) {
                    refreshViews();
                    vscode.window.showInformationMessage(
                        `Destination ${normalized.dest} saved.`,
                        'Open Workspace'
                    ).then(sel => {
                        if (sel === 'Open Workspace') {
                            openAbapWorkspace();
                        }
                    });
                    return { close: true, success: true, returnObject: null, templates: [] };
                }

                vscode.window.showErrorMessage(`Could not save destination ${normalized.dest}.`);
                return { close: false, success: false, returnObject: null, templates: [] };
            }
        }
    };
}
