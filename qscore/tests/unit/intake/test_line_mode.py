"""Packages and line mode through the sandbox and the loader (ChP-0037 §2.1 B/D, §2.2 D1).

The fixtures are small local look-alikes of MQT Bench (a builder inside a package that uses a
relative import), of qopt-best-practices (a script with a relative data path and a cloud login
after the circuit) and of a notebook. They are copied to a temporary directory first so the
runner never writes bytecode into the source tree.
"""

import json
import shutil
from pathlib import Path

import pytest
from typer.testing import CliRunner

from qscore.cli import app
from qscore.errors import SandboxError
from qscore.intake.loaders import LoadedCircuit, QasmProblem, load_builder
from qscore.intake.sandbox import BuilderRequest, run_builder
from qscore.manifest.resolve import item_hash
from qscore.schemas.manifest import CircuitItem, Runner
from qscore.schemas.scorecard import Scorecard

FIXTURES = Path(__file__).with_name("fixtures")


def copy(tmp_path: Path, name: str) -> Path:
    return Path(shutil.copytree(FIXTURES / name, tmp_path / name))


def item(builder: str, line: int | None = None, **args: object) -> CircuitItem:
    source: dict[str, object] = {"builder": builder, "args": args}
    if line is not None:
        source["line"] = line
    return CircuitItem.model_validate(
        {"id": "x", "source": source, "target": {"backend": "line-5"}}
    )


def load(root: Path, builder: str, line: int | None = None, **args: object):
    return load_builder(item(builder, line, **args), root, Runner(timeout_s=60))


# --- packages (function mode) --------------------------------------------------------------


def test_package_builder_with_relative_import_loads(tmp_path: Path) -> None:
    root = copy(tmp_path, "mqt_pkg")
    loaded = load(root, "src/pkg/sub/ghz.py::create_circuit", num_qubits=4)
    assert isinstance(loaded, LoadedCircuit), loaded
    assert loaded.circuit.num_qubits == 4
    assert loaded.circuit.count_ops() == {"h": 1, "cx": 3}


def test_package_builder_size_rebuild(tmp_path: Path) -> None:
    root = copy(tmp_path, "mqt_pkg")
    raw = item("src/pkg/sub/ghz.py::create_circuit", num_qubits=3).model_dump(exclude_none=True)
    swept = CircuitItem.model_validate({**raw, "size_sweep": {"arg": "num_qubits", "values": [5]}})
    loaded = load_builder(swept, root, Runner(timeout_s=60))
    assert isinstance(loaded, LoadedCircuit) and loaded.rebuild is not None
    assert loaded.rebuild(5).num_qubits == 5


def test_package_init_runs_before_module(tmp_path: Path) -> None:
    root = copy(tmp_path, "mqt_pkg")
    (root / "src/pkg/sub/__init__.py").write_text("raise ImportError('sub init ran')\n")
    loaded = load(root, "src/pkg/sub/ghz.py::create_circuit", num_qubits=3)
    assert isinstance(loaded, QasmProblem)
    assert loaded.code == "Q301" and "sub init ran" in loaded.message


def test_single_file_outside_package_imports_as_before(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text(
        "from qiskit import QuantumCircuit\n\ndef build(n):\n    return QuantumCircuit(n)\n"
    )
    loaded = load(tmp_path, "b.py::build", n=2)
    assert isinstance(loaded, LoadedCircuit) and loaded.circuit.num_qubits == 2


def test_function_mode_cwd_is_not_the_file_directory(tmp_path: Path) -> None:
    (tmp_path / "marker.txt").write_text("here")
    (tmp_path / "b.py").write_text(
        "import os\nfrom qiskit import QuantumCircuit\n\n"
        "def build():\n"
        "    qc = QuantumCircuit(1)\n"
        "    qc.name = str(os.path.exists('marker.txt'))\n"
        "    return qc\n"
    )
    request = BuilderRequest(tmp_path, tmp_path / "b.py", "build")
    assert run_builder(request, 60, 4096).circuit.name == "False"


# --- line mode: scripts -------------------------------------------------------------------


def test_script_circuit_variable_with_relative_data_path(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::qc", line=9)
    assert isinstance(loaded, LoadedCircuit), loaded
    assert loaded.circuit.num_qubits == 3
    assert loaded.circuit.count_ops() == {"h": 1, "cx": 1}


def test_main_block_and_later_code_never_run(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::scaled", line=20, width=3)
    assert isinstance(loaded, LoadedCircuit), loaded
    assert loaded.circuit.count_ops() == {"h": 3}


def test_line_including_the_raise_runs_it(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::qc", line=21)
    assert isinstance(loaded, QasmProblem)
    assert loaded.code == "Q301" and "cloud login" in loaded.message
    assert 'hw_circ.py", line 21' in loaded.message  # original numbering in the traceback


def test_line_past_end_is_q103(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::qc", line=99)
    assert isinstance(loaded, QasmProblem) and loaded.code == "Q103"
    assert "line 99" in loaded.message


def test_missing_name_after_line_is_q302(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::scaled", line=9)
    assert isinstance(loaded, QasmProblem) and loaded.code == "Q302"
    assert "scaled is not defined after line 9" in loaded.message


def test_circuit_with_args_is_q103(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::qc", line=9, width=3)
    assert isinstance(loaded, QasmProblem) and loaded.code == "Q103"


def test_function_in_line_mode_raising_is_q302(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::scaled", line=20, width="x")
    assert isinstance(loaded, QasmProblem) and loaded.code == "Q302"


def test_variable_not_a_circuit_is_q303(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    loaded = load(root, "run/hw_circ.py::n", line=9)
    assert isinstance(loaded, QasmProblem) and loaded.code == "Q303"


def test_line_mode_inside_a_package_resolves_relative_imports(tmp_path: Path) -> None:
    root = copy(tmp_path, "mqt_pkg")
    script = root / "src/pkg/sub/script.py"
    script.write_text(
        "from .ghz import create_circuit\n\ncirc = create_circuit(3)\nraise SystemExit(9)\n"
    )
    loaded = load(root, "src/pkg/sub/script.py::circ", line=3)
    assert isinstance(loaded, LoadedCircuit), loaded
    assert loaded.circuit.num_qubits == 3


# --- line mode: notebooks -----------------------------------------------------------------


def test_notebook_variable_by_line(tmp_path: Path) -> None:
    root = copy(tmp_path, "nb_line")
    loaded = load(root, "demo.ipynb::bell", line=5)
    assert isinstance(loaded, LoadedCircuit), loaded
    assert loaded.circuit.count_ops() == {"h": 1, "cx": 1}


def test_notebook_later_cell_runs_only_when_included(tmp_path: Path) -> None:
    root = copy(tmp_path, "nb_line")
    loaded = load(root, "demo.ipynb::bell", line=7)
    assert isinstance(loaded, QasmProblem)
    assert loaded.code == "Q301" and "later cell" in loaded.message


# --- request and item hash ----------------------------------------------------------------


def test_request_line_mode_runs_source_text_in_given_cwd(tmp_path: Path) -> None:
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub/w.txt").write_text("4")
    text = "from qiskit import QuantumCircuit\nqc = QuantumCircuit(int(open('w.txt').read()))\n"
    request = BuilderRequest(
        tmp_path,
        tmp_path / "sub/s.py",
        "qc",
        source_text=text,
        cwd=tmp_path / "sub",
        line=2,
    )
    assert run_builder(request, timeout_s=60, mem_mb=4096).circuit.num_qubits == 4


def test_request_module_is_not_main(tmp_path: Path) -> None:
    text = "from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.name = __name__\n"
    request = BuilderRequest(
        tmp_path, tmp_path / "s.py", "qc", source_text=text, cwd=tmp_path, line=3
    )
    assert run_builder(request, 60, 4096).circuit.name == "__qscore_script__"


def test_request_args_with_circuit_kind(tmp_path: Path) -> None:
    text = "from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\n"
    request = BuilderRequest(
        tmp_path, tmp_path / "s.py", "qc", {"n": 1}, source_text=text, cwd=tmp_path, line=2
    )
    with pytest.raises(SandboxError) as err:
        run_builder(request, 60, 4096)
    assert err.value.kind == "args_for_circuit"


def test_request_line_mode_needs_line_and_cwd(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="line mode"):
        BuilderRequest(tmp_path, tmp_path / "s.py", "qc", source_text="x = 1\n")


def test_item_hash_includes_line(tmp_path: Path) -> None:
    root = copy(tmp_path, "qopt_script")
    eight, nine = item("run/hw_circ.py::qc", 8), item("run/hw_circ.py::qc", 9)
    assert item_hash(eight, root) != item_hash(nine, root)


def test_notebook_fixture_has_pip_line_and_two_code_cells() -> None:
    doc = json.loads((FIXTURES / "nb_line/demo.ipynb").read_text())
    code = [c for c in doc["cells"] if c["cell_type"] == "code"]
    assert len(code) >= 2 and code[0]["source"][0].startswith("!pip")


# --- end to end: both shapes score complete through the CLI -------------------------------


@pytest.mark.parametrize(
    "fixture,source",
    [
        ("mqt_pkg", {"builder": "src/pkg/sub/ghz.py::create_circuit", "args": {"num_qubits": 3}}),
        ("qopt_script", {"builder": "run/hw_circ.py::qc", "line": 9}),
    ],
)
def test_scores_complete(tmp_path: Path, fixture: str, source: dict) -> None:
    root = copy(tmp_path, fixture)
    doc = {
        "schema": "qscore.project/v0.2",
        "project": {"name": fixture},
        "defaults": {"target": {"backend": "line-5"}, "execution": {"transpiler_seeds": [11]}},
        "circuits": [{"id": "c", "source": source}],
    }
    (root / "qscore.yaml").write_text(json.dumps(doc))
    out = str(tmp_path / "out")
    manifest = str(root / "qscore.yaml")
    result = CliRunner().invoke(
        app, ["score", "--manifest", manifest, "--yes", "--json", "--out", out]
    )
    assert result.exit_code == 0, result.output
    card = Scorecard.model_validate(json.loads(result.stdout)[0])
    assert card.status == "complete"
