"""Seed spread (specs/06-metrics.md §2.2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qscore.compile.select import spread
from qscore.errors import MetricError
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed
from qscore.schemas.common import MetricGroup, MetricKind


@dataclass(frozen=True)
class SeedSpreadMetric:
    """How much the result depends on the compiler's random seed.

    `(max - min) / median` of the two-qubit count across the transpiler seeds. Evidence:
    min, median, max and the per-seed table.

    Unit: ratio. Reference: qscore definition (06 §2.2).
    """

    id: str = "seed_spread"
    group: MetricGroup = MetricGroup.HARDWARE
    version: str = "1"
    kind: MetricKind = MetricKind.DETERMINISTIC
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = frozenset({Requirement.COMPILED})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "trivial"

    def compute(self, ctx: ScoringContext) -> Outcome:
        s = spread(ctx.compile_set)
        ev = {
            "min": s.minimum,
            "median": s.median,
            "max": s.maximum,
            "per_seed": {str(k): v for k, v in s.per_seed.items()},
        }
        if s.median == 0:
            if s.maximum == 0:
                return computed(0.0, "ratio", ev)
            # Spec defines no value for a zero median (ChP-0007 item 4); fail loudly.
            raise MetricError("seed_spread: median two-qubit count is 0 but not all seeds are 0")
        return computed((s.maximum - s.minimum) / s.median, "ratio", ev)
