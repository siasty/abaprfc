import path from 'path';
import * as fs from 'fs';
import { CancellationToken, ProviderResult, QuickDiffProvider, Uri, workspace, WorkspaceFolder } from 'vscode';
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

        const jsFiddleScm = vscode.scm.createSourceControl('abapGit_' + programName, programName, vscode.Uri.parse(this.workArea));
        jsFiddleScm.createResourceGroup('abapGit_' + programName, 'Changes');
        vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workArea, '*.*'));
    }

    public openResource(resource: vscode.Uri): void {
        vscode.window.showTextDocument(vscode.Uri.file(resource.path));
    }

    public async createFile(type: string, filename: string, data: any): Promise<void> {
        let area: string;
        if (type === '' || type === ' ') {
            area = this.workArea;
        } else {
            area = this.createWorksapce(path.join(this.workArea, type));
        }

        const filePath = path.join(area, filename + '.abap');
        let code = '';
        data.forEach((item: { [x: string]: string }) => {
            code += item['LINE'] + '\n';
        });

        try {
            await fs.promises.access(filePath);
            console.log('The file already exists: ' + filePath);
        } catch {
            await fs.promises.writeFile(filePath, code);
            console.log('File saved: ' + filePath);
        }
    }

    private createWorksapce(repoPath: string): string {
        try {
            if (!fs.existsSync(repoPath)) {
                fs.mkdirSync(repoPath, { recursive: true });
            }
            return repoPath;
        } catch (ex) {
            console.log(ex);
            return '';
        }
    }
}

export const JSFIDDLE_SCHEME = 'jsfiddle';
export class FiddleRepository implements QuickDiffProvider {

    constructor(private workspaceFolder: WorkspaceFolder, private fiddleSlug: string) { }

    provideOriginalResource?(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
        const relativePath = workspace.asRelativePath(uri.fsPath);
        return Uri.parse(`${JSFIDDLE_SCHEME}:${relativePath}`);
    }

    provideSourceControlledResources(): Uri[] {
        return [
            Uri.file(this.createLocalResourcePath('html')),
            Uri.file(this.createLocalResourcePath('js')),
            Uri.file(this.createLocalResourcePath('css'))];
    }

    createLocalResourcePath(extension: string) {
        return path.join(this.workspaceFolder.uri.fsPath, this.fiddleSlug + '.' + extension);
    }
}
