"""CPU-vs-GPU statevector benchmark (specs/09 §7; EXPERIMENTAL downscale, ChP-0046).

Identical work per device: the same fixed random layered circuits and seeds, 1 warm-up and
`reps` measured runs each, double precision. Every GPU row is checked against the CPU result
for the same circuit (differential check); a mismatch fails the benchmark. Aer's own result
metadata must report the device that was requested, so a CPU run is never labelled GPU.
"""

from __future__ import annotations

import math
import statistics
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import qiskit_aer  # noqa: F401  (registers QuantumCircuit.save_expectation_value)
from qiskit import QuantumCircuit
from qiskit.quantum_info import Pauli

from qscore.errors import SimulationError
from qscore.schemas.run import BenchRow
from qscore.sim.backends import Device, Precision, make_simulator

SUITE_NAME = "qscore-rocm-experimental-2026.1"
BENCH_SUITE: dict[str, Any] = {
    "name": SUITE_NAME,
    "circuit": "random_layered",
    "depth": 20,
    "seed": 20261011,
    "sizes": (16, 20, 24, 26, 28),
    "method": "statevector",
    "precision": "double",
    "fusion_sweep": {"qubits": 26, "fusion_max_qubit": (2, 3, 4, 5)},
}
DIFF_TOL = 1e-9  # |<Z...Z>_cpu - <Z...Z>_gpu| in double precision


def random_layered(num_qubits: int, depth: int, seed: int) -> QuantumCircuit:
    """Fixed random layered circuit: RY/RZ on every qubit, then a CX brick, per layer."""
    rng = np.random.default_rng([seed, num_qubits, depth])
    qc = QuantumCircuit(num_qubits, name=f"random_layered_{num_qubits}")
    for layer in range(depth):
        for q in range(num_qubits):
            qc.ry(float(rng.uniform(0, 2 * math.pi)), q)
            qc.rz(float(rng.uniform(0, 2 * math.pi)), q)
        for q in range(layer % 2, num_qubits - 1, 2):
            qc.cx(q, q + 1)
    # Z on every qubit: a single-qubit observable lets Aer truncate the circuit to that qubit's
    # light cone (measured: 26 -> 20 active qubits), so the size would not be what is timed.
    qc.save_expectation_value(Pauli("Z" * num_qubits), range(num_qubits), label="zall")
    return qc


@dataclass
class Timing:
    times_s: list[float]
    value: float

    @property
    def median(self) -> float:
        return statistics.median(self.times_s)

    def quantile(self, q: float) -> float:
        ordered = sorted(self.times_s)
        return ordered[min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))]


def time_circuit(
    qc: QuantumCircuit,
    device: Device,
    precision: Precision,
    reps: int,
    warmup: int,
    fusion_max_qubit: int | None = None,
) -> Timing:
    """Wall time of `run().result()` (execution + result transfer); warm-ups are not timed."""
    sim = make_simulator(device, precision=precision, fusion_max_qubit=fusion_max_qubit)
    times: list[float] = []
    value: float | None = None
    for i in range(warmup + reps):
        start = time.perf_counter()
        result = sim.run(qc).result()
        elapsed = time.perf_counter() - start
        if not result.success:
            raise SimulationError(f"{qc.name} on {device} failed: {result.status}")
        ran_on = str(result.results[0].metadata.get("device", "")).lower()
        if ran_on != device:
            raise SimulationError(f"{qc.name}: requested {device} but Aer ran on {ran_on!r}")
        simulated = result.results[0].metadata.get("num_qubits")
        if simulated != qc.num_qubits:
            raise SimulationError(
                f"{qc.name}: Aer simulated {simulated} qubits, not {qc.num_qubits}; "
                "the row would not measure the stated size"
            )
        value = float(np.real(result.data(0)["zall"]))
        if i >= warmup:
            times.append(elapsed)
    assert value is not None
    return Timing(times, value)


def _row(qc: QuantumCircuit, device: Device, fusion: int | None, t: Timing) -> BenchRow:
    return BenchRow(
        circuit="random_layered",
        qubits=qc.num_qubits,
        method="statevector",
        precision="double",
        fusion_max_qubit=fusion,
        device=device,
        median_s=t.median,
        p10_s=t.quantile(0.1),
        p90_s=t.quantile(0.9),
        throughput=1.0 / t.median if t.median > 0 else None,
    )


@dataclass
class BenchOutcome:
    rows: list[BenchRow] = field(default_factory=list)
    differential: list[dict[str, Any]] = field(default_factory=list)
    crossover_qubits: int | None = None
    fusion_best: int | None = None
    unmeasured: list[dict[str, Any]] = field(default_factory=list)


def _check(out: BenchOutcome, n: int, fusion: int | None, cpu: float, gpu: float) -> None:
    """CPU/GPU differential on the same circuit; a mismatch fails the benchmark."""
    diff = abs(cpu - gpu)
    out.differential.append(
        {"qubits": n, "fusion_max_qubit": fusion, "abs_diff": diff, "tolerance": DIFF_TOL}
    )
    if diff > DIFF_TOL:
        raise SimulationError(f"CPU/GPU differential failed at {n} qubits: {diff:.3e}")


def crossover(rows: Sequence[BenchRow]) -> int | None:
    """Smallest size where the GPU median beats the CPU median (default fusion rows)."""
    base = {(r.device, r.qubits): r.median_s for r in rows if r.fusion_max_qubit is None}
    sizes = sorted({q for d, q in base if d == "gpu" and ("cpu", q) in base})
    return next((q for q in sizes if base[("gpu", q)] < base[("cpu", q)]), None)


def run_bench(
    devices: Sequence[Device],
    sizes: Sequence[int] = BENCH_SUITE["sizes"],
    reps: int = 3,
    warmup: int = 1,
    fusion_sweep: bool = True,
    vram_budget_bytes: int | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> BenchOutcome:
    say = on_progress or (lambda _m: None)
    out = BenchOutcome()
    depth, seed = BENCH_SUITE["depth"], BENCH_SUITE["seed"]
    cpu_values: dict[int, float] = {}
    for n in sizes:
        qc = random_layered(n, depth, seed)
        need = int(1.2 * 16 * 2**n)  # complex128 statevector x declared overhead (09 §2)
        values: dict[str, float] = {}
        for device in devices:
            if device == "gpu" and vram_budget_bytes is not None and need > vram_budget_bytes:
                out.unmeasured.append(
                    {"qubits": n, "device": device, "reason": f"needs {need} B > budget"}
                )
                continue
            say(f"{n} qubits on {device} ({warmup} warm-up + {reps} reps)")
            t = time_circuit(qc, device, "double", reps, warmup)
            out.rows.append(_row(qc, device, None, t))
            values[device] = t.value
        if "cpu" in values:
            cpu_values[n] = values["cpu"]
        if "cpu" in values and "gpu" in values:
            _check(out, n, None, values["cpu"], values["gpu"])
    out.crossover_qubits = crossover(out.rows)
    if fusion_sweep and "gpu" in devices:
        n = BENCH_SUITE["fusion_sweep"]["qubits"]
        qc = random_layered(n, depth, seed)
        best: tuple[float, int] | None = None
        need = int(1.2 * 16 * 2**n)
        if vram_budget_bytes is not None and need > vram_budget_bytes:
            out.unmeasured.append(
                {"qubits": n, "device": "gpu (fusion sweep)", "reason": f"needs {need} B > budget"}
            )
            return out
        if n not in cpu_values:
            say(f"fusion sweep reference: {n} qubits on cpu (1 run)")
            cpu_values[n] = time_circuit(qc, "cpu", "double", 1, 0).value
        for f in BENCH_SUITE["fusion_sweep"]["fusion_max_qubit"]:
            say(f"fusion sweep: {n} qubits on gpu, fusion_max_qubit={f}")
            t = time_circuit(qc, "gpu", "double", reps, warmup, fusion_max_qubit=f)
            out.rows.append(_row(qc, "gpu", f, t))
            _check(out, n, f, cpu_values[n], t.value)
            if best is None or t.median < best[0]:  # ties keep the smaller width
                best = (t.median, f)
        out.fusion_best = best[1] if best else None
    return out
