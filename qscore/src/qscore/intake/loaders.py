"""Circuit loading (specs/05-pipeline.md §4.1). Slice S5: OpenQASM 2/3 files.
Builders via the sandbox arrive with M3 (CP-0023)."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

from openqasm3.parser import QASM3ParsingError
from qiskit import QuantumCircuit, qasm2, qasm3, qpy

from qscore.errors import InvalidInput
from qscore.schemas.common import sha256_hex

_VERSION = re.compile(r"^\s*OPENQASM\s+(\d+)(?:\.\d+)?\s*;", re.MULTILINE)


@dataclass(frozen=True)
class LoadedCircuit:
    circuit: QuantumCircuit
    circuit_sha256: str
    qasm_version: int


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
    # QASM3ParsingError (syntax) escapes qasm3.loads unwrapped and carries no message (CP-0027).
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
