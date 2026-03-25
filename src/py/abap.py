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

    def checkFunctionExist(self, funcName):
        try:
            conn = Connection(**self.abap_system)
            conn.call("RFC_FUNCTION_SEARCH", FUNCNAME=funcName)
            return True
        except Exception:
            return False

    def searchPrograms(self, pattern):
        """
        Search ABAP programs by wildcard pattern (e.g. 'Z_MY*').
        Uses RFC_READ_TABLE on TRDIR (program directory).
        Returns list of {'NAME': str, 'SUBC': str} or error dict.
        """
        try:
            conn = Connection(**self.abap_system)
            like_pattern = pattern.upper().replace("*", "%")
            result = conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="TRDIR",
                DELIMITER="|",
                FIELDS=[{"FIELDNAME": "NAME"}, {"FIELDNAME": "SUBC"}],
                OPTIONS=[{"TEXT": f"NAME LIKE '{like_pattern}'"}],
                ROWCOUNT=100,
            )
            rows = []
            for entry in result.get("DATA", []):
                parts = entry.get("WA", "").split("|")
                if len(parts) >= 2:
                    rows.append({"NAME": parts[0].strip(), "SUBC": parts[1].strip()})
            return {"PROGRAMS": rows}
        except Exception as e:
            return get_error(e)

    def searchFunctionModules(self, pattern):
        """
        Search function modules by wildcard pattern (e.g. 'Z_MY*').
        Uses RFC_FUNCTION_SEARCH which natively supports wildcards.
        Returns list of {'FUNCNAME': str, 'GROUPNAME': str} or error dict.
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RFC_FUNCTION_SEARCH",
                FUNCNAME=pattern.upper().replace("*", "*"),
            )
            rows = [
                {"FUNCNAME": r.get("FUNCNAME", ""), "GROUPNAME": r.get("GROUPNAME", "")}
                for r in result.get("FUNCTIONS", [])
            ]
            return {"FUNCTIONS": rows}
        except Exception as e:
            return get_error(e)

    def getFunctionModule(self, funcName):
        """
        Read function module source and attributes.
        Returns dict with SOURCE (lines), GLOBAL_SOURCE, FUNCTION_GROUP.
        RFC: RFC_FUNCTION_SOURCE_CONTENTS
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RFC_FUNCTION_SOURCE_CONTENTS",
                FUNCNAME=funcName.upper(),
            )
            return result
        except Exception as e:
            return get_error(e)


def get_error(ex):
    error = {}
    error["type"] = type(ex).__name__
    error["code"] = ex.code if hasattr(ex, "code") else "<None>"
    error["key"] = ex.key if hasattr(ex, "key") else "<None>"
    raw_msg = ex.message if hasattr(ex, "message") else str(ex)
    error["message"] = raw_msg.split("\n")
    error["msg_class"] = ex.msg_class if hasattr(ex, "msg_class") else "<None>"
    error["msg_type"] = ex.msg_type if hasattr(ex, "msg_type") else "<None>"
    error["msg_number"] = ex.msg_number if hasattr(ex, "msg_number") else "<None>"
    error["msg_v1"] = ex.msg_v1 if hasattr(ex, "msg_v1") else "<None>"
    return error
