"""Builder reference pass: Q200 parameters, Q201-Q204, Q301 syntax (05 §3; ast only)."""

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
