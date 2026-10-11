"""Exact equivalence methods (specs/08 §3).

ChP-0049 (downscaled hf slice): only the region rung — a convex region of ≤ 12 qubits compared
with `Operator.equiv` (global phase ignored) or `Operator.__eq__` (`global_phase: exact`),
recorded as `method: "region_operator"` (08 §2 "Region requests"). The rest of the ladder is T23.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qiskit.circuit import QuantumCircuit
from qiskit.quantum_info import Operator

REGION_MAX_QUBITS = 12
NON_UNITARY = frozenset({"measure", "reset"})

VerifyStatus = Literal["passed", "failed", "inconclusive", "unsupported"]


@dataclass(frozen=True)
class RegionVerification:
    status: VerifyStatus
    method: str
    reason: str


def region_operator(
    original: QuantumCircuit,
    candidate: QuantumCircuit,
    global_phase: Literal["ignore", "exact"],
) -> RegionVerification:
    method = "region_operator"
    if original.num_qubits != candidate.num_qubits:
        return RegionVerification("failed", method, "qubit counts differ")
    if original.num_qubits > REGION_MAX_QUBITS:
        return RegionVerification("unsupported", method, f"> {REGION_MAX_QUBITS} qubits")
    for name, qc in (("original", original), ("candidate", candidate)):
        ops = {i.operation.name for i in qc.data}
        if ops & NON_UNITARY:
            # A model rewrite must not touch measurements or resets (permitted changes, 08 §2).
            status: VerifyStatus = "failed" if name == "candidate" else "unsupported"
            found = sorted(ops & NON_UNITARY)
            return RegionVerification(status, method, f"{name} contains {found}")
    a = Operator(original)
    b = Operator(candidate)
    # 08 §2 names `Operator.equal`; Qiskit spells exact equality `==` (allclose incl. phase).
    same = a == b if global_phase == "exact" else a.equiv(b)
    return RegionVerification("passed" if same else "failed", method, "operator comparison")
