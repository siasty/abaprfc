/**
 * Unit tests for SAP Clean ABAP style rules (no VS Code dependency).
 * Each rule's linePattern is tested directly against example ABAP code.
 */
import * as assert from 'assert';
import { ABAP_STYLE_RULES, CLEAN_ABAP_GUIDE_URL } from '../../data/cleanAbapRules';

// Pull only the rules that have linePatterns (CA014 line-length is handled separately)
const patternRules = ABAP_STYLE_RULES.filter(r => r.linePattern !== undefined);

suite('Clean ABAP rules — linePattern', () => {

    test('CA001 matches FORM statement', () => {
        const rule = patternRules.find(r => r.id === 'CA001')!;
        assert.ok(rule.linePattern!.test('FORM my_routine.'));
        assert.ok(rule.linePattern!.test('  form my_routine.'));
        assert.ok(!rule.linePattern!.test('  DATA lv_form TYPE string.'));
    });

    test('CA002 matches MOVE ... TO statement', () => {
        const rule = patternRules.find(r => r.id === 'CA002')!;
        assert.ok(rule.linePattern!.test('MOVE lv_source TO lv_target.'));
        assert.ok(!rule.linePattern!.test('  lv_target = lv_source.'));
    });

    test('CA003 matches COMPUTE statement', () => {
        const rule = patternRules.find(r => r.id === 'CA003')!;
        assert.ok(rule.linePattern!.test('COMPUTE lv_result = lv_a + lv_b.'));
        assert.ok(!rule.linePattern!.test('  lv_result = lv_a + lv_b.'));
    });

    test('CA004 matches WRITE statement', () => {
        const rule = patternRules.find(r => r.id === 'CA004')!;
        assert.ok(rule.linePattern!.test('WRITE lv_text.'));
        assert.ok(rule.linePattern!.test('  write / lv_text.'));
        assert.ok(!rule.linePattern!.test('  lv_text = |hello|.'));
    });

    test('CA005 matches CREATE OBJECT', () => {
        const rule = patternRules.find(r => r.id === 'CA005')!;
        assert.ok(rule.linePattern!.test('CREATE OBJECT lo_obj.'));
        assert.ok(rule.linePattern!.test('  create object lo_obj TYPE lcl_foo.'));
        assert.ok(!rule.linePattern!.test('  DATA(lo_obj) = NEW lcl_foo( ).'));
    });

    test('CA006 matches CALL METHOD', () => {
        const rule = patternRules.find(r => r.id === 'CA006')!;
        assert.ok(rule.linePattern!.test('CALL METHOD lo_obj->do_something.'));
        assert.ok(!rule.linePattern!.test('  lo_obj->do_something( ).'));
    });

    test('CA007 matches DEFAULT KEY', () => {
        const rule = patternRules.find(r => r.id === 'CA007')!;
        assert.ok(rule.linePattern!.test('  lt_table TYPE TABLE OF ty_line WITH DEFAULT KEY.'));
        assert.ok(!rule.linePattern!.test('  lt_table TYPE SORTED TABLE OF ty_line WITH UNIQUE KEY id.'));
    });

    test('CA008 matches APPEND ... TO', () => {
        const rule = patternRules.find(r => r.id === 'CA008')!;
        assert.ok(rule.linePattern!.test('APPEND ls_line TO lt_table.'));
        assert.ok(!rule.linePattern!.test('INSERT ls_line INTO TABLE lt_table.'));
    });

    test('CA009 matches CONCATENATE', () => {
        const rule = patternRules.find(r => r.id === 'CA009')!;
        assert.ok(rule.linePattern!.test('CONCATENATE lv_a lv_b INTO lv_result.'));
        assert.ok(!rule.linePattern!.test('  lv_result = |{ lv_a }{ lv_b }|.'));
    });

    test("CA010 matches comparison with hard-coded 'X'", () => {
        const rule = patternRules.find(r => r.id === 'CA010')!;
        assert.ok(rule.linePattern!.test("  IF lv_flag = 'X'."));
        assert.ok(rule.linePattern!.test("  IF lv_flag EQ 'X'."));
        assert.ok(!rule.linePattern!.test('  IF lv_flag = abap_true.'));
    });

    test('CA011 matches NOT var IS', () => {
        const rule = patternRules.find(r => r.id === 'CA011')!;
        assert.ok(rule.linePattern!.test('  IF NOT lv_val IS INITIAL.'));
        assert.ok(!rule.linePattern!.test('  IF lv_val IS NOT INITIAL.'));
    });

    test('CA012 matches RAISE EXCEPTION TYPE', () => {
        const rule = patternRules.find(r => r.id === 'CA012')!;
        assert.ok(rule.linePattern!.test('RAISE EXCEPTION TYPE cx_my_error.'));
        assert.ok(!rule.linePattern!.test('RAISE EXCEPTION NEW cx_my_error( ).'));
    });

    test('CA013 matches * comment line', () => {
        const rule = patternRules.find(r => r.id === 'CA013')!;
        assert.ok(rule.linePattern!.test('* This is a comment'));
        assert.ok(rule.linePattern!.test('  * indented comment'));
        assert.ok(!rule.linePattern!.test('  " This is inline comment'));
    });

    test('CA015 matches SELECT *', () => {
        const rule = patternRules.find(r => r.id === 'CA015')!;
        assert.ok(rule.linePattern!.test('SELECT * FROM mara INTO TABLE lt_mara.'));
        assert.ok(!rule.linePattern!.test('SELECT matnr maktx FROM mara INTO TABLE lt_mara.'));
    });

    test('All rules have a guideAnchor and reference the Clean ABAP guide', () => {
        for (const rule of ABAP_STYLE_RULES) {
            assert.ok(rule.guideAnchor.length > 0, `Rule ${rule.id} missing guideAnchor`);
            assert.ok(CLEAN_ABAP_GUIDE_URL.startsWith('https://github.com/SAP/styleguides'), 'Unexpected guide URL');
        }
    });
});
