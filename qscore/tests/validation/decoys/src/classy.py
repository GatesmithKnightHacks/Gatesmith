"""Decoy: a circuit built in a class method is not a top-level builder."""

from __future__ import annotations

from qiskit import QuantumCircuit


class Factory:
    def build(self, n: int) -> QuantumCircuit:
        return QuantumCircuit(n)

    @staticmethod
    def make(n):
        qc = QuantumCircuit(n)
        return qc
