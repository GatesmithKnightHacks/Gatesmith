"""Entanglement variance (specs/06-metrics.md §2.3; inspired by QASMBench, not identical)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from qiskit.circuit import QuantumCircuit

from qscore.compile import counts as c
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed
from qscore.schemas.common import MetricGroup, MetricKind


def per_qubit_two_qubit_counts(qc: QuantumCircuit) -> dict[int, int]:
    """Two-qubit operations touching each active logical qubit."""
    out = dict.fromkeys(c.active_qubits(qc), 0)
    for inst in qc.data:
        if inst.operation.num_qubits == 2 and not c.is_directive(inst):
            for q in inst.qubits:
                out[qc.find_bit(q).index] += 1
    return out


@dataclass(frozen=True)
class EntanglementVariance:
    """How unevenly the two-qubit gates are spread over the qubits.

    Population variance of `c_i`, the number of two-qubit operations touching logical qubit
    `i`, over the active logical qubits. Evidence: per-qubit counts, mean, `cv = std / mean`
    (0 when the mean is 0). Inspired by QASMBench's entanglement variance, but not identical
    to it.

    Unit: gates^2. Reference: Inspired by Li et al., "QASMBench", ACM TQC 2023
    (arXiv:2005.13018); not the same formula.
    """

    id: str = "entanglement_variance"
    group: MetricGroup = MetricGroup.OPPORTUNITIES
    version: str = "1"
    kind: MetricKind = MetricKind.DETERMINISTIC
    scope: Literal["logical", "compiled", "both"] = "logical"
    requires: frozenset[Requirement] = frozenset({Requirement.LOGICAL})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "trivial"

    def compute(self, ctx: ScoringContext) -> Outcome:
        counts = per_qubit_two_qubit_counts(ctx.logical)
        values = list(counts.values())
        if not values:
            return computed(0.0, "gates^2", {"per_qubit": {}, "mean": 0.0, "cv": 0.0})
        mean = sum(values) / len(values)
        var = sum((v - mean) ** 2 for v in values) / len(values)
        cv = 0.0 if mean == 0 else math.sqrt(var) / mean
        ev = {"per_qubit": {str(k): v for k, v in counts.items()}, "mean": mean, "cv": cv}
        return computed(var, "gates^2", ev)
