"""Dependency confirmation, exact manifest edits and CLI negation (ChP-0039)."""

import pytest
from typer.testing import CliRunner

from qscore import services
from qscore.cli import app
from qscore.errors import ConfigError, InvalidInput, RecordError
from qscore.intake import deps


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(deps.shutil, "which", lambda _: "/tools/uv")
    root = tmp_path / "src"
    root.mkdir()
    (root / "requirements.txt").write_text("networkx\n")
    manifest = tmp_path / "qscore.yaml"
    manifest.write_text(
        "schema: qscore.project/v0.2\nproject:\n  name: deps\n"
        "  root: src # research path\n  runner:\n    timeout_s: 30 # keep limit\n"
        "circuits: []\n"
    )
    return root, manifest


def test_refusal_does_not_install_or_edit(project, monkeypatch):
    root, manifest = project
    before = manifest.read_bytes()
    seen = []
    monkeypatch.setattr(deps, "prepare", lambda _: pytest.fail("must not install"))

    def confirm(summary):
        seen.append(summary)
        return False

    result = services.prepare_dependencies(manifest, confirm=confirm)
    assert not result.installed
    assert manifest.read_bytes() == before
    assert not (root / ".qscore").exists()
    assert "+    env: uv" in seen[0]
    assert str(root) in seen[0]


def test_success_updates_only_env_with_comments(project, monkeypatch):
    root, manifest = project
    seen = []
    monkeypatch.setattr(deps, "prepare", lambda plan: plan.environment)
    result = services.prepare_dependencies(manifest, seen.append, confirm="yes")
    assert result.installed and result.environment == root / ".qscore/venv"
    text = manifest.read_text()
    assert "root: src # research path" in text
    assert "timeout_s: 30 # keep limit" in text
    assert "env: uv" in text
    assert "build hooks" in seen[0].message


def test_changed_manifest_not_overwritten(project, monkeypatch):
    _, manifest = project

    def prepare(plan):
        manifest.write_text("researcher edit\n")
        return plan.environment

    monkeypatch.setattr(deps, "prepare", prepare)
    with pytest.raises(RecordError, match="changed"):
        services.prepare_dependencies(manifest, confirm="yes")
    assert manifest.read_text() == "researcher edit\n"


@pytest.mark.parametrize(
    "args",
    [
        ["score", "--yes", "--not", "unknown"],
        ["score", "--not", "input"],
        ["score", "--not", "confirm,"],
        ["discover", "--not", "confirm"],
        ["deps", "--not", "input"],
        ["deps", "--not", ""],
    ],
)
def test_invalid_negation_is_exit_two(args):
    result = CliRunner().invoke(app, args)
    assert result.exit_code == 2, result.output
    assert "valid names" in result.output


@pytest.mark.parametrize("color", [False, True])
def test_old_flag_has_migration_hint(color):
    result = CliRunner().invoke(
        app, ["discover", "--no-input"], color=color, env={"COLUMNS": "28", "FORCE_COLOR": "1"}
    )
    assert result.exit_code == 2
    assert "use --not input" in result.output


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (ConfigError("missing uv"), 4),
        (InvalidInput("no requirements", report=None), 2),
        (RecordError("resolver conflict"), 3),
    ],
)
def test_deps_cli_exit_codes(monkeypatch, error, code):
    def prepare(*args, **kwargs):
        assert kwargs["confirm"] == "yes"
        raise error

    monkeypatch.setattr(services, "prepare_dependencies", prepare)
    result = CliRunner().invoke(app, ["deps", "--not", "confirm", "--not", "confirm"])
    assert result.exit_code == code, result.output
    assert str(error) in result.output


def test_completion_respects_command_and_comma_prefix():
    from typer.main import get_command

    command = get_command(app)
    for name, incomplete, expected in [
        ("discover", "in", ["input"]),
        ("discover", "input,c", ["input,confirm"]),
        ("score", "", ["confirm"]),
        ("deps", "i", []),
    ]:
        child = command.commands[name]
        with child.make_context(name, [], resilient_parsing=True) as context:
            option = next(p for p in child.params if "--not" in p.opts)
            assert [item.value for item in option.shell_complete(context, incomplete)] == expected


def test_score_negation_records_yes_flag(tmp_path):
    import json

    circuit = tmp_path / "bell.qasm"
    circuit.write_text('OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; h q[0]; cx q[0],q[1];')
    out = tmp_path / "out"
    result = CliRunner().invoke(app, ["score", str(circuit), "--not", "confirm", "--out", str(out)])
    assert result.exit_code == 0, result.output
    run = json.loads((out / "run.json").read_text())
    assert run["confirmation"]["mode"] == "yes_flag"


def test_discover_repeated_negation_selects_exclusion_then_scores(tmp_path):
    (tmp_path / "circuits.py").write_text(
        "from qiskit import QuantumCircuit\n"
        "def a() -> QuantumCircuit: return QuantumCircuit(2)\n"
        "def b() -> QuantumCircuit: return QuantumCircuit(2)\n"
    )
    out = tmp_path / "out"
    result = CliRunner().invoke(
        app,
        [
            "discover",
            str(tmp_path),
            "--draft",
            "--pick",
            "not:a",
            "--not",
            "input",
            "--not",
            "confirm",
            "--score",
            "--out",
            str(out),
        ],
    )
    assert result.exit_code == 0, result.output
    assert (out / "scorecards/b.json").exists()
    assert not (out / "scorecards/a.json").exists()


def test_deps_eof_preserves_native_abort_without_install(project, monkeypatch):
    root, manifest = project
    before = manifest.read_bytes()
    monkeypatch.setattr(deps, "prepare", lambda _: pytest.fail("aborted confirmation installed"))
    result = CliRunner().invoke(app, ["deps", str(manifest)], input="")
    assert result.exit_code == 1, result.output
    assert "Aborted" in result.output and "Traceback" not in result.output
    assert manifest.read_bytes() == before
    assert not (root / ".qscore").exists()
