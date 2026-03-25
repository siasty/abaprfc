import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { AbapObjectMeta, ABAP_META_FILE } from '../models/abapObjectMeta';

/**
 * Handles local file operations for downloaded ABAP programs.
 * Writes source files and a `.abapobj` sidecar with object metadata.
 */
export class AbapFileWriter {

    protected readonly objectDir: string;

    constructor(destRepoPath: string, programName: string) {
        this.objectDir = path.join(destRepoPath, programName.toUpperCase());
        fs.mkdirSync(this.objectDir, { recursive: true });
    }

    /** Write main program source. Skips if file already exists. */
    async writeSource(programName: string, lines: Array<{ LINE: string }>): Promise<string> {
        const filePath = path.join(this.objectDir, programName.toLowerCase() + '.abap');
        await this.writeIfNew(filePath, lines);
        return filePath;
    }

    /** Write a program include into the INCLUDES subfolder. */
    async writeInclude(includeName: string, lines: Array<{ LINE: string }>): Promise<void> {
        const includesDir = path.join(this.objectDir, 'INCLUDES');
        fs.mkdirSync(includesDir, { recursive: true });
        const filePath = path.join(includesDir, includeName.toLowerCase() + '.abap');
        await this.writeIfNew(filePath, lines);
    }

    /** Write the `.abapobj` metadata sidecar. */
    async writeMeta(meta: AbapObjectMeta): Promise<void> {
        const metaPath = path.join(this.objectDir, ABAP_META_FILE);
        await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }

    /** Open a file in the VS Code editor. */
    openInEditor(filePath: string): void {
        vscode.window.showTextDocument(vscode.Uri.file(filePath));
    }

    protected async writeIfNew(filePath: string, lines: Array<{ LINE: string }>): Promise<void> {
        try {
            await fs.promises.access(filePath);
        } catch {
            const code = lines.map(l => l['LINE']).join('\n');
            await fs.promises.writeFile(filePath, code, 'utf-8');
        }
    }
}

/**
 * Handles local file operations for downloaded Function Modules.
 * Stores FM source in a flat file next to the main source.
 */
export class FmFileWriter extends AbapFileWriter {

    constructor(destRepoPath: string, funcName: string) {
        super(destRepoPath, funcName);
    }

    /** Write function module source. */
    async writeFmSource(funcName: string, lines: Array<{ LINE: string }>): Promise<string> {
        return this.writeSource(funcName, lines);
    }
}

/** Read and parse the `.abapobj` metadata sidecar for a given object directory. */
export function readObjectMeta(objectDir: string): AbapObjectMeta | undefined {
    try {
        const data = fs.readFileSync(path.join(objectDir, ABAP_META_FILE), 'utf-8');
        return JSON.parse(data) as AbapObjectMeta;
    } catch {
        return undefined;
    }
}
