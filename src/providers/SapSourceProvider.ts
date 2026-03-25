import * as vscode from 'vscode';
import * as path from 'path';
import { getFullConfiguration } from '../helper/Configuration';

export const SAP_SOURCE_SCHEME = 'sap-source';

/**
 * Virtual document provider for SAP source code.
 * Used by the diff editor to show the SAP-side version of a program.
 *
 * URI format: sap-source:/{dest}/{programName}
 * Example:    sap-source:/DEV/ZPROGRAM1
 */
export class SapSourceProvider implements vscode.TextDocumentContentProvider {

    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const [, dest, programName] = uri.path.split('/');

        if (!dest || !programName) {
            return '// Invalid SAP source URI.';
        }

        const ABAPSYS = await getFullConfiguration(dest.toUpperCase(), this.context);
        if (!ABAPSYS) {
            return `// No configuration found for destination: ${dest}`;
        }

        try {
            const nodecallspython = require('node-calls-python');
            const py = nodecallspython.interpreter;
            const pyReadFile = path.join(__dirname, '../../src/py', 'abap.py');

            const pymodule = await py.import(pyReadFile);
            const sap = await py.create(pymodule, 'SAP', ABAPSYS);
            const data = await py.call(sap, 'getZetReadProgram', programName.toUpperCase());

            if (!data || RFC_ERROR_TYPES.has(data['type'])) {
                const msg = data?.msg_v1 ?? data?.type ?? 'unknown error';
                return `// Error fetching ${programName} from ${dest}: ${msg}`;
            }

            return (data['SOURCE'] ?? [])
                .map((l: { LINE: string }) => l['LINE'])
                .join('\n');

        } catch (err) {
            return `// Unexpected error: ${err}`;
        }
    }
}

const RFC_ERROR_TYPES = new Set([
    'ABAPApplicationError', 'ABAPRuntimeError',
    'CommunicationError', 'LogonError', 'RFCError'
]);
