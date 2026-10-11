"""Configured uv environments fail explicitly before a builder runs (ChP-0039)."""

import json
import subprocess
import sys
from importlib.metadata import version

import pytest

from qscore.errors import ConfigError
from qscore.intake import sandbox
from qscore.intake.deps import environment_python


def test_missing_project_interpreter_is_not_engine_fallback(tmp_path):
    with pytest.raises(ConfigError, match="qscore deps"):
        sandbox.project_python(tmp_path, 10, 4096)


@pytest.mark.parametrize(
    "facts",
    [
        {"python": [1, 0], "qiskit": version("qiskit")},
        {"python": list(sys.version_info[:2]), "qiskit": "0.1"},
    ],
)
def test_version_mismatch_rejected_before_builder(tmp_path, monkeypatch, facts):
    python = environment_python(tmp_path / ".qscore/venv")
    python.parent.mkdir(parents=True)
    python.touch()
    monkeypatch.setenv("OPENAI_API_KEY", "sensitive-test-value")

    def run(args, **kwargs):
        assert args[:2] == [str(python), "-I"]
        assert "OPENAI_API_KEY" not in kwargs["env"]
        assert kwargs["timeout"] == 10
        return subprocess.CompletedProcess(args, 0, json.dumps(facts), "")

    monkeypatch.setattr(sandbox.subprocess, "run", run)
    with pytest.raises(ConfigError, match="needs Python"):
        sandbox.project_python(tmp_path, 10, 4096)
