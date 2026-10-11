"""Decoys: functions that touch circuits but do not return one."""

from __future__ import annotations

from qiskit import QuantumCircuit


def make_all():
    return [QuantumCircuit(2), QuantumCircuit(3)]


def make_typed() -> list[QuantumCircuit]:
    return [QuantumCircuit(1)]


def width(qc: QuantumCircuit) -> int:
    return qc.num_qubits


def draw_only(n):
    qc = QuantumCircuit(n)
    print(qc)


def outer():
    def inner() -> QuantumCircuit:
        return QuantumCircuit(2)

    return inner
