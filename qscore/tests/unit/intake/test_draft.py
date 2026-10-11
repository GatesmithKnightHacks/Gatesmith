"""Deterministic drafting: picks, values file, ranges, resolution order (specs/05-pipeline.md §2,
04-contracts.md §14, ChP-0029)."""

from __future__ import annotations

import dataclasses
import shutil
from pathlib import Path

import pytest
from ruamel.yaml import YAML

from qscore.config import Settings
from qscore.errors import InvalidInput
from qscore.intake.discover import Candidate, discover
from qscore.intake.draft import (
    PromptSpec,
    ResolvedValue,
    Skipped,
    diff,
    draft_items,
    draft_target,
    dump,
    load_values,
    merge_into,
    new_manifest,
    parse_range,
    pick_candidates,
    resolve_args,
)
from qscore.schemas.values import DraftValues
from qscore.validate.pipeline import run_validation
from qscore.validate.schema_checks import load_manifest_with_positions

FIXTURES = Path(__file__).parent / "fixtures"
REPO = FIXTURES / "repo"
EXAMPLES = Path(__file__).resolve().parents[3] / "examples"


def line_of(path: Path, needle: str) -> int:
    lines = path.read_text(encoding="utf-8").splitlines()
    [line] = [i for i, text in enumerate(lines, start=1) if needle in text]
    return line


@pytest.fixture(scope="module")
def candidates() -> list[Candidate]:
    return discover(REPO)


def get(candidates: list[Candidate], name: str) -> Candidate:
    [c] = [c for c in candidates if c.name == name]
    return c


def values_of(**builders: object) -> DraftValues:
    return DraftValues.model_validate({"schema": "qscore.values/v0.1", "builders": builders})


class Prompts:
    """A scripted prompt: answers by argument name; records every question."""

    def __init__(self, answers: dict[str, str]) -> None:
        self.answers, self.asked = answers, []  # type: list[PromptSpec]

    def __call__(self, spec: PromptSpec) -> str:
        self.asked.append(spec)
        return self.answers[spec.arg or "pick"]


def issue_codes(exc: pytest.ExceptionInfo[InvalidInput]) -> list[str]:
    return [i.code for i in exc.value.report.issues]


# ---------------------------------------------------------------- parse_range


@pytest.mark.parametrize(
    ("spec", "expected"),
    [
        ("2..6", [2, 3, 4, 5, 6]),
        ("2..10..2", [2, 4, 6, 8, 10]),
        (" -1 .. 1 ", [-1, 0, 1]),
        ("4..4", [4]),
        ([3, 5, 9], [3, 5, 9]),
    ],
)
def test_parse_range(spec: str | list[int], expected: list[int]) -> None:
    assert parse_range(spec) == expected


@pytest.mark.parametrize(
    "spec", ["2..", "..6", "2-6", "a..b", "2.5..6", "2...6", "6..2", "2..6..0", "2..6..-1", ""]
)
def test_parse_range_bad_strings_are_q103(spec: str) -> None:
    with pytest.raises(InvalidInput) as exc:
        parse_range(spec)
    assert exc.value.code == "Q103"


@pytest.mark.parametrize(("spec", "code"), [(["3"], "Q102"), ([2.5], "Q102"), ([True], "Q102")])
def test_parse_range_non_int_lists_are_q102(spec: list[object], code: str) -> None:
    with pytest.raises(InvalidInput) as exc:
        parse_range(spec)
    assert exc.value.code == code


def test_parse_range_empty_list_is_q103() -> None:
    with pytest.raises(InvalidInput) as exc:
        parse_range([])
    assert exc.value.code == "Q103"


# ---------------------------------------------------------------- values file


def test_values_file_fixture_loads(candidates: list[Candidate]) -> None:
    values = load_values(FIXTURES / "values.yaml", candidates, REPO)
    assert values.builders["builders.py::annotated"].sweep == {"n": "2..4"}
    assert values.builders["builders.py::returned"].args == {"num_qubits": 3, "theta": 0.25}


VALUES_ISSUES = [
    # (body, code, line, column)
    ("schema: [\n", "Q100", 2, 1),
    ("schema: qscore.values/v0.1\nextra: 1\n", "Q101", 2, 1),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n    argz: {n: 2}\n",
        "Q101",
        4,
        5,
    ),
    ("schema: qscore.values/v0.2\n", "Q106", 1, 1),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n    args: {n: [1, 2]}\n",
        "Q102",
        4,
        12,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n    args: {label: 3}\n",
        "Q102",
        4,
        12,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        "    sweep: {n: [2, x]}\n",
        "Q102",
        4,
        13,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        '    sweep: {n: "2...6"}\n',
        "Q103",
        4,
        13,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        '    sweep: {n: "2..6", depth: "1..3"}\n',
        "Q103",
        4,
        5,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::returned:\n"
        '    sweep: {theta: "1..3"}\n',
        "Q103",
        4,
        13,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        '    args: {n: 3}\n    sweep: {n: "2..6"}\n',
        "Q103",
        4,
        12,
    ),
    ("schema: qscore.values/v0.1\nbuilders:\n  builders.py::nope:\n    args: {}\n", "Q202", 3, 3),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        "    parameters: {file: oracle.qasm, extra: 1}\n",
        "Q101",
        4,
        37,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        "    parameters: {file: params/missing.json}\n",
        "Q200",
        4,
        18,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::BELL:\n    args: {n: 3}\n",
        "Q202",
        3,
        3,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n    args: {m: 3}\n",
        "Q203",
        4,
        12,
    ),
    (
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        '    sweep: {m: "1..3"}\n',
        "Q204",
        4,
        13,
    ),
]


@pytest.mark.parametrize(("body", "code", "line", "column"), VALUES_ISSUES)
def test_values_file_issues_are_located(
    tmp_path: Path, candidates: list[Candidate], body: str, code: str, line: int, column: int
) -> None:
    path = tmp_path / "values.yaml"
    path.write_text(body, encoding="utf-8")
    with pytest.raises(InvalidInput) as exc:
        load_values(path, candidates, REPO)
    [issue] = exc.value.report.issues
    assert issue.code == code
    assert (issue.location.file, issue.location.line, issue.location.column) == (
        "values.yaml",
        line,
        column,
    )


def test_values_file_reports_every_issue_at_once(
    tmp_path: Path, candidates: list[Candidate]
) -> None:
    path = tmp_path / "values.yaml"
    path.write_text(
        "schema: qscore.values/v0.1\nbuilders:\n"
        "  builders.py::nope: {}\n"
        "  builders.py::annotated:\n    args: {m: 1}\n    sweep: {q: 1..2}\n",
        encoding="utf-8",
    )
    with pytest.raises(InvalidInput) as exc:
        load_values(path, candidates, REPO)
    assert issue_codes(exc) == ["Q202", "Q203", "Q204"]


def test_values_file_missing_is_q200(tmp_path: Path, candidates: list[Candidate]) -> None:
    with pytest.raises(InvalidInput) as exc:
        load_values(tmp_path / "none.yaml", candidates, REPO)
    assert exc.value.code == "Q200"


# ---------------------------------------------------------------- resolution order


def test_resolution_order_default_values_prompt(candidates: list[Candidate]) -> None:
    annotated = get(candidates, "annotated")
    prompt = Prompts({"n": "5"})
    resolved = resolve_args(annotated, values_of(**{}), prompt)
    assert resolved.args == {
        "n": ResolvedValue(5, "entered"),
        "depth": ResolvedValue(3, "default"),
        "label": ResolvedValue("x", "default"),
    }
    assert [s.arg for s in prompt.asked] == ["n"]  # defaults are never asked
    spec = prompt.asked[0]
    assert spec.kind == "value" and spec.annotation == "int" and spec.size_like
    assert [s.value for s in spec.suggestions] == [2, 5]  # shown, not applied
    with_file = resolve_args(
        annotated,
        values_of(**{"builders.py::annotated": {"args": {"n": 4, "label": "y"}}}),
        Prompts({}),
    )
    assert with_file.args == {
        "n": ResolvedValue(4, "values file"),  # values file before the prompt: nothing asked
        "depth": ResolvedValue(3, "default"),
        "label": ResolvedValue("y", "values file"),
    }


def test_no_input_uses_first_suggestion_then_required(candidates: list[Candidate]) -> None:
    source = REPO / "builders.py"
    annotated = resolve_args(get(candidates, "annotated"), None, None, no_input=True)
    line = line_of(source, "MODULE_CALL = ")
    assert annotated.args["n"] == ResolvedValue(2, f"suggested from builders.py:{line}")
    returned = resolve_args(get(candidates, "returned"), None, None, no_input=True)
    line = line_of(source, "returned(-3, ")
    assert returned.args == {
        "num_qubits": ResolvedValue(-3, f"suggested from builders.py:{line}"),
        "theta": ResolvedValue(-0.5, "default"),
        "flag": ResolvedValue(True, "default"),
    }  # `seed=BELL` is not a literal: left to the function
    qft = resolve_args(get(candidates, "qft_builder"), None, None, no_input=True)
    assert qft.args == {"n_qubits": ResolvedValue("<required>", "required")}


def test_prompt_never_used_with_no_input(candidates: list[Candidate]) -> None:
    def refuse(spec: PromptSpec) -> str:
        raise AssertionError(f"prompted for {spec.arg}")

    resolved = resolve_args(get(candidates, "library"), None, refuse, no_input=True)
    assert resolved.args["reps"] == ResolvedValue("<required>", "required")


def test_suggestions_only_with_no_input(candidates: list[Candidate]) -> None:
    resolved = resolve_args(get(candidates, "direct"), None, Prompts({"size": ""}))
    assert resolved.args == {"size": ResolvedValue("<required>", "required")}


def test_prompt_needed_unless_no_input(candidates: list[Candidate]) -> None:
    with pytest.raises(ValueError, match="prompt"):
        resolve_args(get(candidates, "direct"), None, None)


def test_range_from_values_file_becomes_sweep(candidates: list[Candidate]) -> None:
    values = load_values(FIXTURES / "values.yaml", candidates, REPO)
    resolved = resolve_args(get(candidates, "annotated"), values, Prompts({}))
    assert resolved.sweep is not None
    assert (resolved.sweep.arg, resolved.sweep.values) == ("n", (2, 3, 4))
    assert resolved.args["n"] == ResolvedValue(2, "values file (first value of the sweep)")
    assert resolved.args["label"] == ResolvedValue("from-file", "values file")


@pytest.mark.parametrize("answer", ["3..5", "[3, 4, 5]"])
def test_range_entered_at_prompt(candidates: list[Candidate], answer: str) -> None:
    resolved = resolve_args(get(candidates, "direct"), None, Prompts({"size": answer}))
    assert resolved.sweep is not None and resolved.sweep.values == (3, 4, 5)
    assert resolved.sweep.origin == "entered"
    assert resolved.args["size"] == ResolvedValue(3, "entered (first value of the sweep)")


def test_second_sweep_is_q103(tmp_path: Path) -> None:
    (tmp_path / "two.py").write_text(
        "from qiskit import QuantumCircuit\n\n\ndef two(n, m) -> QuantumCircuit:\n"
        "    return QuantumCircuit(n + m)\n",
        encoding="utf-8",
    )
    [candidate] = discover(tmp_path)
    with pytest.raises(InvalidInput) as exc:
        resolve_args(candidate, None, Prompts({"n": "1..2", "m": "3..4"}))
    assert exc.value.code == "Q103"
    values = values_of(**{"two.py::two": {"sweep": {"n": "1..2"}}})
    with pytest.raises(InvalidInput) as exc:
        resolve_args(candidate, values, Prompts({"m": "[5, 6]"}))
    assert exc.value.code == "Q103"


@pytest.mark.parametrize(
    ("name", "answer", "code"),
    [
        ("annotated", "abc", "Q102"),  # str for int n
        ("annotated", "true", "Q102"),  # bool is not int
        ("annotated", "1..b", "Q102"),  # not a range, so the string '1..b' for int n
        ("returned", "{a: 1}", "Q102"),  # not a scalar
        ("returned", "[1, x", "Q103"),  # not YAML
        ("returned", "[1, x]", "Q102"),  # a list that is not all ints
    ],
)
def test_prompt_type_checks(candidates: list[Candidate], name: str, answer: str, code: str) -> None:
    arg = "n" if name == "annotated" else "num_qubits"
    with pytest.raises(InvalidInput) as exc:
        resolve_args(get(candidates, name), None, Prompts({arg: answer}))
    assert exc.value.code == code


def test_values_file_type_mismatch_is_q102_never_coerced(candidates: list[Candidate]) -> None:
    values = values_of(**{"builders.py::returned": {"args": {"num_qubits": 2, "flag": "yes"}}})
    with pytest.raises(InvalidInput) as exc:
        resolve_args(get(candidates, "returned"), values, Prompts({}))
    assert exc.value.code == "Q102"
    ok = values_of(**{"builders.py::returned": {"args": {"num_qubits": 2, "theta": 1}}})
    resolved = resolve_args(get(candidates, "returned"), ok, Prompts({}))
    assert resolved.args["theta"] == ResolvedValue(1, "values file")  # an int is a float


def test_range_for_non_int_argument_is_q103(tmp_path: Path) -> None:
    (tmp_path / "f.py").write_text(
        "from qiskit import QuantumCircuit\n\n\ndef f(theta: float) -> QuantumCircuit:\n"
        "    return QuantumCircuit(1)\n",
        encoding="utf-8",
    )
    [candidate] = discover(tmp_path)
    with pytest.raises(InvalidInput) as exc:
        resolve_args(candidate, None, Prompts({"theta": "1..3"}))
    assert exc.value.code == "Q103"


def test_notebook_and_module_variable_are_drafted_with_line(candidates: list[Candidate]) -> None:
    # ChP-0037 replaces the old Q103 refusal: a notebook function resolves its args as usual,
    # a module-level circuit variable gets none; both carry a default `line` (draft_item).
    ghz = resolve_args(get(candidates, "ghz"), None, None, no_input=True)
    assert ghz.args == {"n": ResolvedValue(3, "suggested from notebook.ipynb:10")}
    assert resolve_args(get(candidates, "BELL"), None, None, no_input=True).args == {}
    assert get(candidates, "ghz").default_line == 10
    assert get(candidates, "BELL").default_line == get(candidates, "BELL").line


# ---------------------------------------------------------------- picking


def test_pick_by_number_and_name(candidates: list[Candidate]) -> None:
    picked = pick_candidates(candidates, "2, returned,builders.py::direct,2", None, no_input=True)
    assert [c.name for c in picked] == ["annotated", "returned", "direct"]
    prompt = Prompts({"pick": "8"})
    assert [c.reference for c in pick_candidates(candidates, None, prompt)] == ["oracle.qasm"]
    assert prompt.asked[0].kind == "pick" and len(prompt.asked[0].choices) == len(candidates)


@pytest.mark.parametrize(
    ("pick", "codes"),
    [("99", ["Q103"]), ("nope", ["Q202"]), (" , ", ["Q103"]), ("99,x", None)],
)
def test_bad_picks(candidates: list[Candidate], pick: str, codes: list[str] | None) -> None:
    with pytest.raises(InvalidInput) as exc:
        pick_candidates(candidates, pick, None, no_input=True)
    assert issue_codes(exc) == (codes or ["Q103", "Q202"])


def test_pick_required_with_no_input(candidates: list[Candidate]) -> None:
    with pytest.raises(InvalidInput) as exc:
        pick_candidates(candidates, None, None, no_input=True)
    assert exc.value.code == "Q104"


def test_ambiguous_name_needs_number(tmp_path: Path) -> None:
    body = "from qiskit import QuantumCircuit\n\n\ndef b() -> QuantumCircuit:\n"
    body += "    return QuantumCircuit(1)\n"
    (tmp_path / "x.py").write_text(body)
    (tmp_path / "y.py").write_text(body)
    found = discover(tmp_path)
    with pytest.raises(InvalidInput) as exc:
        pick_candidates(found, "b", None, no_input=True)
    assert exc.value.code == "Q103"
    items = draft_items(found, None, None, no_input=True)
    # The same name in two files: ids carry the file stem (lead, class B, 2026-10-10).
    assert [i["id"] for i in items] == ["x_b", "y_b"]


# ---------------------------------------------------------------- YAML output


def test_draft_comments_say_where_values_came_from(candidates: list[Candidate]) -> None:
    picked = pick_candidates(candidates, "annotated,returned,qft_builder,oracle.qasm", None)
    values = values_of(**{"builders.py::annotated": {"args": {"label": "z"}}})
    text = dump_items(draft_items(picked, values, None, no_input=True))
    main = line_of(REPO / "builders.py", "returned(-3, ")
    module = line_of(REPO / "builders.py", "MODULE_CALL = ")
    for expected in (
        f"n: 2  # suggested from builders.py:{module}",
        "depth: 3  # default",
        "label: z  # values file",
        f"num_qubits: -3  # suggested from builders.py:{main}",
        "theta: -0.5  # default",
        "n_qubits: <required>  # required",
        "id: qft_builder  # size-like arguments (suggested sweeps): n_qubits",
        "qasm: oracle.qasm",
        "intent: exact_unitary  # default",
    ):
        assert expected in normalized(text), expected


def test_drafted_sweep_written(candidates: list[Candidate]) -> None:
    values = load_values(FIXTURES / "values.yaml", candidates, REPO)
    [item] = draft_items([get(candidates, "annotated")], values, None, no_input=True)
    text = normalized(dump_items([item]))
    assert "n: 2  # values file (first value of the sweep)" in text
    assert "values: [2, 3, 4]  # values file" in text
    assert "arg: n" in text


def dump_items(items: list) -> str:  # type: ignore[type-arg]
    doc = new_manifest("demo")
    merge_into(doc, items)
    return dump(doc)


def normalized(text: str) -> str:
    """Collapse the padding ruamel puts before end-of-line comments."""
    return "\n".join(" ".join(line.split()).replace(" #", "  #") for line in text.splitlines())


def test_merge_never_overwrites_user_edits(tmp_path: Path, candidates: list[Candidate]) -> None:
    path = tmp_path / "qscore.yaml"
    path.write_text(
        "schema: qscore.project/v0.2\nproject: {name: demo}\ncircuits:\n"
        "  - id: annotated   # my own entry\n"
        "    source: {builder: builders.py::annotated, args: {n: 9}}\n"
        "  - id: returned\n    source: {qasm: other.qasm}\n",
        encoding="utf-8",
    )
    doc = YAML(typ="rt").load(path.read_text(encoding="utf-8"))
    before = dump(doc)
    picked = pick_candidates(candidates, "annotated,returned", None)
    added, skipped = merge_into(doc, draft_items(picked, None, None, no_input=True))
    assert added == ["returned_2"]
    assert skipped == [
        Skipped(
            "builders.py::annotated",
            "source already listed as item 'annotated'; the existing entry is kept",
        )
    ]
    after = dump(doc)
    assert after.startswith(before)  # appended only
    assert "id: annotated   # my own entry" in after
    assert "args: {n: 9}" in after
    assert "builder: builders.py::returned" in after
    assert "+  - id: returned_2" in diff(before, after)
    assert draft_target(path) == tmp_path / "qscore.yaml.draft"
    assert draft_target(tmp_path / "new.yaml") == tmp_path / "new.yaml"


# ---------------------------------------------------------------- the examples


def draft_example(tmp_path: Path, example: str, pick: str, values_text: str) -> Path:
    root = tmp_path / example
    shutil.copytree(EXAMPLES / example, root)
    (root / "qscore.yaml").unlink()
    (tmp_path / "values.yaml").write_text(values_text, encoding="utf-8")
    found = discover(root)
    values = load_values(tmp_path / "values.yaml", found, root)
    picked = pick_candidates(found, pick, None, no_input=True)
    doc = new_manifest(example)
    merge_into(doc, draft_items(picked, values, None, no_input=True))
    path = draft_target(root / "qscore.yaml")
    path.write_text(dump(doc), encoding="utf-8")
    return path


def hand_written(example: str) -> dict:  # type: ignore[type-arg]
    data = YAML(typ="safe").load((EXAMPLES / example / "qscore.yaml").read_text())
    return data["circuits"][0]  # type: ignore[no-any-return]


def test_sidechain_draft_matches_hand_written_args_and_sweep(tmp_path: Path) -> None:
    values = (FIXTURES / "sidechain_values.yaml").read_text(encoding="utf-8")
    path = draft_example(tmp_path, "sidechain_qaoa", "build_qaoa", values)
    text = normalized(path.read_text(encoding="utf-8"))
    assert "parameters: {file: params/qaoa_p2.json}  # values file" in text
    manifest, positions = load_manifest_with_positions(path)  # stage 3: schema
    [item] = manifest.circuits
    expected = hand_written("sidechain_qaoa")
    assert item.size_sweep is not None
    assert item.size_sweep.model_dump() == expected["size_sweep"]
    source = item.source.model_dump()
    assert source["parameters"] == expected["source"]["parameters"]
    args = source["args"]
    assert {k: args[k] for k in ("rotamers", "p")} == {"rotamers": 3, "p": 2}
    assert args["n_residues"] == 2  # a range sets the argument to its first value (05 §2)
    # Stages 3-4 pass in full: references, sandboxed build, bound angles, semantic checks.
    [(resolved, loaded)] = run_validation(manifest, path.parent, Settings(), path.name, positions)
    assert resolved.item.id == "build_qaoa"
    assert loaded.circuit.num_qubits == 2 * 3
    assert not loaded.circuit.parameters


def test_sbox_draft_validates(tmp_path: Path) -> None:
    path = draft_example(tmp_path, "sbox_oracle", "1", "schema: qscore.values/v0.1\nbuilders: {}\n")
    manifest, positions = load_manifest_with_positions(path)
    [item] = manifest.circuits
    assert item.source.model_dump() == hand_written("sbox_oracle")["source"]
    assert "args" not in hand_written("sbox_oracle")["source"]
    [(resolved, loaded)] = run_validation(manifest, path.parent, Settings(), path.name, positions)
    assert resolved.item.id == "sbox_layer_4x"
    assert loaded.circuit.num_qubits == 20


@pytest.mark.parametrize("answer", ["{bad: 1}", "!!set {bad: null}", "2026-10-10"])
def test_unannotated_prompt_rejects_non_scalar_values(tmp_path: Path, answer: str) -> None:
    (tmp_path / "builder.py").write_text(
        "def build(n) -> QuantumCircuit:\n    return QuantumCircuit(n)\n"
    )
    [candidate] = discover(tmp_path)
    with pytest.raises(InvalidInput) as exc:
        resolve_args(candidate, None, Prompts({"n": answer}))
    assert issue_codes(exc) == ["Q102"]


@pytest.mark.parametrize(("key", "code"), [("file", "Q200"), ("typo", "Q101")])
def test_parameters_file_errors_are_located(
    tmp_path: Path, candidates: list[Candidate], key: str, code: str
) -> None:
    path = tmp_path / "values.yaml"
    path.write_text(
        "schema: qscore.values/v0.1\nbuilders:\n  builders.py::annotated:\n"
        f"    parameters: {{{key}: absent.json}}\n"
    )
    with pytest.raises(InvalidInput) as exc:
        load_values(path, candidates, tmp_path)
    matches = [i for i in exc.value.report.issues if i.code == code]
    assert matches
    assert all(i.location.line == 4 and i.location.column for i in matches)


@pytest.mark.parametrize(
    ("annotation", "bad"), [("int", "wrong"), ("float", "wrong"), ("bool", 1), ("str", 1)]
)
def test_quoted_builtin_annotations_are_checked(
    tmp_path: Path, annotation: str, bad: object
) -> None:
    (tmp_path / "b.py").write_text(
        f'def build(n: "{annotation}") -> QuantumCircuit:\n    return QuantumCircuit(1)\n'
    )
    [candidate] = discover(tmp_path)
    path = tmp_path / "values.yaml"
    path.write_text(
        f"schema: qscore.values/v0.1\nbuilders:\n  b.py::build:\n    args: {{n: {bad}}}\n"
    )
    with pytest.raises(InvalidInput) as exc:
        load_values(path, [candidate], tmp_path)
    [issue] = exc.value.report.issues
    assert issue.code == "Q102"
    assert (issue.location.file, issue.location.line, issue.location.column) == (
        "values.yaml",
        4,
        12,
    )


def test_quoted_int_annotation_accepts_values_and_prompt_sweeps(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text(
        'def build(n: "int") -> QuantumCircuit:\n    return QuantumCircuit(n)\n'
    )
    [candidate] = discover(tmp_path)
    path = tmp_path / "values.yaml"
    path.write_text("schema: qscore.values/v0.1\nbuilders:\n  b.py::build:\n    sweep: {n: 2..4}\n")
    values = load_values(path, [candidate], tmp_path)
    for resolved in (
        resolve_args(candidate, values, None, no_input=True),
        resolve_args(candidate, None, Prompts({"n": "2..4"})),
    ):
        assert resolved.sweep is not None
        assert resolved.sweep.values == (2, 3, 4)
        assert resolved.args["n"].value == 2


def test_kwargs_value_and_sweep_overlap_is_located(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text(
        "def build(**kwargs) -> QuantumCircuit:\n    return QuantumCircuit(1)\n"
    )
    path = tmp_path / "values.yaml"
    path.write_text(
        "schema: qscore.values/v0.1\nbuilders:\n  b.py::build:\n"
        "    args: {n: 99}\n    sweep: {n: 2..4}\n"
    )
    with pytest.raises(InvalidInput) as exc:
        load_values(path, discover(tmp_path), tmp_path)
    [issue] = exc.value.report.issues
    assert issue.code == "Q103"
    assert (issue.location.file, issue.location.line, issue.location.column) == (
        "values.yaml",
        4,
        12,
    )


def test_excluded_picks_keep_discovery_order(candidates: list[Candidate]) -> None:
    selected = pick_candidates(candidates, "not:2,returned,2", None)
    assert selected == [c for c in candidates if c.index != 2 and c.name != "returned"]


@pytest.mark.parametrize("pick", ["not:", "not:99", "not:missing", "not:1,", "not:,1"])
def test_invalid_exclusions(candidates: list[Candidate], pick: str) -> None:
    with pytest.raises(InvalidInput):
        pick_candidates(candidates, pick, None)


def test_exclusion_cannot_leave_empty_selection(candidates: list[Candidate]) -> None:
    with pytest.raises(InvalidInput) as exc:
        pick_candidates(candidates, "not:" + ",".join(str(c.index) for c in candidates), None)
    assert exc.value.code == "Q103"
    assert "no draftable" in exc.value.report.issues[0].message


def test_ambiguous_exclusion_is_refused(candidates: list[Candidate]) -> None:
    twin = dataclasses.replace(candidates[1], name=candidates[0].name)
    with pytest.raises(InvalidInput) as exc:
        pick_candidates([candidates[0], twin], f"not:{candidates[0].name}", None)
    [issue] = exc.value.report.issues
    assert issue.code == "Q103" and "matches several" in issue.message


@pytest.mark.parametrize("pick", ["1,,2", ",1", "1,"])
def test_positive_pick_rejects_empty_selectors(candidates: list[Candidate], pick: str) -> None:
    with pytest.raises(InvalidInput) as exc:
        pick_candidates(candidates, pick, None)
    assert exc.value.code == "Q103"
