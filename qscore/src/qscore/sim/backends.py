"""Aer simulator construction (specs/09 §4; downscaled to the experimental ROCm path, ChP-0046).

`device="gpu"` never runs on the CPU: if Aer's GPU device is unavailable, building a GPU
simulator raises SimulationError (no device switch).
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from typing import Literal

from qiskit_aer import AerSimulator

from qscore.errors import SimulationError

Device = Literal["cpu", "gpu"]
Precision = Literal["single", "double"]

# The ROCm wheel is built as `qiskit-aer-gpu-rocm` (scripts/build_aer_rocm.sh); never both.
_AER_DISTRIBUTIONS = (("qiskit-aer-gpu-rocm", "rocm"), ("qiskit-aer", "cpu"))


def aer_build() -> tuple[str, Literal["cpu", "rocm"]]:
    """(version, build) of the installed Aer distribution."""
    found: list[tuple[str, Literal["cpu", "rocm"]]] = []
    for dist, build in _AER_DISTRIBUTIONS:
        try:
            found.append((version(dist), build))  # type: ignore[arg-type]
        except PackageNotFoundError:
            continue
    if len(found) != 1:
        raise SimulationError(
            f"expected exactly one Aer distribution (qiskit-aer or qiskit-aer-gpu-rocm), "
            f"found {len(found)}"
        )
    return found[0]


def gpu_available() -> bool:
    return "GPU" in AerSimulator().available_devices()


def make_simulator(
    device: Device,
    method: str = "statevector",
    precision: Precision = "double",
    seed: int | None = None,
    fusion_max_qubit: int | None = None,
    max_memory_mb: int | None = None,
) -> AerSimulator:
    if device == "gpu" and not gpu_available():
        raise SimulationError(
            "device 'gpu' requested but Aer reports no GPU device "
            f"(Aer build: {aer_build()[1]}); refusing to run on the CPU"
        )
    options: dict[str, object] = {
        "method": method,
        "device": device.upper(),
        "precision": precision,
    }
    if seed is not None:
        options["seed_simulator"] = seed
    if fusion_max_qubit is not None:
        options["fusion_enable"] = True
        options["fusion_max_qubit"] = fusion_max_qubit
        options["fusion_threshold"] = 1  # fusion only applies above the threshold (09 §5.5)
    if max_memory_mb is not None:
        options["max_memory_mb"] = max_memory_mb
    return AerSimulator(**options)
