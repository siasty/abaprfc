"""Tests for src/py/abap_write.py (write + transport operations)."""
import pytest
from abap_write import SAPWriter, _get_error
import mock_pyrfc

SYSTEM = {
    'dest': 'DEV', 'ashost': 'sap-test', 'user': 'TESTUSER',
    'passwd': 'secret', 'sysnr': '00', 'client': '100', 'lang': 'EN'
}

SOURCE = [{'LINE': 'REPORT ZTEST.'}, {'LINE': 'WRITE: / \'ok\'.'}]


@pytest.fixture(autouse=True)
def reset_mock():
    mock_pyrfc.Connection.reset()
    yield
    mock_pyrfc.Connection.reset()


# ── _get_error ────────────────────────────────────────────────────────────────

class TestGetError:
    def test_extracts_type_name(self):
        result = _get_error(mock_pyrfc.RFCError('conn failed'))
        assert result['type'] == 'RFCError'

    def test_handles_plain_exception(self):
        result = _get_error(ValueError('bad value'))
        assert result['type'] == 'ValueError'
        assert result['code'] == '<None>'


# ── syntaxCheckProgram ────────────────────────────────────────────────────────

class TestSyntaxCheckProgram:
    writer = SAPWriter(SYSTEM)

    def test_returns_empty_errors_on_clean_code(self):
        mock_pyrfc.Connection.RESPONSES['SYNTAX_CHECK_PROGRAM'] = {'SYNTAX_ERRORS': []}
        result = self.writer.syntaxCheckProgram('ZTEST', SOURCE)
        assert result['SYNTAX_ERRORS'] == []

    def test_returns_errors_when_syntax_wrong(self):
        errors = [{'LINE': '2', 'ERRMSG': 'Syntax error', 'MSGTYP': 'E', 'WORD': 'WRTE'}]
        mock_pyrfc.Connection.RESPONSES['SYNTAX_CHECK_PROGRAM'] = {'SYNTAX_ERRORS': errors}
        result = self.writer.syntaxCheckProgram('ZTEST', SOURCE)
        assert len(result['SYNTAX_ERRORS']) == 1
        assert result['SYNTAX_ERRORS'][0]['ERRMSG'] == 'Syntax error'

    def test_returns_error_dict_on_rfc_failure(self):
        mock_pyrfc.Connection.RESPONSES['SYNTAX_CHECK_PROGRAM'] = \
            mock_pyrfc.CommunicationError('no route to host')
        result = self.writer.syntaxCheckProgram('ZTEST', SOURCE)
        assert result['type'] == 'CommunicationError'

    def test_uppercases_program_name(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return {'SYNTAX_ERRORS': []}
        mock_pyrfc.Connection.RESPONSES['SYNTAX_CHECK_PROGRAM'] = capture
        self.writer.syntaxCheckProgram('ztest', SOURCE)
        assert received.get('PROGRAM') == 'ZTEST'


# ── getOpenTransports ─────────────────────────────────────────────────────────

class TestGetOpenTransports:
    writer = SAPWriter(SYSTEM)

    def test_returns_transport_list(self):
        trs = [
            {'TRKORR': 'DEVK123456', 'AS4TEXT': 'My change', 'AS4USER': 'TESTUSER'},
            {'TRKORR': 'DEVK123457', 'AS4TEXT': 'Another',   'AS4USER': 'TESTUSER'},
        ]
        mock_pyrfc.Connection.RESPONSES['CTS_API_GET_OPEN_CHANGE_REQUESTS'] = \
            {'ET_CHANGE_REQUESTS': trs}
        result = self.writer.getOpenTransports('TESTUSER')
        assert len(result['ET_CHANGE_REQUESTS']) == 2
        assert result['ET_CHANGE_REQUESTS'][0]['TRKORR'] == 'DEVK123456'

    def test_uppercases_user(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return {'ET_CHANGE_REQUESTS': []}
        mock_pyrfc.Connection.RESPONSES['CTS_API_GET_OPEN_CHANGE_REQUESTS'] = capture
        self.writer.getOpenTransports('testuser')
        assert received.get('IV_USER') == 'TESTUSER'

    def test_returns_error_dict_on_logon_error(self):
        mock_pyrfc.Connection.RESPONSES['CTS_API_GET_OPEN_CHANGE_REQUESTS'] = \
            mock_pyrfc.LogonError('wrong password')
        result = self.writer.getOpenTransports('TESTUSER')
        assert result['type'] == 'LogonError'


# ── createTransport ───────────────────────────────────────────────────────────

class TestCreateTransport:
    writer = SAPWriter(SYSTEM)

    def test_returns_new_trkorr(self):
        mock_pyrfc.Connection.RESPONSES['CTS_API_CREATE_CHANGE_REQUEST'] = \
            {'EV_TRKORR': 'DEVK999001'}
        result = self.writer.createTransport('My new transport')
        assert result['EV_TRKORR'] == 'DEVK999001'

    def test_passes_description(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return {'EV_TRKORR': 'DEVK999002'}
        mock_pyrfc.Connection.RESPONSES['CTS_API_CREATE_CHANGE_REQUEST'] = capture
        self.writer.createTransport('Fix for bug 42')
        assert received.get('IV_SHORT_TEXT') == 'Fix for bug 42'


# ── updateProgram ─────────────────────────────────────────────────────────────

class TestUpdateProgram:
    writer = SAPWriter(SYSTEM)

    def test_calls_rpy_program_update(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return {}
        mock_pyrfc.Connection.RESPONSES['RPY_PROGRAM_UPDATE'] = capture
        self.writer.updateProgram('ZTEST', SOURCE, 'DEVK123456')
        assert received.get('PROGRAM_NAME')       == 'ZTEST'
        assert received.get('TRANSPORT_REQUEST')  == 'DEVK123456'
        assert received.get('SOURCE_EXTENDED')    == SOURCE

    def test_uppercases_program_name(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return {}
        mock_pyrfc.Connection.RESPONSES['RPY_PROGRAM_UPDATE'] = capture
        self.writer.updateProgram('ztest', SOURCE, 'DEVK123456')
        assert received.get('PROGRAM_NAME') == 'ZTEST'

    def test_returns_error_dict_on_failure(self):
        mock_pyrfc.Connection.RESPONSES['RPY_PROGRAM_UPDATE'] = \
            mock_pyrfc.ABAPApplicationError('locked by user', msg_v1='DEVK999999')
        result = self.writer.updateProgram('ZTEST', SOURCE, 'DEVK123456')
        assert result['type'] == 'ABAPApplicationError'


# ── insertObjectToTransport ───────────────────────────────────────────────────

class TestInsertObjectToTransport:
    writer = SAPWriter(SYSTEM)

    def test_assigns_prog_to_tr(self):
        received = {}
        def capture(**kwargs):
            received.update(kwargs)
            return {}
        mock_pyrfc.Connection.RESPONSES['TR_OBJECT_INSERT'] = capture
        self.writer.insertObjectToTransport('DEVK123456', 'ZTEST')
        assert received.get('WI_TRKORR')   == 'DEVK123456'
        assert received.get('WI_PGMID')    == 'R3TR'
        assert received.get('WI_OBJECT')   == 'PROG'
        assert received.get('WI_OBJ_NAME') == 'ZTEST'

    def test_uppercases_program_name(self):
        received = {}
        mock_pyrfc.Connection.RESPONSES['TR_OBJECT_INSERT'] = \
            lambda **kw: received.update(kw) or {}
        self.writer.insertObjectToTransport('DEVK123456', 'ztest')
        assert received.get('WI_OBJ_NAME') == 'ZTEST'
