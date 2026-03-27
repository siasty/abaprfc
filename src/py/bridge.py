import importlib.util
import json
import os
import sys
import traceback


def _serialize_exception(ex):
    error = {}
    ex_type = type(ex).__name__
    error["type"] = ex_type
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
    spec = importlib.util.spec_from_file_location("abaprfc_bridge_target", module_path)
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


def main():
    try:
        _configure_windows_dll_path()
        payload = json.load(sys.stdin)
        module = _load_module(payload["scriptPath"])
        cls = getattr(module, payload["className"])
        instance = cls(*payload.get("constructorArgs", []))
        method = getattr(instance, payload["method"])
        result = method(*payload.get("args", []))
        json.dump({"ok": True, "result": result}, sys.stdout)
    except Exception as ex:
        json.dump({"ok": False, "error": _serialize_exception(ex)}, sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
