"""Reference pass (specs/05-pipeline.md §3): the files an item names exist, and its target name
is known. Parses nothing and runs nothing; every issue of every item is returned at once.

Codes here: Q200 (QASM, parameters or observable file not found), Q201-Q204 (builder file,
function, arguments, size-sweep argument; checked with `ast`, never imported), Q301 (builder file
does not parse), Q206 (unknown target), Q103 (synthetic target with backend calibration).
"""

from __future__ import annotations

import ast
from collections.abc import Callable
from pathlib import Path

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
    try:
        tree = ast.parse(path.read_bytes(), filename=rel)
    except SyntaxError as exc:
        issues.append(
            make_issue(
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
        )
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
    sig = functions[name].args
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
