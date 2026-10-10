"""Routing metrics (specs/06-metrics.md §2.2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qscore.compile import counts as c
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed, unavailable
from qscore.schemas.common import MetricGroup, MetricKind


@dataclass(frozen=True)
class _Hw:
    id: str
    unit: str
    requires: frozenset[Requirement]
    scope: Literal["logical", "compiled", "both"] = "compiled"
    group: MetricGroup = MetricGroup.HARDWARE
    version: str = "1"
    kind: MetricKind = MetricKind.DETERMINISTIC
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "cheap"


def _pair_key(pair: tuple[int, int]) -> str:
    return f"{pair[0]}-{pair[1]}"


class RoutingOverhead(_Hw):
    """(R - A) / R: R = representative 2q count, A = min over all-to-all compiles."""

    def __init__(self) -> None:
        super().__init__(
            "routing_overhead",
            "ratio",
            frozenset({Requirement.COMPILED, Requirement.ALL_TO_ALL, Requirement.ROUTING_STAGE}),
        )

    def compute(self, ctx: ScoringContext) -> Outcome:
        r = ctx.representative.two_qubit_count
        a = min(x.two_qubit_count for x in ctx.all_to_all.results)
        routed = ctx.routing_stage
        top = sorted(routed.swaps_per_pair.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
        ev = {
            "routed_two_qubit": r,
            "all_to_all_two_qubit": a,
            "swaps_inserted": routed.swaps_inserted,
            "top_swap_pairs": {_pair_key(p): n for p, n in top},
        }
        return computed(0.0 if r == 0 else (r - a) / r, self.unit, ev)


class SwapsInserted(_Hw):
    """SWAPs in the route-only output for the representative seed."""

    def __init__(self) -> None:
        super().__init__("swaps_inserted", "gates", frozenset({Requirement.ROUTING_STAGE}))

    def compute(self, ctx: ScoringContext) -> Outcome:
        routed = ctx.routing_stage
        ev = {
            "seed": routed.seed,
            "per_pair": {_pair_key(p): n for p, n in routed.swaps_per_pair.items()},
        }
        return computed(routed.swaps_inserted, self.unit, ev)


class CompileRatio(_Hw):
    """R / L0 with L0 the two-qubit count of the raw translation."""

    def __init__(self) -> None:
        super().__init__(
            "compile_ratio", "ratio", frozenset({Requirement.COMPILED, Requirement.RAW_TRANSLATION})
        )

    def compute(self, ctx: ScoringContext) -> Outcome:
        l0 = c.two_qubit_count(ctx.raw_translation)
        if l0 == 0:
            return unavailable("no two-qubit operations")
        r = ctx.representative.two_qubit_count
        return computed(r / l0, self.unit, {"compiled_two_qubit": r, "raw_two_qubit": l0})
