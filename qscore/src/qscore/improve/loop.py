"""Pure acceptance comparisons (03 §3; approved ChP-0045, 08 §4).

This helper checks one constraint. It never establishes exact equivalence, strict primary
improvement, or acceptance of an attempt; those remain separate mandatory checks in T24.
"""

from __future__ import annotations

import math
from typing import Literal

from qscore.errors import VerificationError
from qscore.schemas.common import MetricKind, Status
from qscore.schemas.records import ConstraintCheck
from qscore.schemas.scorecard import MetricResult


def check_relative_constraint(
    baseline: MetricResult,
    candidate: MetricResult,
    factor: float,
    direction: Literal["min_vs_baseline", "max_vs_baseline"],
) -> ConstraintCheck:
    """Check C >= f*B or C <= f*B with finite, nonnegative evidence, including B=0."""
    if baseline.id != candidate.id:
        raise VerificationError("relative constraint requires the same metric on both sides")
    if direction not in ("min_vs_baseline", "max_vs_baseline"):
        raise VerificationError(f"unsupported relative constraint {direction!r}")
    values = []
    for name, metric in (("baseline", baseline), ("candidate", candidate)):
        if metric.kind is MetricKind.STATISTICAL:
            # 08 §4: statistical metrics compare by intervals, not point values.
            raise VerificationError(f"{name} metric {metric.id} is statistical (interval rule)")
        if metric.status != Status.COMPUTED:
            raise VerificationError(f"{name} metric {metric.id} is {metric.status}, not computed")
        value = metric.value
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise VerificationError(f"{name} metric {metric.id} needs a scalar value")
        if not math.isfinite(value) or value < 0:
            raise VerificationError(f"{name} metric {metric.id} must be finite and nonnegative")
        values.append(float(value))
    if (
        isinstance(factor, bool)
        or not isinstance(factor, (int, float))
        or not math.isfinite(factor)
        or factor < 0
    ):
        raise VerificationError("relative constraint factor must be finite and nonnegative")
    before, after = values
    bound = factor * before
    if not math.isfinite(bound):
        raise VerificationError("relative constraint bound is not finite")
    return ConstraintCheck.model_validate(
        {
            "metric": baseline.id,
            "before": before,
            "after": after,
            "ok": after >= bound if direction == "min_vs_baseline" else after <= bound,
            "x-relative": {"factor": factor, "bound": bound, "operator": direction},
        }
    )
