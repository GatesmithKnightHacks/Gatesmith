"""JSON Schema export (specs/04-contracts.md §12; drift-checked by tests/contract)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from qscore.schemas.improvement import ImprovementRequest, Proposal
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.records import AttemptRecord, JobSpec
from qscore.schemas.run import (
    BenchResult,
    Event,
    HardwareProfile,
    IssueReportModel,
    Plan,
    RunRecord,
)
from qscore.schemas.scorecard import Scorecard

# Schema id → model. `qscore.conformance/v0.2` is exported once ChP-0004 defines it.
EXPORTED: dict[str, type[BaseModel]] = {
    "qscore.project/v0.2": ProjectManifest,
    "qscore.scorecard/v0.3": Scorecard,
    "qscore.request/v0.2": ImprovementRequest,
    "qscore.proposal/v0.2": Proposal,
    "qscore.attempt/v0.2": AttemptRecord,
    "qscore.job/v0.2": JobSpec,
    "qscore.event/v0.2": Event,
    "qscore.plan/v0.2": Plan,
    "qscore.issues/v0.2": IssueReportModel,
    "qscore.profile/v0.2": HardwareProfile,
    "qscore.bench/v0.2": BenchResult,
    "qscore.run/v0.2": RunRecord,
}


def file_name(schema_id: str) -> str:
    """`qscore.project/v0.2` → `qscore.project_v0.2.json`."""
    return schema_id.replace("/", "_") + ".json"


def render(schema_id: str) -> str:
    """The exported JSON Schema text for one schema id (stable formatting)."""
    schema: dict[str, Any] = EXPORTED[schema_id].model_json_schema(by_alias=True, mode="validation")
    schema["$id"] = schema_id
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def export_json_schemas(out_dir: Path) -> list[Path]:
    """Write every exported schema to `out_dir`; returns the written paths (sorted)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for schema_id in sorted(EXPORTED):
        path = out_dir / file_name(schema_id)
        path.write_text(render(schema_id), encoding="utf-8")
        paths.append(path)
    return paths
