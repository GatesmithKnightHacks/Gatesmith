"""Circuit counting helpers shared by compile and metrics (specs/06-metrics.md §2.1).

Directives (barriers) are excluded everywhere.
"""

from __future__ import annotations

from qiskit.circuit import CircuitInstruction, QuantumCircuit


def is_directive(inst: CircuitInstruction) -> bool:
    return bool(getattr(inst.operation, "_directive", False))


def active_qubits(qc: QuantumCircuit) -> list[int]:
    """Indices of qubits touched by at least one non-directive operation (sorted)."""
    return sorted(
        {qc.find_bit(q).index for inst in qc.data if not is_directive(inst) for q in inst.qubits}
    )


def size(qc: QuantumCircuit) -> int:
    return sum(1 for inst in qc.data if not is_directive(inst))


def two_qubit_count(qc: QuantumCircuit) -> int:
    return sum(1 for i in qc.data if i.operation.num_qubits == 2 and not is_directive(i))


def multi_qubit_count(qc: QuantumCircuit) -> int:
    return sum(1 for i in qc.data if i.operation.num_qubits >= 3 and not is_directive(i))


def two_qubit_depth(qc: QuantumCircuit) -> int:
    return int(
        qc.depth(filter_function=lambda i: i.operation.num_qubits == 2 and not is_directive(i))
    )


def depth(qc: QuantumCircuit) -> int:
    return int(qc.depth(filter_function=lambda i: not is_directive(i)))


def measurement_count(qc: QuantumCircuit) -> int:
    return sum(1 for i in qc.data if i.operation.name == "measure")


def toffoli_count(qc: QuantumCircuit) -> int:
    """`ccx`, plus `mcx` with exactly two controls."""
    return sum(
        1
        for i in qc.data
        if i.operation.name == "ccx"
        or (i.operation.name == "mcx" and getattr(i.operation, "num_ctrl_qubits", 0) == 2)
    )
