import { isRfcError } from './RfcErrorHandler';
import * as vscode from 'vscode';
import { TransportRequest } from '../models/transportModel';
import { context } from '../extension';

const GLOBAL_STATE_KEY = 'abaprfc.lastTR';

/** Per-session cache: dest → TR (fast path, avoids globalState reads). */
const sessionCache = new Map<string, string>();

function getPersistedTR(dest: string): string | undefined {
    const store: Record<string, string> = context?.globalState.get(GLOBAL_STATE_KEY) ?? {};
    return store[dest];
}

function persistTR(dest: string, trkorr: string): void {
    const store: Record<string, string> = context?.globalState.get(GLOBAL_STATE_KEY) ?? {};
    store[dest] = trkorr;
    context?.globalState.update(GLOBAL_STATE_KEY, store);
}

const CREATE_NEW = '$(add)  Create new transport request...';

/**
 * Returns the transport number to use for the given destination.
 *
 * Flow:
 *   1. If a TR is cached for this session + dest → offer it as default
 *   2. Otherwise show quick pick with all open TRs for the user
 *   3. User can pick an existing TR or create a new one
 *   4. Selected TR is cached for the rest of the session
 */
export async function selectTransport(
    dest: string,
    sapWriter: any,
    userId: string
): Promise<string | undefined> {

    // Prefer session cache (fast), fall back to persisted globalState
    const cached = sessionCache.get(dest) ?? getPersistedTR(dest);

    // If we already have a cached TR, ask if user wants to reuse it
    if (cached) {
        const reuse = await vscode.window.showQuickPick(
            [
                { label: `$(history)  ${cached}`, description: 'Last used transport', trkorr: cached },
                { label: '$(list-unordered)  Choose different transport...', description: '', trkorr: '' }
            ],
            { placeHolder: `Active transport for ${dest}` }
        );
        if (!reuse) {
            return undefined;
        }
        if (reuse.trkorr) {
            return reuse.trkorr;
        }
        // fall through to full selection
    }

    return pickOrCreateTransport(dest, sapWriter, userId);
}

/**
 * Clears the cached transport for a destination.
 * Call this when the user explicitly wants to switch TR.
 */
export function clearTransportCache(dest: string): void {
    sessionCache.delete(dest);
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function pickOrCreateTransport(
    dest: string,
    sapWriter: any,
    userId: string
): Promise<string | undefined> {

    const openTRs = await fetchOpenTransports(sapWriter, userId);

    const items: vscode.QuickPickItem[] = [
        ...openTRs.map(tr => ({
            label: `$(tag)  ${tr.trkorr}`,
            description: tr.description,
            detail: `Owner: ${tr.owner}  |  Category: ${categoryLabel(tr.category)}`
        })),
        { label: CREATE_NEW, description: '' }
    ];

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: openTRs.length > 0
            ? `Select transport request for ${dest}`
            : `No open transports found for ${userId} — create a new one`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!pick) {
        return undefined;
    }

    if (pick.label === CREATE_NEW) {
        return createNewTransport(dest, sapWriter);
    }

    // Extract TRKORR from "$(tag)  DEVK123456"
    const trkorr = pick.label.replace('$(tag)  ', '').trim();
    sessionCache.set(dest, trkorr);
    persistTR(dest, trkorr);
    return trkorr;
}

async function createNewTransport(
    dest: string,
    sapWriter: any
): Promise<string | undefined> {

    const description = await vscode.window.showInputBox({
        prompt: 'Transport description',
        placeHolder: 'e.g. My ABAP changes',
        validateInput: v => (!v || v.trim() === '') ? 'Description is required' : undefined
    });

    if (!description) {
        return undefined;
    }

    const result = await sapWriter.createTransport(description.trim());

    if (isRfcError(result)) {
        vscode.window.showErrorMessage(
            `Failed to create transport: ${result['msg_v1'] || result['type']}`
        );
        return undefined;
    }

    const trkorr: string = result['EV_TRKORR'];
    if (!trkorr) {
        vscode.window.showErrorMessage('Transport created but number not returned by SAP.');
        return undefined;
    }

    sessionCache.set(dest, trkorr);
    persistTR(dest, trkorr);
    vscode.window.showInformationMessage(`Transport ${trkorr} created.`);
    return trkorr;
}

async function fetchOpenTransports(sapWriter: any, userId: string): Promise<TransportRequest[]> {
    try {
        const result = await sapWriter.getOpenTransports(userId);

        if (isRfcError(result)) {
            return [];
        }

        const rows: any[] = result['ET_CHANGE_REQUESTS'] ?? [];
        return rows.map(r => ({
            trkorr:      r['TRKORR']  ?? '',
            description: r['AS4TEXT'] ?? '',
            owner:       r['AS4USER'] ?? '',
            category:    r['TRSTATUS'] ?? ''
        }));
    } catch {
        return [];
    }
}

function categoryLabel(cat: string): string {
    switch (cat) {
        case 'K': return 'Workbench';
        case 'C': return 'Customizing';
        case 'T': return 'Transport of copies';
        default:  return cat || '—';
    }
}

