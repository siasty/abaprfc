/**
 * Severity mirrors vscode.DiagnosticSeverity values (0-3) so this file
 * has NO dependency on the vscode module and can be unit-tested in Node.
 *   0 = Error | 1 = Warning | 2 = Information | 3 = Hint
 */
export const enum RuleSeverity {
    Error       = 0,
    Warning     = 1,
    Information = 2,
    Hint        = 3,
}

export interface AbapStyleRule {
    id: string;
    category: string;
    title: string;
    description: string;
    severity: RuleSeverity;
    /** Regex tested against each individual line (case-insensitive) */
    linePattern?: RegExp;
    /** Link anchor in the Clean ABAP guide */
    guideAnchor: string;
    /** Optional quick-fix hint shown in the message */
    quickFix?: string;
}

export const CLEAN_ABAP_GUIDE_URL =
    'https://github.com/SAP/styleguides/blob/main/clean-abap/CleanABAP.md';

export const ABAP_STYLE_RULES: AbapStyleRule[] = [
    // ── Language ────────────────────────────────────────────────────────────
    {
        id: 'CA001',
        category: 'Language',
        title: 'Prefer object orientation to procedural programming',
        description: 'FORM/ENDFORM routines are procedural. Use classes and methods instead.',
        severity: RuleSeverity.Warning,
        linePattern: /^\s*FORM\s+\w+/i,
        guideAnchor: 'prefer-object-orientation-to-procedural-programming',
    },
    {
        id: 'CA002',
        category: 'Language',
        title: 'Avoid obsolete MOVE statement',
        description: 'Use simple assignment = instead of MOVE ... TO.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*MOVE\s+.+\s+TO\s+\w+/i,
        guideAnchor: 'prefer-functional-to-procedural-language-constructs',
        quickFix: 'target = source.',
    },
    {
        id: 'CA003',
        category: 'Language',
        title: 'Avoid obsolete COMPUTE statement',
        description: 'Use direct expression assignment instead of COMPUTE.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*COMPUTE\s+/i,
        guideAnchor: 'prefer-functional-to-procedural-language-constructs',
        quickFix: 'result = expression.',
    },
    {
        id: 'CA004',
        category: 'Language',
        title: 'Avoid obsolete WRITE statement',
        description: 'WRITE is an obsolete output statement. Use modern UI or application logging.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*WRITE\s+/i,
        guideAnchor: 'avoid-obsolete-language-elements',
    },

    // ── Classes ──────────────────────────────────────────────────────────────
    {
        id: 'CA005',
        category: 'Classes',
        title: 'Prefer NEW to CREATE OBJECT',
        description: 'Use the NEW operator for object instantiation instead of CREATE OBJECT.',
        severity: RuleSeverity.Information,
        linePattern: /\bCREATE OBJECT\b/i,
        guideAnchor: 'prefer-new-to-create-object',
        quickFix: 'DATA(obj) = NEW class_name( ).',
    },

    // ── Methods ──────────────────────────────────────────────────────────────
    {
        id: 'CA006',
        category: 'Methods',
        title: 'Prefer functional to procedural method calls',
        description: 'Use functional call syntax instead of CALL METHOD.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*CALL METHOD\s+/i,
        guideAnchor: 'prefer-functional-to-procedural-calls',
        quickFix: 'obj->method( param = value ).',
    },

    // ── Tables ───────────────────────────────────────────────────────────────
    {
        id: 'CA007',
        category: 'Tables',
        title: 'Avoid DEFAULT KEY',
        description: 'DEFAULT KEY is often a performance trap. Specify table keys explicitly.',
        severity: RuleSeverity.Warning,
        linePattern: /\bDEFAULT KEY\b/i,
        guideAnchor: 'avoid-default-key',
    },
    {
        id: 'CA008',
        category: 'Tables',
        title: 'Prefer INSERT INTO TABLE to APPEND',
        description: 'INSERT INTO TABLE works for all table types; APPEND only for standard tables.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*APPEND\s+.+\s+TO\s+/i,
        guideAnchor: 'prefer-insert-into-table-to-append-to',
        quickFix: 'INSERT var INTO TABLE table.',
    },

    // ── Strings ──────────────────────────────────────────────────────────────
    {
        id: 'CA009',
        category: 'Strings',
        title: 'Use string templates instead of CONCATENATE',
        description: 'Prefer | template | syntax over CONCATENATE for assembling text.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*CONCATENATE\b/i,
        guideAnchor: 'use--to-assemble-text',
        quickFix: "lv_text = |{ part1 }{ part2 }|.",
    },

    // ── Booleans ─────────────────────────────────────────────────────────────
    {
        id: 'CA010',
        category: 'Booleans',
        title: "Use ABAP_TRUE / ABAP_FALSE for Boolean comparisons",
        description: "Prefer abap_true/abap_false constants over hard-coded 'X' and ' '.",
        severity: RuleSeverity.Hint,
        linePattern: /\bEQ\b\s*'[X ]'|=\s*'[X ]'/i,
        guideAnchor: 'use-abap_true-and-abap_false-for-comparisons',
        quickFix: "IF flag = abap_true. or IF flag = abap_false.",
    },

    // ── Conditions ───────────────────────────────────────────────────────────
    {
        id: 'CA011',
        category: 'Conditions',
        title: 'Prefer IS NOT to NOT IS',
        description: 'Use IS NOT BOUND/SUPPLIED/INITIAL instead of NOT ... IS ...',
        severity: RuleSeverity.Hint,
        linePattern: /\bNOT\s+\w+\s+IS\s+/i,
        guideAnchor: 'prefer-is-not-to-not-is',
        quickFix: 'IF var IS NOT INITIAL.',
    },

    // ── Error Handling ────────────────────────────────────────────────────────
    {
        id: 'CA012',
        category: 'Error Handling',
        title: 'Prefer RAISE EXCEPTION NEW',
        description: 'Use RAISE EXCEPTION NEW cx_... instead of RAISE EXCEPTION TYPE cx_...',
        severity: RuleSeverity.Information,
        linePattern: /\bRAISE EXCEPTION TYPE\b/i,
        guideAnchor: 'prefer-raise-exception-new-to-raise-exception-type',
        quickFix: 'RAISE EXCEPTION NEW cx_class( ).',
    },

    // ── Comments ──────────────────────────────────────────────────────────────
    {
        id: 'CA013',
        category: 'Comments',
        title: 'Comment with ", not with *',
        description: 'Use inline comment character " instead of full-line * for code comments.',
        severity: RuleSeverity.Hint,
        linePattern: /^\s*\*/,
        guideAnchor: 'comment-with--not-with-',
    },

    // ── Formatting ────────────────────────────────────────────────────────────
    // CA014 (line length) is checked separately — no linePattern needed here.
    {
        id: 'CA014',
        category: 'Formatting',
        title: 'Stick to a reasonable line length',
        description: 'Lines should not exceed 120 characters.',
        severity: RuleSeverity.Information,
        guideAnchor: 'stick-to-a-reasonable-line-length',
    },

    // ── Testing ───────────────────────────────────────────────────────────────
    {
        id: 'CA015',
        category: 'Testing',
        title: 'Avoid SELECT * — specify required fields',
        description: 'SELECT * transfers unnecessary data. List only the columns you need.',
        severity: RuleSeverity.Warning,
        linePattern: /\bSELECT\s+\*/i,
        guideAnchor: 'write-testable-code',   // general clean code, closest anchor
    },
];
