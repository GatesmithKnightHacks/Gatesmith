"""Target registry (specs/05-pipeline.md §6.1)."""

from __future__ import annotations

import pytest

from qscore.errors import InvalidInput
from qscore.schemas.manifest import TargetSpec
from qscore.targets.registry import all_to_all_for, get_target


def test_faketorino_uses_backend_basis_and_calibration() -> None:
    b = get_target(TargetSpec(backend="FakeTorino", calibration="from_backend"))
    assert b.num_qubits == 133
    assert b.basis == ("cz", "rz", "sx", "x")
    assert b.two_qubit_gate == "cz"
    assert b.has_calibration and b.has_durations and b.calibration_id
    assert not b.calibration_assumed


def test_faketorino_without_calibration_has_none() -> None:
    b = get_target(TargetSpec(backend="FakeTorino", calibration="none"))
    assert (b.calibration_id, b.has_calibration, b.has_durations) == (None, False, False)


@pytest.mark.parametrize(
    ("name", "qubits", "two_qubit"),
    [("line-5", 5, "cx"), ("grid-2x3", 6, "cx"), ("heavy-hex-3", 19, "cz")],
)
def test_synthetic_targets(name: str, qubits: int, two_qubit: str) -> None:
    b = get_target(TargetSpec(backend=name, calibration="none"))
    assert b.num_qubits == qubits
    assert b.two_qubit_gate == two_qubit
    assert (b.calibration_id, b.has_calibration, b.has_durations) == (None, False, False)


def test_synthetic_target_refuses_backend_calibration() -> None:
    with pytest.raises(InvalidInput, match="Q103"):
        get_target(TargetSpec(backend="line-5", calibration="from_backend"))


def test_unknown_target_is_q206() -> None:
    with pytest.raises(InvalidInput, match="Q206"):
        get_target(TargetSpec(backend="FakeNowhere", calibration="none"))


def test_all_to_all_keeps_the_basis() -> None:
    base = get_target(TargetSpec(backend="heavy-hex-3", calibration="none"))
    ref = all_to_all_for(base, 4)
    assert ref.basis == base.basis and ref.num_qubits == 4
    assert ref.target.build_coupling_map() is None  # no coupling constraint
    assert all(
        ref.target.instruction_supported("cz", (a, b)) for a in range(4) for b in range(4) if a != b
    )
