"""`scalability` (specs/06-metrics.md §2.4; zero/degenerate cases per CP-0007 item 5).

For each `size_sweep` value the item is rebuilt (`ScoringContext.rebuild`, supplied by the builder
path through the sandbox, M3), compiled with the first 3 transpiler seeds, and the logical
(RAW_TRANSLATION) and compiled two-qubit counts and the routing overhead are recorded. A power
law `y = a·n^b` is fitted by least squares on `log y` vs `log n`, with `n` the built circuit's
qubit count. The compiled count of a size is the minimum two-qubit count over its 3 seeds.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from qscore.compile import counts as c
from qscore.compile import pipeline
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed, unavailable
from qscore.schemas.common import MetricGroup, MetricKind, Status

SWEEP_SEEDS = 3
MIN_FIT_SIZES = 3


def fit_power_law(points: list[tuple[int, int]]) -> dict[str, Any]:
    """OLS fit of log y on log n. Sizes with y = 0 are excluded (listed); fewer than 3 distinct n
    with positive y → `b` and `r2` are None (CP-0007). `r2` is 1.0 when every log y is equal
    (the zero-slope fit is exact)."""
    excluded = sorted({n for n, y in points if y <= 0})
    used = [(math.log(n), math.log(y)) for n, y in points if y > 0]
    if len({x for x, _ in used}) < MIN_FIT_SIZES:
        return {"b": None, "r2": None, "excluded_n": excluded}
    mx = sum(x for x, _ in used) / len(used)
    my = sum(y for _, y in used) / len(used)
    sxx = sum((x - mx) ** 2 for x, _ in used)
    b = sum((x - mx) * (y - my) for x, y in used) / sxx
    a = my - b * mx
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in used)
    ss_tot = sum((y - my) ** 2 for _, y in used)
    r2 = 1.0 if ss_tot == 0 else 1.0 - ss_res / ss_tot
    return {"b": b, "r2": r2, "excluded_n": excluded}


@dataclass(frozen=True)
class Scalability:
    id: str = "scalability"
    group: MetricGroup = MetricGroup.RESEARCH
    version: str = "1"
    kind: MetricKind = MetricKind.DETERMINISTIC
    scope: Literal["logical", "compiled", "both"] = "both"
    requires: frozenset[Requirement] = frozenset({Requirement.BUILDER})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "expensive"

    def compute(self, ctx: ScoringContext) -> Outcome:
        sweep = ctx.size_sweep
        if sweep is None:
            return unavailable("no size_sweep")
        if ctx.rebuild is None:
            return unavailable("item has no builder to rebuild at other sizes")
        seeds = ctx.seeds[:SWEEP_SEEDS]
        rows = []
        for v in sweep.values:
            qc = ctx.rebuild(v)
            logical = c.two_qubit_count(pipeline.raw_translation(qc, ctx.target))
            r = min(x.two_qubit_count for x in pipeline.compile_item(qc, ctx.target, seeds).results)
            a = min(
                x.two_qubit_count
                for x in pipeline.compile_all_to_all(qc, ctx.target, seeds).results
            )
            rows.append(
                {
                    sweep.arg: v,
                    "qubits": qc.num_qubits,
                    "logical_two_qubit": logical,
                    "compiled_two_qubit": r,
                    "routing_overhead": 0.0 if r == 0 else (r - a) / r,
                }
            )
        fl = fit_power_law([(row["qubits"], row["logical_two_qubit"]) for row in rows])
        fc = fit_power_law([(row["qubits"], row["compiled_two_qubit"]) for row in rows])
        evidence = {
            "per_size": rows,
            "seeds": seeds,
            "excluded_from_fit": {"logical": fl["excluded_n"], "compiled": fc["excluded_n"]},
        }
        if fl["b"] is None and fc["b"] is None:
            return Outcome(
                status=Status.UNAVAILABLE,
                reason="fewer than 3 sizes with two-qubit operations (CP-0007)",
                evidence=evidence,
            )
        value = {
            "b_logical": fl["b"],
            "b_compiled": fc["b"],
            "r2_logical": fl["r2"],
            "r2_compiled": fc["r2"],
        }
        return computed(value, "dict", evidence)
