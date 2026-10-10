"""Calibration-based reliability heuristic (specs/06-metrics.md §2.2)."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from qscore.compile import counts as c
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed, unavailable
from qscore.schemas.common import MetricGroup, MetricKind

LABEL = "calibration-based reliability heuristic, not a success probability"


def reliability_from_ops(ops: Iterable[tuple[str, tuple[int, ...], float | None]]) -> float:
    """exp(Σ log(1 - e)) over ops with error data; `None` or 0 contributes nothing."""
    return math.exp(sum(math.log1p(-e) for _, _, e in ops if e))


@dataclass(frozen=True)
class ReliabilityHeuristic:
    """Rough calibration-based estimate of how error-prone the compiled circuit is; a heuristic,
    not a success probability.

    `exp(sum(log(1 - e_op)))` over the compiled circuit's gates and measurements that have
    error data (`target[op][qargs].error`; `None` or 0, e.g. virtual `rz`, contributes
    nothing). Evidence: per-qubit and per-edge contributions of `-log(1 - e)`, the five
    largest contributors, `ops_without_error`. Labelled everywhere "calibration-based
    reliability heuristic, not a success probability".

    Unit: probability-like, in (0, 1]. Reference: Expected-fidelity style of mapomatic
    (Nation & Treinish, PRX Quantum 4, 010327, 2023) and MQT Predictor.
    """

    id: str = "reliability_heuristic"
    group: MetricGroup = MetricGroup.HARDWARE
    version: str = "1"
    kind: MetricKind = MetricKind.HEURISTIC
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = frozenset({Requirement.COMPILED, Requirement.CALIBRATION})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "cheap"

    def compute(self, ctx: ScoringContext) -> Outcome:
        if not ctx.target.has_calibration:
            return unavailable("target has no calibration")
        target, circuit = ctx.target.target, ctx.representative.circuit
        ops: list[tuple[str, tuple[int, ...], float | None]] = []
        without = 0
        for inst in circuit.data:
            if c.is_directive(inst) or inst.operation.name == "delay":
                continue
            qargs = tuple(circuit.find_bit(q).index for q in inst.qubits)
            props = (
                (target[inst.operation.name] or {}).get(qargs)
                if inst.operation.name in target
                else None
            )
            err = None if props is None else props.error
            if err is None:
                without += 1
            ops.append((inst.operation.name, qargs, err))
        contrib: dict[str, float] = defaultdict(float)
        for _, qargs, e in ops:
            if e:
                contrib["-".join(map(str, sorted(qargs)))] += -math.log1p(-e)
        top = dict(sorted(contrib.items(), key=lambda kv: (-kv[1], kv[0]))[:5])
        per_qubit = {k: v for k, v in contrib.items() if "-" not in k}
        per_edge = {k: v for k, v in contrib.items() if "-" in k}
        ev = {
            "label": LABEL,
            "per_qubit": per_qubit,
            "per_edge": per_edge,
            "top_contributors": top,
            "total_neg_log": sum(contrib.values()),
            "ops_without_error": without,
        }
        return computed(reliability_from_ops(ops), "probability-like", ev)
