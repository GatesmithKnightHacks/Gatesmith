"""Draft manifest entries from discovered candidates (specs/05-pipeline.md §2, ChP-0029).

Deterministic and pure: no LLM, no network, no user code. Arguments are filled in the order of
05 §2: signature default → values file (`qscore.values/v0.1`, 04 §14) → interactive prompt
(unless `no_input`) → literal call-site suggestion (only with `no_input`) → `<required>`. Every
written value carries a comment saying where it came from. The prompt is an injected callable so
the services layer stays print-free; the CLI owns the I/O.

ChP-0037: module-level circuit variables and notebook candidates are drafted in line mode: the
entry gets `source.line` (the candidate's `default_line`) and a comment saying how far it runs.
"""

from __future__ import annotations

import difflib
import io
import re
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pydantic import ValidationError
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.error import YAMLError

from qscore.errors import InvalidInput, RecordError
from qscore.intake.discover import Candidate, Param, Suggestion
from qscore.manifest.yamlio import PositionMap, load_yaml
from qscore.schemas.common import Location
from qscore.schemas.manifest import ITEM_ID_PATTERN, PROJECT_SCHEMA, REQUIRED_PLACEHOLDER
from qscore.schemas.run import IssueModel, IssueReportModel
from qscore.schemas.values import DraftValues

FieldPath = tuple[int | str, ...]
PROMPT_FILE = "<prompt>"
PICK_FILE = "--pick"
CHECKED_ANNOTATIONS = frozenset({"int", "float", "bool", "str"})
_RANGE = re.compile(r"^\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*(?:\.\.\s*(-?\d+)\s*)?$")
# ChP-0037 §2.1 C (the dash is an en dash)
LINE_COMMENT = "runs lines 1\u2013{line}; move it to choose a later point"


@dataclass(frozen=True)
class PromptSpec:
    """One question for the injected prompt. `kind="pick"` asks which candidates to draft
    (answer: `1,3` or names); `kind="value"` asks for one argument value (answer: a YAML scalar,
    a range `a..b` / `a..b..s`, or a list `[a, b]`; empty means no value)."""

    kind: Literal["pick", "value"]
    message: str
    candidate: str | None = None
    arg: str | None = None
    annotation: str | None = None
    size_like: bool = False
    suggestions: tuple[Suggestion, ...] = ()
    choices: tuple[str, ...] = ()


Prompt = Callable[[PromptSpec], str]


@dataclass(frozen=True)
class ResolvedValue:
    value: object
    origin: str  # default | values file | entered | suggested from <file>:<line> | required


@dataclass(frozen=True)
class ResolvedSweep:
    arg: str
    values: tuple[int, ...]
    origin: str


@dataclass(frozen=True)
class ResolvedArgs:
    args: dict[str, ResolvedValue] = field(default_factory=dict)
    sweep: ResolvedSweep | None = None
    parameters: str | None = None  # parameters file from the values file (relative to root)


@dataclass(frozen=True)
class Skipped:
    """A drafted item `merge_into` did not add, and why."""

    reference: str
    reason: str


# ---------------------------------------------------------------- issues


def _issue(
    code: str,
    location: Location,
    message: str,
    hint: str | None = None,
    item: str | None = None,
) -> IssueModel:
    return IssueModel(
        code=code,
        severity="error",
        item=item,
        location=location,
        message=message,
        hint=hint,
        docs=f"docs/issues.md#{code.lower()}",
    )


def _raise(file: str, issues: list[IssueModel]) -> InvalidInput:
    report = IssueReportModel.model_validate(
        {
            "schema": "qscore.issues/v0.2",
            "manifest": file,
            "errors": len(issues),
            "warnings": 0,
            "issues": issues,
        }
    )
    codes = sorted({i.code for i in issues})
    return InvalidInput(
        f"{file}: {len(issues)} issue(s) ({', '.join(codes)})",
        report=report,
        code=codes[0] if len(codes) == 1 else None,
    )


def _fail(
    code: str, file: str, message: str, hint: str | None = None, field_: str | None = None
) -> InvalidInput:
    return _raise(file, [_issue(code, Location(file=file, field=field_), message, hint)])


def _code_for(error_type: str) -> str:
    """Same mapping as the manifest schema pass (05 §3): issue-coded errors keep their code."""
    if error_type.startswith("Q") and error_type[1:].isdigit():
        return error_type
    if error_type == "missing":
        return "Q104"
    if error_type.endswith("_type"):
        return "Q102"
    return "Q103"


# ---------------------------------------------------------------- ranges and type checks


def parse_range(spec: str | Sequence[object]) -> list[int]:
    """`a..b` (inclusive, step 1), `a..b..s`, or a list of ints (05 §2). Raises `InvalidInput`
    with Q103 for a malformed or empty range, Q102 for a list item that is not an int."""
    if isinstance(spec, str):
        match = _RANGE.match(spec)
        if match is None:
            raise InvalidInput(
                f"[Q103] {spec!r} is not a range: use 'a..b', 'a..b..s' or a list [a, b, c]",
                report=None,
                code="Q103",
            )
        start, stop = int(match.group(1)), int(match.group(2))
        step = int(match.group(3)) if match.group(3) is not None else 1
        if step <= 0 or start > stop:
            raise InvalidInput(
                f"[Q103] range {spec!r} is empty: need a <= b and a positive step",
                report=None,
                code="Q103",
            )
        return list(range(start, stop + 1, step))
    values = list(spec)
    bad = [v for v in values if not isinstance(v, int) or isinstance(v, bool)]
    if bad:
        raise InvalidInput(
            f"[Q102] sweep values must be integers, got {bad[0]!r}", report=None, code="Q102"
        )
    if not values:
        raise InvalidInput("[Q103] a sweep needs at least one value", report=None, code="Q103")
    return [int(v) for v in values]  # type: ignore[call-overload]


def _type_problem(value: object, annotation: str | None) -> str | None:
    """A mismatch between a value and an `int`/`float`/`bool`/`str` annotation (never coerced).
    An int is a valid `float` (Python's numeric tower); other annotations are not checked."""
    if annotation not in CHECKED_ANNOTATIONS:
        return None
    ok = {
        "int": isinstance(value, int) and not isinstance(value, bool),
        "float": isinstance(value, (int, float)) and not isinstance(value, bool),
        "bool": isinstance(value, bool),
        "str": isinstance(value, str),
    }[annotation]
    return None if ok else f"{value!r} is not {annotation}"


def _range_allowed(param: Param) -> bool:
    return param.annotation in (None, "int")


# ---------------------------------------------------------------- values file


def _builders(candidates: Sequence[Candidate]) -> dict[str, Candidate]:
    return {
        c.reference: c
        for c in candidates
        if c.source_kind in ("python", "notebook")
        and c.name is not None
        and c.signal != "module_variable"
    }


def load_values(path: Path, candidates: Sequence[Candidate], root: Path) -> DraftValues:
    """Read and check a `qscore.values/v0.1` file against the discovered builders (04 §14);
    `parameters` files are resolved against the project `root`. Every problem is reported at
    once, located in the values file (line:column)."""
    if not path.is_file():
        raise _fail("Q200", path.name, f"values file not found: {path}")
    try:
        data, positions = load_yaml(path)  # Q100 on a parse error
    except UnicodeError as exc:
        raise _fail("Q100", path.name, f"values file is not UTF-8: {path}") from exc
    except OSError as exc:
        raise RecordError(f"could not read values file {path}: {exc}") from exc
    try:
        values = DraftValues.model_validate(data)
    except ValidationError as exc:
        issues = [
            _issue(
                _code_for(e["type"]),
                positions.locate(_loc(e)),
                e["msg"],
            )
            for e in exc.errors()
        ]
        raise _raise(positions.file, issues) from exc
    issues = _value_issues(values, _builders(candidates), positions, root)
    if issues:
        raise _raise(positions.file, issues)
    return values


def _loc(error: Any) -> FieldPath:
    loc = tuple(x for x in error["loc"] if not (isinstance(x, str) and "[" in x))
    if not loc and "qscore_field" in error.get("ctx", {}):
        loc = tuple(error["ctx"]["qscore_field"])
    return loc


def _code_of(exc: InvalidInput) -> str:
    """The issue code an `InvalidInput` from this module carries (always set by its raisers)."""
    if exc.code is None:
        raise exc
    return exc.code


def _value_issues(
    values: DraftValues, builders: dict[str, Candidate], positions: PositionMap, root: Path
) -> list[IssueModel]:
    issues: list[IssueModel] = []

    def add(code: str, path: FieldPath, message: str, hint: str | None = None) -> None:
        issues.append(_issue(code, positions.locate(path), message, hint))

    for key, entry in values.builders.items():
        candidate = builders.get(key)
        if candidate is None:
            known = ", ".join(sorted(builders)) or "none"
            add(
                "Q202",
                ("builders", key),
                f"{key!r} matches no discovered builder",
                f"Discovered builders: {known}.",
            )
            continue
        if entry.parameters is not None and not (root / entry.parameters.file).is_file():
            add(
                "Q200",
                ("builders", key, "parameters", "file"),
                f"parameters file not found: {entry.parameters.file}",
                "Paths are relative to the project root.",
            )
        params = {p.name: p for p in candidate.params}
        signature = f"Signature: {candidate.name}({', '.join(params)})."
        for arg, value in entry.args.items():
            if arg in entry.sweep:
                add(
                    "Q103",
                    ("builders", key, "args", arg),
                    f"{arg!r} is given both a value and a sweep",
                    "A sweep sets the argument to its first value; remove one of them.",
                )
            param = params.get(arg)
            if param is None:
                if not candidate.var_kwargs:
                    add(
                        "Q203",
                        ("builders", key, "args", arg),
                        f"{arg!r} is not a parameter of {candidate.name}",
                        signature,
                    )
                continue
            problem = _type_problem(value, param.annotation)
            if problem is not None:
                add("Q102", ("builders", key, "args", arg), f"{arg}: {problem}")
        for arg, spec in entry.sweep.items():
            param = params.get(arg)
            if param is None and not candidate.var_kwargs:
                add(
                    "Q204",
                    ("builders", key, "sweep", arg),
                    f"sweep argument {arg!r} is not a parameter of {candidate.name}",
                    signature,
                )
                continue
            if param is not None and not _range_allowed(param):
                add(
                    "Q103",
                    ("builders", key, "sweep", arg),
                    f"ranges are for int arguments only; {arg} is {param.annotation}",
                )
                continue
            try:
                parse_range(spec)
            except InvalidInput as exc:
                add(_code_of(exc), ("builders", key, "sweep", arg), str(exc))
    return issues


# ---------------------------------------------------------------- resolution


def _answer(text: str, param: Param, where: str) -> object | list[int]:
    """A typed answer: a YAML scalar, or a range (returned as a list of ints)."""
    if param.annotation != "str" and _RANGE.match(text):
        return _range_for(param, text, where)
    try:
        value: object = YAML(typ="safe", pure=True).load(text)
    except YAMLError as exc:
        raise _fail(
            "Q103", PROMPT_FILE, f"{where}: {text!r} is not a YAML value", None, where
        ) from exc
    if isinstance(value, list):
        return _range_for(param, value, where)
    if value is not None and not isinstance(value, (bool, int, float, str)):
        raise _fail(
            "Q102",
            PROMPT_FILE,
            f"{where}: a value must be a scalar (bool, int, float, str or null), "
            f"got {type(value).__name__}",
            None,
            where,
        )
    return value


def _range_for(param: Param, spec: str | list[object], where: str) -> list[int]:
    if not _range_allowed(param):
        raise _fail(
            "Q103",
            PROMPT_FILE,
            f"{where}: ranges are for int arguments only; {param.name} is {param.annotation}",
            None,
            where,
        )
    try:
        return parse_range(spec)
    except InvalidInput as exc:
        raise _fail(_code_of(exc), PROMPT_FILE, f"{where}: {exc}", None, where) from exc


def _checked(value: object, param: Param, file: str, where: str) -> object:
    problem = _type_problem(value, param.annotation)
    if problem is not None:
        raise _fail("Q102", file, f"{where}: {problem}", "Values are never coerced.", where)
    return value


def resolve_args(
    candidate: Candidate,
    values: DraftValues | None,
    prompt: Prompt | None,
    *,
    no_input: bool = False,
) -> ResolvedArgs:
    """Fill each argument of a builder candidate (05 §2). A range becomes the item's sweep with
    the argument set to its first value; a second range for the same item is Q103. A QASM file
    or a circuit variable (ChP-0037) has no arguments."""
    if candidate.source_kind == "qasm" or candidate.signal == "module_variable":
        return ResolvedArgs()
    if prompt is None and not no_input:
        raise ValueError("resolve_args needs a prompt callable unless no_input is set")
    entry = values.builders.get(candidate.reference) if values is not None else None
    args: dict[str, ResolvedValue] = {}
    sweep: ResolvedSweep | None = None

    def set_sweep(arg: str, numbers: list[int], origin: str, file: str) -> None:
        nonlocal sweep
        if sweep is not None:
            raise _fail(
                "Q103",
                file,
                f"{candidate.reference}: a second sweep ({arg}) after {sweep.arg}",
                "At most one argument per item may have a range.",
                arg,
            )
        sweep = ResolvedSweep(arg, tuple(numbers), origin)
        args[arg] = ResolvedValue(numbers[0], f"{origin} (first value of the sweep)")

    for param in candidate.params:
        where = f"{candidate.reference}.{param.name}"
        if entry is not None and param.name in entry.sweep:
            numbers = parse_range(entry.sweep[param.name])
            set_sweep(param.name, numbers, "values file", "values file")
            continue
        if entry is not None and param.name in entry.args:
            value = _checked(entry.args[param.name], param, "values file", where)
            args[param.name] = ResolvedValue(value, "values file")
            continue
        if param.has_default:
            if param.default_is_literal:
                args[param.name] = ResolvedValue(param.default, "default")
            continue  # a non-literal default stays in the function
        if not no_input and prompt is not None:  # prompt is required unless no_input (above)
            text = prompt(_value_prompt(candidate, param)).strip()
            if text:
                answer = _answer(text, param, where)
                if isinstance(answer, list):
                    set_sweep(param.name, answer, "entered", PROMPT_FILE)
                else:
                    args[param.name] = ResolvedValue(
                        _checked(answer, param, PROMPT_FILE, where), "entered"
                    )
                continue
        elif no_input:
            suggestions = candidate.suggestions.get(param.name, ())
            if suggestions:
                first = suggestions[0]
                value = _checked(first.value, param, first.file, where)
                args[param.name] = ResolvedValue(value, f"suggested from {first.where}")
                continue
        args[param.name] = ResolvedValue(REQUIRED_PLACEHOLDER, "required")
    if entry is not None and candidate.var_kwargs:
        known = {p.name for p in candidate.params}
        for arg, value in entry.args.items():
            if arg not in known:
                args[arg] = ResolvedValue(value, "values file")
        for arg, spec in entry.sweep.items():
            if arg not in known:
                set_sweep(arg, parse_range(spec), "values file", "values file")
    parameters = entry.parameters.file if entry is not None and entry.parameters else None
    return ResolvedArgs(args, sweep, parameters)


def _value_prompt(candidate: Candidate, param: Param) -> PromptSpec:
    kind = f": {param.annotation}" if param.annotation else ""
    return PromptSpec(
        kind="value",
        message=f"{candidate.reference}: value for {param.name}{kind} "
        "(a value, a range a..b or a..b..s, or a list; empty to leave <required>)",
        candidate=candidate.reference,
        arg=param.name,
        annotation=param.annotation,
        size_like=param.name in candidate.size_like,
        suggestions=candidate.suggestions.get(param.name, ()),
    )


# ---------------------------------------------------------------- picking


def pick_candidates(
    candidates: Sequence[Candidate],
    pick: str | None,
    prompt: Prompt | None,
    *,
    no_input: bool = False,
) -> list[Candidate]:
    """The candidates named by `--pick` (`1,3` by list number, or function names / references),
    or by the interactive prompt."""
    if pick is None:
        if no_input:
            raise _fail(
                "Q104", PICK_FILE, "no candidates picked", "Pass --pick 1,3 or --pick <name>."
            )
        if prompt is None:
            raise ValueError("pick_candidates needs a prompt callable unless no_input is set")
        pick = prompt(
            PromptSpec(
                kind="pick",
                message="Pick candidates to draft (numbers or names, comma-separated)",
                choices=tuple(f"{c.index}. {c.reference}" for c in candidates),
            )
        )
    tokens = [t.strip() for t in pick.split(",") if t.strip()]
    if not tokens:
        raise _fail("Q103", PICK_FILE, f"empty pick {pick!r}", "Pass --pick 1,3 or names.")
    issues: list[IssueModel] = []
    chosen: list[Candidate] = []
    for token in tokens:
        matches = _match(candidates, token)
        if not matches:
            code = "Q103" if token.isdigit() else "Q202"
            issues.append(
                _issue(code, Location(file=PICK_FILE, field=token), f"no candidate {token!r}")
            )
        elif len(matches) > 1:
            listed = ", ".join(f"{c.index}" for c in matches)
            issues.append(
                _issue(
                    "Q103",
                    Location(file=PICK_FILE, field=token),
                    f"{token!r} matches several candidates ({listed})",
                    "Pick by number or by path::function.",
                )
            )
        elif matches[0] not in chosen:
            chosen.append(matches[0])
    if issues:
        raise _raise(PICK_FILE, issues)
    return chosen


def _match(candidates: Sequence[Candidate], token: str) -> list[Candidate]:
    if token.isdigit():
        return [c for c in candidates if c.index == int(token)]
    return [c for c in candidates if token in (c.name, c.reference)]


# ---------------------------------------------------------------- YAML output


def item_id(candidate: Candidate, *, with_stem: bool = False) -> str:
    """Function name for builders (`<file stem>_<name>` with `with_stem`), file stem for QASM;
    lower-cased to the id pattern."""
    stem = Path(candidate.path).stem
    base = (
        stem
        if candidate.name is None
        else f"{stem}_{candidate.name}"
        if with_stem
        else candidate.name
    )
    text = re.sub(r"[^a-z0-9_\-]", "_", base.lower())
    if not re.match(ITEM_ID_PATTERN, text[:64]):
        text = "_" + text
    return text[:64]


def _unique(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    n = 2
    while f"{base[:60]}_{n}" in taken:
        n += 1
    return f"{base[:60]}_{n}"


def draft_item(candidate: Candidate, resolved: ResolvedArgs, id_: str) -> CommentedMap:
    """One manifest item, each drafted value commented with where it came from."""
    item = CommentedMap()
    item["id"] = id_
    source = CommentedMap()
    if candidate.source_kind == "qasm":
        source["qasm"] = candidate.path
    else:
        source["builder"] = candidate.reference
        if candidate.default_line is not None:
            source["line"] = candidate.default_line
            source.yaml_add_eol_comment(LINE_COMMENT.format(line=candidate.default_line), "line")
        args = CommentedMap()
        for name, value in resolved.args.items():
            args[name] = value.value
            args.yaml_add_eol_comment(value.origin, name)
        if args:
            source["args"] = args
        if resolved.parameters is not None:
            parameters = CommentedMap()
            parameters["file"] = resolved.parameters
            parameters.fa.set_flow_style()
            source["parameters"] = parameters
            source.yaml_add_eol_comment("values file", "parameters")
    item["source"] = source
    if resolved.sweep is not None:
        sweep = CommentedMap()
        sweep["arg"] = resolved.sweep.arg
        numbers = CommentedSeq(resolved.sweep.values)
        numbers.fa.set_flow_style()
        sweep["values"] = numbers
        sweep.yaml_add_eol_comment(resolved.sweep.origin, "values")
        item["size_sweep"] = sweep
    elif candidate.size_like:
        item.yaml_add_eol_comment(
            f"size-like arguments (suggested sweeps): {', '.join(candidate.size_like)}", "id"
        )
    invariants = CommentedMap()
    invariants["intent"] = "exact_unitary"
    invariants.yaml_add_eol_comment("default", "intent")
    item["invariants"] = invariants
    return item


def draft_items(
    candidates: Sequence[Candidate],
    values: DraftValues | None,
    prompt: Prompt | None,
    *,
    no_input: bool = False,
    taken: Sequence[str] = (),
) -> list[CommentedMap]:
    """Draft every picked candidate; ids are de-duplicated in list order against `taken`.
    Builders whose function name a picked candidate in another file shares get the file stem
    as a prefix (`ghz.py::create_circuit` → `ghz_create_circuit`), so ids name their file."""
    used = set(taken)
    items: list[CommentedMap] = []
    names = Counter(n for n, _ in {(c.name, c.path) for c in candidates if c.name is not None})
    for candidate in candidates:
        resolved = resolve_args(candidate, values, prompt, no_input=no_input)
        shared = candidate.name is not None and names[candidate.name] > 1
        id_ = _unique(item_id(candidate, with_stem=shared), used)
        used.add(id_)
        items.append(draft_item(candidate, resolved, id_))
    return items


def new_manifest(project_name: str) -> CommentedMap:
    """A minimal `qscore.yaml` to draft into when none exists."""
    doc = CommentedMap()
    doc["schema"] = PROJECT_SCHEMA
    project = CommentedMap()
    project["name"] = project_name
    project["root"] = "."
    doc["project"] = project
    doc["circuits"] = CommentedSeq()
    return doc


def _source_key(item: object) -> str | None:
    """The item's source reference; with a `line` (ChP-0037) `<builder>@<line>`, since two
    lines of one file are two different circuits."""
    source = item.get("source") if isinstance(item, dict) else None
    if not isinstance(source, dict):
        return None
    key = source.get("builder", source.get("qasm"))
    if not isinstance(key, str):
        return None
    line = source.get("line")
    return key if line is None else f"{key}@{line}"


def merge_into(
    manifest: CommentedMap, items: Sequence[CommentedMap]
) -> tuple[list[str], list[Skipped]]:
    """Append drafted items to `manifest["circuits"]`. Returns the ids added and the drafted
    items skipped, with the reason. An item whose source is already listed is skipped (the
    user's entry is kept as written); an id taken by another item gets a numeric suffix.
    Existing entries are never changed."""
    circuits = manifest.get("circuits")
    if circuits is None:
        circuits = CommentedSeq()
        manifest["circuits"] = circuits
    if not isinstance(circuits, list):
        raise _fail("Q102", "qscore.yaml", "circuits must be a list", None, "circuits")
    listed: dict[str | None, object] = {}
    for circuit in circuits:
        listed.setdefault(
            _source_key(circuit), circuit.get("id") if isinstance(circuit, dict) else None
        )
    ids = {c.get("id") for c in circuits if isinstance(c, dict)}
    added: list[str] = []
    skipped: list[Skipped] = []
    for item in items:
        key = _source_key(item)
        if key in listed:
            skipped.append(
                Skipped(
                    str(key),
                    f"source already listed as item {listed[key]!r}; the existing entry is kept",
                )
            )
            continue
        id_ = _unique(str(item["id"]), {i for i in ids if isinstance(i, str)})
        if id_ != item["id"]:
            item["id"] = id_
        circuits.append(item)
        listed[key] = id_
        ids.add(id_)
        added.append(id_)
    return added, skipped


def dump(doc: CommentedMap) -> str:
    stream = io.StringIO()
    yaml = YAML(typ="rt")
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.dump(doc, stream)
    return stream.getvalue()


def placeholders(path: Path) -> list[Location]:
    """Every `<required>` left in a written draft, located, so the researcher sees each one
    before scoring refuses it with Q107 (05 §2)."""
    data, positions = load_yaml(path)
    found: list[FieldPath] = []

    def walk(node: object, at: FieldPath) -> None:
        if node == REQUIRED_PLACEHOLDER:
            found.append(at)
        elif isinstance(node, dict):
            for key, value in node.items():
                walk(value, (*at, str(key)))
        elif isinstance(node, list):
            for i, value in enumerate(node):
                walk(value, (*at, i))

    walk(data, ())
    return [positions.locate(at) for at in found]


def draft_target(manifest_path: Path) -> Path:
    """`qscore.yaml.draft` when a manifest exists, else `qscore.yaml` (05 §2, §11)."""
    if manifest_path.exists():
        return manifest_path.with_name(manifest_path.name + ".draft")
    return manifest_path


def diff(old: str, new: str, name: str = "qscore.yaml") -> str:
    """The unified diff shown before saving (05 §2)."""
    return "".join(
        difflib.unified_diff(
            old.splitlines(keepends=True), new.splitlines(keepends=True), name, name + ".draft"
        )
    )
