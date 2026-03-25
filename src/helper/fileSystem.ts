import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Handles local file operations for downloaded ABAP objects.
 * One instance per program download — creates the program directory
 * and writes source files into it.
 */
export class AbapFileWriter {

    private readonly programDir: string;

    constructor(destRepoPath: string, programName: string) {
        this.programDir = path.join(destRepoPath, programName.toUpperCase());
        fs.mkdirSync(this.programDir, { recursive: true });
    }

    /** Write main program source. Skips if file already exists. */
    async writeSource(programName: string, lines: Array<{ LINE: string }>): Promise<string> {
        const filePath = path.join(this.programDir, programName.toLowerCase() + '.abap');
        await this.writeIfNew(filePath, lines);
        return filePath;
    }

    /** Write a program include into the INCLUDES subfolder. Skips if file already exists. */
    async writeInclude(includeName: string, lines: Array<{ LINE: string }>): Promise<void> {
        const includesDir = path.join(this.programDir, 'INCLUDES');
        fs.mkdirSync(includesDir, { recursive: true });
        const filePath = path.join(includesDir, includeName.toLowerCase() + '.abap');
        await this.writeIfNew(filePath, lines);
    }

    /** Open a file in the VS Code editor. */
    openInEditor(filePath: string): void {
        vscode.window.showTextDocument(vscode.Uri.file(filePath));
    }

    private async writeIfNew(filePath: string, lines: Array<{ LINE: string }>): Promise<void> {
        try {
            await fs.promises.access(filePath);
        } catch {
            const code = lines.map(l => l['LINE']).join('\n');
            await fs.promises.writeFile(filePath, code, 'utf-8');
        }
    }
}
