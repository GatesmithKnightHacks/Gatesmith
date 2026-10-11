"""Schema compatibility and hashing helpers (specs/04 §1, §12; specs/03 §5)."""

from __future__ import annotations

import pytest

from qscore.errors import InvalidInput
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.versions import SCHEMA_VERSIONS, SCORE_VERSION, check_compatible, migrate


def test_score_version() -> None:
    assert SCORE_VERSION == "qscore-2026.2"


def test_all_schema_ids_listed() -> None:
    # 04 §1: twelve ids plus `qscore.run` (ChP-0004/ChP-0028) and `qscore.values` (ChP-0029);
    # scorecard is v0.3 (ChP-0028), run is v0.3 (ChP-0034/ChP-0035), values is v0.1 (ChP-0029).
    assert len(SCHEMA_VERSIONS) == 14
    assert SCHEMA_VERSIONS["qscore.scorecard"] == "v0.3"
    assert SCHEMA_VERSIONS["qscore.run"] == "v0.3"
    assert SCHEMA_VERSIONS["qscore.values"] == "v0.1"
    others = {"qscore.scorecard", "qscore.run", "qscore.values"}
    assert {v for k, v in SCHEMA_VERSIONS.items() if k not in others} == {"v0.2"}


@pytest.mark.parametrize(
    "schema_id", ["qscore.scorecard/v0.3", "qscore.scorecard/v0.2", "qscore.scorecard/v0.1"]
)
def test_same_major_lower_or_equal_minor_accepted(schema_id: str) -> None:
    assert check_compatible({"schema": schema_id}) == schema_id


@pytest.mark.parametrize(
    "schema_id", ["qscore.scorecard/v0.4", "qscore.scorecard/v1.0", "qscore.nope/v0.2", None]
)
def test_incompatible_rejected_with_version(schema_id: object) -> None:
    with pytest.raises(InvalidInput):
        check_compatible({"schema": schema_id})


def test_migrate_identity_and_missing_step() -> None:
    doc = {"schema": "qscore.job/v0.2"}
    assert migrate(doc, "v0.2") is doc
    with pytest.raises(InvalidInput, match="no migration"):
        migrate({"schema": "qscore.job/v0.1"}, "v0.2")


def test_scorecard_v02_migrates_to_v03_unchanged() -> None:
    doc = {"schema": "qscore.scorecard/v0.2", "status": "complete"}
    assert migrate(doc, "v0.3") == {"schema": "qscore.scorecard/v0.3", "status": "complete"}


def test_run_v02_migrates_to_v03_with_empty_lists() -> None:
    # ChP-0034 §2.1 B: v0.2 → v0.3 adds empty `compiled`/`compiled_skipped`; ChP-0035 §2.1 D adds
    # `project_source` (null: no source was recorded for a v0.2 run).
    doc = {"schema": "qscore.run/v0.2", "status": "complete", "scorecards": []}
    assert migrate(doc, "v0.3") == {
        "schema": "qscore.run/v0.3",
        "status": "complete",
        "scorecards": [],
        "compiled": [],
        "compiled_skipped": [],
        "project_source": None,
    }
    assert check_compatible({"schema": "qscore.run/v0.2"}) == "qscore.run/v0.2"


def test_canonical_json_sorted_compact_unicode() -> None:
    assert canonical_json({"b": 1, "a": "é"}) == '{"a":"é","b":1}'


def test_sha256_hex_lowercase() -> None:
    assert sha256_hex("abc") == ("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
