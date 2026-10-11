"""GPU telemetry sampler (specs/09 §6; amd-smi CLI source only, ChP-0046 downscale).

Telemetry never changes a result. If sampling fails, the summary says `unavailable` with
the reason; it is never silently swapped to another source.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

from qscore.errors import SimulationError
from qscore.hardware.profiler import amd_smi_json, gpu_entries


def _value(node: Any) -> float | None:
    if isinstance(node, dict) and isinstance(node.get("value"), int | float):
        return float(node["value"])
    return None


def parse_metric(doc: Any) -> dict[str, float | None]:
    gpu = gpu_entries(doc)[0]
    return {
        "gfx_activity_pct": _value(gpu.get("usage", {}).get("gfx_activity")),
        "used_vram_mb": _value(gpu.get("mem_usage", {}).get("used_vram")),
        "free_vram_mb": _value(gpu.get("mem_usage", {}).get("free_vram")),
        "power_w": _value(gpu.get("power", {}).get("socket_power")),
    }


@dataclass
class GpuSampler:
    """Samples `amd-smi metric` about once a second while a GPU job runs."""

    interval_s: float = 1.0
    samples: list[dict[str, float | None]] = field(default_factory=list)
    error: str | None = None
    _stop: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = None

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                row = parse_metric(amd_smi_json("metric", "--usage", "--mem-usage", "--power"))
            except SimulationError as exc:
                self.error = str(exc)
                return
            row["t"] = time.time()
            self.samples.append(row)
            self._stop.wait(self.interval_s)

    def __enter__(self) -> GpuSampler:
        self._thread = threading.Thread(target=self._run, name="qscore-gpu-sampler", daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=35)

    def summary(self) -> dict[str, Any]:
        def peak(key: str) -> float | None:
            values = [s[key] for s in self.samples if s.get(key) is not None]
            return max(v for v in values if v is not None) if values else None

        status = "unavailable" if self.error or not self.samples else "ok"
        return {
            "source": "amd-smi",
            "status": status,
            "reason": self.error or (None if self.samples else "no samples collected"),
            "samples": len(self.samples),
            "peak_used_vram_mb": peak("used_vram_mb"),
            "peak_gfx_activity_pct": peak("gfx_activity_pct"),
            "peak_power_w": peak("power_w"),
        }
