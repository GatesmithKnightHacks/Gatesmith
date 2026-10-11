"""Removed Qiskit APIs: joined to Q301/Q302 and listed by `qscore discover` (ChP-0037 §2.1 B)."""

from __future__ import annotations

from pathlib import Path

from typer.testing import CliRunner

from qscore.cli import app
from qscore.intake.loaders import QasmProblem, load_builder
from qscore.schemas.manifest import CircuitItem, Runner

OLD = (
    "from qiskit import QuantumCircuit, execute\n"
    "\n"
    "def build():\n"
    "    qc = QuantumCircuit(2)\n"
    "    qc.h(0)\n"
    "    qc.cx(0, 1)\n"
    "    return qc\n"
)


def _load(root: Path) -> QasmProblem:
    item = CircuitItem.model_validate(
        {
            "id": "x",
            "source": {"builder": "old.py::build", "args": {}},
            "target": {"backend": "line-5"},
        }
    )
    loaded = load_builder(item, root, Runner(timeout_s=60))
    assert isinstance(loaded, QasmProblem)
    return loaded


def test_q301_carries_the_removed_api_hint(tmp_path: Path) -> None:
    (tmp_path / "old.py").write_text(OLD)
    problem = _load(tmp_path)
    assert problem.code == "Q301"
    assert "old.py:1: uses qiskit.execute" in problem.message


def test_q301_without_removed_apis_has_no_hint(tmp_path: Path) -> None:
    (tmp_path / "old.py").write_text("import not_a_module_qscore\n\ndef build():\n    pass\n")
    problem = _load(tmp_path)
    assert problem.code == "Q301"
    assert "Removed Qiskit APIs" not in problem.message


def test_discover_lists_the_hint_once_per_file(tmp_path: Path) -> None:
    (tmp_path / "old.py").write_text(OLD + "\n\ndef build2():\n    return build()\n")
    result = CliRunner().invoke(app, ["discover", str(tmp_path)])
    assert result.exit_code == 0, result.output
    warnings = [ln for ln in result.output.splitlines() if "uses qiskit.execute" in ln]
    assert len(warnings) == 1 and "old.py:1:" in warnings[0]
