"""Calibration files and custom targets (ChP-0009, ChP-0025; specs/05-pipeline.md §6.1)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from qscore.errors import InvalidInput
from qscore.schemas.manifest import TargetSpec
from qscore.targets.registry import get_target

LINE3 = {"coupling_map": [[0, 1], [1, 0], [1, 2], [2, 1]], "basis_gates": ["cx", "rz", "sx", "x"]}
CAL: dict[str, Any] = {
    "schema": "qscore.calibration/v0.1",
    "gates": [{"name": "cx", "qubits": [0, 1], "error": 0.008, "duration_s": 3.0e-7}],
    "readout": [{"qubit": 0, "error": 0.015, "duration_s": 1.2e-6}],
    "qubits": [{"qubit": 0, "t1_s": 1.5e-4, "t2_s": 1.0e-4}],
}


def _spec(tmp_path: Path, doc: Any, **target: Any) -> TargetSpec:
    (tmp_path / "cal.json").write_text(json.dumps(doc), encoding="utf-8")
    return TargetSpec.model_validate({**(target or LINE3), "calibration": {"file": "cal.json"}})


def test_custom_target_without_calibration() -> None:
    b = get_target(TargetSpec.model_validate(LINE3), num_qubits=3)
    assert (b.num_qubits, b.basis, b.two_qubit_gate) == (3, ("cx", "rz", "sx", "x"), "cx")
    assert (b.calibration_id, b.has_calibration, b.has_durations) == (None, False, False)


def test_file_values_are_applied_in_seconds(tmp_path: Path) -> None:
    b = get_target(_spec(tmp_path, CAL), tmp_path)
    t = b.target
    assert t["cx"][(0, 1)].error == 0.008 and t["cx"][(0, 1)].duration == 3.0e-7
    assert t["measure"][(0,)].error == 0.015 and t["measure"][(0,)].duration == 1.2e-6
    assert b.has_calibration and b.has_durations and b.calibration_id
    assert not b.calibration_assumed


def test_qubit_coherence_is_kept(tmp_path: Path) -> None:
    # Regression: Target.qubit_properties returns a copy, so item assignment was lost.
    props = get_target(_spec(tmp_path, CAL), tmp_path).target.qubit_properties
    assert props is not None
    assert (props[0].t1, props[0].t2) == (1.5e-4, 1.0e-4)
    assert (props[1].t1, props[1].t2) == (None, None)


def test_absent_entries_stay_unknown(tmp_path: Path) -> None:
    t = get_target(_spec(tmp_path, CAL), tmp_path).target
    assert t["cx"][(1, 2)].error is None and t["cx"][(1, 2)].duration is None
    assert t["measure"][(1,)].error is None


def test_file_replaces_backend_data(tmp_path: Path) -> None:
    doc = {"schema": "qscore.calibration/v0.1", "readout": [{"qubit": 0, "error": 0.015}]}
    t = get_target(_spec(tmp_path, doc, backend="FakeTorino"), tmp_path).target
    assert t["measure"][(0,)].error == 0.015
    # Not a partial overlay of FakeTorino's own data: what the file omits is unknown.
    assert t["measure"][(1,)].error is None and t["sx"][(0,)].error is None
    assert t.qubit_properties is not None and t.qubit_properties[0].t2 is None


def test_snapshot_id_tracks_the_data(tmp_path: Path) -> None:
    first = get_target(_spec(tmp_path, CAL), tmp_path).calibration_id
    assert get_target(_spec(tmp_path, CAL), tmp_path).calibration_id == first
    changed = {**CAL, "qubits": [{"qubit": 0, "t1_s": 1.5e-4, "t2_s": 9.0e-5}]}
    assert get_target(_spec(tmp_path, changed), tmp_path).calibration_id != first


@pytest.mark.parametrize(
    "doc",
    [
        {**CAL, "schema": "qscore.calibration/v9"},
        {**CAL, "extra": 1},
        {**CAL, "gates": [{"name": "cx", "qubits": [0, 1], "error": 1.0}]},
        {**CAL, "gates": [{"name": "cx", "qubits": [0, 1], "duration_s": 0}]},
        {**CAL, "gates": [{"name": "cx", "qubits": [0, 2], "error": 0.01}]},
        {**CAL, "gates": [{"name": "cz", "qubits": [0, 1], "error": 0.01}]},
        {**CAL, "gates": [CAL["gates"][0], CAL["gates"][0]]},
        {**CAL, "qubits": [{"qubit": 7, "t1_s": 1e-4}]},
        {**CAL, "qubits": [{"qubit": 0, "t1_s": True}]},
        [],
    ],
    ids=[
        "schema",
        "unknown-field",
        "error-range",
        "duration-zero",
        "no-such-edge",
        "not-in-basis",
        "duplicate",
        "qubit-range",
        "bool-number",
        "not-object",
    ],
)
def test_invalid_file_is_q208(tmp_path: Path, doc: Any) -> None:
    with pytest.raises(InvalidInput, match=r"^\[Q208\]"):
        get_target(_spec(tmp_path, doc), tmp_path)


def test_unreadable_file_is_q208(tmp_path: Path) -> None:
    (tmp_path / "cal.json").write_text("{not json", encoding="utf-8")
    spec = TargetSpec.model_validate({**LINE3, "calibration": {"file": "cal.json"}})
    with pytest.raises(InvalidInput, match=r"^\[Q208\]"):
        get_target(spec, tmp_path)


def test_custom_target_cannot_take_backend_calibration() -> None:
    with pytest.raises(InvalidInput, match=r"^\[Q103\]"):
        get_target(TargetSpec.model_validate({**LINE3, "calibration": "from_backend"}))


@pytest.mark.parametrize(
    ("basis", "message"),
    [
        (["cx", "foo"], "unknown gate"),
        (["cx", "cx"], "duplicate"),
        (["cx", "measure"], "added automatically"),
    ],
)
def test_custom_basis_errors_are_q103(basis: list[str], message: str) -> None:
    spec = TargetSpec.model_validate({**LINE3, "basis_gates": basis, "calibration": "none"})
    with pytest.raises(InvalidInput, match=message) as info:
        get_target(spec, num_qubits=3)
    assert info.value.code == "Q103"
