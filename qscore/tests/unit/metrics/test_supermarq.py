"""supermarq_profile (specs/06-metrics.md §2.3): hand-derived feature values."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from qiskit import QuantumCircuit

from qscore.metrics.opportunities import supermarq as smq


@dataclass
class Ctx:
    logical: QuantumCircuit


def ghz5() -> QuantumCircuit:
    qc = QuantumCircuit(5)
    qc.h(0)
    for i in range(4):
        qc.cx(i, i + 1)
    return qc


def test_ghz5_profile_by_hand() -> None:
    # 4 distinct edges -> degree sum 8 / (5*4); every cx on the critical path; 4 of 5 gates are
    # 2q; 5 gates / depth 5 -> parallelism 0; activity 1+2+2+2+2 = 9 of 5x5; no resets.
    out = smq.SupermarqProfile().compute(Ctx(ghz5()))  # type: ignore[arg-type]
    assert out.status == "computed"
    assert out.value == pytest.approx(
        {
            "program_communication": 0.4,
            "critical_depth": 1.0,
            "entanglement_ratio": 0.8,
            "parallelism": 0.0,
            "liveness": 0.36,
            "measurement": 0.0,
        },
        abs=1e-15,
    )


def test_barrier_changes_nothing_and_input_is_not_mutated() -> None:
    qc = ghz5()
    qc.barrier()
    qc.measure_all()
    before = qc.copy()
    smq.measurement(qc)
    assert qc == before
    plain = ghz5()
    plain.measure_all(add_bits=True)
    for f in (smq.communication, smq.entanglement_ratio, smq.critical_depth, smq.parallelism):
        assert f(qc) == f(plain)


def test_measurement_counts_reset_layers() -> None:
    qc = QuantumCircuit(2)
    qc.h(0)
    qc.reset(0)
    qc.cx(0, 1)
    assert smq.measurement(qc) == pytest.approx(1 / 3)


def test_undefined_features_are_zero_and_listed() -> None:
    # ChP-0026: where SupermarQ's formula divides by zero, the feature is 0.0 and recorded.
    one = QuantumCircuit(1)
    one.h(0)
    out = smq.SupermarqProfile().compute(Ctx(one))  # type: ignore[arg-type]
    assert out.status == "computed"
    assert out.value["program_communication"] == 0.0
    assert out.evidence["undefined_as_zero"] == ["program_communication"]
    empty = smq.SupermarqProfile().compute(Ctx(QuantumCircuit(2)))  # type: ignore[arg-type]
    assert empty.evidence["undefined_as_zero"] == [
        "entanglement_ratio",
        "liveness",
        "measurement",
    ]
    assert set(empty.value.values()) == {0.0}


def test_defined_profile_lists_nothing_undefined() -> None:
    out = smq.SupermarqProfile().compute(Ctx(ghz5()))  # type: ignore[arg-type]
    assert out.evidence["undefined_as_zero"] == []
