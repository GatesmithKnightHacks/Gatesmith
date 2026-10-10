"""Build one located `Issue` (specs/05-pipeline.md §3, §12; 04-contracts.md issues schema).

Shared by the reference and semantic passes so every issue carries `file:line:column` and the
full field path when a manifest exists, and just the file in single-file mode.
"""

from __future__ import annotations

from collections.abc import Callable

from qscore.schemas.common import Location
from qscore.schemas.run import IssueModel

Locate = Callable[[tuple[int | str, ...]], Location]
FieldPath = tuple[int | str, ...]


def dotted(path: FieldPath) -> str:
    out = ""
    for key in path:
        out += f"[{key}]" if isinstance(key, int) else (f".{key}" if out else key)
    return out


def make_issue(
    code: str,
    item: str | None,
    file: str,
    path: FieldPath | None,
    locate: Locate | None,
    message: str,
    hint: str | None,
    *,
    line: int | None = None,
    column: int | None = None,
) -> IssueModel:
    """`path` is the manifest field path (None in single-file mode). `line`/`column` override
    the manifest position for issues found inside another file (a QASM parse error)."""
    if line is not None:
        location = Location(file=file, line=line, column=column)
    elif locate is not None and path is not None:
        location = locate(path)
    else:
        location = Location(file=file)
    location = location.model_copy(update={"field": dotted(path) if path else None})
    return IssueModel(
        code=code,
        severity="error",
        item=item,
        location=location,
        message=message,
        hint=hint,
        docs=f"docs/issues.md#{code.lower()}",
    )
