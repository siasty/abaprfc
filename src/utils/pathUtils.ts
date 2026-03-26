import * as path from 'path';

export interface ParsedAbapPath {
    dest:        string;   // e.g. "DEV"
    objectName:  string;   // directory name under dest, e.g. "ZPROGRAM1"
    programName: string;   // file stem (no .abap), e.g. "ZPROGRAM1" or "ZINCLUDE1"
    objectDir:   string;   // absolute path to the object root directory
    isInclude:   boolean;  // true when file lives inside an INCLUDES subfolder
}

export type ParseResult =
    | { ok: true;  value: ParsedAbapPath }
    | { ok: false; reason: string };

/**
 * Pure function — no VS Code dependency, fully unit-testable.
 *
 * Parses an absolute .abap file path into SAP context given the repo root.
 *
 * Accepted layouts:
 *   {repoRoot}/{DEST}/{OBJECT}/{object}.abap          → main source
 *   {repoRoot}/{DEST}/{OBJECT}/INCLUDES/{incl}.abap   → include
 */
export function resolveAbapPath(filePath: string, repoRoot: string): ParseResult {
    if (!filePath.endsWith('.abap')) {
        return { ok: false, reason: 'Not an .abap file' };
    }

    const norm      = (p: string) => p.replace(/\\/g, '/');
    const normRepo  = norm(repoRoot);
    const normFile  = norm(filePath);

    if (!normFile.startsWith(normRepo + '/') && normFile !== normRepo) {
        return { ok: false, reason: `File is not inside the ABAP workspace (${repoRoot})` };
    }

    const relative = normFile.slice(normRepo.length + 1);
    const segments = relative.split('/');

    // minimum: DEST / OBJECT / file.abap  →  3 segments
    if (segments.length < 3) {
        return { ok: false, reason: 'Cannot determine SAP destination — unexpected path structure' };
    }

    const dest       = segments[0].toUpperCase();
    const objectName = segments[1].toUpperCase();
    const isInclude  = segments.length >= 4 && segments[2].toUpperCase() === 'INCLUDES';
    const programName = path.basename(filePath, '.abap').toUpperCase();
    const objectDir  = path.join(repoRoot, segments[0], segments[1]);

    return { ok: true, value: { dest, objectName, programName, objectDir, isInclude } };
}
