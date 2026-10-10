"""Target registry (specs/05-pipeline.md §6.1; slice S1 of CP-0022).

Built-ins: `FakeTorino`, `line-N`, `grid-RxC`, `heavy-hex-D`, and the all-to-all shadow of any
target. Custom `{coupling_map, basis_gates}` targets arrive with T11 (their calibration format and
assumed errors are pending in CP-0009).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from pathlib import Path

from qiskit.transpiler import CouplingMap, Target, TranspilerError

from qscore.errors import CompileError, InvalidInput
from qscore.schemas.manifest import CalibrationFile, TargetSpec
from qscore.targets.calibration import apply_file, snapshot_id

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
    if name in NAMED_BACKENDS:
        return None
    if name is None:
        if spec.calibration == "from_backend":
            return "Q103", "custom targets have no backend calibration"
        return None
    if name != "all-to-all" and not any(re.fullmatch(p, name) for p in _SYNTHETIC):
        return "Q206", f"unknown target {name!r}"
    if spec.calibration == "from_backend":
        return (
            "Q103",
            f"target {name} is synthetic and has no backend calibration; "
            "set target.calibration: none",
        )
    return None


def get_target(
    spec: TargetSpec, root: Path = Path("."), num_qubits: int | None = None
) -> TargetBundle:
    """Resolve a target; optional calibration paths are relative to the project root."""
    if problem := target_problem(spec):
        raise InvalidInput(f"[{problem[0]}] {problem[1]}", report=None)
    try:
        bundle = _build_target(spec, num_qubits)
    except (TranspilerError, ValueError, IndexError) as exc:
        raise InvalidInput(f"[Q103] invalid target: {exc}", report=None) from exc
    if isinstance(spec.calibration, CalibrationFile):
        has_cal, has_durations = apply_file(bundle.target, root / spec.calibration.file)
        bundle = replace(
            bundle,
            calibration_id=snapshot_id(bundle.target),
            has_calibration=has_cal,
            has_durations=has_durations,
        )
    return bundle


def _build_target(spec: TargetSpec, num_qubits: int | None) -> TargetBundle:
    """Build the target named by `spec` (raises `InvalidInput` for unknown names, Q206)."""
    if spec.backend is None:
        assert spec.coupling_map is not None and spec.basis_gates is not None
        if any(a < 0 or b < 0 or a == b for a, b in spec.coupling_map):
            raise ValueError("coupling edges must join distinct nonnegative qubits")
        return _from_coupling("custom", CouplingMap(spec.coupling_map), tuple(spec.basis_gates))
    name = spec.backend
    if name == "FakeTorino":
        from qiskit_ibm_runtime.fake_provider import FakeTorino

        target = FakeTorino().target
        with_cal = spec.calibration in (None, "from_backend")
        return TargetBundle(
            name,
            target,
            _basis_of(target),
            target.num_qubits,
            snapshot_id(target) if with_cal else None,
            False,
            with_cal,
            with_cal,
        )
    if problem := target_problem(spec):
        raise InvalidInput(f"[{problem[0]}] {problem[1]}", report=None)
    if name == "all-to-all":
        if num_qubits is None or num_qubits < 1:
            raise ValueError("all-to-all needs a circuit with at least one qubit")
        return _from_coupling(name, CouplingMap.from_full(num_qubits), CX_BASIS)
    if m := re.fullmatch(r"line-(\d+)", name):
        if int(m[1]) < 1:
            raise ValueError("line size must be positive")
        return _from_coupling(name, CouplingMap.from_line(int(m[1])), CX_BASIS)
    if m := re.fullmatch(r"grid-(\d+)x(\d+)", name):
        if min(int(m[1]), int(m[2])) < 1:
            raise ValueError("grid dimensions must be positive")
        return _from_coupling(name, CouplingMap.from_grid(int(m[1]), int(m[2])), CX_BASIS)
    if m := re.fullmatch(r"heavy-hex-(\d+)", name):
        if int(m[1]) < 1 or int(m[1]) % 2 == 0:
            raise ValueError("heavy-hex distance must be a positive odd integer")
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
