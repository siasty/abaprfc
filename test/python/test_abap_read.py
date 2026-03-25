"""Tests for src/py/abap.py (read operations)."""
import pytest
from abap import SAP, get_error
import mock_pyrfc

SYSTEM = {
    'dest': 'DEV', 'ashost': 'sap-test', 'user': 'TESTUSER',
    'passwd': 'secret', 'sysnr': '00', 'client': '100', 'lang': 'EN'
}


@pytest.fixture(autouse=True)
def reset_mock():
    mock_pyrfc.Connection.reset()
    yield
    mock_pyrfc.Connection.reset()


# ── get_error ─────────────────────────────────────────────────────────────────

class TestGetError:
    def test_maps_standard_fields(self):
        exc = mock_pyrfc.ABAPApplicationError(
            msg='line1\nline2', code='TST', key='MYKEY', msg_v1='short msg'
        )
        result = get_error(exc)
        assert result['type']      == 'ABAPApplicationError'
        assert result['code']      == 'TST'
        assert result['key']       == 'MYKEY'
        assert result['msg_v1']    == 'short msg'
        assert isinstance(result['message'], list)

    def test_handles_missing_attributes(self):
        exc = Exception('plain error')
        result = get_error(exc)
        assert result['code']   == '<None>'
        assert result['key']    == '<None>'
        assert result['msg_v1'] == '<None>'

    def test_type_name_extracted_correctly(self):
        result = get_error(mock_pyrfc.LogonError('bad login'))
        assert result['type'] == 'LogonError'

        result = get_error(mock_pyrfc.CommunicationError('no route'))
        assert result['type'] == 'CommunicationError'


# ── checkProgramExist ─────────────────────────────────────────────────────────

class TestCheckProgramExist:
    sap = SAP(SYSTEM)

    def test_returns_true_when_program_found(self):
        mock_pyrfc.Connection.RESPONSES['RPY_EXISTENCE_CHECK_PROG'] = {}
        assert self.sap.checkProgramExist('ZTEST') is True

    def test_returns_false_on_abap_exception(self):
        mock_pyrfc.Connection.RESPONSES['RPY_EXISTENCE_CHECK_PROG'] = \
            mock_pyrfc.ABAPApplicationError('PROG_NOT_FOUND')
        assert self.sap.checkProgramExist('ZTEST') is False

    def test_returns_false_on_logon_error(self):
        mock_pyrfc.Connection.RESPONSES['RPY_EXISTENCE_CHECK_PROG'] = \
            mock_pyrfc.LogonError('bad credentials')
        assert self.sap.checkProgramExist('ZTEST') is False


# ── getZetReadProgram ─────────────────────────────────────────────────────────

class TestGetZetReadProgram:
    sap = SAP(SYSTEM)

    SOURCE_RESPONSE = {
        'PROG_INF':    {'PROGNAME': 'ZTEST'},
        'SOURCE':      [{'LINE': 'REPORT ZTEST.'}, {'LINE': 'WRITE: / ''Hello''.'}],
        'INCLUDE_TAB': [],
        'TEXTELEMENTS': [],
    }

    def test_returns_source_on_success(self):
        mock_pyrfc.Connection.RESPONSES['RPY_PROGRAM_READ'] = self.SOURCE_RESPONSE
        result = self.sap.getZetReadProgram('ZTEST')
        assert result['PROG_INF']['PROGNAME'] == 'ZTEST'
        assert len(result['SOURCE']) == 2
        assert result['SOURCE'][0]['LINE'] == 'REPORT ZTEST.'

    def test_returns_error_dict_on_exception(self):
        mock_pyrfc.Connection.RESPONSES['RPY_PROGRAM_READ'] = \
            mock_pyrfc.ABAPApplicationError('not found', code='E001', msg_v1='Program not found')
        result = self.sap.getZetReadProgram('ZTEST')
        assert result['type'] == 'ABAPApplicationError'
        assert result['msg_v1'] == 'Program not found'

    def test_passes_program_name_to_rfc(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return self.SOURCE_RESPONSE
        mock_pyrfc.Connection.RESPONSES['RPY_PROGRAM_READ'] = capture
        self.sap.getZetReadProgram('ZMYPROG')
        assert received.get('PROGRAM_NAME') == 'ZMYPROG'


# ── getFunctionModule ─────────────────────────────────────────────────────────

class TestGetFunctionModule:
    sap = SAP(SYSTEM)

    FM_RESPONSE = {
        'SOURCE':         [{'LINE': 'FUNCTION Z_MY_FUNC.'}, {'LINE': 'ENDFUNCTION.'}],
        'GLOBAL_SOURCE':  [],
        'FUNCTION_GROUP': 'Z_MY_GROUP',
    }

    def test_returns_source_on_success(self):
        mock_pyrfc.Connection.RESPONSES['RFC_FUNCTION_SOURCE_CONTENTS'] = self.FM_RESPONSE
        result = self.sap.getFunctionModule('Z_MY_FUNC')
        assert result['FUNCTION_GROUP'] == 'Z_MY_GROUP'
        assert len(result['SOURCE']) == 2

    def test_returns_error_dict_on_exception(self):
        mock_pyrfc.Connection.RESPONSES['RFC_FUNCTION_SOURCE_CONTENTS'] = \
            mock_pyrfc.ABAPApplicationError('FM not found')
        result = self.sap.getFunctionModule('Z_MY_FUNC')
        assert result['type'] == 'ABAPApplicationError'
