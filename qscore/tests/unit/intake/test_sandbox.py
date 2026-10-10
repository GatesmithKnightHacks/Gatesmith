"""Builder sandbox: success, Q300-Q303 failure kinds, secrets stripped (05 §4.1-4.2)."""

from pathlib import Path

import pytest

from qscore.errors import SandboxError
from qscore.intake.sandbox import BuilderRequest, child_env, run_builder

BUILDERS = """
import os
from qiskit import QuantumCircuit
from helper import width


def ghz(n):
    qc = QuantumCircuit(width(n))
    qc.h(0)
    for i in range(1, qc.num_qubits):
        qc.cx(0, i)
    return qc


def boom(n):
    raise ValueError(f"bad n={n}")


def not_circuit():
    return 42


def sleepy():
    import time
    time.sleep(30)


def env_probe():
    qc = QuantumCircuit(1)
    qc.name = ",".join(sorted(k for k in os.environ if k.startswith("QSCORE_TEST_")))
    return qc
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "builders.py").write_text(BUILDERS, encoding="utf-8")
    (tmp_path / "helper.py").write_text("def width(n):\n    return n\n", encoding="utf-8")
    (tmp_path / "broken.py").write_text("import not_a_real_module_xyz\n", encoding="utf-8")
    return tmp_path


def call(repo: Path, function: str, file: str = "builders.py", timeout_s: float = 60, **args):
    request = BuilderRequest(repo, repo / file, function, dict(args))
    return run_builder(request, timeout_s=timeout_s, mem_mb=4096)


def test_builds_circuit_with_project_root_on_path(repo: Path) -> None:
    result = call(repo, "ghz", n=3)
    assert result.circuit.num_qubits == 3
    assert result.circuit.count_ops() == {"h": 1, "cx": 2}
    assert len(result.circuit_sha256) == 64


def test_same_build_same_hash(repo: Path) -> None:
    assert call(repo, "ghz", n=3).circuit_sha256 == call(repo, "ghz", n=3).circuit_sha256


def test_import_error_is_q301_kind(repo: Path) -> None:
    with pytest.raises(SandboxError) as err:
        call(repo, "ghz", file="broken.py")
    assert err.value.kind == "import_error"
    assert "not_a_real_module_xyz" in str(err.value)


def test_user_exception_trimmed_to_user_files(repo: Path) -> None:
    with pytest.raises(SandboxError) as err:
        call(repo, "boom", n=7)
    assert err.value.kind == "user_exception"
    text = str(err.value)
    assert "builders.py" in text and "ValueError: bad n=7" in text
    assert "runner.py" not in text


def test_not_a_circuit(repo: Path) -> None:
    with pytest.raises(SandboxError) as err:
        call(repo, "not_circuit")
    assert err.value.kind == "not_a_circuit"


def test_timeout(repo: Path) -> None:
    with pytest.raises(SandboxError) as err:
        call(repo, "sleepy", timeout_s=2)
    assert err.value.kind == "timeout"


def test_secrets_stripped_from_child(repo: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("QSCORE_TEST_TOKEN", "QSCORE_TEST_API_KEY", "QSCORE_TEST_MY_SECRET"):
        monkeypatch.setenv(name, "x")
    monkeypatch.setenv("QSCORE_TEST_PLAIN", "x")
    assert call(repo, "env_probe").circuit.name == "QSCORE_TEST_PLAIN"


@pytest.mark.parametrize(
    "name",
    [
        "GITHUB_TOKEN",
        "AWS_SECRET_ACCESS_KEY",
        "QSCORE_NEON_DSN",
        "HF_HOME",
        "NEON_X",
        "GEMINI_API_KEY",
        "OPENAI_ORG",
        "client_secret",
    ],
)
def test_child_env_drops(name: str) -> None:
    assert child_env({name: "x", "PATH": "/bin"}) == {"PATH": "/bin"}
