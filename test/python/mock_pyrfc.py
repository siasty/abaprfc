"""
Mock pyrfc module for testing.
Replaces the real SAP RFC library with controllable test doubles.
"""
from unittest.mock import MagicMock


# ── Exception classes (same interface as real pyrfc) ─────────────────────────

class _RfcBase(Exception):
    def __init__(self, msg='', code='', key='', msg_v1=''):
        super().__init__(msg)
        self.message   = msg
        self.code      = code
        self.key       = key
        self.msg_v1    = msg_v1
        self.msg_class = ''
        self.msg_type  = 'E'
        self.msg_number = '000'

class ABAPApplicationError(_RfcBase): pass
class ABAPRuntimeError(_RfcBase):     pass
class LogonError(_RfcBase):           pass
class CommunicationError(_RfcBase):   pass
class RFCError(_RfcBase):             pass


# ── Connection mock ───────────────────────────────────────────────────────────

class Connection:
    """
    Configurable mock connection. Set RESPONSES before each test:

        Connection.RESPONSES['RPY_PROGRAM_READ'] = {'SOURCE': [...], ...}
        Connection.RESPONSES['RPY_PROGRAM_READ'] = SomeException('msg')
    """
    RESPONSES: dict = {}

    def __init__(self, **kwargs):
        self.params = kwargs

    def call(self, fm_name: str, **params):
        if fm_name not in Connection.RESPONSES:
            raise RFCError(f"No mock response registered for FM: {fm_name}")

        response = Connection.RESPONSES[fm_name]

        if isinstance(response, BaseException):
            raise response
        if isinstance(response, type) and issubclass(response, BaseException):
            raise response()
        if callable(response):
            return response(**params)

        return response

    @classmethod
    def reset(cls):
        cls.RESPONSES.clear()
