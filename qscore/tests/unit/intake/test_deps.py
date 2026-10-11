"""Approved ChP-0039: dependency plans, isolated preparation and preserved failures."""

import json
import shlex
import subprocess
import sys
from pathlib import Path

import pytest

from qscore.errors import ConfigError, InvalidInput, RecordError
from qscore.intake import deps


def plan(root: Path, monkeypatch: pytest.MonkeyPatch) -> deps.DependencyPlan:
    monkeypatch.setattr(deps.shutil, "which", lambda _: "/tools/uv")
    (root / "requirements.txt").write_text("networkx\n")
    return deps.inspect_dependencies(root)


def test_static_inspection_never_executes_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(deps.shutil, "which", lambda _: "/tools/uv")
    (tmp_path / "setup.py").write_text("raise AssertionError('must not execute')\n")
    inspected = deps.inspect_dependencies(tmp_path)
    assert inspected.install_project
    assert [p.name for p in inspected.declarations] == ["setup.py"]
    assert "qiskit==" + inspected.qiskit_version in deps.render_plan(inspected)
    assert "build hooks" in deps.render_plan(inspected)
    assert not inspected.environment.exists()


@pytest.mark.parametrize("body", ["[tool.ruff]\nline-length=90\n", ""])
def test_no_installable_project(tmp_path, monkeypatch, body):
    monkeypatch.setattr(deps.shutil, "which", lambda _: "/tools/uv")
    (tmp_path / "pyproject.toml").write_text(body)
    with pytest.raises(InvalidInput, match="no installable"):
        deps.inspect_dependencies(tmp_path)


def test_missing_uv_is_configuration_error(tmp_path, monkeypatch):
    monkeypatch.setattr(deps.shutil, "which", lambda _: None)
    with pytest.raises(ConfigError, match="requires uv"):
        deps.inspect_dependencies(tmp_path)


def test_changed_inputs_do_not_install(tmp_path, monkeypatch):
    inspected = plan(tmp_path, monkeypatch)
    (tmp_path / "requirements.txt").write_text("qiskit<1\n")
    with pytest.raises(RecordError, match="changed after confirmation"):
        deps.prepare(inspected)
    assert not inspected.environment.parent.exists()


def test_resolver_failure_preserves_prior_environment_and_record(tmp_path, monkeypatch):
    inspected = plan(tmp_path, monkeypatch)
    inspected.environment.mkdir(parents=True)
    marker = inspected.environment / "original"
    marker.write_text("working")
    record = inspected.environment.parent / "deps.json"
    record.write_text("old metadata")
    calls = []

    def run(args, root):
        calls.append(args)
        if args[1] == "venv":
            Path(args[-1]).mkdir()
            return ""
        raise RecordError("No solution: qiskit<1 conflicts with engine pin")

    monkeypatch.setattr(deps, "_run", run)
    with pytest.raises(RecordError, match=r"No solution.*preparation files retained"):
        deps.prepare(inspected)
    assert marker.read_text() == "working"
    assert record.read_text() == "old metadata"
    assert "qiskit==" + inspected.qiskit_version in calls[1]
    assert "--constraint" in calls[1]
    assert list(inspected.environment.parent.glob("venv-preparing-*"))


@pytest.mark.parametrize("bad_versions", [False, True])
def test_verified_promotion_and_version_failure(tmp_path, monkeypatch, bad_versions):
    inspected = plan(tmp_path, monkeypatch)
    inspected.environment.mkdir(parents=True)
    marker = inspected.environment / "original"
    marker.touch()
    calls = []

    def run(args, root):
        calls.append(args)
        if args[1] == "venv":
            Path(args[-1]).mkdir()
            (Path(args[-1]) / "new").touch()
        elif args[1] == "-I":
            return json.dumps(
                {
                    "python": list(sys.version_info[:2]),
                    "qiskit": "wrong" if bad_versions else inspected.qiskit_version,
                }
            )
        elif args[1:3] == ["pip", "list"]:
            return json.dumps(
                [
                    {
                        "name": "qiskit",
                        "version": inspected.qiskit_version,
                        "editable_project_location": "private URL not retained",
                    }
                ]
            )
        return ""

    monkeypatch.setattr(deps, "_run", run)
    if bad_versions:
        with pytest.raises(ConfigError, match="the engine needs Python"):
            deps.prepare(inspected)
        assert marker.exists()
        assert not (inspected.environment.parent / "deps.json").exists()
    else:
        prepared = deps.prepare(inspected)
        assert prepared.environment == inspected.environment
        assert (inspected.environment / "new").exists()
        record = json.loads((inspected.environment.parent / "deps.json").read_text())
        assert record["inputs"] == inspected.hashes
        assert record["packages"] == [{"name": "qiskit", "version": inspected.qiskit_version}]
        assert any(c[1:3] == ["pip", "check"] for c in calls)
        kept = list(inspected.environment.parent.glob("venv-preparing-*/previous-venv"))
        assert kept and (kept[0] / "original").exists()
        assert prepared.previous == kept[0]


def test_install_logs_strip_credentials_and_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-sensitive-value")

    def run(args, **kwargs):
        assert "OPENAI_API_KEY" not in kwargs["env"]
        return subprocess.CompletedProcess(
            args,
            1,
            "",
            "conflict at "
            "https://user:pass@example.org/pkg?token=private-token test-sensitive-value",
        )

    monkeypatch.setattr(deps.subprocess, "run", run)
    with pytest.raises(RecordError) as exc:
        deps._run(["uv"], tmp_path)
    message = str(exc.value)
    assert "conflict" in message and "example.org/pkg" in message
    assert all(s not in message for s in ["user:pass", "private-token", "test-sensitive-value"])


def test_manifest_record_failure_rolls_back_promotion(tmp_path, monkeypatch):
    inspected = plan(tmp_path, monkeypatch)
    inspected.environment.mkdir(parents=True)
    (inspected.environment / "original").touch()
    record = inspected.environment.parent / "deps.json"
    record.write_text("old metadata")

    def run(args, root):
        if args[1] == "venv":
            Path(args[-1]).mkdir()
        elif args[1] == "-I":
            return json.dumps(
                {"python": list(sys.version_info[:2]), "qiskit": inspected.qiskit_version}
            )
        elif args[1:3] == ["pip", "list"]:
            return "[]"
        return ""

    monkeypatch.setattr(deps, "_run", run)

    def replace(*args):
        raise OSError("record write denied")

    monkeypatch.setattr(deps.os, "replace", replace)
    with pytest.raises(RecordError, match="record write denied"):
        deps.prepare(inspected)
    assert (inspected.environment / "original").exists()
    assert record.read_text() == "old metadata"


def test_plan_shows_the_exact_install_command(tmp_path, monkeypatch):
    inspected = plan(tmp_path, monkeypatch)
    staged = inspected.environment.parent / "venv-preparing-*"
    exact = deps.install_args(
        inspected,
        str(deps.environment_python(staged / "venv")),
        f"{staged}/qscore-constraints.txt (qiskit=={inspected.qiskit_version})",
    )
    shown = deps.render_plan(inspected).splitlines()
    assert f"Install: {shlex.join(exact)}" in shown
    assert exact[1:5] == ["pip", "install", "--no-config", "--no-python-downloads"]
    assert exact[-2:] == ["--requirement", str(tmp_path / "requirements.txt")]


def test_build_environment_keeps_proxies_but_not_secrets(monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy:3128")
    monkeypatch.setenv("no_proxy", "localhost")
    monkeypatch.setenv("HF_TOKEN", "hf_secret")
    env = deps._env()
    assert env["HTTPS_PROXY"] == "http://proxy:3128" and env["no_proxy"] == "localhost"
    assert "HF_TOKEN" not in env


@pytest.mark.parametrize(
    ("files", "expected"),
    [
        ({"pyproject.toml": "[tool.ruff]\nline-length = 99\n"}, False),
        ({"pyproject.toml": "[project]\nname = 'x'\n"}, True),
        ({"pyproject.toml": "not toml ["}, True),
        ({"requirements.txt": "networkx\n"}, True),
        ({}, False),
    ],
)
def test_discovery_hint_matches_what_deps_installs(tmp_path, files, expected):
    for name, body in files.items():
        (tmp_path / name).write_text(body)
    assert deps.declares_dependencies(tmp_path) is expected
