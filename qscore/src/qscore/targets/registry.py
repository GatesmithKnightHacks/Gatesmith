"""Target registry (specs/05-pipeline.md §6.1; slice S1 of CP-0022).

Built-ins: `FakeTorino`, `line-N`, `grid-RxC`, `heavy-hex-D`, and the all-to-all shadow of any
target. Custom `{coupling_map, basis_gates}` targets arrive with T11 (their calibration format and
assumed errors are pending in CP-0009).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from qiskit.transpiler import CouplingMap, Target

from qscore.errors import CompileError, InvalidInput
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.manifest import TargetSpec

# Operations that are not gates of the basis (scorecard `target.basis` lists gates only).
NON_BASIS_OPS = frozenset({"measure", "reset", "delay", "id", "for_loop", "if_else", "switch_case"})
CX_BASIS = ("cx", "rz", "sx", "x")
CZ_BASIS = ("cz", "rz", "sx", "x")
# Non-gate operations every built target supports (05 §6.1: "plus measure/reset/delay").
NON_GATE_OPS = ("measure", "reset", "delay")
# Named backends carry their own calibration; every other target is synthetic (CP-0025).
NAMED_BACKENDS = frozenset({"FakeTorino"})


@dataclass(frozen=True)
class TargetBundle:
    """A compile target plus what the scorecard records about it."""

    name: str
    target: Target
    basis: tuple[str, ...]
    num_qubits: int
    calibration_id: str | None
    calibration_assumed: bool
    has_calibration: bool  # gate/measure error data usable by reliability_heuristic
    has_durations: bool

    @property
    def two_qubit_gate(self) -> str:
        names = [n for n in self.basis if self.target.operation_from_name(n).num_qubits == 2]
        if len(names) != 1:
            raise CompileError(f"target {self.name}: expected one 2-qubit basis gate, got {names}")
        return names[0]


def _snapshot_id(target: Target) -> str:
    """Hash of the error/duration tables (the calibration snapshot id)."""
    table: list[Any] = []
    for name in sorted(target.operation_names):
        for qargs, props in sorted((target[name] or {}).items(), key=lambda kv: kv[0] or ()):
            if props is not None:
                table.append([name, list(qargs or ()), props.error, props.duration])
    return sha256_hex(canonical_json(table))


def _basis_of(target: Target) -> tuple[str, ...]:
    return tuple(sorted(n for n in target.operation_names if n not in NON_BASIS_OPS))


def _from_coupling(name: str, cmap: CouplingMap, basis: tuple[str, ...]) -> TargetBundle:
    target = Target.from_configuration(basis_gates=[*basis, *NON_GATE_OPS], coupling_map=cmap)
    return TargetBundle(name, target, basis, target.num_qubits, None, False, False, False)


_SYNTHETIC = (r"line-(\d+)", r"grid-(\d+)x(\d+)", r"heavy-hex-(\d+)")


def target_problem(spec: TargetSpec) -> tuple[str, str] | None:
    """`(code, message)` when a named target is unknown (Q206) or a synthetic target asks for
    backend calibration (Q103); None otherwise. Builds nothing (reference pass, 05 §3)."""
    name = spec.backend
    if name is None or name in NAMED_BACKENDS:
        return None
    if not any(re.fullmatch(p, name) for p in _SYNTHETIC):
        return "Q206", f"unknown target {name!r}"
    if spec.calibration == "from_backend":
        return (
            "Q103",
            f"target {name} is synthetic and has no backend calibration; "
            "set target.calibration: none",
        )
    return None


def get_target(spec: TargetSpec) -> TargetBundle:
    """Build the target named by `spec` (raises `InvalidInput` for unknown names, Q206)."""
    if spec.backend is None:
        raise CompileError("custom {coupling_map, basis_gates} targets arrive with T11 (CP-0009)")
    name = spec.backend
    if spec.calibration not in (None, "none", "from_backend"):
        raise CompileError(f"target {name}: calibration files arrive with T11 (CP-0009)")
    if name == "FakeTorino":
        from qiskit_ibm_runtime.fake_provider import FakeTorino

        target = FakeTorino().target
        with_cal = spec.calibration in (None, "from_backend")
        return TargetBundle(
            name,
            target,
            _basis_of(target),
            target.num_qubits,
            _snapshot_id(target) if with_cal else None,
            False,
            with_cal,
            with_cal,
        )
    if problem := target_problem(spec):
        raise InvalidInput(f"[{problem[0]}] {problem[1]}", report=None)
    if m := re.fullmatch(r"line-(\d+)", name):
        return _from_coupling(name, CouplingMap.from_line(int(m[1])), CX_BASIS)
    if m := re.fullmatch(r"grid-(\d+)x(\d+)", name):
        return _from_coupling(name, CouplingMap.from_grid(int(m[1]), int(m[2])), CX_BASIS)
    if m := re.fullmatch(r"heavy-hex-(\d+)", name):
        return _from_coupling(name, CouplingMap.from_heavy_hex(int(m[1])), CZ_BASIS)
    raise AssertionError(f"target {name!r} passed target_problem but has no builder")


def all_to_all_for(bundle: TargetBundle, num_qubits: int) -> TargetBundle:
    """Full connectivity on `num_qubits`, same basis as `bundle` (routing reference, 06 §6)."""
    target = Target.from_configuration(
        basis_gates=[*bundle.basis, *NON_GATE_OPS], num_qubits=num_qubits
    )
    return TargetBundle(
        f"all-to-all({bundle.name})", target, bundle.basis, num_qubits, None, False, False, False
    )
