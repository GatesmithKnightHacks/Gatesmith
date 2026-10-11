"""Markdown for the EXPERIMENTAL AMD ROCm benchmark (ChP-0032 D/E, downscaled by ChP-0046).

Pure renderer: no profiling, simulation, network or resource allocation. It shows only what
the evidence says ran; slower GPU rows are shown as they are, and missing telemetry is shown
as missing, never filled in.
"""

from __future__ import annotations

from typing import Any

from qscore.errors import RecordError
from qscore.schemas.run import BenchResult, GpuProfile

TITLE = "EXPERIMENTAL — qscore statevector simulation on AMD ROCm"


def _ms(seconds: float) -> str:
    return f"{seconds * 1000:,.1f} ms"


def render_w7900(gpu: GpuProfile | None, bench: BenchResult, evidence: dict[str, Any]) -> str:
    for key in ("w7900", "differential", "telemetry", "unmeasured", "aer"):
        if key not in evidence:
            raise RecordError(f"W7900 evidence is missing '{key}'")
    lines = [f"# {TITLE}", ""]
    lines += [
        "> **Experimental.** This is a downscaled, first-pass use of the AMD GPU (ChP-0046): "
        "Qiskit Aer built for ROCm runs the statevector simulations below on the GPU. It is "
        "not the full ChP-0032 qualification (no cached hardware profile, no ROCm option "
        "probes, no memory-planned batching). Numbers are for these fixtures only. "
        "Every row is checked: Aer must report the requested device and the full qubit count.",
        "",
        "## Device",
        "",
    ]
    if gpu is None:
        lines += ["No AMD GPU detected (amd-smi not found). CPU rows only.", ""]
    else:
        family = "W7900 family (name + gfx1100)" if evidence["w7900"] else "not a W7900"
        lines += [
            f"- GPU: **{gpu.name}** · arch `{gpu.arch}` · {family}",
            f"- VRAM reported by amd-smi: {gpu.vram_gib:.1f} GiB",
            f"- ROCm (runtime, amd-smi): {gpu.rocm or 'unknown'} · amdgpu driver: "
            f"{gpu.driver or 'unknown'}",
        ]
    plan = evidence.get("memory_planning")
    if plan:
        lines.append(
            f"- VRAM admission (ChP-0032 B, {plan['mode']}): budget = floor(0.9 x min(T - R, F)) = "
            f"{plan['budget_bytes'] / 1024**3:.1f} GiB "
            f"(T {plan['total_bytes_T'] / 1024**3:.1f} GiB, "
            f"F {plan['free_bytes_F'] / 1024**3:.1f} GiB, R 0); overhead factor "
            f"{plan['overhead_factor']} ({plan['overhead_source']})"
        )
    aer = evidence["aer"]
    lines += [
        f"- Aer: {aer['version']} (build `{aer['build']}`; GPU device available: "
        f"{aer['gpu_available']})",
        f"- Suite `{bench.suite}`: {bench.reps} measured reps after {bench.warmup} warm-up, "
        "FP64 statevector; timed region = `run().result()` (execution + result transfer); "
        "with 3 reps the p10-p90 spread is effectively min-max.",
        "",
        "## CPU vs GPU (FP64, default fusion)",
        "",
        "| Qubits | CPU median | GPU median | Speedup (CPU/GPU) | GPU spread (p10-p90) |",
        "|---:|---:|---:|---:|---|",
    ]
    base = {(r.device, r.qubits): r for r in bench.rows if r.fusion_max_qubit is None}
    for n in sorted({q for _d, q in base}):
        cpu, gpu_row = base.get(("cpu", n)), base.get(("gpu", n))
        speed = f"{cpu.median_s / gpu_row.median_s:.2f}x" if cpu and gpu_row else "—"
        lines.append(
            f"| {n} | {_ms(cpu.median_s) if cpu else 'not run'} | "
            f"{_ms(gpu_row.median_s) if gpu_row else 'not run'} | {speed} | "
            f"{_ms(gpu_row.p10_s) + ' - ' + _ms(gpu_row.p90_s) if gpu_row else '—'} |"
        )
    if any(r.device == "gpu" for r in bench.rows) and not evidence["differential"]:
        lines += [
            "",
            "**GPU rows UNVERIFIED:** no CPU differential was run (`--device gpu` only).",
        ]
    cross = bench.crossover.get("double")
    lines += [
        "",
        f"Measured crossover (smallest size where the GPU median is faster): "
        f"{f'**{cross} qubits**' if cross is not None else 'none in this sweep'}.",
        "",
    ]
    fusion = [r for r in bench.rows if r.fusion_max_qubit is not None]
    if fusion:
        best = bench.crossover.get("fusion_best_double")
        lines += [
            f"## GPU fusion sweep (FP64, {fusion[0].qubits} qubits)",
            "",
            "| fusion_max_qubit | GPU median |",
            "|---:|---:|",
        ]
        default = base.get(("gpu", fusion[0].qubits))
        if default:
            lines.append(f"| Aer default | {_ms(default.median_s)} |")
        lines += [f"| {r.fusion_max_qubit} | {_ms(r.median_s)} |" for r in fusion]
        lines += ["", f"Best measured setting for this fixture: `fusion_max_qubit={best}`.", ""]
    lines += ["## Differential check (CPU vs GPU, ⟨Z⊗…⊗Z⟩ on all qubits)", ""]
    if evidence["differential"]:
        lines += [
            f"- {d['qubits']} qubits"
            + (
                f" (GPU fusion_max_qubit={d['fusion_max_qubit']})"
                if d.get("fusion_max_qubit")
                else ""
            )
            + f": |Δ| = {d['abs_diff']:.2e} (tolerance {d['tolerance']:.0e})"
            for d in evidence["differential"]
        ]
    else:
        lines.append("- Not run (needs both devices).")
    tel = evidence["telemetry"]
    lines += ["", "## AMD telemetry (amd-smi, sampled ~1 s during the whole benchmark)", ""]
    if tel.get("status") == "ok":
        for key, label, unit in (
            ("peak_used_vram_mb", "Peak VRAM used", "MB"),
            ("peak_gfx_activity_pct", "Peak GFX activity", "%"),
            ("peak_power_w", "Peak socket power", "W"),
        ):
            value = tel.get(key)
            lines.append(
                f"- {label}: {f'{value:g} {unit}' if value is not None else 'not reported'}"
            )
        lines.append(f"- Samples: {tel['samples']}")
    else:
        lines.append(f"- Unavailable: {tel.get('reason') or 'not sampled'}")
    if evidence["unmeasured"]:
        lines += ["", "## Not measured", ""]
        lines += [
            f"- {u['qubits']} qubits on {u['device']}: {u['reason']}"
            for u in evidence["unmeasured"]
        ]
    lines.append("")
    return "\n".join(lines)
