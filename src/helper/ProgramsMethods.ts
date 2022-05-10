import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {homedir} from 'os';
import { getConfiguration } from './Configuration';

const pyfile = path.join(__dirname, "../src/py", "abap.py");
const repoPath = path.join(homedir(),'repos');

export async function getZetProgram(context: vscode.ExtensionContext) {

    let items = getSapDestinationList();
    const pageType = await vscode.window.showQuickPick(
        items,
        { placeHolder: 'Select SAP System' })
        .then((pick) => {
              getProgramObjects(pick?.label);
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

function getProgramObjects(dest: string | undefined) {

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
                let result = await py.call(sap, "getZetProgram");

                console.log(result);
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
        if (fs.existsSync(_tmp)) {
           return true;
        } else {
            fs.mkdirSync(_tmp);
          return true;
        }
    }
    catch (ex) {
        console.log(ex);
        return false;
    }
}