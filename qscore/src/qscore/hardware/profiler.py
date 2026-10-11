"""Hardware identity for the experimental ROCm path (09 §5, ChP-0032; downscaled: ChP-0046).

Only GPU identity is implemented here: the full profiler (crossover, cache knee, fusion
sweep, cached `HardwareProfile`) is out of the downscaled scope. A machine without the
`amd-smi` tool has no AMD GPU visible to qscore; a present tool that fails is an error.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any

from qscore.errors import SimulationError
from qscore.schemas.run import GpuProfile

W7900_ARCH = "gfx1100"


def amd_smi_path() -> str | None:
    return shutil.which("amd-smi")


def amd_smi_json(*args: str, tool: str | None = None) -> Any:
    """Run `amd-smi <args> --json` and parse it; failures raise SimulationError."""
    exe = tool or amd_smi_path()
    if exe is None:
        raise SimulationError("amd-smi is not on PATH; AMD GPU identity/telemetry unavailable")
    try:
        proc = subprocess.run(
            [exe, *args, "--json"], capture_output=True, text=True, check=False, timeout=30
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SimulationError(f"amd-smi {' '.join(args)} could not run: {exc}") from exc
    if proc.returncode != 0:
        raise SimulationError(f"amd-smi {' '.join(args)} failed: {proc.stderr.strip()[:300]}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise SimulationError(f"amd-smi {' '.join(args)} returned invalid JSON: {exc}") from exc


def gpu_entries(doc: Any) -> list[dict[str, Any]]:
    """amd-smi wraps per-GPU data in {"gpu_data": [...]} (27.x) or returns a bare list."""
    entries = doc.get("gpu_data") if isinstance(doc, dict) else doc
    if not isinstance(entries, list) or not entries:
        raise SimulationError("amd-smi reported no GPU entries")
    return entries


def parse_identity(static_doc: Any, version_doc: Any) -> GpuProfile:
    """Build a GpuProfile from `amd-smi static --asic --vram --driver` and `amd-smi version`."""
    gpu = gpu_entries(static_doc)[0]
    try:
        asic, vram = gpu["asic"], gpu["vram"]["size"]
        name, arch = str(asic["market_name"]), str(asic["target_graphics_version"])
        if vram["unit"] != "MB":
            raise SimulationError(f"unexpected VRAM unit from amd-smi: {vram['unit']}")
        vram_gib = float(vram["value"]) / 1024
    except (KeyError, TypeError, ValueError) as exc:
        raise SimulationError(f"amd-smi identity is missing a field: {exc}") from exc
    versions = version_doc[0] if isinstance(version_doc, list) and version_doc else version_doc
    rocm = versions.get("rocm_version") if isinstance(versions, dict) else None
    driver = gpu.get("driver", {}).get("version") if isinstance(gpu.get("driver"), dict) else None
    return GpuProfile(name=name, arch=arch, vram_gib=vram_gib, rocm=rocm, driver=driver)


def detect_gpu() -> GpuProfile | None:
    """Identity of GPU 0, or None when no amd-smi tool exists on this machine."""
    if amd_smi_path() is None:
        return None
    return parse_identity(
        amd_smi_json("static", "--asic", "--vram", "--driver"), amd_smi_json("version")
    )


def is_w7900(gpu: GpuProfile | None) -> bool:
    """Radeon PRO W7900 family (W7900, W7900D): model name and gfx1100 together (ChP-0032 C).

    The architecture alone does not identify the model (other RDNA 3 cards are gfx1100).
    """
    if gpu is None:
        return False
    return "W7900" in gpu.name.upper() and gpu.arch == W7900_ARCH
