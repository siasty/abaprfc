import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AbapRfcConfigModel } from '../models/abapConfigModel';
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

const SECRET_KEY_PREFIX = 'abaprfc.passwd.';

// ── In-memory config cache ───────────────────────────────────────────────────
let _configCache: any[] | null = null;

function invalidateCache(): void {
    _configCache = null;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function openSampleWizard(context: vscode.ExtensionContext): Promise<void> {
    const wiz = singlePageAllControls(context);
    wiz.open();
}

export async function checkConfigurationFile(): Promise<void> {
    try {
        fs.mkdirSync(abapRoot, { recursive: true });
        await createFileIfMissing(configPath);
    } catch (ex) {
        console.error('checkConfigurationFile:', ex);
    }
}

/** Returns all connections (array) or a single connection by dest. Uses in-memory cache. */
export function getConfiguration(dest?: string): any | undefined {
    if (_configCache === null) {
        _configCache = readConfigFromFile();
    }
    return dest
        ? _configCache.find((i: { dest: string }) => i.dest === dest)
        : _configCache;
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

/** Returns connection config merged with the password from SecretStorage. */
export async function getFullConfiguration(
    dest: string,
    context: vscode.ExtensionContext
): Promise<any | undefined> {
    const config = getConfiguration(dest);
    if (!config) {
        return undefined;
    }
    const passwd = await context.secrets.get(`${SECRET_KEY_PREFIX}${dest}`);
    return { ...config, passwd };
}

/** Opens (or prompts to open) the persisted ABAP workspace file. */
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

// ── Internal helpers ─────────────────────────────────────────────────────────

async function setConfiguration(
    data: any,
    context: vscode.ExtensionContext
): Promise<boolean> {
    const { passwd, ...fields } = data;

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

    await context.secrets.store(`${SECRET_KEY_PREFIX}${model.dest}`, passwd ?? '');

    const ok = await updateJsonFile(configPath, JSON.stringify(existing));
    if (ok) {
        invalidateCache();
        await updateWorkspaceFile(existing);
    }
    return ok;
}

async function updateJsonFile(filePath: string, data: string): Promise<boolean> {
    try {
        await fs.promises.truncate(filePath);
        await fs.promises.writeFile(filePath, data, 'utf-8');
        return true;
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error('updateJsonFile:', err.message);
        }
        return false;
    }
}

/**
 * Keeps the .code-workspace file in sync with the list of SAP connections.
 * Each destination gets its own folder entry so the workspace persists
 * across VS Code restarts without calling updateWorkspaceFolders every time.
 */
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

// ── Wizard ───────────────────────────────────────────────────────────────────

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

                    // Destination
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

                    // Host
                    if (!parameters.ashost || parameters.ashost.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'ashost', content: 'SAP host address is required.' } });
                    }

                    // User
                    if (!parameters.user || parameters.user.trim() === '') {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'user', content: 'User name is required.' } });
                    }

                    // System number — must be exactly 2 digits
                    if (!parameters.sysnr || !/^\d{2}$/.test(parameters.sysnr)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'sysnr', content: 'System number must be exactly 2 digits, e.g. 00.' } });
                    }

                    // Client — must be exactly 3 digits
                    if (!parameters.client || !/^\d{3}$/.test(parameters.client)) {
                        items.push({ severity: SEVERITY.ERROR, template: { id: 'client', content: 'Client must be exactly 3 digits, e.g. 100.' } });
                    }

                    // Language — must be exactly 2 letters
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
                const saved = await setConfiguration(data, context);
                if (saved) {
                    vscode.window.showInformationMessage(
                        `Destination ${data.dest} saved.`,
                        'Open Workspace'
                    ).then(sel => {
                        if (sel === 'Open Workspace') {
                            openAbapWorkspace();
                        }
                    });
                    return { close: true, success: true, returnObject: null, templates: [] };
                }
                vscode.window.showErrorMessage(`Could not save destination ${data.dest}.`);
                return { close: false, success: false, returnObject: null, templates: [] };
            }
        }
    };
}
