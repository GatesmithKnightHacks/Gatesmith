"""Builder runner, executed **inside the sandbox** (specs/03-code-structure.md §3, 05 §4.1).

Run as ``python -I runner.py REQUEST.json``. The request names the builder file, the function,
its keyword arguments, the directories to put on ``sys.path`` (the project root) and the two
output paths. The runner imports the file, calls the function, checks that it returned a
``QuantumCircuit`` and writes QPY plus a JSON status. Depends only on Qiskit and the stdlib:
it never imports qscore, so it runs the same with or without the engine installed.

Status JSON: ``{"ok": true}`` or ``{"ok": false, "kind": "import_error" | "user_exception" |
"not_a_circuit", "message": str, "traceback": str}`` (traceback trimmed to user files).
"""

from __future__ import annotations

import importlib.util
import json
import sys
import traceback
from pathlib import Path
from types import ModuleType
from typing import Any


def _user_traceback(exc: BaseException, user_root: Path) -> str:
    """The traceback with only the frames from files under the project root."""
    frames = [
        f
        for f in traceback.extract_tb(exc.__traceback__)
        if Path(f.filename).resolve().is_relative_to(user_root)
    ]
    head = "Traceback (most recent call last):\n" if frames else ""
    tail = "".join(traceback.format_exception_only(type(exc), exc))
    return head + "".join(traceback.format_list(frames)) + tail


def _fail(status_path: Path, kind: str, exc: BaseException, user_root: Path) -> int:
    status = {
        "ok": False,
        "kind": kind,
        "message": f"{type(exc).__name__}: {exc}",
        "traceback": _user_traceback(exc, user_root),
    }
    status_path.write_text(json.dumps(status), encoding="utf-8")
    return 1


def _import(file: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(file.stem, file)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot import {file.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[file.stem] = module
    spec.loader.exec_module(module)
    return module


def main(argv: list[str]) -> int:
    request: dict[str, Any] = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    status_path = Path(request["status"])
    user_root = Path(request["project_root"]).resolve()
    sys.path[:0] = [str(user_root)]

    from qiskit import QuantumCircuit, qpy

    try:
        module = _import(Path(request["file"]))
        # Q202 is caught earlier by the reference pass; reaching here means the import changed it.
        function = getattr(module, request["function"])
    # Any user exception is reported as Q301, not swallowed (BLE001 exempted: user approved).
    except Exception as exc:  # noqa: BLE001
        return _fail(status_path, "import_error", exc, user_root)
    try:
        circuit = function(**request["args"])
    # Any user exception is reported as Q302, not swallowed (BLE001 exempted: user approved).
    except Exception as exc:  # noqa: BLE001
        return _fail(status_path, "user_exception", exc, user_root)
    if not isinstance(circuit, QuantumCircuit):
        wrong = TypeError(f"{request['function']} returned {type(circuit).__name__}")
        return _fail(status_path, "not_a_circuit", wrong, user_root)
    with open(request["qpy"], "wb") as fh:
        qpy.dump(circuit, fh)
    status_path.write_text(json.dumps({"ok": True}), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
