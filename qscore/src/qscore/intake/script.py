"""Line mode prefix (ChP-0037 §2.1 A/B; specs/05-pipeline.md §4.1).

``prefix`` keeps the top-level statements of a script whose first line (a decorator's line for a
decorated definition) is at or before ``until_line`` and drops the rest, so code after the line
never runs. The kept text is the original text cut right after the last kept statement, so every
line keeps its number and tracebacks point at the researcher's own lines.
"""

from __future__ import annotations

import ast
import tokenize
from pathlib import Path

from qscore.errors import InvalidInput
from qscore.intake.discover import notebook_source
from qscore.manifest.yamlio import single_issue_report
from qscore.schemas.common import Location
from qscore.schemas.run import IssueModel


def _error(
    code: str,
    rel: str,
    message: str,
    hint: str,
    *,
    line: int | None = None,
    column: int | None = None,
    field: str | None = None,
) -> InvalidInput:
    issue = IssueModel(
        code=code,
        severity="error",
        location=Location(file=rel, line=line, column=column, field=field),
        message=message,
        hint=hint,
        docs=f"docs/issues.md#{code.lower()}",
    )
    return InvalidInput(f"[{code}] {message}", report=single_issue_report(rel, issue), code=code)


def script_text(path: Path, rel: str) -> str:
    """The script that line mode cuts: a `.py` file's text (honouring its encoding declaration)
    or a notebook's code-cell script as `qscore discover` prints it (ChP-0037 §2.1 A)."""
    if rel.endswith(".ipynb"):
        return notebook_source(path, rel)
    with tokenize.open(path) as fh:
        return fh.read()


def _target_names(target: ast.expr) -> list[str]:
    """Plain names an assignment target binds (unpacking included; `a.b`/`a[i]` bind none)."""
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, ast.Tuple | ast.List):
        return [name for element in target.elts for name in _target_names(element)]
    if isinstance(target, ast.Starred):
        return _target_names(target.value)
    return []


def bound_names(node: ast.stmt) -> list[str]:
    """Names a top-level statement binds for line mode: a function definition, an assignment
    or annotated assignment with a value, or an import. Classes do not count (ChP-0037)."""
    if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
        return [node.name]
    if isinstance(node, ast.Assign):
        return [name for target in node.targets for name in _target_names(target)]
    if isinstance(node, ast.AnnAssign) and node.value is not None:
        return [node.target.id] if isinstance(node.target, ast.Name) else []
    if isinstance(node, ast.Import):
        return [a.asname or a.name.split(".")[0] for a in node.names]
    if isinstance(node, ast.ImportFrom):
        return [a.asname or a.name for a in node.names if a.name != "*"]
    return []


def first_line(node: ast.stmt) -> int:
    """The statement's first line: its first decorator for a decorated definition."""
    decorators: list[ast.expr] = getattr(node, "decorator_list", [])
    return min([node.lineno, *(d.lineno for d in decorators)])


def parse_script(text: str, rel: str) -> ast.Module:
    """The script's syntax tree; a syntax error is Q301 located in the file."""
    try:
        return ast.parse(text, filename=rel)
    except SyntaxError as exc:
        raise _error(
            "Q301",
            rel,
            f"{rel}: {exc.msg}",
            "Fix the builder's Python syntax.",
            line=exc.lineno,
            column=exc.offset,
        ) from exc


def check_line(text: str, until_line: int, rel: str) -> None:
    """`until_line` must name a line of the script (Q103 located at ``source.line``)."""
    count = len(text.splitlines())
    if until_line > count:
        raise _error(
            "Q103",
            rel,
            f"line {until_line} is past the end of {rel} ({count} lines)",
            "Choose a line inside the script (qscore discover prints notebook scripts).",
            field="source.line",
        )


def prefix(text: str, until_line: int, rel: str) -> str:
    """The top-level statements whose first line is ≤ `until_line`, with original numbering."""
    check_line(text, until_line, rel)
    tree = parse_script(text, rel)
    kept = [node for node in tree.body if first_line(node) <= until_line]
    if not kept:
        return ""
    last = kept[-1]
    assert last.end_lineno is not None and last.end_col_offset is not None
    lines = text.splitlines(keepends=True)
    head = "".join(lines[: last.end_lineno - 1])
    # `end_col_offset` counts UTF-8 bytes; cut there so a later statement sharing the line
    # (``a = (1,\n2); b = 3``) is dropped.
    tail = lines[last.end_lineno - 1].encode("utf-8")[: last.end_col_offset].decode("utf-8")
    return head + tail + "\n"
