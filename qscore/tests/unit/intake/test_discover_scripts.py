"""Scripts and notebooks become draftable (ChP-0037 §2.1 B/C, §2.2 D2): static default `line`,
removed-Qiskit-API hints per file, drafted `line` with its comment."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from qscore.intake.compat import CompatHit
from qscore.intake.discover import Candidate, discover, notebook_cells, notebook_source
from qscore.intake.draft import draft_items, dump, merge_into, new_manifest, pick_candidates
from qscore.schemas.manifest import BuilderSource

COMMENT = "# runs lines 1\u2013{n}; move it to choose a later point"

# A small copy of the shape of the Quantum-Adder notebook (Qiskit < 1.0 imports).
ADDER_CELLS: list[tuple[str, str]] = [
    ("code", "!pip install qiskit==0.39\n"),
    ("code", "from qiskit import QuantumCircuit, execute, Aer\nimport numpy as np\n"),
    ("code", "circuit = QuantumCircuit(4, 2)\ncircuit.x(0)\ncircuit.cx(0, 2)\n"),
    ("markdown", "Now a smaller one\n"),
    ("code", "%matplotlib inline\ncircuit = QuantumCircuit(3)\ncircuit.h(0)"),
    ("code", "backend = Aer.get_backend('qasm_simulator')\njob = execute(circuit, backend)\n"),
]

# A small copy of the shape of qopt-best-practices run/hw_native_test_1_circ.py.
QOPT = (
    "import json\n"  # 1
    "\n"  # 2
    "from qiskit.circuit.library import QAOAAnsatz\n"  # 3
    "\n"  # 4
    'graph = json.load(open("data/hardware_native_127.json"))\n'  # 5
    "qaoa_circ = QAOAAnsatz(cost_operator(graph), reps=2)\n"  # 6
    "qaoa_circ.measure_all()\n"  # 7
    "print(qaoa_circ.num_parameters)\n"  # 8
    "\n"  # 9
    "from qiskit_ibm_runtime import QiskitRuntimeService\n"  # 10
    'service = QiskitRuntimeService(channel="ibm_quantum")\n'  # 11
)


def write_notebook(path: Path, cells: list[tuple[str, str]]) -> Path:
    doc = {
        "cells": [
            {
                "cell_type": kind,
                "metadata": {},
                "source": text.splitlines(keepends=True),
                **({"outputs": [], "execution_count": None} if kind == "code" else {}),
            }
            for kind, text in cells
        ],
        "metadata": {},
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


@pytest.fixture
def adder(tmp_path: Path) -> Path:
    write_notebook(tmp_path / "adder.ipynb", ADDER_CELLS)
    return tmp_path


@pytest.fixture
def qopt(tmp_path: Path) -> Path:
    (tmp_path / "run").mkdir()
    (tmp_path / "run" / "hw_native_test_1_circ.py").write_text(QOPT, encoding="utf-8")
    return tmp_path


def script_line(script: str, needle: str, occurrence: int = 0) -> int:
    lines = [i for i, t in enumerate(script.splitlines(), start=1) if needle in t]
    return lines[occurrence]


# ---------------------------------------------------------------- notebook cells


def test_notebook_cells_match_the_printed_script(adder: Path) -> None:
    path = adder / "adder.ipynb"
    script = notebook_source(path, "adder.ipynb")
    cells = notebook_cells(path, "adder.ipynb")
    lines = script.split("\n")
    # five code cells; the first one only had a shell line (dropped), so it is empty
    assert [lines[a - 1 : b] for a, b in cells] == [
        [],
        ["from qiskit import QuantumCircuit, execute, Aer", "import numpy as np"],
        ["circuit = QuantumCircuit(4, 2)", "circuit.x(0)", "circuit.cx(0, 2)"],
        ["circuit = QuantumCircuit(3)", "circuit.h(0)"],
        ["backend = Aer.get_backend('qasm_simulator')", "job = execute(circuit, backend)"],
    ]


def test_notebook_variables_default_to_the_end_of_their_cell(adder: Path) -> None:
    script = notebook_source(adder / "adder.ipynb", "adder.ipynb")
    first, second = discover(adder)
    assert (first.reference, second.reference) == ("adder.ipynb::circuit",) * 2
    assert first.source_kind == second.source_kind == "notebook"
    assert first.line == script_line(script, "circuit = QuantumCircuit(4, 2)")
    assert first.default_line == script_line(script, "circuit.cx(0, 2)")
    assert second.line == script_line(script, "circuit = QuantumCircuit(3)")
    assert second.default_line == script_line(script, "circuit.h(0)")


def test_notebook_compat_hits_located_in_the_script(adder: Path) -> None:
    script = notebook_source(adder / "adder.ipynb", "adder.ipynb")
    imports = script_line(script, "from qiskit import QuantumCircuit, execute, Aer")
    for candidate in discover(adder):
        assert [(h.line, h.used) for h in candidate.compat] == [
            (imports, "qiskit.execute"),
            (imports, "qiskit.Aer"),
        ]
        assert all(isinstance(h, CompatHit) for h in candidate.compat)


def test_notebook_function_defaults_to_the_end_of_its_cell(tmp_path: Path) -> None:
    write_notebook(
        tmp_path / "nb.ipynb",
        [
            ("code", "from qiskit import QuantumCircuit\n"),
            (
                "code",
                "def ghz(n: int) -> QuantumCircuit:\n    qc = QuantumCircuit(n)\n    return qc\n"
                "\n\nghz(3)\n",
            ),
            ("code", "print('later')\n"),
        ],
    )
    [candidate] = discover(tmp_path)
    script = notebook_source(tmp_path / "nb.ipynb", "nb.ipynb")
    assert candidate.signal == "annotation"
    assert candidate.default_line == script_line(script, "ghz(3)")


# ---------------------------------------------------------------- .py scripts


def test_script_variable_runs_through_consecutive_mentions(qopt: Path) -> None:
    [candidate] = discover(qopt)
    assert candidate.reference == "run/hw_native_test_1_circ.py::qaoa_circ"
    assert candidate.signal == "module_variable"
    assert candidate.line == script_line(QOPT, "qaoa_circ = ")
    assert candidate.default_line == script_line(QOPT, "print(qaoa_circ.num_parameters)")
    assert candidate.compat == ()


def test_run_ends_at_the_last_line_of_a_multiline_statement(tmp_path: Path) -> None:
    (tmp_path / "s.py").write_text(
        "from qiskit import QuantumCircuit\n"  # 1
        "qc = QuantumCircuit(2)\n"  # 2
        "for i in range(1):\n"  # 3
        "    qc.cx(\n"  # 4
        "        i, i + 1\n"  # 5
        "    )\n"  # 6
        "other = 3\n"  # 7
        "qc.h(0)\n",  # 8: not consecutive with the run any more
        encoding="utf-8",
    )
    [candidate] = discover(tmp_path)
    assert candidate.default_line == 6


def test_python_functions_and_qasm_have_no_default_line(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text(
        "from qiskit import QuantumCircuit, execute\n\n\n"
        "def build(n) -> QuantumCircuit:\n    return QuantumCircuit(n)\n",
        encoding="utf-8",
    )
    (tmp_path / "c.qasm").write_text("OPENQASM 2.0;\nqreg q[1];\n", encoding="utf-8")
    build, qasm = discover(tmp_path)
    assert build.default_line is None and qasm.default_line is None
    assert [(h.line, h.used) for h in build.compat] == [(1, "qiskit.execute")]
    assert qasm.compat == ()


# ---------------------------------------------------------------- drafting


def drafted(candidates: list[Candidate], pick: str) -> str:
    chosen = pick_candidates(candidates, pick, None, no_input=True)
    doc = new_manifest("demo")
    merge_into(doc, draft_items(chosen, None, None, no_input=True))
    return dump(doc)


def test_script_variable_drafts_with_line_and_comment(qopt: Path) -> None:
    candidates = discover(qopt)
    text = drafted(candidates, "qaoa_circ")
    n = script_line(QOPT, "print(qaoa_circ.num_parameters)")
    assert f"line: {n}  {COMMENT.format(n=n)}" in text
    assert "args" not in text  # a circuit variable gets no args
    assert "builder: run/hw_native_test_1_circ.py::qaoa_circ" in text


def test_both_notebook_cells_draft_as_separate_items(adder: Path) -> None:
    candidates = discover(adder)
    text = drafted(candidates, "1,2")
    first, second = (c.default_line for c in candidates)
    assert first is not None and second is not None
    assert COMMENT.format(n=first) in text and COMMENT.format(n=second) in text
    assert "id: circuit\n" in text and "id: circuit_2\n" in text
    assert "args" not in text


def test_drafted_source_is_a_valid_builder_source(qopt: Path, adder: Path) -> None:
    from ruamel.yaml import YAML

    for root, pick in ((qopt, "1"), (adder, "2")):
        doc = YAML(typ="safe", pure=True).load(drafted(discover(root), pick))
        [item] = doc["circuits"]
        source = BuilderSource.model_validate(item["source"])
        assert source.line is not None and source.args == {}


def test_notebook_function_drafts_args_and_line(tmp_path: Path) -> None:
    write_notebook(
        tmp_path / "nb.ipynb",
        [("code", "def ghz(n: int = 3) -> QuantumCircuit:\n    return QuantumCircuit(n)\n")],
    )
    text = drafted(discover(tmp_path), "ghz")
    assert "n: 3  # default" in text
    assert COMMENT.format(n=2) in text
