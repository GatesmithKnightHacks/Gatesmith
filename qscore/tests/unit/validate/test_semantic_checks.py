"""Semantic pass: intent vs circuit (specs/05-pipeline.md §4.3, 04-contracts.md §2.2)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from qiskit import QuantumCircuit, qasm2

from qscore.schemas.manifest import CircuitItem
from qscore.validate.semantic_checks import semantic_issues


def _item(invariants: dict[str, Any] | None = None, **extra: Any) -> CircuitItem:
    doc: dict[str, Any] = {"id": "c", "source": {"qasm": "c.qasm"}, **extra}
    if invariants is not None:
        doc["invariants"] = invariants
    return CircuitItem.model_validate(doc)


def _codes(item: CircuitItem, qc: QuantumCircuit, root: Path = Path(".")) -> list[str]:
    return [i.code for i in semantic_issues(item, qc, root, "qscore.yaml", 0)]


def _bell(measure: bool = True) -> QuantumCircuit:
    qc = QuantumCircuit(2, 2)
    qc.h(0)
    qc.cx(0, 1)
    if measure:
        qc.measure([0, 1], [0, 1])
    return qc


def test_clean_exact_unitary_circuit_has_no_issues() -> None:
    assert _codes(_item(), _bell()) == []


def test_q400_reversible_intent_with_a_non_reversible_gate() -> None:
    item = _item({"intent": "reversible_function"})
    assert _codes(item, _bell()) == ["Q400"]


def test_q400_not_raised_for_x_cx_ccx_swap_and_final_measure() -> None:
    qc = QuantumCircuit(3, 3)
    qc.x(0)
    qc.cx(0, 1)
    qc.ccx(0, 1, 2)
    qc.swap(1, 2)
    qc.barrier()
    qc.measure([0, 1, 2], [0, 1, 2])
    assert _codes(_item({"intent": "reversible_function"}), qc) == []


def test_q401_known_output_without_measurements() -> None:
    task = {"bitstring": "00", "min_probability": 0.4, "shots": 100}
    item = _item({"intent": "known_output", "task": task})
    assert _codes(item, _bell(measure=False)) == ["Q401"]
    assert _codes(item, _bell(measure=True)) == []


def test_q401_distribution_without_measurements() -> None:
    item = _item({"intent": "distribution", "task": {"tolerance": 0.05, "shots": 100}})
    assert _codes(item, _bell(measure=False)) == ["Q401"]


def test_q402_mid_circuit_measurement_under_exact_unitary() -> None:
    qc = QuantumCircuit(2, 2)
    qc.h(0)
    qc.measure(0, 0)
    qc.cx(0, 1)
    issues = semantic_issues(_item(), qc, Path("."), "qscore.yaml", 0)
    assert [i.code for i in issues] == ["Q402"]
    assert issues[0].item == "c"
    assert issues[0].location.field == "circuits[0].invariants.intent"


def test_q402_not_raised_for_terminal_measurements_and_barriers() -> None:
    qc = _bell(measure=False)
    qc.measure(0, 0)
    qc.barrier()
    qc.measure(1, 1)
    assert _codes(_item(), qc) == []


def test_q402_not_raised_for_structure_only_intent() -> None:
    qc = QuantumCircuit(2, 2)
    qc.measure(0, 0)
    qc.h(0)
    assert "Q402" not in _codes(_item({"intent": "structure_only"}), qc)


def test_q403_observable_width_differs_from_circuit(tmp_path: Path) -> None:
    obs = {
        "schema": "qscore.observable/v0.1",
        "num_qubits": 3,
        "terms": [{"pauli": "ZZI", "coeff": 1.0}],
    }
    (tmp_path / "h.json").write_text(json.dumps(obs))
    task = {"observable": "h.json", "tolerance": 0.02, "shots": 100}
    item = _item({"intent": "expectation", "task": task})
    assert _codes(item, _bell(measure=False), tmp_path) == ["Q403"]
    obs["num_qubits"] = 2
    (tmp_path / "h.json").write_text(json.dumps(obs))
    assert _codes(item, _bell(measure=False), tmp_path) == []


@pytest.mark.parametrize("text", ["not json", '{"terms": []}', '{"num_qubits": "two"}'])
def test_q205_unreadable_observable(tmp_path: Path, text: str) -> None:
    (tmp_path / "h.json").write_text(text)
    task = {"observable": "h.json", "tolerance": 0.02, "shots": 100}
    item = _item({"intent": "expectation", "task": task})
    assert _codes(item, _bell(measure=False), tmp_path) == ["Q205"]


def test_q406_classical_control() -> None:
    qc = qasm2.loads(
        'OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; creg c[1];'
        "h q[0]; measure q[0] -> c[0]; if (c==1) x q[1];"
    )
    assert "Q406" in _codes(_item({"intent": "structure_only"}), qc)


def test_q407_opaque_gate_without_definition() -> None:
    qc = qasm2.loads('OPENQASM 2.0; include "qelib1.inc"; opaque foo a; qreg q[1]; foo q[0];')
    assert _codes(_item(), qc) == ["Q407"]


def test_q407_not_raised_for_a_custom_gate_with_a_definition() -> None:
    qc = qasm2.loads('OPENQASM 2.0; include "qelib1.inc"; gate bar a { x a; } qreg q[1]; bar q[0];')
    assert _codes(_item(), qc) == []


def test_every_issue_is_reported_at_once() -> None:
    qc = qasm2.loads(
        'OPENQASM 2.0; include "qelib1.inc"; opaque foo a; qreg q[2]; creg c[1];'
        "foo q[0]; measure q[0] -> c[0]; h q[0];"
    )
    assert sorted(_codes(_item(), qc)) == ["Q402", "Q407"]
