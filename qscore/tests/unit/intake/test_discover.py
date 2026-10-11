"""Discovery with ast only (specs/05-pipeline.md §1, ChP-0029; 14 §1 decoys)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from qscore.errors import InvalidInput
from qscore.intake.discover import Candidate, Suggestion, discover, size_like

FIXTURES = Path(__file__).parent / "fixtures"
REPO = FIXTURES / "repo"
QSCORE = Path(__file__).resolve().parents[3]
DECOYS = QSCORE / "tests" / "validation" / "decoys"
EXAMPLES = QSCORE / "examples"


def line_of(path: Path, needle: str) -> int:
    lines = path.read_text(encoding="utf-8").splitlines()
    matches = [i for i, text in enumerate(lines, start=1) if needle in text]
    assert len(matches) == 1, f"{needle!r} must occur once in {path.name}"
    return matches[0]


def by_ref(candidates: list[Candidate]) -> dict[str, Candidate]:
    return {c.reference: c for c in candidates}


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """The fixture repo plus a test file with call sites (kept out of pytest's collection)."""
    root = tmp_path / "repo"
    shutil.copytree(REPO, root)
    (root / "tests").mkdir()
    (root / "tests" / "test_builders.py").write_text(
        "from builders import annotated, direct\n"
        "\n"
        "\n"
        "def test_sizes():\n"
        "    assert annotated(n=6).num_qubits == 6\n"
        "    assert direct(9).num_qubits == 9\n"
        "    direct(size=-2)\n",
        encoding="utf-8",
    )
    (root / "tests" / "helpers.py").write_text("from builders import direct\ndirect(11)\n")
    return root


def test_every_builder_signal(repo: Path) -> None:
    found = by_ref(discover(repo))
    signals = {ref: c.signal for ref, c in found.items() if c.source_kind == "python"}
    assert signals == {
        "builders.py::BELL": "module_variable",
        "builders.py::annotated": "annotation",
        "builders.py::returned": "returns_circuit",
        "builders.py::direct": "returns_circuit",
        "builders.py::library": "library_builder",
        "builders.py::qft_builder": "library_builder",
    }
    assert found["builders.py::BELL"].weak
    assert not found["builders.py::annotated"].weak
    assert "builders.py::helper" not in found


def test_order_index_and_lines(repo: Path) -> None:
    candidates = discover(repo)
    assert [c.index for c in candidates] == list(range(1, len(candidates) + 1))
    assert [c.reference for c in candidates] == [
        "builders.py::BELL",
        "builders.py::annotated",
        "builders.py::returned",
        "builders.py::direct",
        "builders.py::library",
        "builders.py::qft_builder",
        "notebook.ipynb::ghz",
        "oracle.qasm",
    ]
    source = repo / "builders.py"
    found = by_ref(candidates)
    assert found["builders.py::annotated"].line == line_of(source, "def annotated(")
    assert found["builders.py::BELL"].line == line_of(source, "BELL = ")
    assert discover(repo) == candidates  # deterministic


def test_signature_annotations_and_literal_defaults(repo: Path) -> None:
    found = by_ref(discover(repo))
    annotated = found["builders.py::annotated"]
    assert [(p.name, p.annotation, p.has_default, p.default) for p in annotated.params] == [
        ("n", "int", False, None),
        ("depth", "int", True, 3),
        ("label", "str", True, "x"),
    ]
    returned = found["builders.py::returned"]
    assert returned.annotations == {
        "num_qubits": None,
        "theta": "float",
        "flag": "bool",
        "seed": None,
    }
    theta = returned.params[1]
    assert theta.default == -0.5 and theta.default_is_literal
    seed = returned.params[3]  # `seed=BELL`: a default, but not a literal one
    assert seed.keyword_only and seed.has_default and not seed.default_is_literal


def test_size_like_arguments(repo: Path) -> None:
    for name in ("n", "num_qubits", "n_qubits", "size", "n_residues", "depth", "p", "reps"):
        assert size_like(name)
    for name in ("theta", "rotamers", "N", "width", "qubits"):
        assert not size_like(name)
    found = by_ref(discover(repo))
    assert found["builders.py::annotated"].size_like == ("n", "depth")
    assert found["builders.py::returned"].size_like == ("num_qubits",)
    assert found["builders.py::library"].size_like == ("reps",)
    assert found["builders.py::qft_builder"].size_like == ("n_qubits",)


def test_call_site_suggestions(repo: Path) -> None:
    source = repo / "builders.py"
    main_annotated = line_of(source, "annotated(5, depth=4)")
    module_call = line_of(source, "MODULE_CALL = ")
    main_returned = line_of(source, "returned(-3, ")
    found = by_ref(discover(repo))
    annotated = found["builders.py::annotated"].suggestions
    assert annotated["n"] == (
        Suggestion(2, "builders.py", module_call),  # module level, positional
        Suggestion(5, "builders.py", main_annotated),  # __main__ block, positional
        Suggestion(6, "tests/test_builders.py", 5),  # test file, keyword
    )
    assert annotated["depth"] == (Suggestion(4, "builders.py", main_annotated),)
    assert annotated["label"] == (Suggestion("mod", "builders.py", module_call),)
    returned = found["builders.py::returned"].suggestions
    assert returned == {  # negative numbers are literals; keyword vs positional both map
        "num_qubits": (Suggestion(-3, "builders.py", main_returned),),
        "theta": (Suggestion(-1.5, "builders.py", main_returned),),
        "flag": (Suggestion(False, "builders.py", main_returned),),
    }
    assert found["builders.py::library"].suggestions == {}  # reps=helper(2) is not a literal
    direct = found["builders.py::direct"].suggestions
    assert direct["size"] == (  # tests/helpers.py is not a test_*.py file
        Suggestion(7, "builders.py", line_of(source, "direct(size=7)")),
        Suggestion(9, "tests/test_builders.py", 6),
        Suggestion(-2, "tests/test_builders.py", 7),
    )
    assert Suggestion(7, "builders.py", 1).where == "builders.py:1"


def test_calls_inside_functions_are_not_suggestions(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text(
        "from qiskit import QuantumCircuit\n"
        "\n"
        "\n"
        "def build(n):\n"
        "    return QuantumCircuit(n)\n"
        "\n"
        "\n"
        "def main():\n"
        "    build(4)\n",
        encoding="utf-8",
    )
    [candidate] = discover(tmp_path)
    assert candidate.suggestions == {}


def test_notebook_listed_with_magics_dropped(repo: Path) -> None:
    found = by_ref(discover(repo))
    nb = found["notebook.ipynb::ghz"]
    assert nb.source_kind == "notebook"
    assert nb.signal == "annotation"
    assert nb.size_like == ("n",)
    assert [s.value for s in nb.suggestions["n"]] == [3]
    # the markdown cell's "def fake() -> QuantumCircuit" is not code
    assert not any(c.name == "fake" for c in found.values())


def test_qasm_candidates_and_version(repo: Path) -> None:
    found = by_ref(discover(repo))
    qasm = found["oracle.qasm"]
    assert (qasm.source_kind, qasm.name, qasm.signal, qasm.qasm_version) == ("qasm", None, None, 2)
    decoy = by_ref(discover(DECOYS))["circuits/ghz3.qasm"]
    assert decoy.qasm_version == 3  # a comment precedes the header


def test_single_file_and_subdir(repo: Path) -> None:
    single = discover(repo / "builders.py")
    assert [c.reference for c in single][:2] == ["builders.py::BELL", "builders.py::annotated"]
    assert all(c.path == "builders.py" for c in single)
    (repo / "sub").mkdir()
    shutil.copy(repo / "oracle.qasm", repo / "sub" / "x.qasm")
    assert [c.reference for c in discover(repo, "sub")] == ["sub/x.qasm"]


def test_missing_path_is_q200(tmp_path: Path) -> None:
    with pytest.raises(InvalidInput) as exc:
        discover(tmp_path / "nope")
    assert exc.value.code == "Q200"


def test_syntax_error_fails_loudly(tmp_path: Path) -> None:
    (tmp_path / "bad.py").write_text("def build(:\n", encoding="utf-8")
    with pytest.raises(InvalidInput) as exc:
        discover(tmp_path)
    assert exc.value.code == "Q301"
    assert exc.value.report.issues[0].location.file == "bad.py"
    assert exc.value.report.issues[0].location.line == 1


def test_decoys_yield_exactly_the_real_candidates(tmp_path: Path) -> None:
    root = tmp_path / "decoys"
    shutil.copytree(DECOYS, root)
    builder = "from qiskit import QuantumCircuit\n\n\ndef hidden(n) -> QuantumCircuit:\n"
    builder += "    return QuantumCircuit(n)\n"
    for skipped in (
        ".venv/lib",
        ".git/hooks",
        "build",
        "dist",
        "node_modules/pkg",
        ".ipynb_checkpoints",
    ):
        (root / skipped).mkdir(parents=True)
        (root / skipped / "hidden.py").write_text(builder, encoding="utf-8")
        (root / skipped / "hidden.qasm").write_text("OPENQASM 2.0;\nqreg q[1];\n")
    candidates = discover(root)
    assert [(c.reference, c.signal) for c in candidates] == [
        ("circuits/ghz3.qasm", None),
        ("src/real.py::ghz", "annotation"),
    ]
    real = root / "src" / "real.py"
    tests = root / "tests" / "test_real.py"
    assert candidates[1].suggestions == {
        "n": (
            Suggestion(5, "src/real.py", line_of(real, "print(ghz(5))")),
            Suggestion(3, "tests/test_real.py", line_of(tests, "ghz(3)")),
            Suggestion(4, "tests/test_real.py", line_of(tests, "ghz(n=4)")),
        )
    }


@pytest.mark.parametrize(
    ("example", "expected"),
    [
        (
            "sidechain_qaoa",
            [
                ("circuits/packing_qaoa_p2.qasm", None),
                ("src/packing/qaoa.py::build_qaoa", "annotation"),
            ],
        ),
        ("sbox_oracle", [("circuits/sbox_layer_4x.qasm", None)]),
    ],
)
def test_examples_yield_exactly_their_candidates(
    example: str, expected: list[tuple[str, str | None]]
) -> None:
    candidates = discover(EXAMPLES / example)
    assert [(c.reference, c.signal) for c in candidates] == expected


def test_example_builder_signature() -> None:
    [_, qaoa] = discover(EXAMPLES / "sidechain_qaoa")
    assert qaoa.annotations == {"n_residues": "int", "rotamers": "int", "p": "int"}
    assert qaoa.size_like == ("n_residues", "p")
    assert not any(p.has_default for p in qaoa.params)


def test_discovery_never_executes_import_side_effects(tmp_path: Path) -> None:
    marker = tmp_path / "imported"
    (tmp_path / "side_effect.py").write_text(
        f"from pathlib import Path\nPath({str(marker)!r}).write_text('executed')\n"
        "raise RuntimeError('must not import')\n"
        "def build(n) -> QuantumCircuit:\n    return QuantumCircuit(n)\n"
    )
    [candidate] = discover(tmp_path)
    assert candidate.name == "build"
    assert not marker.exists()


@pytest.mark.parametrize("source", [None, 3, {}, ["def build():", 5]])
def test_invalid_notebook_source_is_q103(tmp_path: Path, source: object) -> None:
    (tmp_path / "bad.ipynb").write_text(
        json.dumps({"cells": [{"cell_type": "code", "source": source}]})
    )
    with pytest.raises(InvalidInput) as exc:
        discover(tmp_path)
    assert [i.code for i in exc.value.report.issues] == ["Q103"]


def test_all_parse_errors_have_locations(tmp_path: Path) -> None:
    for name in ("a.py", "b.py"):
        (tmp_path / name).write_text("def build(:\n")
    with pytest.raises(InvalidInput) as exc:
        discover(tmp_path)
    assert [(i.code, i.location.file) for i in exc.value.report.issues] == [
        ("Q301", "a.py"),
        ("Q301", "b.py"),
    ]
    assert all(i.location.line == 1 and i.location.column for i in exc.value.report.issues)


def test_attribute_suggestions_require_the_builders_import_alias(tmp_path: Path) -> None:
    (tmp_path / "builder.py").write_text(
        "def build(n) -> QuantumCircuit:\n    return QuantumCircuit(n)\nunrelated.build(99)\n"
    )
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests/test_use.py").write_text(
        "import builder as b\nimport other as o\n"
        "def test_calls():\n    b.build(3)\n    o.build(97)\n    mystery.build(98)\n"
    )
    [candidate] = discover(tmp_path)
    assert candidate.suggestions == {"n": (Suggestion(3, "tests/test_use.py", 4),)}


def test_syntax_warnings_in_researcher_code_are_not_printed(
    tmp_path: Path, recwarn: pytest.WarningsRecorder
) -> None:
    # Invalid escapes in user code (common in notebook LaTeX strings) are not qscore's to report.
    (tmp_path / "m.py").write_text(
        'from qiskit import QuantumCircuit\nLABEL = "\\m"\n\n\n'
        "def b() -> QuantumCircuit:\n    return QuantumCircuit(1)\n"
    )
    assert [c.name for c in discover(tmp_path)] == ["b"]
    assert not [w for w in recwarn if issubclass(w.category, SyntaxWarning)]


def test_circuit_methods_on_a_bound_circuit_are_builders(tmp_path: Path) -> None:
    # QED-C kernels: `qc2 = qc.decompose(); return qc2` (class B lead decision, 05 §1).
    (tmp_path / "k.py").write_text(
        "from qiskit import QuantumCircuit\n\n\n"
        "def bv(n: int):\n    qc = QuantumCircuit(n)\n    qc.h(0)\n"
        "    qc2 = qc.decompose()\n    return qc2\n\n\n"
        "def inv(n: int):\n    qc = QuantumCircuit(n)\n    return qc.inverse()\n\n\n"
        "def not_a_circuit(n: int):\n    x = [n]\n    return x.copy()\n"
    )
    found = {c.name: c.signal for c in discover(tmp_path)}
    assert found == {"bv": "returns_circuit", "inv": "returns_circuit"}


def test_unreadable_file_is_a_warning_when_others_have_candidates(tmp_path: Path) -> None:
    # ChP-0044: one broken file (QED-C has a notebook with a syntax error) does not hide the rest.
    (tmp_path / "bad.py").write_text("def build(:\n", encoding="utf-8")
    (tmp_path / "good.py").write_text(
        "from qiskit import QuantumCircuit\n\n\ndef b() -> QuantumCircuit:\n"
        "    return QuantumCircuit(1)\n"
    )
    unreadable: list[Any] = []
    assert [c.name for c in discover(tmp_path, unreadable=unreadable)] == ["b"]
    assert [(i.code, i.location.file, i.location.line) for i in unreadable] == [
        ("Q301", "bad.py", 1)
    ]
    # Without the collector, or when nothing readable has candidates, it still fails loudly.
    with pytest.raises(InvalidInput):
        discover(tmp_path)
    (tmp_path / "good.py").unlink()
    with pytest.raises(InvalidInput):
        discover(tmp_path, unreadable=[])
