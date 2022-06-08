import path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import { createFile } from './Configuration';
import { Uri, workspace, WorkspaceFolder } from 'vscode';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';



export class FileExplorer {

    private workArea: string = '';

    constructor(workspaceRoot: string, programName: string) {

        this.workArea = this.createWorksapce(path.join(workspaceRoot, programName.toUpperCase()));

        const { workspaceFolders } = vscode.workspace;
        vscode.workspace.updateWorkspaceFolders(
            workspaceFolders ? workspaceFolders.length : 0,
            null,
            {
                uri: vscode.Uri.file(this.workArea),
                name: programName
            }
        );

        this.openResource(vscode.Uri.parse(path.join(this.workArea, programName + '.abap')));

    }

    private openResource(resource: vscode.Uri): void {
        if (fs.existsSync(resource.fsPath)) {
            vscode.window.showTextDocument(resource);
        } else {
            vscode.window.showInformationMessage('File ' + resource.fsPath + ' does not exist.');
        }

    }

    public createFile(type: string, filename: string, data: string) {
        let area:string ='';
        if(type === '' || type === ' '){
           area = this.workArea;
        }else{
           area = this.createWorksapce(path.join(this.workArea, type));
        }
        const filePath = path.join(area, filename + '.abap');
        
        fs.open(filePath, 'r', function (err, fd) {
            if (err) {
                fs.writeFile(filePath, data, function (err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }
        });
    }


    private createWorksapce(repoPath: string): string {
        let tmpDir;
        try {
            if (fs.existsSync(repoPath)) {
                return repoPath;
            } else {
                tmpDir = fs.mkdirSync(repoPath);
                return repoPath;
            }
        }
        catch (ex) {
            console.log(ex);
            return '';
        }
    }
}