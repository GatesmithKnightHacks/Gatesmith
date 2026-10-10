"""Simulation metrics in the MVP build (specs/06-metrics.md §2.4, CP-0023, CP-0026).

`sim/` is final product (T19/T20). Until then both metrics are listed in every scorecard with an
explicit status and reason instead of being absent; they never compute a value here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qscore.metrics.base import Outcome, Requirement, ScoringContext, skipped, unavailable
from qscore.schemas.common import MetricGroup, MetricKind

NOT_BUILT = "simulation is not in the MVP build (CP-0023)"
_REQUIRES = frozenset({Requirement.COMPILED, Requirement.SIMULATION})


@dataclass(frozen=True)
class SimulatedTaskScore:
    id: str = "simulated_task_score"
    group: MetricGroup = MetricGroup.RESEARCH
    version: str = "1"
    kind: MetricKind = MetricKind.STATISTICAL
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = _REQUIRES | {Requirement.TASK}
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "expensive"

    def compute(self, ctx: ScoringContext) -> Outcome:
        return unavailable(NOT_BUILT if ctx.has_task else "intent has no task")


@dataclass(frozen=True)
class MirrorScore:
    id: str = "mirror_score"
    group: MetricGroup = MetricGroup.RESEARCH
    version: str = "1"
    kind: MetricKind = MetricKind.STATISTICAL
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = _REQUIRES
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "expensive"

    def compute(self, ctx: ScoringContext) -> Outcome:
        # Selected by default only for items whose intent has no task (06 §2.4).
        return skipped("not selected") if ctx.has_task else unavailable(NOT_BUILT)
