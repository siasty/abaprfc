import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { homedir } from 'os';
import { getConfiguration, getFullConfiguration } from './Configuration';
import { FileExplorer } from './fileSystem';


const pyfile = path.join(__dirname, '../../src/py', 'abap.py');
const repoPath = path.join(homedir(), 'AbapRfc', 'repos');

export async function getZetProgram(context: vscode.ExtensionContext) {

    const items = getSapDestinationList();
    await vscode.window.showQuickPick(items, { placeHolder: 'Select SAP System' })
        .then(async (pick) => {
            const input = await vscode.window.showInputBox({
                placeHolder: 'Choose a unique name for the sap program',
                validateInput: validateNameIsUnique
            });
            if (input !== undefined && pick !== undefined) {
                await getProgramObjects(pick.label.toUpperCase(), input, context);
            }
        });
}

function getSapDestinationList(): Array<vscode.QuickPickItem> {
    const ABAPSYS = getConfiguration();
    const items: Array<vscode.QuickPickItem> = [];

    for (let i = 0; i < ABAPSYS.length; i++) {
        items.push({
            description: ABAPSYS[i].ashost,
            label: ABAPSYS[i].dest
        });
    }
    return items;
}

async function getProgramObjects(dest: string, name: string, context: vscode.ExtensionContext) {
    if (!dest) {
        vscode.window.showErrorMessage('No SAP destination selected.');
        return;
    }

    try {
        const nodecallspython = require('node-calls-python');
        const py = nodecallspython.interpreter;

        const ABAPSYS = await getFullConfiguration(dest, context);
        if (!ABAPSYS) {
            vscode.window.showErrorMessage(`Configuration for destination ${dest} not found.`);
            return;
        }

        if (!checkWorkspace(ABAPSYS.dest)) {
            vscode.window.showErrorMessage(`Could not create workspace for ${dest}.`);
            return;
        }

        const pymodule = await py.import(pyfile);
        const sap = await py.create(pymodule, 'SAP', ABAPSYS);

        const exists = await py.call(sap, 'checkProgramExist', name.toUpperCase());
        if (!exists) {
            vscode.window.showInformationMessage(`Program ${name} does not exist in ${dest}.`);
            return;
        }

        const data = checkIfTheErrorExistInRFCData(
            await py.call(sap, 'getZetReadProgram', name.toUpperCase())
        );

        const explorer = new FileExplorer(path.join(repoPath, ABAPSYS.dest), name.toUpperCase());
        await explorer.createFile('', data['PROG_INF'].PROGNAME.toLowerCase(), data['SOURCE']);

        if (data['INCLUDE_TAB'] && Object.keys(data['INCLUDE_TAB']).length > 0) {
            for (const item of data['INCLUDE_TAB']) {
                const dataSource = await py.call(sap, 'getZetReadProgram', item['INCLNAME'].toUpperCase());
                await explorer.createFile('INCLUDES', item['INCLNAME'].toLowerCase(), dataSource['SOURCE']);
            }
        }

        explorer.openResource(vscode.Uri.file(
            path.join(repoPath, ABAPSYS.dest, name.toUpperCase(), name.toLowerCase() + '.abap')
        ));

    } catch (err) {
        console.log(err);
        vscode.window.showErrorMessage(`Failed to download program ${name}: ${err}`);
    }
}

function checkWorkspace(dest: string): boolean {
    try {
        const _tmp = path.join(repoPath, dest);
        fs.mkdirSync(_tmp, { recursive: true });
        return true;
    } catch (ex) {
        console.log(ex);
        return false;
    }
}

async function validateNameIsUnique(name: string | undefined) {
    return name?.toUpperCase().charAt(0) !== 'Z' ? 'Name must start with "Z"' : undefined;
}

function groupByKey(array: any[], key: string | number) {
    return array.reduce((hash, obj) => {
        if (obj[key] === undefined) { return hash; }
        return Object.assign(hash, { [obj[key]]: (hash[obj[key]] || []).concat(obj) });
    }, {});
}

function viewError(error: any): void {
    vscode.window.showErrorMessage(error['type'] + ':[' + error['code'] + '] "' + error['msg_v1'] + '" ' + error['key']);
}

function checkIfTheErrorExistInRFCData(data: any): any {
    if (typeof data !== 'undefined' && Object.keys(data).length > 0) {
        switch (data['type']) {
            case 'ABAPApplicationError':
            case 'ABAPRuntimeError':
            case 'CommunicationError':
            case 'LogonError':
            case 'RFCError':
                viewError(data);
                break;
        }
    }
    return data;
}
