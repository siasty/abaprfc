import importlib.util
import json
import os
import sys
import traceback


_connections = {}


def _serialize_exception(ex):
    error = {}
    error["type"] = type(ex).__name__
    error["message"] = str(ex)
    error["code"] = getattr(ex, "code", "<None>")
    error["key"] = getattr(ex, "key", "<None>")
    error["msg_class"] = getattr(ex, "msg_class", "<None>")
    error["msg_type"] = getattr(ex, "msg_type", "<None>")
    error["msg_number"] = getattr(ex, "msg_number", "<None>")
    error["msg_v1"] = getattr(ex, "msg_v1", "<None>")
    error["traceback"] = traceback.format_exc().splitlines()
    return error


def _load_module(module_path):
    spec = importlib.util.spec_from_file_location("abaprfc_session_target", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load Python module: {module_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _configure_windows_dll_path():
    sdk_lib = os.environ.get("ABAPRFC_NWRFC_LIB", "").strip()
    if not sdk_lib:
        return

    if hasattr(os, "add_dll_directory") and os.path.isdir(sdk_lib):
        os.add_dll_directory(sdk_lib)

    os.environ["PATH"] = sdk_lib + os.pathsep + os.environ.get("PATH", "")


def _connect(session_id, connection_config):
    from pyrfc import Connection

    conn = Connection(**connection_config)
    conn.call("RFC_PING")
    _connections[session_id] = conn
    return {"connected": True}


def _disconnect(session_id):
    conn = _connections.pop(session_id, None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
    return {"connected": False}


def _call(session_id, payload):
    conn = _connections.get(session_id)
    if conn is None:
        raise RuntimeError(f"RFC session {session_id} is not connected.")

    module = _load_module(payload["scriptPath"])
    cls = getattr(module, payload["className"])
    instance = cls(*payload.get("constructorArgs", []))
    setattr(instance, "_session_connection", conn)
    method = getattr(instance, payload["method"])
    return method(*payload.get("args", []))


def _dispose():
    for session_id in list(_connections.keys()):
        _disconnect(session_id)
    return {"disposed": True}


def _handle_request(request):
    action = request.get("action")
    if action == "connect":
        return _connect(request["sessionId"], request["connectionConfig"])
    if action == "disconnect":
        return _disconnect(request["sessionId"])
    if action == "call":
        return _call(request["sessionId"], request["payload"])
    if action == "dispose":
        return _dispose()
    raise RuntimeError(f"Unsupported session bridge action: {action}")


def main():
    _configure_windows_dll_path()

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue

        request_id = None
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            result = _handle_request(request)
            response = {"id": request_id, "ok": True, "result": result}
        except Exception as ex:
            response = {"id": request_id, "ok": False, "error": _serialize_exception(ex)}

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
