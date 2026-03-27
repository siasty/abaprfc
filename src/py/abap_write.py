from pyrfc import Connection


class SAPWriter:
    """RFC bridge for write operations (program upload, transport management)."""

    def __init__(self, _abap_system):
        self.abap_system = _abap_system

    def syntaxCheckProgram(self, programName, source):
        """
        Run ABAP syntax check on provided source.
        source: list of {'LINE': '...'} dicts (same format as RPY_PROGRAM_READ output).
        Returns dict with SYNTAX_ERRORS table or error dict.
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "SYNTAX_CHECK_PROGRAM",
                PROGRAM=programName.upper(),
                SOURCE=source,
            )
            return result
        except Exception as e:
            return _get_error(e)

    def getOpenTransports(self, userId):
        """
        Returns open (modifiable) change requests for the given user.
        Always reads E070 via RFC_READ_TABLE because CTS helper FMs
        are not consistently available across systems.
        Returns dict with ET_CHANGE_REQUESTS list or error dict.
        """
        try:
            conn = Connection(**self.abap_system)
            uid = userId.upper()
            result = conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="E070",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "TRKORR"},
                    {"FIELDNAME": "TRFUNCTION"},
                    {"FIELDNAME": "TARSYSTEM"},
                    {"FIELDNAME": "AS4USER"},
                    {"FIELDNAME": "TRSTATUS"},
                    {"FIELDNAME": "STRKORR"},
                ],
                OPTIONS=[
                    {"TEXT": f"AS4USER EQ '{uid}'"},
                ],
                ROWCOUNT=200,
            )
            rows = []
            for entry in result.get("DATA", []):
                parts = entry.get("WA", "").split("|")
                if len(parts) >= 6 and parts[4].strip() == "D":
                    rows.append(
                        {
                            "TRKORR": parts[0].strip(),
                            "TRFUNCTION": parts[1].strip(),
                            "TARSYSTEM": parts[2].strip(),
                            "AS4USER": parts[3].strip(),
                            "TRSTATUS": parts[4].strip(),
                            "STRKORR": parts[5].strip(),
                        }
                    )
            return {"ET_CHANGE_REQUESTS": rows}
        except Exception as e:
            return _get_error(e)

    def createTransport(self, description, category="K", owner="", client=""):
        """
        Create a new change request via CTS_API_CREATE_CHANGE_REQUEST.
        category: E070-TRFUNCTION, e.g. K (Workbench), W (Customizing), T (ToC)
        Returns dict with EV_TRKORR - the new transport number (e.g. 'DEVK123456').
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "CTS_API_CREATE_CHANGE_REQUEST",
                DESCRIPTION=description,
                CATEGORY=category,
                OWNER=(owner or self.abap_system.get("user", "")).upper(),
                CLIENT=client or self.abap_system.get("client", ""),
            )
            if result.get("REQUEST") and not result.get("EV_TRKORR"):
                result["EV_TRKORR"] = result["REQUEST"]
            return result
        except Exception as e:
            return _get_error(e)

    def getTransportObjects(self, trkorr):
        """
        Returns the objects included in a transport request.
        Reads table E071 (transport object list) via RFC_READ_TABLE.
        Returns dict with OBJECTS list (PGMID, OBJECT, OBJ_NAME) or error dict.
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RFC_READ_TABLE",
                QUERY_TABLE="E071",
                DELIMITER="|",
                FIELDS=[
                    {"FIELDNAME": "PGMID"},
                    {"FIELDNAME": "OBJECT"},
                    {"FIELDNAME": "OBJ_NAME"},
                ],
                OPTIONS=[{"TEXT": f"TRKORR = '{trkorr.upper()}'"}],
            )
            rows = []
            for entry in result.get("DATA", []):
                parts = entry.get("WA", "").split("|")
                if len(parts) >= 3:
                    rows.append(
                        {
                            "PGMID": parts[0].strip(),
                            "OBJECT": parts[1].strip(),
                            "OBJ_NAME": parts[2].strip(),
                        }
                    )
            return {"OBJECTS": rows}
        except Exception as e:
            return _get_error(e)

    def insertObjectToTransport(self, trkorr, programName):
        """
        Assign an ABAP program object to an existing transport request.
        Uses PGMID=R3TR, OBJECT=PROG which covers both programs and includes.
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "TR_OBJECT_INSERT",
                WI_TRKORR=trkorr,
                WI_PGMID="R3TR",
                WI_OBJECT="PROG",
                WI_OBJ_NAME=programName.upper(),
            )
            return result
        except Exception as e:
            return _get_error(e)

    def updateProgram(self, programName, source, trkorr):
        """
        Write ABAP program source to SAP and assign to transport.
        source: list of {'LINE': '...'} dicts.
        trkorr: transport request number (e.g. 'DEVK123456').
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RPY_PROGRAM_UPDATE",
                PROGRAM_NAME=programName.upper(),
                SOURCE_EXTENDED=source,
                TRANSPORT_REQUEST=trkorr,
            )
            return result
        except Exception as e:
            return _get_error(e)

    def updateFunctionModule(self, funcName, source, trkorr):
        """
        Write function module source to SAP.
        source: list of {'LINE': '...'} dicts.
        Note: TR assignment must use the function GROUP name (FUGR), not the FM name.
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RFC_FUNCTION_SOURCE_INSERT",
                FUNCNAME=funcName.upper(),
                SOURCE=source,
                TRANSPORT_REQUEST=trkorr,
            )
            return result
        except Exception as e:
            return _get_error(e)

    def insertProgram(self, programName, programType, description, source, trkorr):
        """
        Create a new ABAP program in SAP.
        programType: 'E' for include, '1' for executable program, etc.
        """
        try:
            conn = Connection(**self.abap_system)
            result = conn.call(
                "RPY_PROGRAM_INSERT",
                PROGRAM_NAME=programName.upper(),
                PROGRAM_TYPE=programType,
                DESCRIPTION=description,
                SOURCE=source,
                TRANSPORT_REQUEST=trkorr,
            )
            return result
        except Exception as e:
            return _get_error(e)


def _get_error(ex):
    error = {}
    error["type"] = type(ex).__name__
    error["code"] = ex.code if hasattr(ex, "code") else "<None>"
    error["key"] = ex.key if hasattr(ex, "key") else "<None>"
    error["message"] = ex.message.split("\n") if hasattr(ex, "message") else str(ex)
    error["msg_class"] = ex.msg_class if hasattr(ex, "msg_class") else "<None>"
    error["msg_type"] = ex.msg_type if hasattr(ex, "msg_type") else "<None>"
    error["msg_number"] = ex.msg_number if hasattr(ex, "msg_number") else "<None>"
    error["msg_v1"] = ex.msg_v1 if hasattr(ex, "msg_v1") else "<None>"
    return error
