"""Provenance (specs/04-contracts.md §3)."""

from __future__ import annotations

import platform
import subprocess
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

from qscore.config import Settings
from qscore.diagnose.policy import thresholds_sha256
from qscore.schemas.common import Provenance, sha256_hex
from qscore.sim.backends import aer_build

ENGINE_DIR = Path(__file__).resolve().parents[3]  # .../qscore (pyproject.toml, uv.lock)


def _git(*args: str) -> str | None:
    proc = subprocess.run(
        ["git", "-C", str(ENGINE_DIR), *args], capture_output=True, text=True, check=False
    )
    return proc.stdout.strip() if proc.returncode == 0 else None


def collect(
    settings: Settings, seeds: list[int], simulator_base: int, started_at: datetime
) -> Provenance:
    lock = ENGINE_DIR / "uv.lock"
    status = _git("status", "--porcelain", "--", ".")
    aer_version, build = aer_build()
    return Provenance(
        qscore=version("qscore"),
        git_commit=_git("rev-parse", "HEAD"),
        git_dirty=bool(status) if status is not None else True,
        lock_sha256=sha256_hex(lock.read_bytes()) if lock.is_file() else None,
        python=platform.python_version(),
        qiskit=version("qiskit"),
        qiskit_aer=aer_version,
        aer_build=build,
        mqt_qcec=version("mqt.qcec"),
        profile=settings.profile,
        fallbacks_enabled=sorted(settings.enabled_fallbacks),
        seeds={"transpiler": seeds, "simulator_base": simulator_base},
        thresholds_sha256=thresholds_sha256(),
        started_at=started_at,
        finished_at=datetime.now(UTC),
    )
