"""Connected commuting DAG runs (specs/06-metrics.md §2.3)."""

from __future__ import annotations

from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator

from qscore.metrics.opportunities.structure import commuting_runs


def test_terminated_leaf_does_not_close_a_connected_commuting_run() -> None:
    qc = QuantumCircuit(7)
    qc.cz(0, 1)
    qc.cz(1, 2)
    qc.h(0)
    for q in range(2, 6):
        qc.cz(q, q + 1)

    # h(0) has no dependency on these later gates. Moving it to the end must not
    # change the detected six-gate opportunity.
    reordered = QuantumCircuit(7)
    for q in range(6):
        reordered.cz(q, q + 1)
    reordered.h(0)
    assert Operator(qc).equiv(Operator(reordered))
    assert commuting_runs(qc) == [
        {
            "qubits": list(range(7)),
            "layers": [0, 5],
            "gate_indices": [0, 1, 3, 4, 5, 6],
            "num_ops": 6,
        }
    ]
    assert [run["num_ops"] for run in commuting_runs(reordered)] == [6]


def test_diagonal_single_qubit_gates_are_transparent_and_not_counted() -> None:
    qc = QuantumCircuit(3)
    qc.cp(0.2, 0, 1)
    qc.rz(0.1, 1)
    qc.z(0)
    qc.crz(0.3, 1, 2)
    qc.s(2)
    qc.rzz(0.4, 0, 2)
    assert commuting_runs(qc) == [
        {
            "qubits": [0, 1, 2],
            "layers": [0, 4],
            "gate_indices": [0, 3, 5],
            "num_ops": 3,
        }
    ]


def test_directives_do_not_join_disconnected_commuting_runs() -> None:
    qc = QuantumCircuit(4)
    qc.cz(0, 1)
    qc.barrier()
    qc.cz(2, 3)
    assert [run["gate_indices"] for run in commuting_runs(qc)] == [[0], [2]]


def test_only_single_qubit_diagonal_gates_have_no_two_qubit_runs() -> None:
    qc = QuantumCircuit(2)
    qc.rz(0.2, 0)
    qc.z(1)
    assert commuting_runs(qc) == []
