"""Scheduled duration (specs/06-metrics.md §2.2)."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Literal

from qiskit.transpiler import PassManager
from qiskit.transpiler.passes import ALAPScheduleAnalysis

from qscore.compile import counts as c
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed, unavailable
from qscore.schemas.common import MetricGroup, MetricKind


@dataclass(frozen=True)
class ScheduledDuration:
    """Critical-path duration of the compiled circuit from ALAP scheduling with the target's
    durations; evidence `ratio_to_median_t2` = duration / median T2 of the active qubits."""

    id: str = "scheduled_duration"
    group: MetricGroup = MetricGroup.HARDWARE
    version: str = "1"
    kind: MetricKind = MetricKind.HEURISTIC
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = frozenset({Requirement.COMPILED, Requirement.DURATIONS})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "cheap"

    def compute(self, ctx: ScoringContext) -> Outcome:
        bundle = ctx.target
        if not bundle.has_durations:
            return unavailable("target has no gate durations")
        target, circuit = bundle.target, ctx.representative.circuit
        if target.dt is None:
            return unavailable("target has no dt (time resolution)")
        props = target.qubit_properties
        active = c.active_qubits(circuit)
        t2 = {q: props[q].t2 for q in active} if props is not None else {}
        known = {q: v for q, v in t2.items() if v is not None}
        if not known:
            return unavailable("target has no T2 data for the active qubits")
        pm = PassManager([ALAPScheduleAnalysis(target=target)])
        pm.run(circuit)
        starts = pm.property_set["node_start_time"]
        durations = target.durations()
        end_dt = 0
        for node, start in starts.items():
            if getattr(node.op, "_directive", False):
                continue
            qargs = [circuit.find_bit(q).index for q in node.qargs]
            end_dt = max(end_dt, start + durations.get(node.op, qargs, unit="dt"))
        duration_s = end_dt * target.dt
        median_t2 = statistics.median(known.values())
        return computed(
            duration_s,
            "s",
            {
                "duration_dt": end_dt,
                "dt_s": target.dt,
                "median_t2_s": median_t2,
                "ratio_to_median_t2": duration_s / median_t2,
                "active_qubits": len(active),
                "qubits_without_t2": sorted(q for q, v in t2.items() if v is None),
                "method": "ALAPScheduleAnalysis(target) critical path",
            },
        )
