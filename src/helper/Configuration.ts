import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AbapRfcConfigModel } from '../models/abapConfigModel';
import { UPDATE_TITLE, BUTTONS, SEVERITY, ValidatorResponseItem, WebviewWizard, WizardDefinition, IWizardPage, PerformFinishResponse } from '@redhat-developer/vscode-wizard';

const _path = path.join(os.homedir(), 'AbapRfc', 'abapConfig.json');

const SECRET_KEY_PREFIX = 'abaprfc.passwd.';

export async function openSampleWizard(context: vscode.ExtensionContext) {
  const wiz: WebviewWizard = singlePageAllControls(context);
  wiz.open();
}

export async function checkConfigurationFile() {
  const appPrefix = 'AbapRfc';
  try {
    const _tmp = path.join(os.homedir(), appPrefix);
    if (!fs.existsSync(_tmp)) {
      fs.mkdirSync(_tmp);
    }
    await createFile(path.join(_tmp, 'abapConfig.json'));
  } catch (ex) {
    console.log(ex);
  }
}

export function getConfiguration(dest?: string): any | undefined {
  try {
    const data = fs.readFileSync(_path, 'utf-8');
    if (!data || data === '') {
      return undefined;
    }
    const array = JSON.parse(data);
    if (typeof dest !== 'undefined') {
      return array.find((i: { dest: string }) => i.dest === dest);
    }
    return array;
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { message: `Something has gone wrong (${err.message})` };
    }
  }
}

export async function getFullConfiguration(dest: string, context: vscode.ExtensionContext): Promise<any | undefined> {
  const config = getConfiguration(dest);
  if (!config) {
    return undefined;
  }
  const passwd = await context.secrets.get(`${SECRET_KEY_PREFIX}${dest}`);
  return { ...config, passwd };
}

async function setConfiguration(data: any, context: vscode.ExtensionContext): Promise<boolean> {
  const { passwd, ...configData } = data;
  const model = new AbapRfcConfigModel(
    configData.dest,
    configData.ashost,
    configData.user,
    configData.sysnr,
    configData.client,
    configData.lang
  );

  const _conf = getConfiguration();
  let obj: AbapRfcConfigModel[] = [];

  if (_conf !== undefined) {
    _conf.push(model);
    obj = _conf;
  } else {
    obj.push(model);
  }

  await context.secrets.store(`${SECRET_KEY_PREFIX}${model.dest}`, passwd ?? '');

  const json = JSON.stringify(obj);
  return updateFile(_path, json);
}

async function updateFile(filename: string, data: string): Promise<boolean> {
  try {
    await fs.promises.truncate(filename);
    await fs.promises.writeFile(filename, data);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.log(`updateFile error: ${err.message}`);
    }
    return false;
  }
}

export async function createFile(filename: string): Promise<void> {
  try {
    await fs.promises.access(filename);
  } catch {
    await fs.promises.writeFile(filename, '');
  }
}

function singlePageAllControls(context: vscode.ExtensionContext): WebviewWizard {
  const def: WizardDefinition = singlePageAddConfiguration(context);
  return new WebviewWizard('ConfigPage', 'ConfigPage', context, def, new Map<string, string>());
}

function singlePageAddConfiguration(context: vscode.ExtensionContext): WizardDefinition {
  const def: WizardDefinition = {
    title: 'Create SAP system connection',
    description: ' ',
    pages: [
      {
        id: 'page1',
        hideWizardPageHeader: true,
        fields: [
          {
            id: 'dest',
            label: 'dest',
            description: 'Enter a destination name',
            type: 'textbox',
            initialValue: ''
          },
          {
            id: 'ashost',
            label: 'ashost',
            description: 'Enter a host address',
            type: 'textbox',
            initialValue: ''
          },
          {
            id: 'user',
            label: 'user',
            description: 'Enter a user name',
            type: 'textbox',
            initialValue: ''
          },
          {
            id: 'passwd',
            label: 'passwd',
            description: 'Enter a user password',
            type: 'textbox',
            initialValue: ''
          },
          {
            id: 'sysnr',
            label: 'sysnr',
            description: 'Enter a system number',
            type: 'textbox',
            initialValue: ''
          },
          {
            id: 'client',
            label: 'client',
            description: 'Enter a client number',
            type: 'textbox',
            initialValue: ''
          },
          {
            id: 'lang',
            label: 'lang',
            description: 'Enter a language id',
            type: 'textbox',
            initialValue: ''
          },
        ],
        validator: (parameters: any) => {
          const items: ValidatorResponseItem[] = [];
          const _conf = getConfiguration();
          if (_conf !== undefined) {
            const dest = parameters.dest;
            for (const cmd of _conf) {
              if (dest === cmd.dest) {
                items.push(createValidationItem(SEVERITY.ERROR, 'dest', 'Destination already exists!'));
              }
            }
          }
          return { items };
        }
      }
    ],
    buttons: [{
      id: BUTTONS.FINISH,
      label: 'Save'
    }],
    workflowManager: {
      canFinish(wizard: WebviewWizard, data: any): boolean {
        return data.dest !== '' && data.dest !== ' ' && data.dest !== undefined;
      },
      async performFinish(wizard: WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
        const saved = await setConfiguration(data, context);
        if (saved) {
          vscode.window.showInformationMessage(`Destination ${data.dest} has been saved`);
          return { close: true, success: true, returnObject: null, templates: [] };
        } else {
          vscode.window.showErrorMessage(`Destination ${data.dest} could not be saved`);
          return { close: false, success: false, returnObject: null, templates: [] };
        }
      },
    }
  };
  return def;
}

function createValidationItem(sev: SEVERITY, id: string, content: string): ValidatorResponseItem {
  return {
    severity: sev,
    template: { id, content }
  };
}
