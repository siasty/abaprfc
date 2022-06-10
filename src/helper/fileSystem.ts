import path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import { createFile } from './Configuration';
import { CancellationToken, ProviderResult, QuickDiffProvider, Uri, workspace, WorkspaceFolder } from 'vscode';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import { error } from 'console';



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
          let jsFiddleScm = vscode.scm.createSourceControl('abapGit_'+programName, programName, vscode.Uri.parse(this.workArea));
		  let changedResources = jsFiddleScm.createResourceGroup('abapGit_'+programName, 'Changes');
          const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workArea, "*.*"));

           changedResources.resourceStates = [
            { resourceUri: vscode.Uri.file('README.md') },
            { resourceUri: vscode.Uri.file('src/test/api.ts') }
          ];
          
       


        
        // const head = repo.state.HEAD;

    }

    public openResource(resource: vscode.Uri): void {
        
        vscode.window.showTextDocument(vscode.Uri.file(resource.path));

    }


    public createFile(type: string, filename: string, data: any) {
        let area: string = '';
        let code: string = '';
        try {
            if (type === '' || type === ' ') {
                area = this.workArea;
            } else {
                area = this.createWorksapce(path.join(this.workArea, type));
                setTimeout(function () {}, 1000);
            
            }
            const filePath = path.join(area, filename + '.abap');
            data.forEach( (item: { [x: string]: string; }) => {
                code += item['LINE'] + "\n" ;
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
            // fs.open(filePath, 'r', function (err, fd) {
            //     if (err) {
            //         fs.writeFile(filePath, data, function (err) {
            //             if (err) {
            //                 console.log(err);
            //             }
            //         });
            //     }
            // });
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

export const JSFIDDLE_SCHEME = 'jsfiddle';
export class FiddleRepository implements QuickDiffProvider {

	constructor(private workspaceFolder: WorkspaceFolder, private fiddleSlug: string) { }

	provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
		// converts the local file uri to jsfiddle:file.ext
		const relativePath = workspace.asRelativePath(uri.fsPath);
		return Uri.parse(`${JSFIDDLE_SCHEME}:${relativePath}`);
	}

	/**
	 * Enumerates the resources under source control.
	 */
	provideSourceControlledResources(): Uri[] {
		return [
			Uri.file(this.createLocalResourcePath('html')),
			Uri.file(this.createLocalResourcePath('js')),
			Uri.file(this.createLocalResourcePath('css'))];
	}

	/**
	 * Creates a local file path in the local workspace that corresponds to the part of the 
	 * fiddle denoted by the given extension.
	 *
	 * @param extension fiddle part, which is also used as a file extension
	 * @returns path of the locally cloned fiddle resource ending with the given extension
	 */
	createLocalResourcePath(extension: string) {
		return path.join(this.workspaceFolder.uri.fsPath, this.fiddleSlug + '.' + extension);
	}
}