"""Manifest YAML I/O with source positions (specs/03-code-structure.md §3.3; slice S5)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.error import YAMLError

from qscore.errors import InvalidInput
from qscore.schemas.common import Location
from qscore.schemas.run import IssueModel, IssueReportModel


class PositionMap:
    """Maps a pydantic error location (field path) to `file:line:column`."""

    def __init__(self, file: str, root: Any) -> None:
        self.file, self.root = file, root

    def locate(self, loc: tuple[int | str, ...]) -> Location:
        node, line, col = self.root, None, None
        path = ""
        for key in loc:
            if isinstance(node, CommentedMap) and key in node:
                line, col = node.lc.key(key)
                node = node[key]
                path += f".{key}" if path else str(key)
            elif isinstance(node, CommentedSeq) and isinstance(key, int) and key < len(node):
                line, col = node.lc.item(key)
                node = node[key]
                path += f"[{key}]"
            else:
                path += f".{key}" if path else str(key)
                break
        return Location(
            file=self.file,
            line=None if line is None else line + 1,
            column=None if col is None else col + 1,
            field=path or None,
        )


def load_yaml(path: Path) -> tuple[Any, PositionMap]:
    """Round-trip load; a parse error raises `InvalidInput` with Q100."""
    try:
        data = YAML(typ="rt").load(path.read_text(encoding="utf-8"))
    except YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        problem = getattr(exc, "problem", None) or str(exc)
        issue = IssueModel(
            code="Q100",
            severity="error",
            location=Location(
                file=path.name,
                line=mark.line + 1 if mark else None,
                column=mark.column + 1 if mark else None,
            ),
            message=f"YAML could not be parsed: {problem}",
            hint="Check indentation and quoting at this position.",
            docs="docs/issues.md#q100",
        )
        report = single_issue_report(path.name, issue)
        raise InvalidInput(f"[Q100] {path.name}: YAML could not be parsed", report=report) from exc
    return data, PositionMap(path.name, data)


def single_issue_report(file: str, issue: IssueModel) -> IssueReportModel:
    return IssueReportModel.model_validate(
        {
            "schema": "qscore.issues/v0.2",
            "manifest": file,
            "errors": 1,
            "warnings": 0,
            "issues": [issue],
        }
    )
