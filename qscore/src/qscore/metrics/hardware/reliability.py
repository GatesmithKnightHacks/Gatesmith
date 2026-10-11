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


def _check(op: str, qargs: tuple[int, ...], e: float) -> None:
    if e > 1:
        raise ValueError(f"error rate {e} > 1 for {op} on qubits {list(qargs)}")


def reliability_from_ops(ops: Iterable[tuple[str, tuple[int, ...], float | None]]) -> float:
    """exp(Σ log(1 - e)) over ops with error data; `None` or 0 contributes nothing. An op with
    `e = 1` is faulty (the calibration marks it unusable) and makes the value exactly 0
    (ChP-0041); `e > 1` is not an error rate (ValueError)."""
    rated = [(op, qargs, e) for op, qargs, e in ops if e]
    for op, qargs, e in rated:
        _check(op, qargs, e)
    if any(e >= 1 for _, _, e in rated):
        return 0.0
    return math.exp(sum(math.log1p(-e) for _, _, e in rated))


@dataclass(frozen=True)
class ReliabilityHeuristic:
    """Rough calibration-based estimate of how error-prone the compiled circuit is; a heuristic,
    not a success probability.

    `exp(sum(log(1 - e_op)))` over the compiled circuit's gates and measurements that have
    error data (`target[op][qargs].error`; `None` or 0, e.g. virtual `rz`, contributes
    nothing). Evidence: per-qubit and per-edge contributions of `-log(1 - e)`, the five
    largest contributors, `ops_without_error`. Labelled everywhere "calibration-based
    reliability heuristic, not a success probability".

    An op with `e = 1` is faulty: the value is exactly 0, the op is listed in `faulty_ops`
    (`{op, qargs, error, count}`, sorted by qargs, then op) instead of the contributions, and
    `total_neg_log` is null; `e > 1` fails the metric (ChP-0041).

    Unit: probability-like, in [0, 1] (0 only with faulty ops). Reference: Expected-fidelity
    style of mapomatic (Nation & Treinish, PRX Quantum 4, 010327, 2023) and MQT Predictor.
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
        faulty: dict[tuple[str, tuple[int, ...]], tuple[float, int]] = {}
        for name, qargs, e in ops:
            if not e:
                continue
            _check(name, qargs, e)
            if e >= 1:  # faulty: -log(1 - e) is infinite; listed apart (ChP-0041)
                _, count = faulty.get((name, qargs), (e, 0))
                faulty[(name, qargs)] = (e, count + 1)
            else:
                contrib["-".join(map(str, sorted(qargs)))] += -math.log1p(-e)
        top = dict(sorted(contrib.items(), key=lambda kv: (-kv[1], kv[0]))[:5])
        per_qubit = {k: v for k, v in contrib.items() if "-" not in k}
        per_edge = {k: v for k, v in contrib.items() if "-" in k}
        ev = {
            "label": LABEL,
            "per_qubit": per_qubit,
            "per_edge": per_edge,
            "top_contributors": top,
            "total_neg_log": None if faulty else sum(contrib.values()),
            "ops_without_error": without,
            "faulty_ops": [
                {"op": name, "qargs": list(qargs), "error": e, "count": count}
                for (name, qargs), (e, count) in sorted(
                    faulty.items(), key=lambda kv: (kv[0][1], kv[0][0])
                )
            ],
        }
        return computed(reliability_from_ops(ops), "probability-like", ev)
