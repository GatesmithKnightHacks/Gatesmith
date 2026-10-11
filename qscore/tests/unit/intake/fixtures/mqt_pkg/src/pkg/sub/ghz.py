"""GHZ builder that only imports inside its package (relative import)."""

from __future__ import annotations

from qiskit import QuantumCircuit

from ._registry import register_benchmark


@register_benchmark("ghz")
def create_circuit(num_qubits: int) -> QuantumCircuit:
    qc = QuantumCircuit(num_qubits)
    qc.h(0)
    for i in range(1, num_qubits):
        qc.cx(i - 1, i)
    return qc
