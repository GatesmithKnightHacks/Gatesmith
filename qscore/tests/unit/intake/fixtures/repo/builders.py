"""Fixture for tests/unit/intake/test_discover.py: one builder per signal (specs/05 §1)."""

from __future__ import annotations

import qiskit
from qiskit import QuantumCircuit
from qiskit.circuit.library import QFT, efficient_su2

BELL = QuantumCircuit(2)


def annotated(n: int, depth: int = 3, label: str = "x") -> QuantumCircuit:
    qc = QuantumCircuit(n)
    for _ in range(depth):
        qc.h(0)
    return qc


def returned(num_qubits, theta: float = -0.5, flag: bool = True, *, seed=BELL):
    circuit = QuantumCircuit(num_qubits)
    circuit.rz(theta, 0)
    return circuit


def direct(size):
    return qiskit.QuantumCircuit(size)


def library(reps: int, *, scale: float = 1.0):
    return efficient_su2(4, reps=reps)


def qft_builder(n_qubits):
    circ = QFT(n_qubits)
    return circ


def helper(x: int) -> int:
    return x * 2


MODULE_CALL = annotated(2, label="mod")

if __name__ == "__main__":
    annotated(5, depth=4)
    returned(-3, theta=-1.5, flag=False)
    library(reps=helper(2))
    direct(size=7)
