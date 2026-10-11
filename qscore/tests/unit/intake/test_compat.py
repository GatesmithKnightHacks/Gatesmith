"""Removed-Qiskit-API hints (ChP-0037 §2.1 B, §2.2 D2): static detection, located, never rewritten.

Every table entry is checked against the installed Qiskit (the old API must really be gone here),
so the table cannot drift into guesses."""

from __future__ import annotations

import ast
import importlib

import pytest

from qscore.intake.compat import REMOVED, CompatHit, RemovedApi, describe, removed_apis


def hits(source: str) -> list[tuple[int, str]]:
    return [(h.line, h.used) for h in removed_apis(ast.parse(source))]


REQUIRED = {
    "qiskit.execute",
    "qiskit.Aer",
    "qiskit.BasicAer",
    "qiskit.providers.aer",
    "qiskit.IBMQ",
    "qiskit.opflow",
    "qiskit.algorithms",
    "qiskit.utils.QuantumInstance",
    "qiskit.tools",
}


def test_table_covers_the_required_apis() -> None:
    assert {entry.name for entry in REMOVED} >= REQUIRED
    assert len({entry.name for entry in REMOVED}) == len(REMOVED)


@pytest.mark.parametrize("entry", REMOVED, ids=lambda e: e.name)
def test_every_entry_is_really_removed_in_this_environment(entry: RemovedApi) -> None:
    parent, _, last = entry.name.rpartition(".")
    with pytest.raises(ImportError):
        exec(f"from {parent} import {last}", {})


def test_qiskit_is_2x() -> None:
    import qiskit

    assert int(qiskit.__version__.split(".")[0]) >= 2


@pytest.mark.parametrize(
    ("module", "attr"),
    [
        ("qiskit", "transpile"),
        ("qiskit.primitives", "StatevectorSampler"),
        ("qiskit_aer", "AerSimulator"),
        ("qiskit.providers.basic_provider", "BasicSimulator"),
        ("qiskit.quantum_info", "SparsePauliOp"),
        ("qiskit_ibm_runtime", "QiskitRuntimeService"),
    ],
)
def test_named_replacements_exist(module: str, attr: str) -> None:
    assert hasattr(importlib.import_module(module), attr)


def test_from_imports_located() -> None:
    source = (
        "import numpy as np\n"
        "from qiskit import QuantumCircuit, execute, Aer\n"
        "from qiskit import BasicAer, IBMQ\n"
        "from qiskit.providers.aer import AerSimulator\n"
        "from qiskit.opflow import PauliSumOp\n"
        "from qiskit.algorithms.optimizers import COBYLA\n"
        "from qiskit.utils import QuantumInstance, algorithm_globals\n"
        "from qiskit.tools.monitor import job_monitor\n"
        "from qiskit.providers import aer\n"
    )
    assert hits(source) == [
        (2, "qiskit.execute"),
        (2, "qiskit.Aer"),
        (3, "qiskit.BasicAer"),
        (3, "qiskit.IBMQ"),
        (4, "qiskit.providers.aer.AerSimulator"),
        (5, "qiskit.opflow.PauliSumOp"),
        (6, "qiskit.algorithms.optimizers.COBYLA"),
        (7, "qiskit.utils.QuantumInstance"),
        (8, "qiskit.tools.monitor.job_monitor"),
        (9, "qiskit.providers.aer"),
    ]


def test_module_imports_and_attribute_uses_located() -> None:
    source = (
        "import qiskit\n"
        "import qiskit as qk\n"
        "import qiskit.opflow\n"
        "import qiskit.tools.jupyter as tj\n"
        "backend = qiskit.Aer.get_backend('qasm_simulator')\n"
        "job = qk.execute(circ, backend)\n"
        "op = qiskit.opflow.X ^ qiskit.opflow.Z\n"
        "qc = qiskit.QuantumCircuit(2)\n"
    )
    assert hits(source) == [
        (3, "qiskit.opflow"),
        (4, "qiskit.tools.jupyter"),
        (5, "qiskit.Aer.get_backend"),
        (6, "qiskit.execute"),
        (7, "qiskit.opflow.X"),
        (7, "qiskit.opflow.Z"),
    ]


def test_current_apis_and_relative_imports_are_not_hits() -> None:
    source = (
        "from qiskit import QuantumCircuit, transpile\n"
        "from qiskit_aer import AerSimulator\n"
        "from qiskit.quantum_info import SparsePauliOp\n"
        "from qiskit.utils import optionals\n"
        "from .tools import execute\n"
        "from . import Aer\n"
        "import qiskit_algorithms\n"
        "execute(1)\n"
        "tools.execute(2)\n"
    )
    assert hits(source) == []


def test_describe() -> None:
    [execute, monitor] = removed_apis(
        ast.parse("from qiskit import execute\nfrom qiskit.tools.monitor import job_monitor\n")
    )
    assert execute == CompatHit(1, "qiskit.execute", execute.replacement)
    assert describe(execute, "nb/adder.ipynb") == (
        "nb/adder.ipynb:1: uses qiskit.execute, removed by Qiskit 2.x; "
        "use qiskit.transpile + backend.run, or the primitives (qiskit.primitives)"
    )
    assert describe(monitor, "run.py").startswith(
        "run.py:2: uses qiskit.tools.monitor.job_monitor, removed in Qiskit 1.0; use "
    )
