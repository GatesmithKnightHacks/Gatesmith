"""The one real builder in the decoy repository."""

from __future__ import annotations

from qiskit import QuantumCircuit


def ghz(n: int) -> QuantumCircuit:
    qc = QuantumCircuit(n)
    qc.h(0)
    for i in range(n - 1):
        qc.cx(i, i + 1)
    return qc


if __name__ == "__main__":
    print(ghz(5))
