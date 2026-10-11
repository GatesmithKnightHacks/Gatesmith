"""Explicit, isolated dependency preparation (approved ChP-0039)."""

from __future__ import annotations

import json
import os
import re
import shlex
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


@dataclass(frozen=True)
class Prepared:
    environment: Path
    previous: Path | None  # the replaced environment, kept (never deleted automatically)


def environment_python(environment: Path) -> Path:
    return environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def _installable_pyproject(doc: dict[str, object]) -> bool:
    return "project" in doc or "build-system" in doc


def declares_dependencies(root: Path) -> bool:
    """Whether `qscore deps` would find a declaration (static; for discovery hints). An
    unreadable pyproject.toml counts: `qscore deps` then reports the read error itself."""
    if any((root / n).is_file() for n in ("setup.py", "setup.cfg", "requirements.txt")):
        return True
    pyproject = root / "pyproject.toml"
    if not pyproject.is_file():
        return False
    try:
        return _installable_pyproject(tomllib.loads(pyproject.read_text(encoding="utf-8")))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError):
        return True


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
        install_project = _installable_pyproject(doc)
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


def install_args(plan: DependencyPlan, python: str, constraint: str) -> list[str]:
    """The exact install command; `render_plan` shows it before confirmation."""
    args = [
        plan.uv,
        "pip",
        "install",
        "--no-config",
        "--no-python-downloads",
        "--python",
        python,
        "--constraint",
        constraint,
        f"qiskit=={plan.qiskit_version}",
    ]
    if plan.install_project:
        args.append(str(plan.root))
    if any(p.name == "requirements.txt" for p in plan.declarations):
        args += ["--requirement", str(plan.root / "requirements.txt")]
    return args


def render_plan(plan: DependencyPlan) -> str:
    inputs = ", ".join(p.name for p in plan.declarations)
    staged = plan.environment.parent / "venv-preparing-*"
    command = install_args(
        plan,
        str(environment_python(staged / "venv")),
        f"{staged}/qscore-constraints.txt (qiskit=={plan.qiskit_version})",
    )
    return (
        f"Project: {plan.root}\nDeclarations: {inputs}\nEnvironment: {plan.environment}\n"
        f"Python: {plan.python_executable}; required qiskit=={plan.qiskit_version}\n"
        f"Install: {shlex.join(command)}\n"
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
        # Package indexes behind an egress proxy; credentials in these URLs are redacted
        # from any output by `_safe`.
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
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


def prepare(plan: DependencyPlan) -> Prepared:
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
        _run(install_args(plan, str(python), str(constraint)), plan.root)
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
            # Unsupported interpreter (05 §11: ConfigError, exit 4); not caught below.
            raise ConfigError(
                f"prepared environment has Python {facts.get('python')} / qiskit "
                f"{facts.get('qiskit')}; the engine needs Python {list(sys.version_info[:2])} / "
                f"qiskit {plan.qiskit_version}; preparation files retained in {staging}"
            )
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
        replaced = plan.environment.exists()
        if replaced:
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
    return Prepared(plan.environment, previous if replaced else None)
