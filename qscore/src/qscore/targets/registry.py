"""Target registry (specs/05-pipeline.md §6.1; slice S1 of ChP-0022).

Built-ins: `FakeTorino`, `line-N`, `grid-RxC`, `heavy-hex-D`, and the all-to-all shadow of any
target. Custom `{coupling_map, basis_gates}` targets arrive with T11 (their calibration format and
assumed errors are pending in ChP-0009).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from pathlib import Path

from qiskit.circuit.library import get_standard_gate_name_mapping
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
# Named backends carry their own calibration; every other target is synthetic (ChP-0025).
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
        return basis_problem(spec.basis_gates or [])
    if name != "all-to-all" and not any(re.fullmatch(p, name) for p in _SYNTHETIC):
        return "Q206", f"unknown target {name!r}"
    if spec.calibration == "from_backend":
        return (
            "Q103",
            f"target {name} is synthetic and has no backend calibration; "
            "set target.calibration: none",
        )
    return None


def basis_problem(basis: list[str]) -> tuple[str, str] | None:
    """A custom basis must name distinct standard gates; measure/reset/delay are always added."""
    standard = get_standard_gate_name_mapping()
    unknown = sorted({g for g in basis if g not in standard})
    if unknown:
        return "Q103", f"basis_gates: unknown gate(s) {', '.join(unknown)}"
    if len(set(basis)) != len(basis):
        return "Q103", "basis_gates: duplicate entries"
    if extra := sorted(set(basis) & set(NON_GATE_OPS)):
        return "Q103", f"basis_gates: {', '.join(extra)} are added automatically; remove them"
    return None


def get_target(
    spec: TargetSpec, root: Path = Path("."), num_qubits: int | None = None
) -> TargetBundle:
    """Resolve a target; optional calibration paths are relative to the project root."""
    if problem := target_problem(spec):
        raise InvalidInput(f"[{problem[0]}] {problem[1]}", report=None, code=problem[0])
    bundle = _build_target(spec, num_qubits)
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
    """Build the target named by `spec`. Only user-supplied shapes (custom coupling maps and
    synthetic names) map to Q103; a named backend that fails to load is a bug and propagates."""
    if spec.backend == "FakeTorino":
        from qiskit_ibm_runtime.fake_provider import FakeTorino

        target = FakeTorino().target
        with_cal = spec.calibration in (None, "from_backend")
        return TargetBundle(
            "FakeTorino",
            target,
            _basis_of(target),
            target.num_qubits,
            snapshot_id(target) if with_cal else None,
            False,
            with_cal,
            with_cal,
        )
    try:
        return _build_user_shape(spec, num_qubits)
    except (TranspilerError, ValueError, IndexError) as exc:
        raise InvalidInput(f"[Q103] invalid target: {exc}", report=None, code="Q103") from exc


def _build_user_shape(spec: TargetSpec, num_qubits: int | None) -> TargetBundle:
    """A custom coupling map or a synthetic name (validated by `target_problem` already)."""
    if spec.backend is None:
        assert spec.coupling_map is not None and spec.basis_gates is not None
        if any(a < 0 or b < 0 or a == b for a, b in spec.coupling_map):
            raise ValueError("coupling edges must join distinct nonnegative qubits")
        return _from_coupling("custom", CouplingMap(spec.coupling_map), tuple(spec.basis_gates))
    name = spec.backend
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
