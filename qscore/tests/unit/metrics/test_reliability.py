"""reliability_heuristic with faulty calibrated operations (specs/06-metrics.md §2.2, ChP-0041)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from qiskit import QuantumCircuit

from qscore.metrics.hardware.reliability import ReliabilityHeuristic, reliability_from_ops
from qscore.schemas.manifest import TargetSpec
from qscore.targets.registry import get_target


def _ctx(circuit: QuantumCircuit) -> Any:
    target = get_target(TargetSpec(backend="FakeTorino"))
    return SimpleNamespace(target=target, representative=SimpleNamespace(circuit=circuit))


def test_faulty_coupler_gives_zero_and_is_listed() -> None:
    target = get_target(TargetSpec(backend="FakeTorino")).target
    assert target["cz"][(15, 19)].error == 1.0  # FakeTorino snapshot: dead coupler
    qc = QuantumCircuit(133)
    qc.cz(15, 19)
    qc.cz(15, 19)
    qc.cz(0, 1)
    out = ReliabilityHeuristic().compute(_ctx(qc))
    assert out.value == 0.0
    ev = out.evidence
    assert ev["faulty_ops"] == [{"op": "cz", "qargs": [15, 19], "error": 1.0, "count": 2}]
    assert ev["total_neg_log"] is None
    assert set(ev["per_edge"]) == {"0-1"}  # the faulty edge is not a finite contribution


def test_no_faulty_ops_keeps_the_product() -> None:
    qc = QuantumCircuit(133)
    qc.cz(0, 1)
    out = ReliabilityHeuristic().compute(_ctx(qc))
    assert 0 < out.value < 1
    assert out.evidence["faulty_ops"] == []
    assert out.evidence["total_neg_log"] > 0


def test_ops_rule() -> None:
    assert reliability_from_ops([("cz", (0, 1), 1.0), ("sx", (0,), 0.01)]) == 0.0
    with pytest.raises(ValueError, match=r"error rate 1\.2 > 1 for cz on qubits \[0, 1\]"):
        reliability_from_ops([("cz", (0, 1), 1.2)])


def test_error_above_one_is_checked_after_a_faulty_op() -> None:
    with pytest.raises(ValueError, match=r"error rate 1\.2"):
        reliability_from_ops([("cz", (0, 1), 1.0), ("cz", (1, 2), 1.2)])


def test_compute_fails_on_error_above_one(monkeypatch: pytest.MonkeyPatch) -> None:
    ctx = _ctx(QuantumCircuit(133))
    ctx.representative.circuit.cz(0, 1)
    props = ctx.target.target["cz"][(0, 1)]
    monkeypatch.setattr(props, "error", 1.5)
    with pytest.raises(ValueError, match=r"error rate 1\.5 > 1 for cz"):
        ReliabilityHeuristic().compute(ctx)


def test_faulty_ops_sorted_by_qargs_then_op() -> None:
    qc = QuantumCircuit(133)
    qc.cz(19, 20)
    qc.cz(15, 19)
    ev = ReliabilityHeuristic().compute(_ctx(qc)).evidence
    assert [f["qargs"] for f in ev["faulty_ops"]] == [[15, 19], [19, 20]]
