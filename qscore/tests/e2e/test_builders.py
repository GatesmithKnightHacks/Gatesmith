"""Builder-to-CLI integration, parameter binding and size sweeps (M3; 05 §4)."""

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from qscore.cli import app
from qscore.schemas.scorecard import Scorecard

BUILDER = """from qiskit import QuantumCircuit
from qiskit.circuit import Parameter

def build(n):
    qc = QuantumCircuit(n)
    qc.ry(Parameter("theta"), 0)
    for i in range(n-1):
        qc.cx(i, i+1)
    return qc
"""


def project(tmp_path: Path, source: dict | None = None, **extra):
    (tmp_path / "builder.py").write_text(BUILDER)
    (tmp_path / "params.json").write_text('{"theta": 0.4}')
    doc = {
        "schema": "qscore.project/v0.2",
        "project": {"name": "builder"},
        "defaults": {"target": {"backend": "line-6"}, "execution": {"transpiler_seeds": [11]}},
        "circuits": [
            {
                "id": "ghz",
                "source": source
                or {
                    "builder": "builder.py::build",
                    "args": {"n": 3},
                    "parameters": {"file": "params.json"},
                },
                **extra,
            }
        ],
    }
    manifest = tmp_path / "qscore.yaml"
    manifest.write_text(json.dumps(doc))
    return manifest


def test_builder_binding_and_sweep_through_cli(tmp_path):
    manifest = project(tmp_path, size_sweep={"arg": "n", "values": [3, 4, 5]})
    result = CliRunner().invoke(
        app,
        ["score", "--manifest", str(manifest), "--yes", "--json", "--out", str(tmp_path / "out")],
    )
    assert result.exit_code == 0, result.output
    card = Scorecard.model_validate(json.loads(result.stdout)[0])
    metrics = {m.id: m for m in card.metrics}
    assert card.status == "complete"
    assert metrics["scalability"].status == "computed"
    assert [r["qubits"] for r in metrics["scalability"].evidence["per_size"]] == [3, 4, 5]
    assert metrics["scalability"].value["b_compiled"] == pytest.approx(
        metrics["scalability"].value["b_logical"]
    )
    assert metrics["two_qubit_count"].value == 2
    assert (tmp_path / "out/report.md").is_file()


@pytest.mark.parametrize(
    "case,code",
    [
        ("missing", "Q201"),
        ("function", "Q202"),
        ("args", "Q203"),
        ("unbound", "Q305"),
        ("parameters", "Q207"),
        ("exception", "Q302"),
        ("return", "Q303"),
        ("import", "Q301"),
    ],
)
def test_builder_errors_are_located_cli_input_failures(tmp_path, case, code):
    manifest = project(tmp_path)
    if case == "missing":
        (tmp_path / "builder.py").unlink()
    elif case == "function":
        (tmp_path / "builder.py").write_text("def other(n): pass\n")
    elif case == "args":
        (tmp_path / "builder.py").write_text("def build(size): pass\n")
    elif case == "unbound":
        (tmp_path / "params.json").write_text("{}")
    elif case == "parameters":
        (tmp_path / "params.json").write_text('{"theta": "bad"}')
    elif case == "exception":
        (tmp_path / "builder.py").write_text("def build(n): raise ValueError('broken')\n")
    elif case == "return":
        (tmp_path / "builder.py").write_text("def build(n): return 42\n")
    elif case == "import":
        (tmp_path / "builder.py").write_text(
            "import absent_qscore_test_module\ndef build(n): pass\n"
        )
    result = CliRunner().invoke(
        app, ["score", "--manifest", str(manifest), "--yes", "--out", str(tmp_path / "out")]
    )
    assert result.exit_code == 2, result.output
    assert code in result.output
    assert "circuits[0].source" in result.output
    assert not (tmp_path / "out").exists()
