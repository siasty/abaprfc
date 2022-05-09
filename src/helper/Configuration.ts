import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AbapRfcConfigModel } from '../models/abapConfigModel';
import { UPDATE_TITLE, BUTTONS, SEVERITY, ValidatorResponseItem, WebviewWizard, WizardDefinition, IWizardPage, PerformFinishResponse } from '@redhat-developer/vscode-wizard';
import * as util from 'util';

const _path = path.join(os.homedir(), 'AbapRfc', 'abapConfig.json');


export async function openSampleWizard(context: vscode.ExtensionContext) {
  const wiz: WebviewWizard = singlePageAllControls(context);
  wiz.open();
}

export function checkConfigurationFile() {
  let tmpDir;
  const appPrefix = 'AbapRfc';
  try {
    const _tmp = path.join(os.homedir(), appPrefix);
    if (fs.existsSync(_tmp)) {
      createFile(path.join(_tmp, 'abapConfig.json'));
    } else {
      tmpDir = fs.mkdirSync(_tmp);
      createFile(path.join(_tmp, 'abapConfig.json'));
    }
  }
  catch (ex) {
    console.log(ex);
  }
}

export function getConfiguration(dest?: string): any | undefined {
  try {
    let data = fs.readFileSync(_path, 'utf-8');
    if (data) {
      if (data === '') {
        return undefined;
      }
      else {
        if (typeof dest !== 'undefined') {
          let array = JSON.parse(data);
          return array.find((i: { dest: string; }) => i.dest === dest);
        }
        else {
          return JSON.parse(data);
        }
      }
    }

  } catch (err: unknown) {
    if (err instanceof Error) {
      return {
        message: `Something has gone wrong (${(err).message})`,
      };
    }
  }
}

function setConfiguration(dest: AbapRfcConfigModel): boolean {
  const _conf = getConfiguration();
  let obj: any[] = [];

  if (_conf !== undefined) {
    _conf.push(dest);
    obj = _conf;
  }
  else {
    obj.push(new AbapRfcConfigModel(dest.dest, dest.ashost, dest.user, dest.passwd, dest.sysnr, dest.client, dest.lang));
  }
  let json = JSON.stringify(obj);
  return updateFile(_path, json);

}

function updateFile(filename: string, data: any): boolean {

  //clear file
  const trunct = util.promisify(fs.truncate);

  trunct(filename).catch(err => {
    console.log(`Error Occurs,    Error code -> ${err.code},    Error NO -> ${err.errno}`);
    return false;
  });
  // update data

  const write = util.promisify(fs.writeFile);

  write(filename, data).catch(err => {
    console.log(`Error Occurs,    Error code -> ${err.code},    Error NO -> ${err.errno}`);
    return false;
  });
  return true;

}

function createFile(filename: string) {

  fs.open(filename, 'r', function (err, fd) {
    if (err) {
      fs.writeFile(filename, '', function (err) {
        if (err) {
          console.log(err);
        }
      });
    }
  });
}

function singlePageAllControls(context: vscode.ExtensionContext): WebviewWizard {
  let def: WizardDefinition = singlePageAddConfiguration();
  const wiz: WebviewWizard = new WebviewWizard("ConfigPage", "ConfigPage", context, def, new Map<string, string>());
  return wiz;
}

function singlePageAddConfiguration(): WizardDefinition {

  let def: WizardDefinition = {
    title: "Create SAP system connection",
    description: " ",
    pages: [
      {
        id: 'page1',
        hideWizardPageHeader: true,
        fields: [
          {
            id: "dest",
            label: "dest",
            description: "Enter a destination name",
            type: "textbox",
            initialValue: ""
          },
          {
            id: "ashost",
            label: "ashost",
            description: "Enter a host adress",
            type: "textbox",
            initialValue: ""
          },
          {
            id: "user",
            label: "user",
            description: "Enter a user name",
            type: "textbox",
            initialValue: ""
          },
          {
            id: "passwd",
            label: "passwd",
            description: "Enter a user password",
            type: "textbox",
            initialValue: ""
          },
          {
            id: "sysnr",
            label: "sysnr",
            description: "Enter a system number",
            type: "textbox",
            initialValue: ""
          },
          {
            id: "client",
            label: "client",
            description: "Enter a client number",
            type: "textbox",
            initialValue: ""
          },
          {
            id: "lang",
            label: "lang",
            description: "Enter a language id",
            type: "textbox",
            initialValue: ""
          },
        ],
        validator: (parameters: any) => {
          let items: ValidatorResponseItem[] = [];
          let _conf = getConfiguration();
          if (_conf !== undefined) {
            const dest = parameters.dest;
            for (const cmd of _conf) {
              if (dest === cmd.dest) {
                items.push(createValidationItem(SEVERITY.ERROR, "dest", "Destination exist!"));
              }
            }
          }
          return { items: items };
        }
      }
    ],
    buttons: [{
      id: BUTTONS.FINISH,
      label: "Save"
    }],
    workflowManager: {
      canFinish(wizard: WebviewWizard, data: any): boolean {
        return data.dest !== '' || data.dest !== ' ' || data.dest !== undefined;
      },
      performFinish(wizard: WebviewWizard, data: any): Promise<PerformFinishResponse | null> {
        if (setConfiguration(data)) {
          vscode.window.showInformationMessage('Destination ' + data.dest + ' has been saved');
          return new Promise<PerformFinishResponse | null>((res, rej) => {
            res({
              close: true,
              success: true,
              returnObject: null,
              templates: []
            });
          });
        }
        else {
          vscode.window.showInformationMessage('Destination ' + data.dest + ' cannot be saved');

          return new Promise<PerformFinishResponse | null>((res, rej) => {
            res({
              close: false,
              success: false,
              returnObject: null,
              templates: []
            });
          });
        }
      },
      // getNextPage(page: IWizardPage, data: any): IWizardPage | null {
      //   return null;
      // },
      // getPreviousPage(page: IWizardPage, data: any): IWizardPage | null {
      //   return null;
      // }
    }
  };
  return def;
}

function createValidationItem(sev: SEVERITY, id: string, content: string): ValidatorResponseItem {
  return {
    severity: sev,
    template: {
      id: id,
      content: content
    }
  };
}