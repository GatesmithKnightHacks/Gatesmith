# 09 · Simulation, the W7900, the profiler and the benchmark

> **Status:** binding · **Tier:** 0 · **Read:** before working on `sim/`, `hardware/profiler.py`, `bench/`, `metrics/research/simulated.py`, `verify/` GPU paths. Operations on the machine itself: `13-gpu-runbook.md`.

## 1. The card (checked against AMD's pages, 2026-10-09)

| Property | Value | Consequence |
|---|---|---|
| Architecture | RDNA 3, **gfx1100** | Build Aer with `AER_ROCM_ARCH=gfx1100`. Do **not** set `HSA_OVERRIDE_GFX_VERSION` (gfx1100 is supported). |
| Memory | 48 GB GDDR6 (treat as 48 GiB usable before margins) | Limits in §2. |
| Infinity Cache | 96 MB | Time-vs-qubits curve may bend after 22 qubits in double precision (statevector 64 MiB at 22, 128 MiB at 23) and after 23 in single. |
| Bandwidth | 864 GB/s | Plain statevector gates are memory-bound. |
| FP64 / FP32 | 1.92 / 61.32 TFLOPS (1/32) | Ridge point FP64 ≈ 1.92e12 / 864e9 ≈ **2.2 FLOP/byte**. A fused k-qubit gate does ≈ 8·2ᵏ FLOP per amplitude over 32 bytes moved (double) → intensity ≈ 2ᵏ/4: k=3 → 2, k=4 → 4, k=5 → 8. So **fusion width 4–5 makes double precision compute-bound** here, while single precision stays memory-bound. This is a roofline estimate; the profiler's sweep decides (§5). |

## 2. Memory planning

Planning rule (from v1): **1.2 × overhead, 10 % margin.** Budget = usable × 0.9.

| Mode | Budget | When |
|---|---|---|
| `exclusive` | 48 GiB × 0.9 ≈ **43.2 GiB** | vLLM stopped |
| `model_loaded` | 48 GiB × 0.6 × 0.9 ≈ **25.9 GiB** | vLLM resident with `--gpu-memory-utilization 0.40` |

| Workload | Memory | Fits (exclusive) | Fits (model loaded) |
|---|---|---|---|
| Statevector, double | 2ⁿ × 16 B × 1.2 | ≤ 31 qubits (38.4 GiB) | ≤ 30 qubits |
| Statevector, single | 2ⁿ × 8 B × 1.2 | ≤ 32 qubits | ≤ 31 qubits |
| Batch of 28-qubit candidates | 4.8 GiB each (double) | 9 at once (18 single) | 5 (10 single) |
| Batch of 30-qubit candidates | 19.2 GiB each (double) | 2 at once (4 single) | 1 (2 single) |
| Unitary or density matrix, double | 4ⁿ × 16 B | 14 q = 4 GiB, 15 q = 16 GiB; 16 q = 64 GiB does not fit | 15 q (19.2 GiB with overhead) fits |

- **Size by active qubits after routing:** Aer truncates to the qubits a circuit touches; routing can add active qubits beyond the logical count. Plan from the compiled circuit's active qubits.
- The measured overhead factor from the profiler replaces 1.2 once available (recorded in the plan).
- A job that needs `exclusive` mode while vLLM is loaded is held until the worker stops vLLM (the worker owns that decision and logs it). It never silently runs on the CPU instead.
- `max_memory_mb` is passed to Aer explicitly from the plan (never left to Aer's default).

## 3. Planner (`sim/planner.py`)

- `memory_bytes(method, active_qubits, precision) -> int` — the formulas above (statevector 2ⁿ, unitary/density 4ⁿ; 16 B double, 8 B single), × overhead.
- `estimate_seconds(job, profile) -> float` — starts from a simple model (bytes moved per gate layer ÷ measured bandwidth, or the profiler's fitted curve), refit from telemetry (`hardware/profiler.refit_from_telemetry()`). Estimates are labelled estimates.
- `choose_device(job, profile, requested) -> Literal["cpu","gpu"]` — **design rule** (not a fallback): `requested = auto` → GPU at or above the measured crossover size for that method/precision, CPU below it. `requested = gpu` → GPU or a `Q503`/`SimulationError`; never CPU. `requested = cpu` → CPU.
- `group(jobs)` by `(method, active_qubits, noise_model_id, precision)`; `batch(group, memory_budget) -> list[Batch]` sized so `Σ memory ≤ budget`.
- Output is part of the `Plan` (`04-contracts.md` §9) and is shown in the confirm screen ("planned compute").

## 4. Methods per job (`sim/tasks.py`, `sim/backends.py`)

| Job | Aer method | Why |
|---|---|---|
| Noisy task score, ≤ ~14 active qubits | `density_matrix` | Exact noisy probabilities, no per-shot sampling noise in the state |
| Noisy task score, larger | `statevector` with `batched_shots_gpu=True` | Each shot samples a noisy circuit; batching runs shots in parallel. Batching applies up to `batched_shots_gpu_max_qubits` active qubits (default 16) — test higher values on the ROCm build |
| QAOA/VQE parameter sweeps | `statevector` with `runtime_parameter_bind_enable=True` | Many parameter sets in one GPU batch |
| Exact checks at 13–15 qubits | `unitary`, double | Ideal circuits only (verification) |
| Clifford-only circuits | `stabilizer`, CPU | No GPU support and none needed |
| Reversible circuits | Classical simulation of the function (not Aer) | Exact far past statevector limits |
| Ideal reference (for `distribution`/`expectation`) | `statevector`, double | Exact ideal probabilities / expectation |

`make_simulator(device, method, precision, noise_from, seed, fusion_max_qubit, max_memory_mb)` builds `AerSimulator` (with `.from_backend(...)` when a backend noise model applies). `gpu_available()` checks `"GPU" in AerSimulator().available_devices()`.

`probe_rocm_options()` — **at setup, on the ROCm build**: test `batched_shots_gpu`, `runtime_parameter_bind_enable`, `fusion_enable`/`fusion_max_qubit`, `max_parallel_experiments`, `precision="single"`; record which work in the hardware profile. Aer's documentation describes only the NVIDIA build, so nothing is assumed. A job that needs an option the probe marked unsupported fails with a clear error (no silent change of method).

`sim/jobs.py`: `run_jobs(jobs, profile, on_event) -> list[JobResult]`. A GPU worker thread and the CPU pool run at the same time (design rule: small jobs below the crossover go to the CPU pool). Each group is one `run()` call with a list of circuits. On out-of-memory: raise `GpuOutOfMemory` with the planner's estimate (default); with FB-04 enabled: retry with half the batch, then the CPU, recording `fallbacks_used` on the affected metric results.

**Seeds:** each job's `seed_simulator` = `int(sha256(item_sha256 + ":" + job_index).hexdigest()[:8], 16)`; the same derivation for every rerun.

**Precision policy:** single precision **screens** candidates (when there are more candidates than the GPU budget allows in double); double precision **confirms finalists and every reported number**. Scorecard values are always double.

## 5. Hardware profiler (`hardware/profiler.py`)

`profile_hardware(refresh=False) -> HardwareProfile`, cached per machine (`cache_dir/hardware/<host-hash>.json`), run at worker start and by `qscore profile`.

Records:
1. CPU model, cores, RAM; GPU name, **gfx arch**, VRAM, ROCm version, driver; Aer version and build (`cpu`/`rocm`); whether Aer's GPU device works (`available_devices()` and a 2-qubit smoke run).
2. `probe_rocm_options()` results.
3. **Crossover:** time statevector simulations (fixed random circuit family, depth 20, seeds fixed) at 16–26 qubits on CPU and GPU, both precisions; the crossover is the smallest size where the GPU median is faster. 3 reps + 1 warmup.
4. **Time vs qubits curve** (16–30 qubits, GPU, both precisions) and the **cache knee** (largest increase in the per-amplitude time slope between consecutive sizes); expect it after 22 qubits in double.
5. **Fusion sweep:** `fusion_max_qubit ∈ {2, 3, 4, 5}` × precision ∈ {single, double} on 24- and 28-qubit circuits; `fusion_best[precision]` = fastest median. Note: Aer enables fusion only above `fusion_threshold` qubits; set the threshold explicitly in the sweep.
6. Measured memory overhead factor (peak VRAM from telemetry ÷ formula).

Every scorecard carries the profile id in provenance; the bench and the planner read the profile. `refit_from_telemetry()` updates time estimates from real runs.

## 6. Telemetry (`sim/telemetry.py`)

- `GpuSampler`: background thread, once a second while a job runs: GPU utilisation, VRAM used, power. The **source is chosen once by the profiler** and recorded in the hardware profile: the `amdsmi` Python library if it initialises, else the `amd-smi` CLI (`amd-smi metric --json`), else `off`. At runtime only the recorded source is used; if it fails, the job gets a `warning` event and `telemetry.status = unavailable` in its summary (visible, never silently swapped). Every individual reading is optional (some fields are unsupported inside VMs). Telemetry never changes a score.
- `JobTimer` for stage times; `summarize(run)` → busy time, peak memory.
- Writes `telemetry.jsonl` locally and batches rows to Neon every few seconds (`11-records-and-queue.md`); pruned after export.
- Capture one `rocprofv3` trace for the README if permissions allow (optional).

**Options (★):** ★ `amdsmi` Python + `amd-smi` CLI reader · `rocm-smi` (older) · reading `/sys/class/drm/card*/device/` sysfs files (no dependencies, fewer metrics).

## 7. Benchmark (`bench/suite.py`, `qscore bench`)

- `BENCH_SUITE`: fixed circuits (random layered circuits and the example QAOA family), sizes 16–30 qubits, method `statevector` (and `density_matrix` ≤ 14), shots, precision, fusion settings, seeds — all fixed in code and versioned.
- `run_bench(devices, reps=3, warmup=1) -> BenchResult`: identical work per device; medians and p10/p90; `OMP_NUM_THREADS`/Aer thread settings recorded; CPU uses all physical cores of the machine.
- Outputs (dated, to the Hub `bench/<date>-<worker>.json`): time vs qubits per device and precision with the crossover marked, the cache knee, the precision × fusion grid, candidates verified per minute (13–15-qubit unitary checks), throughput (circuits/s) for batched 28-qubit jobs, and, with the model loaded, local-model tokens/s.
- Fairness rules: same circuits, same seeds, warm caches, no other GPU job running, and the result records host, versions and the hardware profile id.

## 8. Options for the GPU simulator (★ default)

| Option | Status | Notes |
|---|---|---|
| ★ **Qiskit Aer, ROCm build** (`AER_THRUST_BACKEND=ROCM`, `AER_ROCM_ARCH=gfx1100`) | Planned | Built from source in GPU session 1; wheel cached on the private Hub repo. Build notes: `13-gpu-runbook.md` §3. |
| PyTorch statevector backend (ideal sims on ROCm PyTorch) + CPU Aer for noisy | **FB-01** (needs approval) | Only if the Aer build fails within its timebox; behind the same `sim/backends.py` interface; every result labelled. |
| PennyLane Lightning-Kokkos built with HIP | Not planned | Would need a circuit converter; consider only post-MVP. |
| Aer CPU only | Always available | The CPU path for laptops and small jobs. |

## 9. Rules that keep the GPU honest

- One GPU job at a time per worker (a GPU lease); the CPU pool runs alongside.
- Nothing else uses the GPU while a batch runs, except a resident vLLM whose memory is already budgeted (`model_loaded` mode).
- Small circuits stay on the CPU below the measured crossover, and the UI says so.
- Differential tests (CPU vs GPU, single vs double, Aer vs exact `Operator`) run at the start and end of every GPU session.
- Do not put parsing, compiling or structural metrics on the GPU.
