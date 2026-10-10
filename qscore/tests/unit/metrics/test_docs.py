"""`docs/metrics.md` covers every registered metric and is up to date (specs/06-metrics.md §5)."""

from __future__ import annotations

from pathlib import Path

import pytest

from qscore.metrics import docs
from qscore.metrics.registry import all_metrics

DOC = Path(__file__).parents[3] / "docs" / "metrics.md"


@pytest.mark.parametrize("metric_id", list(all_metrics()))
def test_every_metric_has_a_complete_entry(metric_id: str) -> None:
    d = docs.parse(all_metrics()[metric_id])
    assert d.tooltip and d.definition and d.unit and d.reference
    assert f"### `{metric_id}`" in DOC.read_text(encoding="utf-8")


def test_committed_doc_matches_the_docstrings() -> None:
    assert DOC.read_text(encoding="utf-8") == docs.render(), (
        "regenerate: uv run python -m qscore.metrics.docs > docs/metrics.md"
    )
