"""Schema pass (specs/05-pipeline.md §3): every pydantic error becomes an issue with a location.
Slice S5 maps error types to catalog codes as documented in `schemas/common.py`; the full issue
model, catalog and "did you mean" hints arrive with T02/T08."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import ValidationError

from qscore.errors import InvalidInput
from qscore.manifest.yamlio import PositionMap, load_yaml, single_issue_report
from qscore.schemas.common import Location
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.run import IssueModel, IssueReportModel

_PYDANTIC_CODES = {"missing": "Q104"}


def code_for(error_type: str) -> str:
    if error_type.startswith("Q") and error_type[1:].isdigit():
        return error_type
    if error_type in _PYDANTIC_CODES:
        return _PYDANTIC_CODES[error_type]
    if error_type.endswith("_type") or error_type in {"model_type", "dict_type", "list_type"}:
        return "Q102"
    return "Q103"


def issues_from(exc: ValidationError, positions: PositionMap) -> IssueReportModel:
    issues = []
    for e in exc.errors():
        loc = tuple(x for x in e["loc"] if not (isinstance(x, str) and "[" in x))
        if not loc and "qscore_field" in e.get("ctx", {}):
            loc = tuple(e["ctx"]["qscore_field"])  # a document-level validator's own location
        item = None
        if len(loc) >= 2 and loc[0] == "circuits" and isinstance(loc[1], int):
            node: Any = positions.root.get("circuits", []) if hasattr(positions.root, "get") else []
            item = (
                node[loc[1]].get("id")
                if loc[1] < len(node) and hasattr(node[loc[1]], "get")
                else None
            )
        code = code_for(e["type"])
        issues.append(
            IssueModel(
                code=code,
                severity="error",
                item=item,
                location=positions.locate(loc),
                message=e["msg"],
                hint=None,
                docs=f"docs/issues.md#{code.lower()}",
            )
        )
    return IssueReportModel.model_validate(
        {
            "schema": "qscore.issues/v0.2",
            "manifest": positions.file,
            "errors": len(issues),
            "warnings": 0,
            "issues": issues,
        }
    )


def load_manifest_with_positions(path: Path) -> tuple[ProjectManifest, PositionMap]:
    """Load and schema-check a manifest; all errors at once in `InvalidInput.report`. The
    position map lets later passes locate their issues in the same file."""
    if not path.is_file():
        issue = IssueModel(
            code="Q200",
            severity="error",
            location=Location(file=path.name),
            message=f"manifest not found: {path}",
            hint=(
                f"Draft one with `qscore discover {path.parent} --draft`, pass an existing "
                "qscore.yaml, or score a single QASM file instead."
            ),
            docs="docs/issues.md#q200",
        )
        report = single_issue_report(path.name, issue)
        raise InvalidInput(f"[Q200] manifest not found: {path}", report=report)
    data, positions = load_yaml(path)
    try:
        return ProjectManifest.model_validate(data), positions
    except ValidationError as exc:
        report = issues_from(exc, positions)
        raise InvalidInput(f"{path.name}: {report.errors} issue(s)", report=report) from exc


def load_manifest(path: Path) -> ProjectManifest:
    return load_manifest_with_positions(path)[0]


def report_of(manifest_file: str, issues: list[IssueModel]) -> IssueReportModel:
    errors = sum(1 for i in issues if i.severity == "error")
    return IssueReportModel.model_validate(
        {
            "schema": "qscore.issues/v0.2",
            "manifest": manifest_file,
            "errors": errors,
            "warnings": sum(1 for i in issues if i.severity == "warning"),
            "issues": issues,
        }
    )
