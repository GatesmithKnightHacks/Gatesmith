"""ChP-0045: zero baselines have multiplicative bounds, never epsilon ratios."""

import pytest

from qscore.errors import VerificationError
from qscore.improve.loop import check_relative_constraint
from qscore.schemas.scorecard import MetricResult


def metric(value):
    return MetricResult(
        id="reliability_heuristic", group="hardware", status="computed", value=value
    )


@pytest.mark.parametrize(
    ("before", "after", "factor", "direction", "ok"),
    [
        (0, 0, 1, "min_vs_baseline", True),
        (0, 0.1, 1, "min_vs_baseline", True),
        (0, 0, 1, "max_vs_baseline", True),
        (0, 1e-30, 1, "max_vs_baseline", False),
        (0.5, 0.4, 0.8, "min_vs_baseline", True),
        (0.5, 0.39, 0.8, "min_vs_baseline", False),
        (0.5, 0.4, 0.8, "max_vs_baseline", True),
        (0.5, 0.41, 0.8, "max_vs_baseline", False),
        (0.5, 0, 0, "max_vs_baseline", True),
    ],
)
def test_multiplicative_bounds(before, after, factor, direction, ok):
    check = check_relative_constraint(metric(before), metric(after), factor, direction)
    assert check.ok is ok
    assert check.before == before and check.after == after
    assert check.model_dump()["x-relative"] == {
        "factor": factor,
        "bound": before * factor,
        "operator": direction,
    }
    assert "accepted" not in check.model_dump()


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), {"bad": 1}])
@pytest.mark.parametrize("side", ["baseline", "candidate"])
def test_invalid_metric_never_passes(value, side):
    before, after = (metric(value), metric(0)) if side == "baseline" else (metric(0), metric(value))
    with pytest.raises(VerificationError):
        check_relative_constraint(before, after, 1, "min_vs_baseline")


@pytest.mark.parametrize("factor", [-1, float("nan"), float("inf"), True])
def test_invalid_factor(factor):
    with pytest.raises(VerificationError):
        check_relative_constraint(metric(0), metric(0), factor, "min_vs_baseline")


@pytest.mark.parametrize("status", ["unavailable", "skipped", "failed"])
@pytest.mark.parametrize("side", ["baseline", "candidate"])
def test_noncomputed_never_passes(status, side):
    missing = MetricResult(
        id="reliability_heuristic",
        group="hardware",
        status=status,
        reason="not available",
        error={"type": "test", "message": "failed"},
    )
    before, after = (missing, metric(0)) if side == "baseline" else (metric(0), missing)
    with pytest.raises(VerificationError, match="not computed"):
        check_relative_constraint(before, after, 1, "min_vs_baseline")


def test_metric_mismatch_and_overflow():
    other = metric(0).model_copy(update={"id": "depth"})
    with pytest.raises(VerificationError, match="same metric"):
        check_relative_constraint(other, metric(0), 1, "min_vs_baseline")
    with pytest.raises(VerificationError, match="bound is not finite"):
        check_relative_constraint(metric(1e308), metric(0), 1e308, "max_vs_baseline")
