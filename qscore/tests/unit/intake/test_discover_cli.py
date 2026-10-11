"""Repository -> reviewed manifest -> score, preserving researcher-owned configuration."""

from pathlib import Path

from typer.testing import CliRunner

from qscore import services
from qscore.cli import app
from qscore.validate.schema_checks import load_manifest_with_positions


def builder_repo(root: Path) -> Path:
    root.mkdir(exist_ok=True)
    (root / "builder.py").write_text(
        "from qiskit import QuantumCircuit\n"
        "def ghz(n: int = 3) -> QuantumCircuit:\n"
        "    qc = QuantumCircuit(n)\n"
        "    qc.h(0)\n"
        "    for i in range(n - 1): qc.cx(i, i + 1)\n"
        "    return qc\n"
    )
    return root


def test_list_does_not_write_a_manifest(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    result = CliRunner().invoke(app, ["discover", str(root)])
    assert result.exit_code == 0, result.output
    assert "builder.py::ghz" in result.output
    assert not (root / "qscore.yaml").exists()


def test_draft_then_score_with_custom_target(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    # The researcher owns target settings and comments; discovery extends this manifest.
    manifest = root / "qscore.yaml"
    original = (
        "schema: qscore.project/v0.2\nproject: {name: research, root: .}\n"
        "defaults:\n  target:  # keep my target\n"
        "    coupling_map: [[0, 1], [1, 0], [1, 2], [2, 1]]\n"
        "    basis_gates: [cx, rz, sx, x]\n"
        "  execution: {transpiler_seeds: [11]}\ncircuits: []\n"
    )
    manifest.write_text(original)
    result = CliRunner().invoke(
        app, ["discover", str(root), "--draft", "--pick", "ghz", "--no-input"]
    )
    assert result.exit_code == 0, result.output
    draft = root / "qscore.yaml.draft"
    assert manifest.read_text() == original
    assert "# keep my target" in draft.read_text()
    assert "+" in result.output  # diff is shown before the write
    score = services.score_project(draft, root / "results", confirm="yes")
    assert score.scorecards[0].status == "complete"
    assert score.scorecards[0].target.name == "custom"
    assert score.scorecards[0].target.num_qubits == 3
    assert score.scorecards[0].compile.seeds == [11]


def test_noninteractive_pick_required_and_bad_value_located(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    # Two candidates: a single one would be picked and announced (ChP-0035).
    (root / "other.py").write_text((root / "builder.py").read_text().replace("ghz", "other"))
    runner = CliRunner()
    result = runner.invoke(app, ["discover", str(root), "--draft", "--no-input"])
    assert result.exit_code == 2
    assert "Q104" in result.output
    values = root / "values.yaml"
    values.write_text(
        "schema: qscore.values/v0.1\nbuilders:\n  builder.py::ghz:\n    args: {n: wrong}\n"
    )
    result = runner.invoke(
        app,
        ["discover", str(root), "--draft", "--pick", "ghz", "--no-input", "--values", str(values)],
    )
    assert result.exit_code == 2
    assert "Q102" in result.output and "values.yaml:4:" in result.output
    assert not (root / "qscore.yaml").exists()


def test_unfilled_placeholder_is_announced_and_blocks_scoring(tmp_path: Path) -> None:
    # No default, no call site, --no-input: the draft must say "<required>", never a dummy value.
    root = tmp_path / "repo"
    root.mkdir()
    (root / "builder.py").write_text(
        "from qiskit import QuantumCircuit\n"
        "def ghz(n_qubits: int) -> QuantumCircuit:\n"
        "    return QuantumCircuit(n_qubits)\n"
    )
    runner = CliRunner()
    result = runner.invoke(app, ["discover", str(root), "--draft", "--pick", "ghz", "--no-input"])
    assert result.exit_code == 0, result.output
    text = (root / "qscore.yaml").read_text()
    assert "n_qubits: <required>  # required" in text
    assert "qscore.yaml:10: circuits[0].source.args.n_qubits is <required>" in result.output
    assert "1 placeholder(s) must be filled before scoring (Q107)" in result.output
    out = tmp_path / "results"
    result = runner.invoke(
        app, ["score", "--manifest", str(root / "qscore.yaml"), "--out", str(out), "--yes"]
    )
    assert result.exit_code == 2
    assert "Q107" in result.output and "qscore.yaml:10:" in result.output
    assert not out.exists()


def test_existing_draft_is_never_overwritten(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    (root / "qscore.yaml").write_text(
        "schema: qscore.project/v0.2\nproject: {name: demo}\ncircuits: []\n"
    )
    draft = root / "qscore.yaml.draft"
    draft.write_text("researcher's unfinished edits\n")
    result = CliRunner().invoke(
        app, ["discover", str(root), "--draft", "--pick", "ghz", "--no-input"]
    )
    assert result.exit_code != 0
    assert draft.read_text() == "researcher's unfinished edits\n"


def test_prompt_answers_and_values_sweep_reach_the_manifest(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    values = root / "values.yaml"
    values.write_text(
        "schema: qscore.values/v0.1\nbuilders:\n  builder.py::ghz:\n    sweep: {n: '2..4'}\n"
    )
    result = CliRunner().invoke(
        app, ["discover", str(root), "--draft", "--values", str(values)], input="1\n"
    )
    assert result.exit_code == 0, result.output
    manifest, _ = load_manifest_with_positions(root / "qscore.yaml")
    assert manifest.circuits[0].source.args == {"n": 2}
    assert manifest.circuits[0].size_sweep.values == [2, 3, 4]


def test_custom_project_root_is_preserved(tmp_path: Path) -> None:
    builder_repo(tmp_path / "src")
    manifest = tmp_path / "qscore.yaml"
    manifest.write_text(
        "schema: qscore.project/v0.2\nproject: {name: demo, root: src}\ncircuits: []\n"
    )
    result = CliRunner().invoke(
        app, ["discover", str(tmp_path), "--draft", "--pick", "ghz", "--no-input"]
    )
    assert result.exit_code == 0, result.output
    drafted, _ = load_manifest_with_positions(tmp_path / "qscore.yaml.draft")
    assert drafted.project.root == "src"
    assert drafted.circuits[0].source.builder == "builder.py::ghz"


def test_service_emits_diff_before_saving_and_never_prints(tmp_path: Path, capsys) -> None:
    root = builder_repo(tmp_path)
    messages = []

    def on_event(event):
        messages.append(event)
        if event.data.get("stage") == "draft":
            assert not (root / "qscore.yaml").exists()
            assert "+" in event.message

    result = services.discover_candidates(root, on_event, draft=True, pick="ghz", no_input=True)
    assert result.added == ["ghz"]
    assert result.draft_path == root / "qscore.yaml"
    assert [e.seq for e in messages] == list(range(1, len(messages) + 1))
    assert [e.data.get("stage") for e in messages[:2]] == ["discover", "draft"]
    assert capsys.readouterr().out == ""
    assert capsys.readouterr().err == ""


def test_existing_item_settings_survive_duplicate_pick(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    original = (
        "schema: qscore.project/v0.2\nproject: {name: demo}\ncircuits:\n"
        "  - id: mine  # researcher comment\n"
        "    source: {builder: builder.py::ghz, args: {n: 7}}\n"
        "    target: {backend: line-7}\n"
    )
    (root / "qscore.yaml").write_text(original)
    result = CliRunner().invoke(
        app, ["discover", str(root), "--draft", "--pick", "ghz", "--no-input"]
    )
    assert result.exit_code == 0, result.output
    assert "existing entry is kept" in result.output
    assert (root / "qscore.yaml").read_text() == original
    manifest, _ = load_manifest_with_positions(root / "qscore.yaml.draft")
    assert len(manifest.circuits) == 1
    assert manifest.circuits[0].source.args == {"n": 7}
    assert manifest.circuits[0].target.backend == "line-7"
    assert "# researcher comment" in (root / "qscore.yaml.draft").read_text()


def test_single_file_discovery_drafts_only_that_file(tmp_path: Path) -> None:
    root = builder_repo(tmp_path)
    (root / "other.qasm").write_text('OPENQASM 2.0; include "qelib1.inc"; qreg q[1];')
    result = CliRunner().invoke(
        app, ["discover", str(root / "builder.py"), "--draft", "--pick", "ghz", "--no-input"]
    )
    assert result.exit_code == 0, result.output
    assert "other.qasm" not in result.output
    manifest, _ = load_manifest_with_positions(root / "qscore.yaml")
    assert manifest.circuits[0].source.builder == "builder.py::ghz"


def test_unfinished_manifest_can_be_listed_and_extended(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text(
        "def first(n: int) -> QuantumCircuit:\n    return QuantumCircuit(n)\n"
        "def second() -> QuantumCircuit:\n    return QuantumCircuit(1)\n"
    )
    runner = CliRunner()
    first = runner.invoke(
        app, ["discover", str(tmp_path), "--draft", "--pick", "first", "--no-input"]
    )
    assert first.exit_code == 0, first.output
    original = (tmp_path / "qscore.yaml").read_text()
    assert "<required>" in original
    listed = runner.invoke(app, ["discover", str(tmp_path)])
    assert listed.exit_code == 0, listed.output
    assert "b.py::second" in listed.output
    second = runner.invoke(
        app, ["discover", str(tmp_path), "--draft", "--pick", "second", "--no-input"]
    )
    assert second.exit_code == 0, second.output
    assert (tmp_path / "qscore.yaml").read_text() == original
    text = (tmp_path / "qscore.yaml.draft").read_text()
    assert "<required>" in text and "b.py::second" in text


def test_invalid_utf8_values_returns_typed_error(tmp_path: Path) -> None:
    builder_repo(tmp_path)
    values = tmp_path / "values.yaml"
    values.write_bytes(b"\xff")
    result = CliRunner().invoke(
        app,
        [
            "discover",
            str(tmp_path),
            "--draft",
            "--pick",
            "ghz",
            "--no-input",
            "--values",
            str(values),
        ],
    )
    assert result.exit_code == 2, result.output
    assert "Q100" in result.output and "values.yaml" in result.output
    assert not (tmp_path / "qscore.yaml").exists()


def test_missing_discovery_files_are_aggregated(tmp_path: Path) -> None:
    builder_repo(tmp_path)
    for name in ("broken.py", "broken.qasm", "broken.ipynb"):
        (tmp_path / name).symlink_to(tmp_path / "absent")
    result = CliRunner().invoke(app, ["discover", str(tmp_path)])
    # ChP-0044: unreadable files are located warnings; the readable builder is still listed.
    assert result.exit_code == 0, result.output
    assert "builder.py::ghz" in result.output
    for name in ("broken.py", "broken.qasm", "broken.ipynb"):
        assert f"{name}:" in result.output
    assert result.output.count("Q200") == 3


def test_shared_function_names_get_the_file_stem(tmp_path: Path) -> None:
    # MQT Bench layout: every builder is `create_circuit`; ids name the file (lead, class B).
    body = builder_repo(tmp_path / "r")
    text = (body / "builder.py").read_text().replace("def ghz(", "def create_circuit(")
    (body / "ghz.py").write_text(text)
    (body / "qft.py").write_text(text)
    (body / "builder.py").unlink()
    result = CliRunner().invoke(
        app, ["discover", str(body), "--draft", "--pick", "1,2", "--no-input"]
    )
    assert result.exit_code == 0, result.output
    manifest = (body / "qscore.yaml").read_text()
    assert "id: ghz_create_circuit" in manifest and "id: qft_create_circuit" in manifest


def test_discover_lists_the_rest_and_warns_about_a_broken_file(tmp_path: Path) -> None:
    root = builder_repo(tmp_path / "r")
    (root / "broken.py").write_text("def build(:\n")
    result = CliRunner().invoke(app, ["discover", str(root)])
    assert result.exit_code == 0, result.output
    assert "builder.py::ghz" in result.output
    assert "broken.py:1:" in result.output and "Q301" in result.output
    assert "not scanned" in result.output
