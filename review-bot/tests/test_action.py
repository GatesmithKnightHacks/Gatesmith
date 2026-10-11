from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError
from qscore.schemas.scorecard import Scorecard
from qscore.schemas.versions import SCORE_VERSION
from ruamel.yaml import YAML

from qscore_review.action import (
    ENGINE_REVISION,
    _clean_environment,
    _cli,
    load_config,
    produce_bundle,
)
from qscore_review.contracts import BundleProvenance, RepoConfig, ReviewBundle


@pytest.fixture
def provenance() -> BundleProvenance:
    return BundleProvenance(
        repository="owner/repo",
        repository_id=1,
        pull_request=2,
        workflow_id=3,
        workflow_path=".github/workflows/qscore.yml",
        run_id=4,
        run_attempt=1,
        base_sha="a" * 40,
        head_sha="b" * 40,
        engine_revision=ENGINE_REVISION,
        score_version=SCORE_VERSION,
        settings_sha256="0" * 64,
        fork=False,
    )


def circuit_repo(path: Path, *, head: bool = False) -> Path:
    path.mkdir()
    (path / "qscore.yaml").write_text(
        "schema: qscore.project/v0.2\nproject: {name: bell, root: .}\n"
        "defaults:\n  target: {backend: line-2}\n"
        "  execution: {device: cpu, transpiler_seeds: [11, 23]}\n"
        "circuits:\n  - id: bell\n    source: {qasm: bell.qasm}\n"
    )
    text = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];\n'
    if head:
        text += "rz(0.37) q[1];\ncx q[0],q[1];\n"
    (path / "bell.qasm").write_text(text)
    return path


def test_real_base_head_qasm_bundle(tmp_path: Path, provenance: BundleProvenance) -> None:
    base = circuit_repo(tmp_path / "base")
    head = circuit_repo(tmp_path / "head", head=True)
    out = tmp_path / "bundle"
    result = produce_bundle(base, head, out, provenance)
    assert (result.base.exit_code, result.head.exit_code) == (0, 0)
    assert result.base.run == "base/run.json"
    assert result.head.compiled_qasm == ["head/compiled/bell.qasm"]
    base_card = Scorecard.model_validate_json((out / result.base.scorecards[0]).read_text())
    head_card = Scorecard.model_validate_json((out / result.head.scorecards[0]).read_text())
    assert base_card.compile is not None and head_card.compile is not None
    assert base_card.compile.seeds == head_card.compile.seeds == [11, 23]
    base_count = next(
        metric.value for metric in base_card.metrics if metric.id == "two_qubit_count"
    )
    head_count = next(
        metric.value for metric in head_card.metrics if metric.id == "two_qubit_count"
    )
    assert head_count > base_count
    parsed = ReviewBundle.model_validate_json((out / "envelope.json").read_text())
    assert parsed == result
    assert (out / "base/settings.json").read_bytes() == (out / "head/settings.json").read_bytes()
    for name, digest in result.checksums.items():
        assert hashlib.sha256((out / name).read_bytes()).hexdigest() == digest
    assert "base/settings.json" in result.checksums
    assert "envelope.json" not in result.checksums


def test_invalid_input_retains_cli_exit_and_structured_revalidation(
    tmp_path: Path, provenance: BundleProvenance
):
    base = circuit_repo(tmp_path / "base")
    head = circuit_repo(tmp_path / "head")
    (head / "qscore.yaml").write_text("schema: qscore.project/v0.9\nproject: {name: broken}\n")
    out = tmp_path / "bundle"
    result = produce_bundle(base, head, out, provenance)
    assert result.head.exit_code == 2
    assert result.head.run is None
    assert result.head.issues == "head/issues.json"
    issues = json.loads((out / result.head.issues).read_text())
    assert issues["schema"] == "qscore.issues/v0.2"
    assert any(issue["code"] == "Q106" for issue in issues["issues"])
    assert result.head.error == "head/error.json"
    assert json.loads((out / result.head.error).read_text())["exit_code"] == 2


def test_no_manifest_is_discovery_with_required_draft(
    tmp_path: Path, provenance: BundleProvenance
) -> None:
    roots = [tmp_path / "base", tmp_path / "head"]
    for root in roots:
        root.mkdir()
        (root / "circuit.py").write_text(
            "from qiskit import QuantumCircuit\n"
            "def build(n: int) -> QuantumCircuit:\n    return QuantumCircuit(n)\n"
        )
    out = tmp_path / "bundle"
    result = produce_bundle(*roots, out, provenance)
    assert result.head.exit_code == 0
    assert result.head.run is None
    assert result.head.discovery == "head/discovery.json"
    discovery = json.loads((out / result.head.discovery).read_text())
    assert discovery["candidates"][0]["name"] == "build"
    assert "<required>" in (out / "head/qscore.suggested.yaml").read_text()
    assert not result.head.scorecards


def test_opt_in_policy_comes_from_base_only(tmp_path: Path, provenance: BundleProvenance) -> None:
    base = circuit_repo(tmp_path / "base")
    head = circuit_repo(tmp_path / "head")
    (head / ".github").mkdir()
    (head / ".github/qscore-review.yml").write_text("version: 1\ngemini: true\n")
    seen = []

    def fake(root: Path, out: Path, config: RepoConfig) -> int:
        seen.append(config.gemini)
        return 4

    result = produce_bundle(base, head, tmp_path / "bundle", provenance, runner=fake)
    assert seen == [False, False]
    assert not result.config.gemini
    assert result.head.exit_code == 4


def test_unknown_configuration_and_path_escape_fail(tmp_path: Path) -> None:
    (tmp_path / ".github").mkdir()
    path = tmp_path / ".github/qscore-review.yml"
    path.write_text("version: 1\nunknown: true\n")
    with pytest.raises(ValidationError):
        load_config(tmp_path)
    path.write_text("version: 1\nmanifest: ../outside.yaml\n")
    with pytest.raises(ValueError, match="unsafe repository path"):
        load_config(tmp_path)


def test_scoring_environment_strips_provider_and_ci_tokens(tmp_path: Path, monkeypatch) -> None:
    for name in ("GITHUB_TOKEN", "GEMINI_API_KEY", "HF_TOKEN", "QSCORE_PLATFORM_URL", "PYTHONPATH"):
        monkeypatch.setenv(name, "secret")
    env = _clean_environment(tmp_path)
    for name in ("GITHUB_TOKEN", "GEMINI_API_KEY", "HF_TOKEN", "QSCORE_PLATFORM_URL", "PYTHONPATH"):
        assert name not in env
    assert env["QSCORE_PROFILE"] == "ci"
    assert env["QSCORE_DEVICE_DEFAULT"] == "cpu"
    assert not Path(env["QSCORE_CACHE_DIR"]).is_relative_to(tmp_path)


def test_exact_cli_configuration_exit_is_not_changed(tmp_path: Path, monkeypatch) -> None:
    root, out = tmp_path / "root", tmp_path / "out"
    root.mkdir()
    out.mkdir()
    (root / "qscore.yaml").write_text("invalid")

    def run(*args, **kwargs):
        assert "GITHUB_TOKEN" not in kwargs["env"]
        return subprocess.CompletedProcess(args[0], 4, "", "ConfigError: explicit failure")

    monkeypatch.setattr(subprocess, "run", run)
    assert _cli(root, out, RepoConfig()) == 4
    assert json.loads((out / "error.json").read_text())["exit_code"] == 4


def test_action_and_example_keep_pull_request_unprivileged() -> None:
    package = Path(__file__).parents[1]
    workflow = YAML(typ="safe").load((package / "examples/qscore-review.yml").read_text())
    assert "pull_request" in workflow["on"]
    assert "pull_request_target" not in workflow["on"]
    assert workflow["permissions"] == {"contents": "read", "actions": "read"}
    action = YAML(typ="safe").load((package / "action/action.yml").read_text())
    checkouts = [
        step
        for step in action["runs"]["steps"]
        if step.get("uses", "").startswith("actions/checkout@")
    ]
    assert len(checkouts) == 2
    assert all(step["with"]["persist-credentials"] is False for step in checkouts)
    assert all(".sha" in step["with"]["ref"] for step in checkouts)


def test_configured_single_qasm_uses_explicit_target(
    tmp_path: Path, provenance: BundleProvenance
) -> None:
    base = circuit_repo(tmp_path / "base")
    head = circuit_repo(tmp_path / "head")
    (base / ".github").mkdir()
    (base / ".github/qscore-review.yml").write_text(
        "version: 1\nmanifest: bell.qasm\ntarget: line-5\n"
    )
    out = tmp_path / "bundle"
    result = produce_bundle(base, head, out, provenance)
    assert result.head.exit_code == 0
    card = Scorecard.model_validate_json((out / result.head.scorecards[0]).read_text())
    assert card.target is not None
    assert card.target.name == "line-5"
