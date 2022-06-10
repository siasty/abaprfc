from pyrfc import (
    Connection,
    ABAPApplicationError,
    ABAPRuntimeError,
    LogonError,
    CommunicationError,
    RFCError,
)


class SAP:
    def __init__(self, _abap_system):
        self.abap_system = _abap_system

    def checkProgramExist(self, programName):
        try:
            conn = Connection(**self.abap_system)
            result = conn.call("RPY_EXISTENCE_CHECK_PROG", NAME=programName)
            return True
        except Exception:
            return False

    def getZetProgram(self, programName):
        I_ENV_TAB = []
        I_OBJ_SOURCE = []
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "REPOSITORY_ENVIRONMENT_RFC",
                OBJ_TYPE="PROG",
                OBJECT_NAME=programName,
                ENVIRONMENT_TAB=I_ENV_TAB,
                SOURCE_OBJECTS=I_OBJ_SOURCE,
            )
            return result
        except Exception as e:
            error = get_error(e)
            return error

    def getZetReadProgram(self, programName):
        I_INCLUDE_TAB = []
        I_SOURCE = []
        I_TEXTELEMENTS = []
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RPY_PROGRAM_READ",
                PROGRAM_NAME=programName,
                INCLUDE_TAB=I_INCLUDE_TAB,
                SOURCE=I_SOURCE,
                TEXTELEMENTS=I_TEXTELEMENTS,
            )
            return result
        except Exception as e:
            error = get_error(e)
            return error


def get_error(ex):
    error = {}
    ex_type_full = str(type(ex))
    error["type"] = ex_type_full[ex_type_full.rfind(".") + 1 : ex_type_full.rfind("'")]
    error["code"] = ex.code if hasattr(ex, "code") else "<None>"
    error["key"] = ex.key if hasattr(ex, "key") else "<None>"
    error["message"] = ex.message.split("\n")
    error["msg_class"] = ex.msg_class if hasattr(ex, "msg_class") else "<None>"
    error["msg_type"] = ex.msg_type if hasattr(ex, "msg_type") else "<None>"
    error["msg_number"] = ex.msg_number if hasattr(ex, "msg_number") else "<None>"
    error["msg_v1"] = ex.msg_v1 if hasattr(ex, "msg_v1") else "<None>"
    return error
