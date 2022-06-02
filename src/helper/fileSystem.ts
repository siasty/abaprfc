import path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import { createFile } from './Configuration';
import { Uri, workspace, WorkspaceFolder } from 'vscode';
import { fileURLToPath } from 'url';

export function createWorksapce(workspaceName: string):WorkspaceFolder | undefined {
    let tmpDir;
    try {
        const _tmp = path.join(homedir(), workspaceName);
        if (fs.existsSync(_tmp)) {
            return workspace.getWorkspaceFolder(Uri.parse(_tmp));
        } else {
            tmpDir = fs.mkdirSync(_tmp);
            return workspace.getWorkspaceFolder(Uri.parse(_tmp));
        }
    }
    catch (ex) {
        console.log(ex);
        return undefined;
    }
}
