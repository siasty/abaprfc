import path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import { createFile } from './Configuration';
import { CancellationToken, ProviderResult, QuickDiffProvider, Uri, workspace, WorkspaceFolder } from 'vscode';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import { error } from 'console';
import { Branch, Change, GitExtension, Repository, RepositoryState } from './git';
import { reporters } from 'mocha';



export class FileExplorer {

    private workArea: string = '';
    private repository: Promise<Repository | null>;

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

        const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        gitExtension?.activate();
        const api = gitExtension!.exports.getAPI(1);

        let that = this;

        const newLocal = Uri.file(this.workArea);
        this.repository = api.openRepository(newLocal);
        if (this.repository === undefined || this.repository === null || api.repositories.length === 0) {
            api.init(newLocal).then(function (repo) {
                repo!.add;
            }).catch((err) => { console.log(err); });
            this.repository = api.openRepository(newLocal);
        } else {

        }
    }

    public openResource(resource: vscode.Uri): void {
        vscode.window.showTextDocument(vscode.Uri.file(resource.path));
    }

    public commitChanges(name: string): void {
        this.repository.then((repo) => { repo!.commit(name, { all: true }); });
    }

    public createFile(type: string, filename: string, data: any) {
        let area: string = '';
        let code: string = '';
        try {
            if (type === '' || type === ' ') {
                area = this.workArea;
            } else {
                area = this.createWorksapce(path.join(this.workArea, type));
                setTimeout(function () { }, 1000);

            }
            const filePath = path.join(area, filename + '.abap');
            data.forEach((item: { [x: string]: string; }) => {
                code += item['LINE'] + "\n";
            });


            fs.open(filePath, 'r', function (err, fd) {
                if (err) {
                    fs.writeFile(filePath, code, function (err) {
                        if (err) {
                            console.log(err);
                        }
                        console.log("The file was saved!");
                    });
                } else {
                    console.log("The file exists!");
                }
            });
        }
        catch (err) {
            console.log(err);
        }
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