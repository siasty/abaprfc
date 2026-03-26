import * as vscode from 'vscode';
import {
    ABAP_STYLE_RULES,
    CLEAN_ABAP_GUIDE_URL,
    AbapStyleRule,
    RuleSeverity,
} from '../data/cleanAbapRules';

function toVscodeSeverity(s: RuleSeverity): vscode.DiagnosticSeverity {
    // RuleSeverity values mirror vscode.DiagnosticSeverity numerically
    return s as unknown as vscode.DiagnosticSeverity;
}

const LINE_LENGTH_LIMIT = 120;
const LINE_LENGTH_RULE_ID = 'CA014';

export class AbapStyleProvider {
    constructor(private readonly collection: vscode.DiagnosticCollection) {}

    /** Run all style rules against the given document and populate diagnostics. */
    checkDocument(document: vscode.TextDocument): void {
        if (!document.fileName.endsWith('.abap')) {
            this.collection.delete(document.uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const lines = document.getText().split('\n');

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            // Per-line pattern rules
            for (const rule of ABAP_STYLE_RULES) {
                if (!rule.linePattern) {
                    continue;
                }

                // Reset lastIndex for global regexes (safety)
                rule.linePattern.lastIndex = 0;
                const match = rule.linePattern.exec(line);
                if (!match) {
                    continue;
                }

                const startChar = match.index;
                const endChar = line.trimEnd().length;
                const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
                diagnostics.push(this.buildDiagnostic(range, rule));
            }

            // CA014 — line length
            if (line.length > LINE_LENGTH_LIMIT) {
                const lengthRule = ABAP_STYLE_RULES.find(r => r.id === LINE_LENGTH_RULE_ID)!;
                const range = new vscode.Range(lineIdx, LINE_LENGTH_LIMIT, lineIdx, line.length);
                const diag = new vscode.Diagnostic(
                    range,
                    `[${LINE_LENGTH_RULE_ID}] ${lengthRule.title}: ` +
                    `line is ${line.length} characters (limit: ${LINE_LENGTH_LIMIT}).`,
                    toVscodeSeverity(lengthRule.severity),
                );
                diag.source = `Clean ABAP (${lengthRule.category})`;
                diag.code = {
                    value: LINE_LENGTH_RULE_ID,
                    target: vscode.Uri.parse(`${CLEAN_ABAP_GUIDE_URL}#${lengthRule.guideAnchor}`),
                };
                diagnostics.push(diag);
            }
        }

        this.collection.set(document.uri, diagnostics);
    }

    clearDocument(uri: vscode.Uri): void {
        this.collection.delete(uri);
    }

    clearAll(): void {
        this.collection.clear();
    }

    getRules(): AbapStyleRule[] {
        return ABAP_STYLE_RULES;
    }

    /** Return a summary of violations grouped by category for the status bar. */
    getSummary(document: vscode.TextDocument): string {
        const diags = this.collection.get(document.uri) ?? [];
        if (diags.length === 0) {
            return 'Clean ABAP: no issues';
        }
        const warnings = diags.filter(
            d => d.severity === vscode.DiagnosticSeverity.Warning ||
                 d.severity === vscode.DiagnosticSeverity.Error,
        ).length;
        const infos = diags.length - warnings;
        const parts: string[] = [];
        if (warnings > 0) { parts.push(`${warnings} warning(s)`); }
        if (infos > 0)    { parts.push(`${infos} hint(s)`); }
        return `Clean ABAP: ${parts.join(', ')}`;
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private buildDiagnostic(
        range: vscode.Range,
        rule: AbapStyleRule,
    ): vscode.Diagnostic {
        let message = `[${rule.id}] ${rule.title}: ${rule.description}`;
        if (rule.quickFix) {
            message += ` — Hint: ${rule.quickFix}`;
        }

        const diag = new vscode.Diagnostic(range, message, toVscodeSeverity(rule.severity));
        diag.source = `Clean ABAP (${rule.category})`;
        diag.code = {
            value: rule.id,
            target: vscode.Uri.parse(`${CLEAN_ABAP_GUIDE_URL}#${rule.guideAnchor}`),
        };
        return diag;
    }
}
