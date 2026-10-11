"""Run record `qscore.run/v0.3` (ChP-0034 §2.1 B, ChP-0035 §2.1 D)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from qscore.record.run_record import read_run_record, write_run_record
from qscore.schemas.run import RUN_SCHEMA, ProjectSource, ProjectSourceError, RunRecord
from qscore.schemas.versions import migrate

SHA = "0" * 64


def v02_record() -> dict[str, Any]:
    return {
        "schema": "qscore.run/v0.2",
        "run_id": "run-1",
        "job_id": None,
        "command": "score",
        "manifest_sha256": SHA,
        "items": ["ghz4"],
        "confirmation": {"mode": "yes_flag", "at": "2026-10-10T15:02:11Z", "manifest_sha256": SHA},
        "interpretation": "Interpretation: x",
        "settings_profile": "dev",
        "fallbacks_enabled": [],
        "fallbacks_used": [],
        "started_at": "2026-10-10T15:02:10Z",
        "finished_at": "2026-10-10T15:02:59Z",
        "status": "complete",
        "exit_code": None,
        "scorecards": [
            {"item_id": "ghz4", "item_sha256": SHA, "path": "scorecards/ghz4.json", "sha256": SHA}
        ],
        "provenance": {
            "qscore": "0.1.0",
            "score_version": "qscore-2026.1",
            "git_commit": None,
            "git_dirty": False,
            "lock_sha256": None,
            "python": "3.12.3",
            "qiskit": "2.5.2",
        },
    }


def v03_record(**update: Any) -> dict[str, Any]:
    doc = {
        **v02_record(),
        "schema": "qscore.run/v0.3",
        "compiled": [{"item_id": "ghz4", "path": "compiled/ghz4.qasm", "sha256": SHA, "seed": 37}],
        "compiled_skipped": [
            {"item_id": "other", "reason": "no representative compile (objective metric failed)"}
        ],
        "project_source": {
            "url": "https://github.com/org/repo",
            "commit": "a" * 40,
            "dirty": False,
        },
    }
    return {**doc, **update}


def test_run_schema_is_v03() -> None:
    assert RUN_SCHEMA == "qscore.run/v0.3"


def test_v03_record_validates_and_round_trips(tmp_path: Path) -> None:
    record = RunRecord.model_validate(v03_record())
    assert record.compiled[0].seed == 37 and record.compiled[0].path == "compiled/ghz4.qasm"
    assert record.compiled_skipped[0].item_id == "other"
    assert isinstance(record.project_source, ProjectSource)
    path = write_run_record(record, tmp_path)
    assert read_run_record(path) == record
    assert json.loads(path.read_text(encoding="utf-8"))["schema"] == "qscore.run/v0.3"


@pytest.mark.parametrize(
    ("source", "kind"),
    [
        ({"url": None, "commit": "b" * 40, "dirty": True}, ProjectSource),
        ({"error": "git not installed"}, ProjectSourceError),
        (None, type(None)),
    ],
)
def test_project_source_shapes(source: Any, kind: type) -> None:
    record = RunRecord.model_validate(v03_record(project_source=source))
    assert isinstance(record.project_source, kind)
    assert record.model_dump(mode="json")["project_source"] == source


@pytest.mark.parametrize(
    "source",
    [
        {"url": None, "commit": "b" * 40},  # dirty missing
        {"error": "x", "commit": "b" * 40},  # mixed shapes
        {},
    ],
)
def test_project_source_bad_shapes_rejected(source: Any) -> None:
    with pytest.raises(ValidationError):
        RunRecord.model_validate(v03_record(project_source=source))


@pytest.mark.parametrize("field", ["compiled", "compiled_skipped", "project_source"])
def test_new_fields_required(field: str) -> None:
    doc = v03_record()
    del doc[field]
    with pytest.raises(ValidationError):
        RunRecord.model_validate(doc)


def test_v02_record_rejected_as_is_and_migrates() -> None:
    with pytest.raises(ValidationError):
        RunRecord.model_validate(v02_record())
    record = RunRecord.model_validate(migrate(v02_record(), "v0.3"))
    assert record.compiled == [] and record.compiled_skipped == []
    assert record.project_source is None
