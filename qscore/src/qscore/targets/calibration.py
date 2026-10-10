"""Calibration files and snapshot identity (approved ChP-0009; units are seconds)."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from qiskit.transpiler import InstructionProperties, QubitProperties, Target

from qscore.errors import InvalidInput
from qscore.schemas.common import canonical_json, sha256_hex


def snapshot_id(target: Target) -> str:
    """Hash operation errors, durations, time resolution and qubit coherence data."""
    operations = [
        [name, list(qargs or ()), props.error, props.duration]
        for name in sorted(target.operation_names)
        for qargs, props in sorted(target[name].items(), key=lambda kv: kv[0] or ())
        if props is not None
    ]
    qubits = [
        None if p is None else [p.t1, p.t2, p.frequency] for p in (target.qubit_properties or [])
    ]
    return sha256_hex(canonical_json({"operations": operations, "qubits": qubits, "dt": target.dt}))


def apply_file(target: Target, path: Path) -> tuple[bool, bool]:
    """Apply only supplied calibration data; absent values remain unknown. Invalid data is Q208."""
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
        _apply(target, doc)
    except (OSError, UnicodeError, ValueError, TypeError, KeyError) as exc:
        raise InvalidInput(
            f"[Q208] calibration {path.name}: {exc}", report=None, code="Q208"
        ) from exc
    props = [p for name in target.operation_names for p in target[name].values() if p is not None]
    return any(p.error is not None for p in props), any(p.duration is not None for p in props)


def _number(value: Any, field: str) -> float | None:
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError(f"{field} must be a finite number")
    if (field == "error" and not 0 <= value < 1) or (field != "error" and value <= 0):
        raise ValueError(f"{field} is outside its allowed range")
    return float(value)


def _qubit(value: Any, target: Target) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < target.num_qubits:
        raise ValueError(f"invalid qubit {value!r}")
    return value


def _apply(target: Target, doc: Any) -> None:
    if not isinstance(doc, dict) or doc.get("schema") != "qscore.calibration/v0.1":
        raise ValueError("expected qscore.calibration/v0.1")
    if set(doc) - {"schema", "gates", "readout", "qubits"}:
        raise ValueError("unknown calibration fields")
    for key in ("gates", "readout", "qubits"):
        if not isinstance(doc.get(key, []), list):
            raise ValueError(f"{key} must be a list")
    # Clear backend data: the file is the declared source, never a partial backend overlay.
    for name in target.operation_names:
        for qargs in target[name]:
            target.update_instruction_properties(name, qargs, InstructionProperties())
    target.qubit_properties = [QubitProperties() for _ in range(target.num_qubits)]
    for row in doc.get("readout", []):
        if not isinstance(row, dict) or set(row) - {"qubit", "error", "duration_s"}:
            raise ValueError("invalid readout row")
    seen: set[tuple[str, tuple[int, ...]]] = set()
    for row in [
        *doc.get("gates", []),
        *[
            {
                "name": "measure",
                "qubits": [r["qubit"]],
                **{k: v for k, v in r.items() if k != "qubit"},
            }
            for r in doc.get("readout", [])
        ],
    ]:
        if not isinstance(row, dict) or set(row) - {"name", "qubits", "error", "duration_s"}:
            raise ValueError("invalid gate/readout row")
        name = row["name"]
        if not isinstance(row["qubits"], list):
            raise ValueError("gate qubits must be a list")
        qs = tuple(_qubit(q, target) for q in row["qubits"])
        if (name, qs) in seen:
            raise ValueError(f"duplicate calibration for {name}{qs}")
        seen.add((name, qs))
        if name not in target.operation_names or qs not in target[name]:
            raise ValueError(f"unsupported instruction {name}{qs}")
        target.update_instruction_properties(
            name,
            qs,
            InstructionProperties(
                error=_number(row.get("error"), "error"),
                duration=_number(row.get("duration_s"), "duration_s"),
            ),
        )
    # `Target.qubit_properties` returns a copy: build the list, then assign it once.
    qubit_props = [QubitProperties() for _ in range(target.num_qubits)]
    seen_qubits: set[int] = set()
    for row in doc.get("qubits", []):
        if not isinstance(row, dict) or set(row) - {"qubit", "t1_s", "t2_s"}:
            raise ValueError("invalid qubit row")
        q = _qubit(row["qubit"], target)
        if q in seen_qubits:
            raise ValueError(f"duplicate qubit {q}")
        seen_qubits.add(q)
        qubit_props[q] = QubitProperties(
            t1=_number(row.get("t1_s"), "t1_s"), t2=_number(row.get("t2_s"), "t2_s")
        )
    target.qubit_properties = qubit_props
