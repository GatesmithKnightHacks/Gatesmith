"""Decoys: strings and comments that mention QuantumCircuit."""

from __future__ import annotations

TEMPLATE = "def build(n) -> QuantumCircuit:\n    return QuantumCircuit(n)\n"

# def build(n) -> QuantumCircuit:
#     return QuantumCircuit(n)


def describe() -> str:
    return "QuantumCircuit(3)"


def label(kind: str = "QuantumCircuit"):
    return kind
