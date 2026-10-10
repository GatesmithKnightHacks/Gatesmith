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
    """How long the compiled circuit takes to run, compared with how long the qubits keep their
    state.

    Critical-path duration of the compiled circuit from ALAP scheduling with the target's
    gate durations. Evidence: `ratio_to_median_t2` (duration / median T2 of the active
    physical qubits), `median_t2_s`. `unavailable` when the target has no durations or no T2
    data for the active qubits.

    Unit: s. Reference: Qiskit `ALAPScheduleAnalysis`.
    """

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
        props = target.qubit_properties
        active = c.active_qubits(circuit)
        t2 = {q: props[q].t2 for q in active} if props is not None else {}
        known = {q: v for q, v in t2.items() if v is not None}
        if not known:
            return unavailable("target has no T2 data for the active qubits")
        durations = target.durations()
        unit = "dt" if target.dt is not None else "s"
        for inst in circuit.data:
            if c.is_directive(inst):
                continue
            qs = tuple(circuit.find_bit(q).index for q in inst.qubits)
            props_op = target[inst.operation.name].get(qs)
            if props_op is None or props_op.duration is None:
                return unavailable(f"target has no duration for {inst.operation.name}{qs}")
        pm = PassManager([ALAPScheduleAnalysis(target=target)])
        pm.run(circuit)
        starts = pm.property_set["node_start_time"]
        end_dt = 0
        for node, start in starts.items():
            if getattr(node.op, "_directive", False):
                continue
            qargs = [circuit.find_bit(q).index for q in node.qargs]
            end_dt = max(end_dt, start + durations.get(node.op, qargs, unit=unit))
        duration_s = end_dt * target.dt if target.dt is not None else end_dt
        median_t2 = statistics.median(known.values())
        return computed(
            duration_s,
            "s",
            {
                "duration_dt": end_dt if target.dt is not None else None,
                "dt_s": target.dt,
                "median_t2_s": median_t2,
                "ratio_to_median_t2": duration_s / median_t2,
                "active_qubits": len(active),
                "qubits_without_t2": sorted(q for q, v in t2.items() if v is None),
                "method": "ALAPScheduleAnalysis(target) critical path",
            },
        )
