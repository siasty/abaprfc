import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { homedir } from 'os';
import { getConfiguration } from './Configuration';
import { FileExplorer } from './fileSystem';


const pyfile = path.join(__dirname, "../../src/py", "abap.py");
const repoPath = path.join(homedir(), 'AbapRfc', 'repos');
let _context: vscode.ExtensionContext;

export async function getZetProgram(context: vscode.ExtensionContext) {

    let items = getSapDestinationList();
    _context = context;
    const pageType = await vscode.window.showQuickPick(
        items,
        { placeHolder: 'Select SAP System' })
        .then(async (pick) => {
            const input = await vscode.window.showInputBox(
                {
                    placeHolder: 'Choose a unique name for the sap program',
                    validateInput: validateNameIsUnique
                });
            if (input !== undefined) {
                getProgramObjects(pick?.label.toUpperCase(), input);
            } else {
                vscode.window.showInformationMessage('Name for the sap program is ' + input);
            }
        });

}

function getSapDestinationList(): Array<vscode.QuickPickItem> {

    let ABAPSYS = getConfiguration();
    let items: Array<vscode.QuickPickItem> = [];

    for (var i = 0; i < ABAPSYS.length; i++) {
        let buff: vscode.QuickPickItem =
        {
            description: ABAPSYS[i].ashost,
            label: ABAPSYS[i].dest
        };
        items.push(buff);
    }
    return items;
}

function getProgramObjects(dest: string | undefined, name: string) {

    if (dest === undefined) {
        throw new Error("Destination Error");
    }

    try {
        const nodecallspython = require("node-calls-python");

        let py = nodecallspython.interpreter;

        py.import(pyfile).then(async function (pymodule: any) {

            let ABAPSYS = getConfiguration(dest);
            if (checkWorkspace(ABAPSYS.dest)) {
                let sap = await py.create(pymodule, "SAP", ABAPSYS);
                if (await py.call(sap, "checkProgramExist", name.toUpperCase())) {
                    let data = checkIfTheErrorExistInRFCData(await py.call(sap, "getZetReadProgram", name.toUpperCase()));
                 //   let data = await py.call(sap, "getZetProgram", name.toUpperCase());

                 //   if (typeof data !== 'undefined' && Object.keys(data["ENVIRONMENT_TAB"]).length > 0) {
                 //       let grupedData = groupByKey(data["ENVIRONMENT_TAB"], 'TYPE');

                 //       let explorer = new FileExplorer(path.join(repoPath, ABAPSYS.dest), name.toUpperCase());

                 //       if (typeof grupedData !== 'undefined' && Object.keys(grupedData).length > 0) {
                 //           if (typeof grupedData['INCL'] !== 'undefined' && Object.keys(grupedData['INCL']).length > 0) {
                 //               grupedData['INCL'].forEach(async (item: any) => {
                 //                   let dataSource = await py.call(sap, "getProramSource", item['OBJECT'].toUpperCase());
                 //                  explorer.createFile('INCLUDES',item['OBJECT'].toLowerCase(), dataSource);
                 //               });
                 //           }else{
                 //               if (typeof grupedData['PROG'] !== 'undefined' && Object.keys(grupedData['PROG']).length > 0) {
                 //                   grupedData['PROG'].forEach(async (item: any) => {
                 //                       let dataSource = await py.call(sap, "getProramSource", item['OBJECT'].toUpperCase());
                 //                       explorer.createFile('',item['OBJECT'].toLowerCase(), dataSource);
                 //                   });
                 //               }
                 //           }

                 //       }
                     
                 //   }

                } else {
                    vscode.window.showInformationMessage('The program ' + name + ' does not exist.');
                }
            }
        });
    }
    catch (err) {
        console.log(err);
    }
}

function checkWorkspace(dest: string): boolean {
    const appPrefix = dest;
    try {
        const _tmp = path.join(repoPath, appPrefix);
        if (fs.existsSync(repoPath)) {
            if (fs.existsSync(_tmp)) {
                return true;
            } else {
                fs.mkdirSync(_tmp);
                return true;
            }
        } else {
            fs.mkdirSync(repoPath);
            if (fs.existsSync(_tmp)) {
                return true;
            } else {
                fs.mkdirSync(_tmp);
                return true;
            }
        }
    }
    catch (ex) {
        console.log(ex);
        return false;
    }
}

async function validateNameIsUnique(name: string | undefined) {
    return name?.toUpperCase().charAt(0) !== 'Z' ? 'Name not starts with "Z"' : undefined;
}

function groupByKey(array: any[], key: string | number) {
    return array
        .reduce((hash, obj) => {
            if (obj[key] === undefined) { return hash; }
            return Object.assign(hash, { [obj[key]]: (hash[obj[key]] || []).concat(obj) });
        }, {});
}

function viewError(error: any): void {
    vscode.window.showInformationMessage(error['type'] + ':[' + error['code'] + '] "' + error['msg_v1'] + '" ' + error['key']);
}

function checkIfTheErrorExistInRFCData(data: any): any {
    if ((typeof data !== 'undefined' && Object.keys(data).length > 0) || typeof data === 'boolean') {
        switch (data['type']) {
            case 'ABAPApplicationError': {
                viewError(data);
                break;
            }
            case 'ABAPRuntimeError': {
                viewError(data);
                break;
            }
            case 'CommunicationError': {
                viewError(data);
                break;
            }
            case 'LogonError': {
                viewError(data);
                break;
            }
            case 'RFCError': {
                viewError(data);
                break;
            }
        }
        return data;
    }
}
