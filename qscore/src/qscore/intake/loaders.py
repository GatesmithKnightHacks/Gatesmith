"""Circuit loading (specs/05-pipeline.md §4.1). Slice S5: OpenQASM 2/3 files.
Builders via the sandbox arrive with M3 (ChP-0023); packages and line mode with ChP-0037."""

from __future__ import annotations

import io
import json
import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from openqasm3.parser import QASM3ParsingError
from qiskit import QuantumCircuit, qasm2, qasm3, qpy

from qscore.errors import ConfigError, InvalidInput, SandboxError
from qscore.intake.compat import describe, removed_apis
from qscore.intake.discover import parse_source
from qscore.intake.sandbox import BuilderRequest, project_python, run_builder
from qscore.intake.script import prefix, script_text
from qscore.schemas.common import sha256_hex
from qscore.schemas.manifest import BuilderSource, CircuitItem, Runner

_VERSION = re.compile(r"^\s*OPENQASM\s+(\d+)(?:\.\d+)?\s*;", re.MULTILINE)


@dataclass(frozen=True)
class LoadedCircuit:
    circuit: QuantumCircuit
    circuit_sha256: str
    qasm_version: int | None
    rebuild: Callable[[int], QuantumCircuit] | None = None
    dependency_sha256: str | None = None


def qpy_sha256(circuit: QuantumCircuit) -> str:
    buf = io.BytesIO()
    qpy.dump(circuit, buf)
    return sha256_hex(buf.getvalue())


@dataclass(frozen=True)
class QasmProblem:
    """Why a QASM file did not load: Q200 (missing) or Q304 (parse error), with the parser's
    1-based line and column when it gives them (05 §4.1)."""

    code: str
    message: str
    line: int | None = None
    column: int | None = None


# Both importers prefix messages with "<line>,<0-based column>:" (qasm2 adds "<input>:").
_POSITION = re.compile(r"^[\"']?(?:<input>:)?(\d+),(\d+):\s*")


def _parse_problem(name: str, exc: Exception) -> QasmProblem:
    text = str(exc).strip()
    m = _POSITION.match(text)
    if m is None:
        return QasmProblem("Q304", f"{name}: {text or type(exc).__name__}")
    detail = text[m.end() :].rstrip("\"'")
    return QasmProblem("Q304", f"{name}: {detail}", int(m[1]), int(m[2]) + 1)


def parse_qasm(path: Path) -> LoadedCircuit | QasmProblem:
    """Load an OpenQASM 2 or 3 file, or say why it cannot be loaded."""
    if not path.is_file():
        return QasmProblem("Q200", f"file not found: {path.name}")
    text = path.read_text(encoding="utf-8")
    m = _VERSION.search(text)
    if m is None:
        return QasmProblem("Q304", f"{path.name}: no 'OPENQASM <version>;' header")
    version = int(m[1])
    if version not in (2, 3):
        line = text.count("\n", 0, m.start(1)) + 1
        return QasmProblem("Q304", f"{path.name}: unsupported OPENQASM {version}", line)
    try:
        if version == 2:
            qc = qasm2.loads(text, custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS)
        else:
            qc = qasm3.loads(text)
    # QASM3ParsingError (syntax) escapes qasm3.loads unwrapped and carries no message (ChP-0027).
    except (qasm2.QASM2ParseError, qasm3.QASM3ImporterError, QASM3ParsingError) as exc:
        return _parse_problem(path.name, exc)
    qc.name = path.stem
    return LoadedCircuit(qc, qpy_sha256(qc), version)


def load_qasm(path: Path) -> LoadedCircuit:
    """Load an OpenQASM 2 or 3 file; missing file → Q200, parse error → Q304."""
    loaded = parse_qasm(path)
    if isinstance(loaded, QasmProblem):
        raise InvalidInput(f"[{loaded.code}] {loaded.message}", report=None)
    return loaded


def bind_parameters(circuit: QuantumCircuit, values: dict[str, float]) -> QuantumCircuit:
    """Bind every free parameter by name; missing names are Q305, extra names Q207."""
    parameters = {p.name: p for p in circuit.parameters}
    missing = parameters.keys() - values.keys()
    if missing:
        raise InvalidInput(
            f"[Q305] unbound parameters: {', '.join(sorted(missing))}", report=None, code="Q305"
        )
    unknown = values.keys() - parameters.keys()
    if unknown:
        raise InvalidInput(
            f"[Q207] unknown parameters: {', '.join(sorted(unknown))}", report=None, code="Q207"
        )
    return circuit.assign_parameters({parameters[k]: v for k, v in values.items()})


def load_builder(
    item: CircuitItem, root: Path, runner: Runner, size: int | None = None
) -> LoadedCircuit | QasmProblem:
    """Run a curated builder in the sandbox, bind angles, and expose a sandboxed size rebuild."""
    source = item.source
    assert isinstance(source, BuilderSource)
    python = None
    dependency_sha256 = None
    if runner.env == "uv":
        python = project_python(root, runner.timeout_s, runner.mem_mb)
        try:
            dependency_sha256 = sha256_hex((root / ".qscore/deps.json").read_bytes())
        except OSError as exc:
            raise ConfigError(
                f"project dependency record missing/unreadable; run qscore deps {root}"
            ) from exc
    rel, function = source.builder.split("::")
    args = dict(source.args)
    if size is not None:
        assert item.size_sweep is not None
        args[item.size_sweep.arg] = size
    values: dict[str, float] = {}
    if source.parameters is not None:
        try:
            doc = json.loads((root / source.parameters.file).read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            return QasmProblem("Q207", f"parameters file: {exc}")
        if not isinstance(doc, dict) or any(
            not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v)
            for v in doc.values()
        ):
            return QasmProblem("Q207", "parameters must map names to finite numeric values")
        values = doc
    file = root / rel
    if source.line is None:
        request = BuilderRequest(root, file, function, args)
    else:
        try:
            text = script_text(file, rel)
            request = BuilderRequest(
                root,
                file,
                function,
                args,
                source_text=prefix(text, source.line, rel),
                cwd=file.parent,
                line=source.line,
            )
        except InvalidInput as exc:
            assert exc.code is not None  # script_text and prefix always name Q103 or Q301
            (issue,) = exc.report.issues
            return QasmProblem(exc.code, issue.message, issue.location.line, issue.location.column)
    try:
        built = (
            run_builder(request, runner.timeout_s, runner.mem_mb)
            if python is None
            else run_builder(request, runner.timeout_s, runner.mem_mb, python=python)
        )
    except SandboxError as exc:
        codes = {
            "timeout": "Q300",
            "import_error": "Q301",
            "user_exception": "Q302",
            "not_a_circuit": "Q303",
            "args_for_circuit": "Q103",
        }
        code = codes[exc.kind]
        message = str(exc)
        if code in ("Q301", "Q302"):
            message += _compat_hint(file, rel)
        return QasmProblem(code, message)
    try:
        circuit = bind_parameters(built.circuit, values)
    except InvalidInput as exc:
        assert exc.code is not None  # bind_parameters always names Q305 or Q207
        return QasmProblem(exc.code, str(exc))

    def rebuild(value: int) -> QuantumCircuit:
        loaded = load_builder(item, root, runner, value)
        if isinstance(loaded, QasmProblem):
            raise InvalidInput(f"[{loaded.code}] size {value}: {loaded.message}", report=None)
        return loaded.circuit

    return LoadedCircuit(circuit, qpy_sha256(circuit), None, rebuild, dependency_sha256)


def _compat_hint(file: Path, rel: str) -> str:
    """Removed Qiskit APIs used in the builder's file, joined to its Q301/Q302 (ChP-0037 §2.1 B);
    empty when there are none. A file that does not parse has no hits (its Q301 says why)."""
    try:
        tree = parse_source(script_text(file, rel))
    except (SyntaxError, UnicodeError):
        return ""
    hits = removed_apis(tree)
    if not hits:
        return ""
    return " Removed Qiskit APIs in this file: " + "; ".join(describe(h, rel) for h in hits)
