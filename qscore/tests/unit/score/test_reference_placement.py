"""Descriptive placement, ties, coverage and the engine's failure contract."""

from __future__ import annotations

from pathlib import Path

import pytest
from tests.unit.record.test_reference import _card

from qscore import services
from qscore.errors import RecordError
from qscore.record.reference import summarize
from qscore.record.report import render
from qscore.schemas.reference import ReferenceCorpus
from qscore.score.reference import place


def corpus(n: int = 5) -> ReferenceCorpus:
    return ReferenceCorpus.model_validate(
        {
            "schema": "qscore.reference/v0.1",
            "score_version": "qscore-2026.2",
            "created_at": "2026-10-11T00:00:00Z",
            "sources": [],
            "failures": [],
            "provenance": {},
            "targets": summarize([_card(f"ref_{i}", value=i * 10) for i in range(n)]),
        }
    )


@pytest.mark.parametrize(("value", "percentile"), [(-1, 0), (0, 10), (20, 50), (25, 60), (41, 100)])
def test_empirical_rank_and_ties(value: float, percentile: float) -> None:
    result = place(_card("query", value=value), corpus())
    assert result["depth"] == {"band": "2\u20135", "n": 5, "percentile": percentile, "median": 20}
    assert result["width"]["percentile"] == 50  # all five reference widths tie


def test_small_and_empty_bands_do_not_invent_percentiles() -> None:
    for card, n in [(_card("query"), 4), (_card("query", width=12), 0)]:
        entry = place(card, corpus(4))["depth"]
        assert entry["n"] == n
        assert entry["reason"] == "too few reference circuits"
        assert "percentile" not in entry and "median" not in entry


def test_target_and_version_must_match() -> None:
    assert place(_card("query", target="line-4"), corpus()) == {}
    with pytest.raises(RecordError, match="score versions differ"):
        place(_card("query"), corpus().model_copy(update={"score_version": "other"}))


def test_explicit_width_supports_resource_exclusion() -> None:
    card = _card("query")
    card.metrics = [m for m in card.metrics if m.id != "width"]
    assert place(card, corpus(), width=4)["depth"]["n"] == 5
    assert place(card, corpus()) == {}


def test_report_missing_corpus_and_descriptive_wording() -> None:
    card = _card("query", value=25)
    assert "no reference corpus for qscore-2026.2" in render([card])
    card = card.model_copy(
        update={
            "x-reference": {
                "corpus": {"score_version": "qscore-2026.2", "sha256": "digest"},
                "placement": place(card, corpus()),
            }
        }
    )
    report = render([card])
    assert "25 · 60th percentile of 5 reference circuits (2\u20135 qubits, FakeTorino)" in report
    assert "Compared with public benchmark circuits of similar width" in report
    assert "Different algorithms are not directly comparable" in report
    assert "better than" not in report and "worse than" not in report


def test_reference_error_marks_card_partial_and_is_visible(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from qscore.score import engine

    monkeypatch.setattr(
        engine,
        "benchpress_block",
        lambda *args: {"error": {"type": "CompileError", "message": "reference compile failed"}},
    )
    path = tmp_path / "bell.qasm"
    path.write_text('OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; h q[0]; cx q[0],q[1];')
    result = services.score_circuit(path, tmp_path / "out", confirm="yes")
    assert result.scorecards[0].status == "partial"
    assert "Benchpress convention FAILED" in result.report_path.read_text()
    assert '"status": "partial"' in result.run_record_path.read_text()


def test_reference_failure_cannot_be_labelled_complete() -> None:
    from pydantic import ValidationError

    from qscore.schemas.scorecard import Scorecard

    data = _card("query").model_dump(mode="json")
    data["x-reference"] = {"benchpress": {"error": {"type": "CompileError", "message": "failed"}}}
    with pytest.raises(ValidationError, match="complete cannot contain"):
        Scorecard.model_validate(data)
    data["status"] = "partial"
    assert Scorecard.model_validate(data).status == "partial"
    data["x-reference"]["benchpress"]["error"] = {}
    with pytest.raises(ValidationError):
        Scorecard.model_validate(data)
