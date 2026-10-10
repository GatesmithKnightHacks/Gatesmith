"""Simulation metrics in the MVP build: listed with a status and reason (CP-0023, CP-0026)."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from qscore.metrics.research.simulated import NOT_BUILT, MirrorScore, SimulatedTaskScore


@dataclass
class Ctx:
    has_task: bool


@pytest.mark.parametrize(
    ("has_task", "task_score", "mirror"),
    [
        (True, ("unavailable", NOT_BUILT), ("skipped", "not selected")),
        (False, ("unavailable", "intent has no task"), ("unavailable", NOT_BUILT)),
    ],
)
def test_mvp_build_statuses(
    has_task: bool, task_score: tuple[str, str], mirror: tuple[str, str]
) -> None:
    t = SimulatedTaskScore().compute(Ctx(has_task))  # type: ignore[arg-type]
    m = MirrorScore().compute(Ctx(has_task))  # type: ignore[arg-type]
    assert (t.status, t.reason) == task_score and t.value is None
    assert (m.status, m.reason) == mirror and m.value is None
