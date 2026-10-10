"""Circuit loading (specs/05-pipeline.md §4.1). Slice S5: OpenQASM 2/3 files.
Builders via the sandbox arrive with M3 (CP-0023)."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

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


def load_qasm(path: Path) -> LoadedCircuit:
    """Load an OpenQASM 2 or 3 file; missing file → Q200, parse error → Q304."""
    if not path.is_file():
        raise InvalidInput(f"[Q200] file not found: {path}", report=None)
    text = path.read_text(encoding="utf-8")
    m = _VERSION.search(text)
    if m is None:
        raise InvalidInput(f"[Q304] {path.name}: no 'OPENQASM <version>;' header", report=None)
    version = int(m[1])
    try:
        if version == 2:
            qc = qasm2.loads(text, custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS)
        elif version == 3:
            qc = qasm3.loads(text)
        else:
            raise InvalidInput(f"[Q304] {path.name}: unsupported OPENQASM {version}", report=None)
    except (qasm2.QASM2ParseError, qasm3.QASM3ImporterError) as exc:
        raise InvalidInput(f"[Q304] {path.name}: {exc}", report=None) from exc
    qc.name = path.stem
    return LoadedCircuit(qc, qpy_sha256(qc), version)
