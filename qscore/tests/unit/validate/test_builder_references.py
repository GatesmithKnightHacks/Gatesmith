"""Builder reference pass: Q200 parameters, Q201-Q204, Q301 syntax (05 §3; ast only)."""

import json
from pathlib import Path

import pytest

from qscore.schemas.manifest import CircuitItem
from qscore.validate.reference_checks import reference_issues

BUILDER = "def build(n, p=1, *, scale):\n    return None\n"


def codes(tmp_path: Path, source: dict, sweep: dict | None = None) -> list[tuple[str, str | None]]:
    raw: dict = {"id": "x", "source": source, "target": {"backend": "line-5"}}
    if sweep is not None:
        raw["size_sweep"] = sweep
    item = CircuitItem.model_validate(raw)
    issues = reference_issues(item, tmp_path, "qscore.yaml", 0, {"target": "item"})
    return [(i.code, i.location.field) for i in issues]


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "b.py").write_text(BUILDER, encoding="utf-8")
    (tmp_path / "bad.py").write_text("def build(:\n", encoding="utf-8")
    return tmp_path


def test_valid_builder_has_no_issues(repo: Path) -> None:
    src = {"builder": "b.py::build", "args": {"n": 2, "scale": 1}}
    assert codes(repo, src, {"arg": "n", "values": [2, 3]}) == []


def test_q201_missing_file(repo: Path) -> None:
    assert codes(repo, {"builder": "nope.py::build"}) == [("Q201", "circuits[0].source.builder")]


def test_q202_missing_function(repo: Path) -> None:
    assert codes(repo, {"builder": "b.py::other"}) == [("Q202", "circuits[0].source.builder")]


def test_q203_unknown_and_missing_args(repo: Path) -> None:
    src = {"builder": "b.py::build", "args": {"n": 2, "typo": 1}}
    assert codes(repo, src) == [("Q203", "circuits[0].source.args")]


def test_q204_sweep_arg_not_in_signature(repo: Path) -> None:
    src = {"builder": "b.py::build", "args": {"n": 2, "scale": 1}}
    assert codes(repo, src, {"arg": "size", "values": [2]}) == [
        ("Q204", "circuits[0].size_sweep.arg")
    ]


def test_q301_syntax_error_located_in_builder(repo: Path) -> None:
    raw = {"id": "x", "source": {"builder": "bad.py::build"}, "target": {"backend": "line-5"}}
    (issue,) = reference_issues(CircuitItem.model_validate(raw), repo, "qscore.yaml", 0, {})
    assert (issue.code, issue.location.file, issue.location.line) == ("Q301", "bad.py", 1)


def test_q200_missing_parameters_file(repo: Path) -> None:
    src = {"builder": "b.py::build", "args": {"n": 2, "scale": 1}, "parameters": {"file": "p.json"}}
    assert codes(repo, src) == [("Q200", "circuits[0].source.parameters.file")]


# --- line mode (ChP-0037 §2.2 D1): `name` bound at top level at or before `line` -------------

SCRIPT = """import json as codec
from qiskit import QuantumCircuit as QC
qc = QC(2)
width: int = 3


class Shape:
    pass


def build(n):
    return QC(n)


late = QC(1)
"""


@pytest.fixture
def script(tmp_path: Path) -> Path:
    (tmp_path / "s.py").write_text(SCRIPT, encoding="utf-8")
    nb = {
        "cells": [
            {
                "cell_type": "code",
                "source": ["!pip install qiskit\n", "from qiskit import QuantumCircuit"],
            },
            {"cell_type": "code", "source": ["bell = QuantumCircuit(2)\n", "bell.h(0)"]},
        ]
    }
    (tmp_path / "n.ipynb").write_text(json.dumps(nb), encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize(
    "name,line",
    [("qc", 3), ("width", 4), ("codec", 1), ("QC", 2), ("build", 12), ("late", 15)],
)
def test_line_mode_bound_names(script: Path, name: str, line: int) -> None:
    args = {"n": 2} if name == "build" else {}
    assert codes(script, {"builder": f"s.py::{name}", "line": line, "args": args}) == []


@pytest.mark.parametrize("name,line", [("late", 14), ("Shape", 9), ("nothing", 15), ("qc", 2)])
def test_line_mode_unbound_name_is_q202(script: Path, name: str, line: int) -> None:
    assert codes(script, {"builder": f"s.py::{name}", "line": line}) == [
        ("Q202", "circuits[0].source.builder")
    ]


def test_line_mode_function_args_checked(script: Path) -> None:
    src = {"builder": "s.py::build", "line": 12, "args": {"m": 2}}
    assert codes(script, src) == [("Q203", "circuits[0].source.args")]


def test_line_mode_past_end_is_q103_at_line(script: Path) -> None:
    assert codes(script, {"builder": "s.py::qc", "line": 16}) == [
        ("Q103", "circuits[0].source.line")
    ]


def test_line_mode_notebook_uses_code_cell_script(script: Path) -> None:
    assert codes(script, {"builder": "n.ipynb::bell", "line": 3}) == []
    assert codes(script, {"builder": "n.ipynb::bell", "line": 2}) == [
        ("Q202", "circuits[0].source.builder")
    ]


def test_line_mode_syntax_error_located(script: Path) -> None:
    (script / "bad.py").write_text("qc = 1\ndef f(:\n", encoding="utf-8")
    raw = {
        "id": "x",
        "source": {"builder": "bad.py::qc", "line": 1},
        "target": {"backend": "line-5"},
    }
    (issue,) = reference_issues(CircuitItem.model_validate(raw), script, "qscore.yaml", 0, {})
    assert (issue.code, issue.location.file, issue.location.line) == ("Q301", "bad.py", 2)
