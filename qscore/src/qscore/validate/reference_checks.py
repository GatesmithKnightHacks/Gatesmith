"""Reference pass (specs/05-pipeline.md §3): the files an item names exist, and its target name
is known. Parses nothing and runs nothing; every issue of every item is returned at once.

Codes here: Q200 (QASM, parameters or observable file not found), Q201-Q204 (builder file,
function, arguments, size-sweep argument; checked with `ast`, never imported), Q301 (builder file
does not parse), Q206 (unknown target), Q103 (synthetic target with backend calibration; line
mode: `source.line` past the end of the script, unreadable notebook).

Line mode (ChP-0037): with `source.line`, `name` must be bound by a top-level statement starting
at or before `line` (a def, an assignment, an import; not a class) in the script text (a
notebook's code-cell script), else Q202. When that binding is a def, its signature is checked
against `args` as in function mode. Known limit: bindings inside top-level compound
statements (`if`/`for`/`with`/`try`) and augmented assignments are not seen, so such a name is
Q202 here even though the runner would bind it.
"""

from __future__ import annotations

import ast
from collections.abc import Callable
from pathlib import Path

from qscore.errors import InvalidInput
from qscore.intake.script import bound_names, check_line, first_line, parse_script, script_text
from qscore.schemas.manifest import BuilderSource, CircuitItem, QasmSource
from qscore.schemas.run import IssueModel
from qscore.targets.registry import target_problem
from qscore.validate.issues import FieldPath, Locate, make_issue


def target_field(index: int, origins: dict[str, str]) -> FieldPath:
    """Where the item's target name was set: on the item, or in the manifest's defaults."""
    if origins.get("target") == "item":
        return ("circuits", index, "target", "backend")
    return ("defaults", "target", "backend")


def reference_issues(
    item: CircuitItem,
    root: Path,
    file: str,
    index: int | None,
    origins: dict[str, str],
    locate: Locate | None = None,
) -> list[IssueModel]:
    """All reference issues of one item. `index` is None in single-file mode (no manifest)."""

    def at(*field: int | str) -> FieldPath | None:
        return ("circuits", index, *field) if index is not None else None

    issues: list[IssueModel] = []
    if isinstance(item.source, BuilderSource):
        issues += _builder_issues(item, root, file, at, locate)
    if isinstance(item.source, QasmSource) and not (root / item.source.qasm).is_file():
        issues.append(
            make_issue(
                "Q200",
                item.id,
                file,
                at("source", "qasm"),
                locate,
                f"QASM file not found: {item.source.qasm}",
                "Paths are relative to project.root.",
            )
        )
    task = item.invariants.task
    if task is not None and task.observable and not (root / task.observable).is_file():
        issues.append(
            make_issue(
                "Q200",
                item.id,
                file,
                at("invariants", "task", "observable"),
                locate,
                f"observable file not found: {task.observable}",
                "Paths are relative to project.root.",
            )
        )
    assert item.target is not None  # filled by merge_items (built-in defaults)
    problem = target_problem(item.target)
    if problem is not None:
        code, message = problem
        issues.append(
            make_issue(
                code,
                item.id,
                file,
                target_field(index, origins) if index is not None else None,
                locate,
                message,
                "Known targets: FakeTorino, line-<n>, grid-<r>x<c>, heavy-hex-<d>."
                if code == "Q206"
                else None,
            )
        )
    return issues


def _builder_issues(
    item: CircuitItem,
    root: Path,
    file: str,
    at: Callable[..., FieldPath | None],
    locate: Locate | None,
) -> list[IssueModel]:
    """Q200 (parameters file), Q201-Q204 and Q301 (syntax) for a builder item."""
    source = item.source
    assert isinstance(source, BuilderSource)
    issues: list[IssueModel] = []

    def add(code: str, field: tuple[str, ...], message: str, hint: str | None = None) -> None:
        issues.append(make_issue(code, item.id, file, at(*field), locate, message, hint))

    if source.parameters is not None and not (root / source.parameters.file).is_file():
        add(
            "Q200",
            ("source", "parameters", "file"),
            f"parameters file not found: {source.parameters.file}",
            "Paths are relative to project.root.",
        )
    rel, name = source.builder.split("::")
    path = root / rel
    if not path.is_file():
        add(
            "Q201",
            ("source", "builder"),
            f"builder file not found: {rel}",
            "Paths are relative to project.root.",
        )
        return issues
    if source.line is not None:
        found = _line_binding(item, name, source.line, path, rel, file, at, locate)
        if isinstance(found, list):
            return issues + found
        if found is None:
            return issues
        function = found
    else:
        try:
            tree = ast.parse(path.read_bytes(), filename=rel)
        except SyntaxError as exc:
            add_syntax = make_issue(
                "Q301",
                item.id,
                rel,
                None,
                None,
                f"{rel}: {exc.msg}",
                "Fix the builder's Python syntax.",
                line=exc.lineno,
                column=exc.offset,
            )
            issues.append(add_syntax)
            return issues
        functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
        if name not in functions:
            known = ", ".join(sorted(functions)) or "none"
            add(
                "Q202",
                ("source", "builder"),
                f"function {name!r} not found in {rel}",
                f"Top-level functions in {rel}: {known}.",
            )
            return issues
        function = functions[name]
    sig = function.args
    positional = sig.posonlyargs + sig.args
    named = [a.arg for a in sig.args + sig.kwonlyargs]
    required = [a.arg for a in positional[: len(positional) - len(sig.defaults)]]
    required += [a.arg for a, d in zip(sig.kwonlyargs, sig.kw_defaults, strict=True) if d is None]
    open_kwargs = sig.kwarg is not None
    unknown = [] if open_kwargs else [a for a in source.args if a not in named]
    missing = [a for a in required if a not in source.args]
    if unknown or missing:
        parts = [f"unknown {', '.join(unknown)}"] if unknown else []
        parts += [f"missing {', '.join(missing)}"] if missing else []
        add(
            "Q203",
            ("source", "args"),
            f"{name} arguments do not match its signature: " + "; ".join(parts),
            f"Signature: {name}({', '.join(named)}).",
        )
    sweep = item.size_sweep
    if sweep is not None and not open_kwargs and sweep.arg not in named:
        add(
            "Q204",
            ("size_sweep", "arg"),
            f"size-sweep argument {sweep.arg!r} is not a parameter of {name}",
            f"Signature: {name}({', '.join(named)}).",
        )
    return issues


def _line_binding(
    item: CircuitItem,
    name: str,
    line: int,
    path: Path,
    rel: str,
    file: str,
    at: Callable[..., FieldPath | None],
    locate: Locate | None,
) -> list[IssueModel] | ast.FunctionDef | ast.AsyncFunctionDef | None:
    """Line mode: the issues (Q103, Q301, Q202), or the def binding `name` last at or before
    `line` (its signature is checked next), or None when `name` is bound by a non-def."""
    try:
        text = script_text(path, rel)
        check_line(text, line, rel)
        tree = parse_script(text, rel)
    except InvalidInput as exc:
        # Q103 (unreadable notebook, `line` past the end) or Q301 (syntax, located in the file).
        assert exc.code is not None
        (issue,) = exc.report.issues
        located: tuple[str, FieldPath | None, Locate | None]
        if issue.location.line is not None:
            located = (rel, None, None)
        else:
            field = (
                ("source", "line")
                if issue.location.field == "source.line"
                else ("source", "builder")
            )
            located = (file, at(*field), locate)
        return [
            make_issue(
                exc.code,
                item.id,
                *located,
                issue.message,
                issue.hint,
                line=issue.location.line,
                column=issue.location.column,
            )
        ]
    binding: ast.stmt | None = None
    for node in tree.body:
        if first_line(node) <= line and name in bound_names(node):
            binding = node
    if binding is None:
        return [
            make_issue(
                "Q202",
                item.id,
                file,
                at("source", "builder"),
                locate,
                f"{name!r} is not bound at the top level of {rel} at or before line {line}",
                "Line mode takes a variable, function or import bound before `line`; "
                "move `line` later or name another variable (qscore discover lists them).",
            )
        ]
    if isinstance(binding, ast.FunctionDef | ast.AsyncFunctionDef):
        return binding
    return None
