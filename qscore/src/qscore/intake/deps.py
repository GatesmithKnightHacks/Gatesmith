"""Explicit, isolated dependency preparation (approved ChP-0039)."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from qscore.errors import ConfigError, InvalidInput, RecordError
from qscore.logging import redact
from qscore.schemas.common import sha256_hex


@dataclass(frozen=True)
class DependencyPlan:
    root: Path
    environment: Path
    declarations: tuple[Path, ...]
    install_project: bool
    qiskit_version: str
    python_executable: str
    uv: str
    hashes: dict[str, str]


def environment_python(environment: Path) -> Path:
    return environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def inspect_dependencies(root: Path) -> DependencyPlan:
    """Read declarations only. Never import a project or execute its metadata here."""
    root = root.resolve()
    if not root.is_dir():
        raise InvalidInput(f"project directory not found: {root}", report=None)
    uv = shutil.which("uv")
    if uv is None:
        raise ConfigError("qscore deps requires uv on PATH")
    declarations: list[Path] = []
    pyproject = root / "pyproject.toml"
    install_project = False
    if pyproject.is_file():
        try:
            doc = tomllib.loads(pyproject.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
            raise InvalidInput(
                f"cannot read {pyproject.name}: {_safe(str(exc))}", report=None
            ) from exc
        install_project = "project" in doc or "build-system" in doc
        if install_project:
            declarations.append(pyproject)
    for name in ("setup.py", "setup.cfg"):
        path = root / name
        if path.is_file():
            declarations.append(path)
            install_project = True
    requirements = root / "requirements.txt"
    if requirements.is_file():
        declarations.append(requirements)
    if not declarations:
        raise InvalidInput(
            "no installable pyproject.toml, setup.py/setup.cfg or requirements.txt found",
            report=None,
        )
    try:
        hashes = {p.name: sha256_hex(p.read_bytes()) for p in declarations}
    except OSError as exc:
        raise RecordError(f"cannot read dependency declaration: {exc}") from exc
    return DependencyPlan(
        root,
        root / ".qscore/venv",
        tuple(declarations),
        install_project,
        version("qiskit"),
        sys.executable,
        uv,
        hashes,
    )


def render_plan(plan: DependencyPlan) -> str:
    inputs = ", ".join(p.name for p in plan.declarations)
    targets = ["."] if plan.install_project else []
    if any(p.name == "requirements.txt" for p in plan.declarations):
        targets += ["-r", "requirements.txt"]
    return (
        f"Project: {plan.root}\nDeclarations: {inputs}\nEnvironment: {plan.environment}\n"
        f"Python: {plan.python_executable}; required qiskit=={plan.qiskit_version}\n"
        f"Install: uv pip install --python <new environment> --constraint <engine pin> "
        f"qiskit=={plan.qiskit_version} {' '.join(targets)}\n"
        "Package build hooks can execute repository code as your user and access the network. "
        "The engine environment is not modified."
    )


def _env() -> dict[str, str]:
    # Package build hooks are repository code too. Do not pass API/cloud credentials.
    names = {
        "PATH",
        "HOME",
        "USERPROFILE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "UV_CACHE_DIR",
        "UV_OFFLINE",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    }
    return {k: v for k, v in os.environ.items() if k in names}


def _safe(text: str) -> str:
    def url(match: re.Match[str]) -> str:
        raw = match.group(0)
        try:
            parts = urlsplit(raw)
            host = parts.netloc.rsplit("@", 1)[-1]
            return urlunsplit((parts.scheme, host, parts.path, "", ""))
        except ValueError:
            return "<redacted URL>"

    return re.sub(r"[a-zA-Z][a-zA-Z0-9+.-]*://[^\s<>]+", url, redact(text))


def _run(args: list[str], root: Path) -> str:
    try:
        result = subprocess.run(
            args, cwd=root, env=_env(), capture_output=True, text=True, check=False, timeout=900
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecordError(f"dependency preparation failed: {_safe(str(exc))}") from exc
    if result.returncode:
        raise RecordError(
            f"dependency preparation failed (exit {result.returncode}): "
            f"{_safe(result.stderr.strip() or result.stdout.strip())}"
        )
    return result.stdout


def prepare(plan: DependencyPlan) -> Path:
    """Prepare after confirmation; failures preserve the previous environment."""
    for path in plan.declarations:
        try:
            current = sha256_hex(path.read_bytes())
        except OSError as exc:
            raise RecordError(
                f"cannot read approved dependency declaration {path.name}: {exc}"
            ) from exc
        if current != plan.hashes[path.name]:
            raise RecordError(f"{path.name} changed after confirmation; run qscore deps again")
    parent = plan.environment.parent
    staging = parent
    try:
        parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix="venv-preparing-", dir=parent))
        constraint = staging / "qscore-constraints.txt"
        constraint.write_text(f"qiskit=={plan.qiskit_version}\n", encoding="utf-8")
        # Keep the constraint outside the directory uv creates.
        staged_env = staging / "venv"
        _run(
            [
                plan.uv,
                "venv",
                "--no-config",
                "--no-project",
                "--no-python-downloads",
                "--relocatable",
                "--python",
                plan.python_executable,
                str(staged_env),
            ],
            plan.root,
        )
        python = environment_python(staged_env)
        args = [
            plan.uv,
            "pip",
            "install",
            "--no-config",
            "--no-python-downloads",
            "--python",
            str(python),
            "--constraint",
            str(constraint),
            f"qiskit=={plan.qiskit_version}",
        ]
        if plan.install_project:
            args.append(str(plan.root))
        if any(p.name == "requirements.txt" for p in plan.declarations):
            args += ["--requirement", str(plan.root / "requirements.txt")]
        _run(args, plan.root)
        facts = json.loads(
            _run(
                [
                    str(python),
                    "-I",
                    "-c",
                    "import json,sys; from importlib.metadata import version; "
                    "print(json.dumps({'python':list(sys.version_info[:2]),'qiskit':version('qiskit')}))",
                ],
                plan.root,
            )
        )
        if facts != {"python": list(sys.version_info[:2]), "qiskit": plan.qiskit_version}:
            raise RecordError("prepared environment has incompatible Python or Qiskit")
        _run([plan.uv, "pip", "check", "--no-config", "--python", str(python)], plan.root)
        packages = json.loads(
            _run(
                [
                    plan.uv,
                    "pip",
                    "list",
                    "--no-config",
                    "--python",
                    str(python),
                    "--format",
                    "json",
                ],
                plan.root,
            )
        )
        if not isinstance(packages, list) or any(
            not isinstance(p, dict)
            or not isinstance(p.get("name"), str)
            or not isinstance(p.get("version"), str)
            for p in packages
        ):
            raise RecordError("uv returned an invalid installed-package list")
        record = {
            "inputs": plan.hashes,
            "python": facts["python"],
            "qiskit": plan.qiskit_version,
            "packages": sorted(
                ({"name": p["name"], "version": p["version"]} for p in packages),
                key=lambda p: p["name"],
            ),
        }
        metadata = staging / "deps.json"
        metadata.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        previous = staging / "previous-venv"
        if plan.environment.exists():
            plan.environment.rename(previous)
        try:
            staged_env.rename(plan.environment)
            os.replace(metadata, parent / "deps.json")
        except OSError:
            # Roll back a failed promotion, preserving the exact prior environment.
            if plan.environment.exists():
                plan.environment.rename(staged_env)
            if previous.exists():
                previous.rename(plan.environment)
            raise
    except (OSError, json.JSONDecodeError, RecordError) as exc:
        raise RecordError(f"{_safe(str(exc))}; preparation files retained in {staging}") from exc
    return plan.environment
