"""Committed JSON Schemas match the Pydantic models (specs/04-contracts.md §12)."""

from __future__ import annotations

from pathlib import Path

import pytest

from qscore.schemas.export import EXPORTED, file_name, render

SCHEMAS_DIR = Path(__file__).resolve().parents[2] / "schemas"


@pytest.mark.parametrize("schema_id", sorted(EXPORTED))
def test_exported_schema_matches_model(schema_id: str) -> None:
    path = SCHEMAS_DIR / file_name(schema_id)
    assert path.exists(), f"{path} missing: run qscore.schemas.export.export_json_schemas"
    assert path.read_text(encoding="utf-8") == render(schema_id), (
        f"{path.name} drifted from the model; re-export and review the diff"
    )


def test_no_stale_schema_files() -> None:
    expected = {file_name(s) for s in EXPORTED}
    assert {p.name for p in SCHEMAS_DIR.glob("*.json")} == expected


def test_x_keys_allowed_in_exported_schema() -> None:
    schema = render("qscore.project/v0.2")
    assert '"^x-"' in schema and '"additionalProperties": false' in schema
