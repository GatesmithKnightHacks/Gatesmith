"""Builder runner, executed **inside the sandbox** (specs/03-code-structure.md §3, 05 §4.1).

Run as ``python -I runner.py REQUEST.json``. The request names the builder file, the name,
its keyword arguments, the project root (put on ``sys.path``) and the two output paths. The
runner imports the file, calls the function, checks that it returned a ``QuantumCircuit`` and
writes QPY plus a JSON status. Depends only on Qiskit and the stdlib: it never imports qscore,
so it runs the same with or without the engine installed.

Packages (ChP-0037): a file inside a regular package (its directory has ``__init__.py``) is
imported by its dotted module name with the top package's parent directory on ``sys.path``, so
relative imports work and the package ``__init__`` files run; otherwise it is imported as a
single file.

Line mode (ChP-0037, request has ``source_text``): the engine already cut the script to the
statements at or before ``line``. The runner executes that text in a fresh module named
``__qscore_script__`` (``if __name__ == "__main__":`` blocks do not run) with ``__file__`` set to
the file, the file's directory and the project root on ``sys.path``, and ``cwd`` as working
directory. It then takes ``name``: a ``QuantumCircuit`` (``args`` must be empty) or a callable
called with ``args``.

Status JSON: ``{"ok": true}`` or ``{"ok": false, "kind": "import_error" | "user_exception" |
"not_a_circuit" | "args_for_circuit", "message": str, "traceback": str}`` (traceback trimmed to
user files).
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import linecache
import os
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


def _package(file: Path, user_root: Path) -> tuple[Path, str] | None:
    """The top package's parent directory and the file's dotted module name, or None when the
    file's directory is not a regular package (no ``__init__.py``) below the project root. The
    walk stops below the root (never the root itself), so no directory above it reaches
    ``sys.path``."""
    directory = file.parent
    parts = [file.stem] if file.name != "__init__.py" else []
    while (
        (directory / "__init__.py").is_file()
        and directory != user_root
        and directory.is_relative_to(user_root)
    ):
        parts.insert(0, directory.name)
        directory = directory.parent
    if directory == file.parent:
        return None
    # src layout: namespace directories (no __init__.py) between an enclosing src/ and the top
    # regular package are part of the dotted name (src/mqt/bench/... -> mqt.bench..., 05 §4.1).
    namespace: list[str] = []
    above = directory
    while above.name != "src" and above != user_root and above.is_relative_to(user_root):
        namespace.insert(0, above.name)
        above = above.parent
    if above.name == "src" and above.is_relative_to(user_root):
        return above, ".".join([*namespace, *parts])
    return directory, ".".join(parts)


def _import(file: Path, user_root: Path) -> ModuleType:
    package = _package(file, user_root)
    if package is not None:
        parent, dotted = package
        sys.path.insert(0, str(parent))
        return importlib.import_module(dotted)
    spec = importlib.util.spec_from_file_location(file.stem, file)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot import {file.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[file.stem] = module
    spec.loader.exec_module(module)
    return module


def _run_script(file: Path, text: str, cwd: Path, user_root: Path) -> dict[str, Any]:
    """Execute the script prefix in a fresh ``__qscore_script__`` module; its namespace."""
    package = _package(file, user_root)
    module = ModuleType("__qscore_script__")
    module.__file__ = str(file)
    sys.path[:0] = [str(file.parent)]
    if package is not None:
        parent, dotted = package
        sys.path.insert(0, str(parent))
        # Relative imports resolve against the file's own package (its __init__ runs on import).
        module.__package__ = dotted if file.name == "__init__.py" else dotted.rpartition(".")[0]
    sys.modules[module.__name__] = module
    # Tracebacks show the script's own lines (a notebook's code-cell script, not its JSON).
    linecache.cache[str(file)] = (len(text), None, text.splitlines(keepends=True), str(file))
    os.chdir(cwd)
    exec(compile(text, str(file), "exec"), module.__dict__)
    return module.__dict__


def main(argv: list[str]) -> int:
    request: dict[str, Any] = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    status_path = Path(request["status"])
    user_root = Path(request["project_root"]).resolve()
    sys.path[:0] = [str(user_root)]
    file, name, args = Path(request["file"]), request["function"], request["args"]
    line_mode = request["source_text"] is not None

    from qiskit import QuantumCircuit, qpy

    try:
        if line_mode:
            namespace = _run_script(file, request["source_text"], Path(request["cwd"]), user_root)
        else:
            # Q202 is caught earlier by the reference pass; reaching here means the import
            # changed it.
            target = getattr(_import(file, user_root), name)
    # Any user exception is reported as Q301, not swallowed (BLE001 exempted: user approved).
    except Exception as exc:  # noqa: BLE001
        return _fail(status_path, "import_error", exc, user_root)
    if line_mode:
        if name not in namespace:
            missing = NameError(f"{name} is not defined after line {request['line']}")
            return _fail(status_path, "user_exception", missing, user_root)
        target = namespace[name]
        if not isinstance(target, QuantumCircuit) and not callable(target):
            kind = type(target).__name__
            wrong = TypeError(f"{name} is {kind}, not a circuit or a function")
            return _fail(status_path, "not_a_circuit", wrong, user_root)
    if line_mode and isinstance(target, QuantumCircuit):
        if args:
            wrong = TypeError(f"{name} is a circuit, so it takes no args (got {', '.join(args)})")
            return _fail(status_path, "args_for_circuit", wrong, user_root)
        circuit = target
    else:
        try:
            circuit = target(**args)
        # Any user exception is reported as Q302, not swallowed (BLE001 exempted: user approved).
        except Exception as exc:  # noqa: BLE001
            return _fail(status_path, "user_exception", exc, user_root)
    if not isinstance(circuit, QuantumCircuit):
        wrong = TypeError(f"{name} returned {type(circuit).__name__}")
        return _fail(status_path, "not_a_circuit", wrong, user_root)
    with open(request["qpy"], "wb") as fh:
        qpy.dump(circuit, fh)
    status_path.write_text(json.dumps({"ok": True}), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
