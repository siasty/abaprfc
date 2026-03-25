import * as assert from 'assert';
import * as path from 'path';
import { resolveAbapPath } from '../../utils/pathUtils';

const REPO = path.join('/home', 'user', 'AbapRfc', 'repos');

suite('resolveAbapPath', () => {

    // ── Happy paths ───────────────────────────────────────────────────────────

    test('parses main program path', () => {
        const file = path.join(REPO, 'DEV', 'ZPROGRAM1', 'zprogram1.abap');
        const result = resolveAbapPath(file, REPO);
        assert.ok(result.ok);
        if (!result.ok) { return; }
        assert.strictEqual(result.value.dest,        'DEV');
        assert.strictEqual(result.value.objectName,  'ZPROGRAM1');
        assert.strictEqual(result.value.programName, 'ZPROGRAM1');
        assert.strictEqual(result.value.isInclude,   false);
        assert.strictEqual(result.value.objectDir,   path.join(REPO, 'DEV', 'ZPROGRAM1'));
    });

    test('parses include path', () => {
        const file = path.join(REPO, 'DEV', 'ZPROGRAM1', 'INCLUDES', 'zinclude1.abap');
        const result = resolveAbapPath(file, REPO);
        assert.ok(result.ok);
        if (!result.ok) { return; }
        assert.strictEqual(result.value.dest,        'DEV');
        assert.strictEqual(result.value.objectName,  'ZPROGRAM1');
        assert.strictEqual(result.value.programName, 'ZINCLUDE1');
        assert.strictEqual(result.value.isInclude,   true);
        assert.strictEqual(result.value.objectDir,   path.join(REPO, 'DEV', 'ZPROGRAM1'));
    });

    test('dest and programName are always uppercase', () => {
        const file = path.join(REPO, 'dev', 'zprogram1', 'zprogram1.abap');
        const result = resolveAbapPath(file, REPO);
        assert.ok(result.ok);
        if (!result.ok) { return; }
        assert.strictEqual(result.value.dest,        'DEV');
        assert.strictEqual(result.value.programName, 'ZPROGRAM1');
    });

    test('works with multiple destinations', () => {
        const fileDev = path.join(REPO, 'DEV', 'ZPROG', 'zprog.abap');
        const fileQas = path.join(REPO, 'QAS', 'ZPROG', 'zprog.abap');
        const r1 = resolveAbapPath(fileDev, REPO);
        const r2 = resolveAbapPath(fileQas, REPO);
        assert.ok(r1.ok);
        assert.ok(r2.ok);
        if (!r1.ok || !r2.ok) { return; }
        assert.strictEqual(r1.value.dest, 'DEV');
        assert.strictEqual(r2.value.dest, 'QAS');
    });

    // ── Error paths ───────────────────────────────────────────────────────────

    test('fails for non-.abap files', () => {
        const file = path.join(REPO, 'DEV', 'ZPROG', 'zprog.ts');
        const result = resolveAbapPath(file, REPO);
        assert.ok(!result.ok);
        if (result.ok) { return; }
        assert.match(result.reason, /Not an \.abap file/);
    });

    test('fails for files outside repo', () => {
        const file = '/home/user/other/ztest.abap';
        const result = resolveAbapPath(file, REPO);
        assert.ok(!result.ok);
        if (result.ok) { return; }
        assert.match(result.reason, /not inside the ABAP workspace/);
    });

    test('fails for path too shallow (only dest/file, no object dir)', () => {
        const file = path.join(REPO, 'DEV', 'zprogram1.abap');
        const result = resolveAbapPath(file, REPO);
        assert.ok(!result.ok);
    });
});
