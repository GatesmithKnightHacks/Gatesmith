"""Compiled circuit export as OpenQASM 3 (ChP-0034 §2.1 A; specs/05-pipeline.md §9).

`<out>/compiled/<item_id>.qasm` is `qiskit.qasm3.dumps` of the representative compiled circuit,
unchanged, preceded by `// <key>: <JSON>` comment lines for what OpenQASM 3 does not carry
(versions, item, target width, seed, optimization level, layouts).
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path

from qiskit import qasm3
from qiskit.qasm3.exceptions import QASM3ExporterError

from qscore.compile.pipeline import CompiledResult
from qscore.errors import RecordError
from qscore.schemas.common import sha256_hex
from qscore.schemas.versions import SCORE_VERSION

COMPILED_DIR = "compiled"


@dataclass(frozen=True)
class CompiledExport:
    """One written file; the fields of the run record's `compiled[]` entry (ChP-0034 §2.1 B)."""

    item_id: str
    path: str  # relative to the output directory, POSIX separators
    sha256: str  # of the file bytes
    seed: int  # the representative compile's transpiler seed


def _header(
    item_id: str,
    item_sha256: str,
    result: CompiledResult,
    target_name: str,
    target_num_qubits: int,
    optimization_level: int,
) -> str:
    layout = result.circuit.layout
    fields: list[tuple[str, object]] = [
        ("qscore", version("qscore")),
        ("score_version", SCORE_VERSION),
        ("item_id", item_id),
        ("item_sha256", item_sha256),
        ("target", {"name": target_name, "num_qubits": target_num_qubits}),
        ("transpiler_seed", result.seed),
        ("optimization_level", optimization_level),
        # virtual qubit i → physical qubit (ancillas included, as Qiskit reports it)
        ("initial_layout", None if layout is None else layout.initial_index_layout()),
        # final physical position of virtual qubit i after routing
        ("final_index_layout", None if layout is None else layout.final_index_layout()),
    ]
    return "".join(f"// {key}: {json.dumps(value)}\n" for key, value in fields)


def export_compiled(
    item_id: str,
    item_sha256: str,
    result: CompiledResult,
    target_name: str,
    target_num_qubits: int,
    optimization_level: int,
    out_dir: Path,
) -> CompiledExport:
    """Write `<out_dir>/compiled/<item_id>.qasm` atomically and return its run-record entry.

    Raises `RecordError` naming the item when Qiskit's OpenQASM 3 exporter cannot export the
    circuit; nothing is written then (no QASM 2, QPY or partial file).
    """
    try:
        body = qasm3.dumps(result.circuit)
    except QASM3ExporterError as exc:
        raise RecordError(
            f"item {item_id}: OpenQASM 3 export of the compiled circuit failed: {exc}"
        ) from exc
    text = (
        _header(item_id, item_sha256, result, target_name, target_num_qubits, optimization_level)
        + body
    )
    data = text.encode("utf-8")
    directory = out_dir / COMPILED_DIR
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{item_id}.qasm"
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=f".{item_id}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)
    finally:
        # Only left behind when the write or the rename failed; the error still propagates.
        if os.path.exists(tmp):
            os.unlink(tmp)
    return CompiledExport(
        item_id=item_id,
        path=f"{COMPILED_DIR}/{item_id}.qasm",
        sha256=sha256_hex(data),
        seed=result.seed,
    )
