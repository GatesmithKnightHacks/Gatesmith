"""Discover candidate circuits under a path (specs/05-pipeline.md §1, ChP-0029).

Static analysis only: Python sources and notebooks are parsed with `ast` and never imported or
run. A candidate is a `.qasm` file, a top-level Python function that builds a `QuantumCircuit`
(signals: `-> QuantumCircuit` annotation, a returned `QuantumCircuit(...)`, a return from a known
library builder) or a module-level circuit variable (weak signal). Notebook candidates are read
from the code-cell script (`notebook_source`) and carry `source_kind: notebook`.

ChP-0037: module-level variables and notebook candidates are drafted in line mode, so each gets
a static `default_line` (05 §2); every Python/notebook candidate carries the removed-Qiskit-API
hits of its file (`compat`).
"""

from __future__ import annotations

import ast
import importlib.util
import json
import os
import re
import warnings
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from qscore.errors import InvalidInput, RecordError
from qscore.intake.compat import CompatHit, removed_apis
from qscore.manifest.yamlio import single_issue_report
from qscore.schemas.common import Location
from qscore.schemas.run import IssueModel, IssueReportModel

SourceKind = Literal["qasm", "python", "notebook"]
Signal = Literal["annotation", "returns_circuit", "library_builder", "module_variable"]

SKIP_DIRS = frozenset({".venv", ".git", "build", "dist", "node_modules", ".ipynb_checkpoints"})
SIZE_LIKE = frozenset({"n", "num_qubits", "n_qubits", "size", "n_residues", "depth", "p", "reps"})
CIRCUIT_CLASS = "QuantumCircuit"
# QuantumCircuit methods that return a new circuit (Qiskit 1.x/2.x API).
CIRCUIT_METHODS = frozenset(
    {
        "assign_parameters",
        "compose",
        "control",
        "copy",
        "decompose",
        "inverse",
        "power",
        "repeat",
        "reverse_bits",
        "reverse_ops",
    }
)  # each checked to return a QuantumCircuit with default arguments (Qiskit 2.x)
# Qiskit circuit-library constructors whose result is a QuantumCircuit (05 §1 "known library
# builder"): the classes and their function-style replacements.
LIBRARY_BUILDERS = frozenset(
    {
        "QFT",
        "QAOAAnsatz",
        "TwoLocal",
        "EfficientSU2",
        "RealAmplitudes",
        "NLocal",
        "PauliTwoDesign",
        "ExcitationPreserving",
        "ZFeatureMap",
        "ZZFeatureMap",
        "PauliFeatureMap",
        "GroverOperator",
        "PhaseEstimation",
        "QuantumVolume",
        "IQP",
        "GraphState",
        "HiddenLinearFunction",
        "FourierChecking",
        "qaoa_ansatz",
        "n_local",
        "efficient_su2",
        "real_amplitudes",
        "pauli_two_design",
        "excitation_preserving",
        "z_feature_map",
        "zz_feature_map",
        "pauli_feature_map",
        "grover_operator",
        "quantum_volume",
        "iqp",
        "graph_state",
        "hidden_linear_function",
        "fourier_checking",
    }
)
_QASM_HEADER = re.compile(r"^\s*OPENQASM\s+(\d+)(?:\.\d+)?\s*;")

Literal_ = int | float | str | bool | None


@dataclass(frozen=True)
class Param:
    """One builder parameter: annotation source text and literal default, if any."""

    name: str
    annotation: str | None
    has_default: bool
    default: Literal_ = None
    default_is_literal: bool = False
    keyword_only: bool = False


@dataclass(frozen=True)
class Suggestion:
    """A literal argument value seen at a call site (shown, never applied silently)."""

    value: Literal_
    file: str
    line: int

    @property
    def where(self) -> str:
        return f"{self.file}:{self.line}"


@dataclass(frozen=True)
class Candidate:
    """One discovered circuit source. `index` is the stable 1-based list number."""

    index: int
    source_kind: SourceKind
    path: str  # relative to the discovery root, POSIX separators
    name: str | None  # function or variable name; None for a QASM file
    signal: Signal | None  # None for a QASM file
    line: int
    params: tuple[Param, ...] = ()
    var_kwargs: bool = False
    size_like: tuple[str, ...] = ()
    suggestions: Mapping[str, tuple[Suggestion, ...]] = field(default_factory=dict)
    qasm_version: int | None = None
    # ChP-0037: the drafted `source.line` (None: function mode, QASM) and the file's uses of
    # removed Qiskit APIs.
    default_line: int | None = None
    compat: tuple[CompatHit, ...] = ()

    @property
    def reference(self) -> str:
        """`path::name` (the manifest's `source.builder` format), or the QASM path."""
        return self.path if self.name is None else f"{self.path}::{self.name}"

    @property
    def weak(self) -> bool:
        return self.signal == "module_variable"

    @property
    def annotations(self) -> dict[str, str | None]:
        return {p.name: p.annotation for p in self.params}


@dataclass(frozen=True)
class _Found:
    """A candidate before numbering."""

    source_kind: SourceKind
    path: str
    name: str | None
    signal: Signal | None
    line: int
    params: tuple[Param, ...] = ()
    var_kwargs: bool = False
    suggestions: Mapping[str, tuple[Suggestion, ...]] = field(default_factory=dict)
    qasm_version: int | None = None
    default_line: int | None = None
    compat: tuple[CompatHit, ...] = ()


def _fail(
    code: str, file: str, message: str, line: int | None = None, column: int | None = None
) -> InvalidInput:
    issue = IssueModel(
        code=code,
        severity="error",
        location=Location(file=file, line=line, column=column),
        message=message,
        hint=None,
        docs=f"docs/issues.md#{code.lower()}",
    )
    return InvalidInput(f"[{code}] {message}", report=single_issue_report(file, issue), code=code)


def size_like(name: str) -> bool:
    """A size-like argument name (05 §1), suggested as a sweep."""
    return name in SIZE_LIKE


def _call_name(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _is_circuit_annotation(node: ast.expr | None) -> bool:
    if node is None:
        return False
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value.strip() == CIRCUIT_CLASS or node.value.strip().endswith(
            "." + CIRCUIT_CLASS
        )
    return _call_name(node) == CIRCUIT_CLASS


def _call_kind(node: ast.expr | None) -> Signal | None:
    """`returns_circuit` for `QuantumCircuit(...)`, `library_builder` for a library call."""
    if not isinstance(node, ast.Call):
        return None
    name = _call_name(node.func)
    if name == CIRCUIT_CLASS:
        return "returns_circuit"
    if name in LIBRARY_BUILDERS:
        return "library_builder"
    return None


def _own_nodes(body: Sequence[ast.stmt]) -> Iterator[ast.AST]:
    """Every node in `body`, without descending into nested functions, classes or lambdas."""
    nested = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)
    stack: list[ast.AST] = [n for n in reversed(body) if not isinstance(n, nested)]
    while stack:
        node = stack.pop()
        yield node
        stack += [
            c for c in reversed(list(ast.iter_child_nodes(node))) if not isinstance(c, nested)
        ]


def _derived_kind(node: ast.expr | None, bound: dict[str, Signal]) -> Signal | None:
    """`_call_kind`, or a circuit-returning method called on a name bound to a circuit
    (`qc.decompose()`, `qc.inverse()`, ...; QED-C kernels return `qc.decompose()`)."""
    if (kind := _call_kind(node)) is not None:
        return kind
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in CIRCUIT_METHODS
        and isinstance(node.func.value, ast.Name)
    ):
        # An explicit in-place call returns None; an unknown expression is not
        # evidence that the method returns a new circuit either.
        if node.func.attr in {"assign_parameters", "compose"} and (
            any(k.arg is None for k in node.keywords)
            or any(isinstance(arg, ast.Starred) for arg in node.args)
        ):
            return None
        inplace = next((k.value for k in node.keywords if k.arg == "inplace"), None)
        position = {"assign_parameters": 1, "compose": 4}.get(node.func.attr)
        if position is not None and len(node.args) > position:
            inplace = node.args[position]
        if inplace is not None and not (
            isinstance(inplace, ast.Constant) and inplace.value is False
        ):
            return None
        return bound.get(node.func.value.id)
    return None


def _return_signal(func: ast.FunctionDef) -> Signal | None:
    """The strongest return-based signal: a returned constructor call, or a returned name that
    the function binds to one (directly or through a circuit-returning method of a bound
    circuit)."""
    bound: dict[str, Signal] = {}
    returns: list[ast.expr] = []
    for node in _own_nodes(func.body):
        if isinstance(node, ast.Assign) and (kind := _derived_kind(node.value, bound)) is not None:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    bound[target.id] = kind
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if (kind := _derived_kind(node.value, bound)) is not None:
                bound[node.target.id] = kind
        elif isinstance(node, ast.Return) and node.value is not None:
            returns.append(node.value)
    kinds: set[Signal] = set()
    for value in returns:
        kind = _derived_kind(value, bound)
        if kind is None and isinstance(value, ast.Name):
            kind = bound.get(value.id)
        if kind is not None:
            kinds.add(kind)
    if "returns_circuit" in kinds:
        return "returns_circuit"
    if "library_builder" in kinds:
        return "library_builder"
    return None


def _literal(node: ast.expr) -> tuple[bool, Literal_]:
    """(True, value) for an int/float/str/bool/None constant or a negated number (ChP-0029)."""
    if isinstance(node, ast.Constant) and (
        node.value is None or isinstance(node.value, (bool, int, float, str))
    ):
        return True, node.value
    if (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, ast.USub)
        and isinstance(node.operand, ast.Constant)
        and isinstance(node.operand.value, (int, float))
        and not isinstance(node.operand.value, bool)
    ):
        return True, -node.operand.value
    return False, None


def signature_of(func: ast.FunctionDef) -> tuple[Param, ...]:
    """Parameters in call order (positional, then keyword-only), with annotation text and
    literal defaults. `*args`/`**kwargs` are not parameters."""
    args = func.args
    positional = args.posonlyargs + args.args
    first_default = len(positional) - len(args.defaults)
    params: list[Param] = []
    for i, arg in enumerate(positional):
        default = args.defaults[i - first_default] if i >= first_default else None
        params.append(_param(arg, default, keyword_only=False))
    for arg, kw_default in zip(args.kwonlyargs, args.kw_defaults, strict=True):
        params.append(_param(arg, kw_default, keyword_only=True))
    return tuple(params)


def _param(arg: ast.arg, default: ast.expr | None, *, keyword_only: bool) -> Param:
    annotation = ast.unparse(arg.annotation) if arg.annotation is not None else None
    if (
        isinstance(arg.annotation, ast.Constant)
        and isinstance(arg.annotation.value, str)
        and arg.annotation.value.strip() in {"int", "float", "bool", "str"}
    ):
        annotation = arg.annotation.value.strip()
    if default is None:
        return Param(arg.arg, annotation, has_default=False, keyword_only=keyword_only)
    is_literal, value = _literal(default)
    return Param(
        arg.arg,
        annotation,
        has_default=True,
        default=value,
        default_is_literal=is_literal,
        keyword_only=keyword_only,
    )


def module_names(path: str) -> frozenset[str]:
    """Dotted names a file may be imported as: every suffix of its path (`src/pkg/mod.py` ->
    `src.pkg.mod`, `pkg.mod`, `mod`), since the import root is not known statically."""
    parts = path.removesuffix(".py").split("/")
    return frozenset(".".join(parts[i:]) for i in range(len(parts)))


def _bindings(
    tree: ast.Module, func_name: str, modules: frozenset[str]
) -> tuple[set[str], set[str]]:
    """(names bound to the builder function, names bound to its module) by this file's imports:
    `from mod import build [as b]`, `import pkg.mod as x`, `import mod`,
    `from pkg import mod [as x]`."""
    names: set[str] = set()
    aliases: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in modules and (alias.asname or "." not in alias.name):
                    aliases.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom):
            source = node.module or ""
            for alias in node.names:
                bound = alias.asname or alias.name
                if source in modules and alias.name == func_name:
                    names.add(bound)
                elif (f"{source}.{alias.name}" if source else alias.name) in modules:
                    aliases.add(bound)
    return names, aliases


def call_site_suggestions(
    tree: ast.Module,
    func_name: str,
    params: Sequence[Param],
    file: str,
    *,
    builder_path: str | None = None,
    whole_file: bool = False,
) -> dict[str, list[Suggestion]]:
    """Literal arguments at calls of the builder `func_name` defined in `builder_path` (ChP-0029).

    In the builder's own file (`builder_path` None or equal to `file`) only bare `func_name(...)`
    calls count. In another file a bare call counts only when the name was imported from the
    builder's module, and `x.func_name(...)` only when `x` is that module's import name. Searched
    at module level, including the `if __name__ == "__main__":` block; with `whole_file` (test
    files) everywhere. Positional arguments map to the parameters in order until a `*args` splat;
    non-literals are ignored."""
    names: set[str]
    aliases: set[str]
    if builder_path is None or builder_path == file:
        names, aliases = {func_name}, set()
    else:
        names, aliases = _bindings(tree, func_name, module_names(builder_path))
    positional = [p.name for p in params if not p.keyword_only]
    known = {p.name for p in params}
    nodes: Iterator[ast.AST] = ast.walk(tree) if whole_file else _own_nodes(tree.body)
    found: dict[str, list[Suggestion]] = {}
    for node in nodes:
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (
            (isinstance(func, ast.Name) and func.id in names)
            or (
                isinstance(func, ast.Attribute)
                and func.attr == func_name
                and isinstance(func.value, ast.Name)
                and func.value.id in aliases
            )
        ):
            continue
        for i, arg in enumerate(node.args):
            if isinstance(arg, ast.Starred) or i >= len(positional):
                break
            is_literal, value = _literal(arg)
            if is_literal:
                found.setdefault(positional[i], []).append(Suggestion(value, file, arg.lineno))
        for keyword in node.keywords:
            if keyword.arg is None or keyword.arg not in known:
                continue
            is_literal, value = _literal(keyword.value)
            if is_literal:
                found.setdefault(keyword.arg, []).append(
                    Suggestion(value, file, keyword.value.lineno)
                )
    return {arg: sorted(values, key=lambda s: s.line) for arg, values in found.items()}


def parse_source(source: str | bytes, filename: str = "<unknown>") -> ast.Module:
    """`ast.parse` of researcher code without Python's SyntaxWarnings about it (e.g. invalid
    escapes in notebook cells): the code is only read here, and the warnings are not qscore's
    to report. SyntaxError still propagates."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SyntaxWarning)
        return ast.parse(source, filename=filename)


def _parse(source: str | bytes, rel: str) -> ast.Module:
    try:
        return parse_source(source, rel)
    except SyntaxError as exc:
        raise _fail(
            "Q301", rel, f"{rel}: {exc.msg} (not parsed for discovery)", exc.lineno, exc.offset
        ) from exc


def _mentions(node: ast.AST, name: str) -> bool:
    return any(isinstance(n, ast.Name) and n.id == name for n in ast.walk(node))


def _run_end(body: Sequence[ast.stmt], start: int, name: str) -> int:
    """Last line of the run of consecutive top-level statements, from `body[start]` on, whose
    AST mentions `name` (ChP-0037 §2.1 C)."""
    end = start
    while end + 1 < len(body) and _mentions(body[end + 1], name):
        end += 1
    last = body[end]
    return last.end_lineno if last.end_lineno is not None else last.lineno


def _cell_end(cells: Sequence[tuple[int, int]], line: int, rel: str) -> int:
    for first, last in cells:
        if first <= line <= last:
            return last
    raise RecordError(f"{rel}: line {line} is in no code cell of the notebook script")


def _scan_tree(
    tree: ast.Module,
    rel: str,
    kind: SourceKind,
    cells: Sequence[tuple[int, int]] = (),
) -> list[_Found]:
    """Candidates of one parsed file. `cells` (notebooks only): each code cell's first and
    last line in the notebook script, for the default `line` (ChP-0037)."""
    compat = tuple(removed_apis(tree))
    found: list[_Found] = []
    for index, node in enumerate(tree.body):
        if isinstance(node, ast.FunctionDef):
            signal: Signal | None = (
                "annotation" if _is_circuit_annotation(node.returns) else _return_signal(node)
            )
            if signal is None:
                continue
            params = signature_of(node)
            suggestions = call_site_suggestions(tree, node.name, params, rel)
            found.append(
                _Found(
                    kind,
                    rel,
                    node.name,
                    signal,
                    node.lineno,
                    params,
                    node.args.kwarg is not None,
                    {k: tuple(v) for k, v in suggestions.items()},
                    default_line=_cell_end(cells, node.lineno, rel) if kind == "notebook" else None,
                    compat=compat,
                )
            )
        elif isinstance(node, (ast.Assign, ast.AnnAssign)) and _call_kind(node.value) is not None:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    default_line = (
                        _cell_end(cells, node.lineno, rel)
                        if kind == "notebook"
                        else _run_end(tree.body, index, target.id)
                    )
                    found.append(
                        _Found(
                            kind,
                            rel,
                            target.id,
                            "module_variable",
                            node.lineno,
                            default_line=default_line,
                            compat=compat,
                        )
                    )
    return found


def scan_python(path: Path, rel: str | None = None) -> list[_Found]:
    """Builder candidates in one Python file (ast only; the file is never imported)."""
    rel = rel or path.name
    return _scan_tree(_parse(_read_bytes(path, rel), rel), rel, "python")


def _read_bytes(path: Path, rel: str) -> bytes:
    try:
        return path.read_bytes()
    except FileNotFoundError as exc:
        raise _fail("Q200", rel, f"file not found: {rel}") from exc
    except OSError as exc:
        raise RecordError(f"could not read {rel}: {exc}") from exc


def notebook_source(path: Path, rel: str) -> str:
    """Code cells joined; lines starting with `%` or `!` (magics, shell) dropped (ChP-0029)."""
    try:
        doc = json.loads(_read_bytes(path, rel).decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise _fail("Q103", rel, f"{rel}: not a readable notebook: {exc}") from exc
    cells = doc.get("cells") if isinstance(doc, dict) else None
    if not isinstance(cells, list):
        raise _fail("Q103", rel, f"{rel}: not a notebook (no 'cells' list)")
    lines: list[str] = []
    for cell in cells:
        if not isinstance(cell, dict) or cell.get("cell_type") != "code":
            continue
        source = cell.get("source", "")
        if isinstance(source, str):
            text = source
        elif isinstance(source, list) and all(isinstance(part, str) for part in source):
            text = "".join(source)
        else:
            raise _fail("Q103", rel, f"{rel}: a code cell's source is not text")
        lines += [ln for ln in text.splitlines() if not ln.lstrip().startswith(("%", "!"))]
        lines.append("")
    return "\n".join(lines)


def notebook_cells(path: Path, rel: str) -> list[tuple[int, int]]:
    """(first, last) line of each code cell in the `notebook_source` script, in cell order; a
    cell with no line left (only magics/shell lines) has `last == first - 1`. Same joining rule
    as `notebook_source`, which validates the notebook first."""
    script = notebook_source(path, rel)
    doc = json.loads(_read_bytes(path, rel).decode("utf-8"))
    cells: list[tuple[int, int]] = []
    lines: list[str] = []
    for cell in doc["cells"]:
        if not isinstance(cell, dict) or cell.get("cell_type") != "code":
            continue
        source = cell.get("source", "")
        text = source if isinstance(source, str) else "".join(source)
        kept = [ln for ln in text.splitlines() if not ln.lstrip().startswith(("%", "!"))]
        cells.append((len(lines) + 1, len(lines) + len(kept)))
        lines += [*kept, ""]  # the blank line notebook_source appends after each cell
    if "\n".join(lines) != script:
        raise RecordError(f"{rel}: code cells do not add up to the notebook script")
    return cells


def scan_notebook(path: Path, rel: str | None = None) -> list[_Found]:
    """Candidates in a notebook (`source_kind: notebook`), lines counted in the code-cell
    script; drafted in line mode with the end of the candidate's cell (ChP-0037)."""
    rel = rel or path.name
    tree = _parse(notebook_source(path, rel), rel)
    return _scan_tree(tree, rel, "notebook", notebook_cells(path, rel))


def qasm_version(text: str) -> int | None:
    """Major version from the `OPENQASM x.y;` header (comments and blank lines skipped)."""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        match = _QASM_HEADER.match(line)
        return int(match.group(1)) if match else None
    return None


def scan_qasm(path: Path, rel: str | None = None) -> _Found:
    rel = rel or path.name
    try:
        text = _read_bytes(path, rel).decode("utf-8")
    except UnicodeError as exc:
        raise _fail("Q304", rel, f"{rel}: not UTF-8 text: {exc}") from exc
    return _Found("qasm", rel, None, None, 1, qasm_version=qasm_version(text))


def _files(start: Path) -> Iterator[Path]:
    if start.is_file():
        yield start
        return

    def unreadable(exc: OSError) -> None:
        raise RecordError(f"could not scan {exc.filename}: {exc}") from exc

    for dirpath, dirnames, filenames in os.walk(start, onerror=unreadable):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            yield Path(dirpath) / name


def _test_files(root: Path) -> list[Path]:
    tests = root / "tests"
    if not tests.is_dir():
        return []
    return [p for p in _files(tests) if p.name.startswith("test_") and p.suffix == ".py"]


def is_test_file(rel: str) -> bool:
    """Files under `tests/` and files named `test_*.py` give call-site suggestions only; they are
    never candidates."""
    return rel.startswith("tests/") or (
        rel.rsplit("/", 1)[-1].startswith("test_") and rel.endswith(".py")
    )


def discover(
    root: Path,
    subdir: Path | str | None = None,
    *,
    unreadable: list[IssueModel] | None = None,
) -> list[Candidate]:
    """Candidates under `root` (a folder, or a single `.py`/`.qasm`/`.ipynb` file), optionally
    limited to `root/subdir`. Ordered by path, then line; numbered from 1. Every file that cannot
    be read is reported at once (one `InvalidInput` with each located issue). With `unreadable`
    given, a folder scan that still finds candidates appends those issues to it instead and
    returns the candidates (ChP-0044); a single file, or a scan with no candidates, still
    raises."""
    root = Path(root)
    if not root.exists():
        raise _fail("Q200", str(root), f"path not found: {root}")
    base = root.parent if root.is_file() else root
    start = root if root.is_file() else (root / subdir if subdir is not None else root)
    if not start.exists():
        raise _fail("Q200", str(start), f"path not found: {start}")
    found: list[_Found] = []
    issues: list[IssueModel] = []
    for path in _files(start):
        rel = path.relative_to(base).as_posix()
        if is_test_file(rel):
            continue
        try:
            if path.suffix == ".qasm":
                found.append(scan_qasm(path, rel))
            elif path.suffix == ".py":
                found += scan_python(path, rel)
            elif path.suffix == ".ipynb":
                found += scan_notebook(path, rel)
        except InvalidInput as exc:
            issues += exc.report.issues
    tests: list[tuple[str, ast.Module]] = []
    for path in _test_files(base):
        rel = path.relative_to(base).as_posix()
        try:
            tests.append((rel, _parse(_read_bytes(path, rel), rel)))
        except InvalidInput as exc:
            issues += exc.report.issues
    if issues and unreadable is not None and start.is_dir() and found:
        unreadable.extend(issues)
        issues = []
    if issues:
        report = IssueReportModel.model_validate(
            {
                "schema": "qscore.issues/v0.2",
                "manifest": str(root),
                "errors": len(issues),
                "warnings": 0,
                "issues": issues,
            }
        )
        codes = sorted({i.code for i in issues})
        raise InvalidInput(
            f"discovery: {len(issues)} file(s) could not be read ({', '.join(codes)})",
            report=report,
            code=codes[0] if len(codes) == 1 else None,
        )
    found = _with_test_suggestions(found, tests)
    found.sort(key=lambda f: (f.path, f.line, f.name or ""))
    return [
        Candidate(
            index=i,
            source_kind=f.source_kind,
            path=f.path,
            name=f.name,
            signal=f.signal,
            line=f.line,
            params=f.params,
            var_kwargs=f.var_kwargs,
            size_like=tuple(p.name for p in f.params if size_like(p.name)),
            suggestions=f.suggestions,
            qasm_version=f.qasm_version,
            default_line=f.default_line,
            compat=f.compat,
        )
        for i, f in enumerate(found, start=1)
    ]


def _with_test_suggestions(
    found: list[_Found], tests: Sequence[tuple[str, ast.Module]]
) -> list[_Found]:
    """Add call sites from `tests/**/test_*.py` under the root to each Python builder."""
    out: list[_Found] = []
    for f in found:
        if f.source_kind != "python" or f.signal == "module_variable" or f.name is None:
            out.append(f)
            continue
        merged = {k: list(v) for k, v in f.suggestions.items()}
        for rel, tree in tests:
            extra = call_site_suggestions(
                tree, f.name, f.params, rel, builder_path=f.path, whole_file=True
            )
            for arg, values in extra.items():
                merged.setdefault(arg, []).extend(values)
        out.append(
            _Found(
                f.source_kind,
                f.path,
                f.name,
                f.signal,
                f.line,
                f.params,
                f.var_kwargs,
                {k: tuple(v) for k, v in merged.items()},
                f.qasm_version,
                f.default_line,
                f.compat,
            )
        )
    return out


@dataclass(frozen=True)
class MissingImport:
    """A top-level import the engine environment cannot find (ChP-0035 §2.1 A)."""

    module: str
    file: str  # relative to the discovery root
    line: int

    def describe(self) -> str:
        return (
            f"{self.file}:{self.line}: module {self.module!r} is not installed in the qscore "
            "environment; scoring will fail with Q301 unless it is installed there"
        )


def _search_dirs(file: Path, root: Path) -> list[Path]:
    """Where the runner looks for the builder's own modules: the project root, the file's
    directory and, inside a package, the top package's parent (05 §4.1)."""
    dirs = [root, file.parent]
    directory = file.parent
    while (
        (directory / "__init__.py").is_file()
        and directory != root
        and directory.is_relative_to(root)
    ):
        directory = directory.parent
    dirs.append(directory)
    return dirs


def missing_imports(candidate: Candidate, root: Path) -> list[MissingImport]:
    """Top-level absolute imports of the candidate's file that neither exist under the project
    nor resolve with `importlib.util.find_spec` in the engine environment. Static: nothing from
    the repository is imported. QASM candidates have none."""
    if candidate.name is None:
        return []
    file = root / candidate.path
    text = (
        notebook_source(file, candidate.path)
        if candidate.source_kind == "notebook"
        else file.read_text(encoding="utf-8")
    )
    tree = parse_source(text)
    dirs = _search_dirs(file, root)
    seen: set[str] = set()
    missing: list[MissingImport] = []
    for node in tree.body:
        if isinstance(node, ast.Import):
            names = [(a.name.split(".")[0], node.lineno) for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names = [(node.module.split(".")[0], node.lineno)]
        else:
            continue
        for top, line in names:
            if top in seen:
                continue
            seen.add(top)
            local = any((d / top).is_dir() or (d / f"{top}.py").is_file() for d in dirs)
            if not local and importlib.util.find_spec(top) is None:
                missing.append(MissingImport(top, candidate.path, line))
    return missing
