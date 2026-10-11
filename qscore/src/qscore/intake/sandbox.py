"""Run a builder in a separate process (specs/05-pipeline.md §4.2, ★ process mode).

The child is ``python -I intake/runner.py request.json`` with a timeout, ``RLIMIT_AS = mem_mb``
and ``RLIMIT_CPU``, a temporary working directory (line mode: the builder file's directory,
ChP-0037 §2.1 D, set by the runner) and an environment stripped of secrets. The
sandbox is not a security boundary for hostile code (R10): builders come only from curated
example repos or the user's own repo in laptop mode.
"""

from __future__ import annotations

import io
import json
import math
import os
import re
import signal
import subprocess
import sys
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from importlib.metadata import version
from pathlib import Path

from qiskit import QuantumCircuit, qpy
from qiskit.qpy.exceptions import QpyError

from qscore.config import get_settings
from qscore.errors import ConfigError, SandboxError
from qscore.schemas.common import sha256_hex

RUNNER = Path(__file__).with_name("runner.py")

# Stripped from the child's environment (05 §4.2).
_SECRET = re.compile(r"(_TOKEN|_KEY|_DSN)$|SECRET|^(HF|GEMINI|OPENAI)_", re.IGNORECASE)


@dataclass(frozen=True)
class BuilderRequest:
    """One builder call: ``file::function(**args)`` with ``project_root`` on ``sys.path``.

    Line mode (ChP-0037): ``source_text`` is the script prefix from ``intake.script.prefix``
    (statements at or before ``line``), run in ``cwd``; ``function`` then names a circuit
    variable or a function. ``line`` is only used to name the line in a missing-name message.
    """

    project_root: Path
    file: Path
    function: str
    args: dict[str, object] = field(default_factory=dict)
    source_text: str | None = None
    cwd: Path | None = None
    line: int | None = None

    def __post_init__(self) -> None:
        line_mode = (self.source_text is not None, self.cwd is not None, self.line is not None)
        if any(line_mode) and not all(line_mode):
            raise ValueError("line mode needs source_text, cwd and line together")


@dataclass(frozen=True)
class SandboxResult:
    circuit: QuantumCircuit
    qpy_bytes: bytes

    @property
    def circuit_sha256(self) -> str:
        return sha256_hex(self.qpy_bytes)


def child_env(environ: dict[str, str]) -> dict[str, str]:
    """The parent environment without secrets."""
    return {k: v for k, v in environ.items() if not _SECRET.search(k)}


def _limits(timeout_s: float, mem_mb: int) -> Callable[[], None] | None:
    if sys.platform == "win32":
        if get_settings().sandbox_mode != "process-unlimited":
            raise ConfigError(
                "the builder sandbox needs rlimits, which Windows lacks; "
                "set QSCORE_SANDBOX_MODE=process-unlimited to run builders without them"
            )
        return None
    import resource

    def apply() -> None:
        mem = mem_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        # Soft < hard: the kernel sends SIGXCPU at the soft limit, so a CPU-time kill is
        # recognisable as a timeout (Q300) rather than an unexplained SIGKILL.
        cpu = math.ceil(timeout_s) + 1
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))

    return apply


def project_python(root: Path, timeout_s: float, mem_mb: int) -> Path:
    """Check the explicitly configured uv interpreter before any builder code runs."""
    python = (
        root / ".qscore/venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    )
    hint = f"Run qscore deps {root} to prepare the project environment."
    if not python.is_file():
        raise ConfigError(f"project runner interpreter missing: {python}. {hint}")
    command = (
        "import json,sys; from importlib.metadata import version; "
        "print(json.dumps({'python':list(sys.version_info[:2]), 'qiskit':version('qiskit')}))"
    )
    try:
        with tempfile.TemporaryDirectory(prefix="qscore-env-check-") as work:
            result = subprocess.run(
                [str(python), "-I", "-c", command],
                cwd=work,
                env=child_env(dict(os.environ)),
                preexec_fn=_limits(timeout_s, mem_mb),
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout_s,
            )
        if result.returncode != 0:
            raise ConfigError(
                f"project environment version check failed (exit {result.returncode}). {hint}"
            )
        facts = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        raise ConfigError(
            f"could not verify project environment: {type(exc).__name__}. {hint}"
        ) from exc
    expected = {"python": list(sys.version_info[:2]), "qiskit": version("qiskit")}
    if facts != expected:
        raise ConfigError(
            f"project environment needs Python {sys.version_info.major}.{sys.version_info.minor} "
            f"and qiskit=={expected['qiskit']}. {hint}"
        )
    return python


def run_builder(
    request: BuilderRequest, timeout_s: float, mem_mb: int, *, python: Path | None = None
) -> SandboxResult:
    """Build the circuit in the sandbox; failures raise ``SandboxError`` (Q300-Q303)."""
    preexec = _limits(timeout_s, mem_mb)
    with tempfile.TemporaryDirectory(prefix="qscore-builder-") as tmp:
        work = Path(tmp)
        qpy_path, status_path = work / "circuit.qpy", work / "status.json"
        payload = {
            "project_root": str(request.project_root.resolve()),
            "file": str(request.file.resolve()),
            "function": request.function,
            "args": request.args,
            "source_text": request.source_text,
            "cwd": None if request.cwd is None else str(request.cwd.resolve()),
            "line": request.line,
            "qpy": str(qpy_path),
            "status": str(status_path),
        }
        (work / "request.json").write_text(json.dumps(payload), encoding="utf-8")
        where = f"{request.file.name}::{request.function}"
        try:
            proc = subprocess.run(
                [
                    str(python) if python is not None else sys.executable,
                    "-I",
                    str(RUNNER),
                    str(work / "request.json"),
                ],
                cwd=work,
                env=child_env(dict(os.environ)),
                preexec_fn=preexec,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise SandboxError(f"{where} timed out after {timeout_s:g} s", "timeout") from exc
        cpu_killed = sys.platform != "win32" and proc.returncode == -signal.SIGXCPU
        if not status_path.is_file() and cpu_killed:
            raise SandboxError(
                f"{where} exceeded the CPU-time limit for {timeout_s:g} s", "timeout"
            )
        if not status_path.is_file():
            # Killed before reporting (signal, RLIMIT_AS): the builder's own process failed.
            stderr = proc.stderr.strip().splitlines()[-1:] or ["no output"]
            raise SandboxError(
                f"{where} exited with code {proc.returncode} without a status: {stderr[0]}",
                "user_exception",
            )
        status = json.loads(status_path.read_text(encoding="utf-8"))
        if not status["ok"]:
            raise SandboxError(f"{where}: {status['traceback'].rstrip()}", status["kind"])
        data = qpy_path.read_bytes()
    try:
        (circuit,) = qpy.load(io.BytesIO(data))
    except (QpyError, TypeError) as exc:
        # Qiskit cannot rebuild some library gates from QPY (e.g. FullAdderGate): Q306.
        raise SandboxError(
            f"{where}: the engine cannot reload the builder's QPY "
            f"({type(exc).__name__}: {exc}); decompose library gates before returning",
            "qpy_incompatible",
        ) from exc
    return SandboxResult(circuit, data)
