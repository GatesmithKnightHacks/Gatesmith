"""Schema compatibility and hashing helpers (specs/04 §1, §12; specs/03 §5)."""

from __future__ import annotations

import pytest

from qscore.errors import InvalidInput
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.versions import SCHEMA_VERSIONS, SCORE_VERSION, check_compatible, migrate


def test_score_version() -> None:
    assert SCORE_VERSION == "qscore-2026.1"


def test_all_twelve_schema_ids_listed() -> None:
    assert len(SCHEMA_VERSIONS) == 12 and set(SCHEMA_VERSIONS.values()) == {"v0.2"}


@pytest.mark.parametrize("schema_id", ["qscore.scorecard/v0.2", "qscore.scorecard/v0.1"])
def test_same_major_lower_or_equal_minor_accepted(schema_id: str) -> None:
    assert check_compatible({"schema": schema_id}) == schema_id


@pytest.mark.parametrize(
    "schema_id", ["qscore.scorecard/v0.3", "qscore.scorecard/v1.0", "qscore.nope/v0.2", None]
)
def test_incompatible_rejected_with_version(schema_id: object) -> None:
    with pytest.raises(InvalidInput):
        check_compatible({"schema": schema_id})


def test_migrate_identity_and_missing_step() -> None:
    doc = {"schema": "qscore.job/v0.2"}
    assert migrate(doc, "v0.2") is doc
    with pytest.raises(InvalidInput, match="no migration"):
        migrate({"schema": "qscore.job/v0.1"}, "v0.2")


def test_canonical_json_sorted_compact_unicode() -> None:
    assert canonical_json({"b": 1, "a": "é"}) == '{"a":"é","b":1}'


def test_sha256_hex_lowercase() -> None:
    assert sha256_hex("abc") == ("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
