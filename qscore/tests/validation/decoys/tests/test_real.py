"""Decoy test file: even builder-shaped helpers are only call-site sources."""

from qiskit import QuantumCircuit
from real import ghz


def test_ghz_width() -> None:
    assert ghz(3).num_qubits == 3
    assert ghz(n=4).num_qubits == 4


def test_local_circuit() -> None:
    qc = QuantumCircuit(2)
    assert qc.num_qubits == 2


def helper_builder(n: int) -> QuantumCircuit:
    return QuantumCircuit(n)
