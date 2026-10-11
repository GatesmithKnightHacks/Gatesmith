# ChP-0046: Experimental ROCm path — downscaled F2 (W7900)

- **Status:** approved by the user (directive in conversation, 2026-10-11 ~00:25 EDT: "downscale … experimental … few features that utilize it … 1–2 hours, hard deadline 2AM")
- **Class:** A (scope of ChP-0032 delivery; acceptance) · **Author:** lead · **Date:** 2026-10-11
- **Related:** ChP-0032 (approved, not applied), ChP-0012; tasks T17, T18b, T19, T21

## 1. Summary
Deliver ChP-0032 as a clearly labelled **experimental** first pass instead of full qualification: Aer built for ROCm gfx1100, GPU identity, a GPU statevector path that never falls back to the CPU, a CPU-vs-GPU benchmark with a per-row differential check, and an `amd-w7900.md` report titled "EXPERIMENTAL". The full ChP-0032 items (cached `HardwareProfile` with fingerprint, `probe_rocm_options`, cache knee, precision × fusion grid, memory-planned 28-qubit batching, planner/jobs integration into scoring) remain approved but are deferred.

## 2. Change (what is built)
| Piece | Where | Note |
|---|---|---|
| Aer ROCm build | `scripts/build_aer_rocm.sh` | ROCm SDK 7.13.0 from repo.amd.com (`rocm[devel]`), DISABLE_CONAN + apt deps, Thrust→rocThrust CMake shim; package `qiskit-aer-gpu-rocm` |
| GPU identity | `hardware/profiler.py`: `detect_gpu`, `is_w7900`, `parse_identity` | from `amd-smi static/version --json`; W7900 family = name contains "W7900" **and** gfx1100 |
| Simulator | `sim/backends.py`: `make_simulator`, `gpu_available`, `aer_build` | `device=gpu` without an Aer GPU → `SimulationError` |
| Telemetry | `sim/telemetry.py`: `GpuSampler` (amd-smi CLI only) | failures → `unavailable` + reason |
| Benchmark | `bench/suite.py`, `services.run_bench`, `qscore bench [--out] [--device both/cpu/gpu] [--sizes] [--reps] [--not fusion]` | FP64 statevector 16–28 q, 1 warm-up + 3 reps; observable ⟨Z⊗…⊗Z⟩ on **all** qubits (a ⟨Z₀⟩-only observable let Aer light-cone-truncate 26 → 20 qubits, measured); every run must report Aer metadata `device` = requested and `num_qubits` = circuit width, else SimulationError; CPU/GPU differential (|Δ| ≤ 1e-9) on every size and every fusion row fails the run on mismatch; `--device gpu` alone marks GPU rows UNVERIFIED in the report; VRAM admission `floor(0.9·min(T − R, F))` (exclusive, R = 0) with T, F, R, overhead factor 1.2 (declared, unmeasured) recorded; GPU fusion sweep {2,3,4,5} at 26 q, admitted against the budget; CPU-only runs never call amd-smi |
| Evidence | `record/w7900.py: render_w7900` → `bench.json`, `gpu-identity.json`, `telemetry.jsonl`, `amd-w7900.md` | renderer in its own module rather than `record/report.py` (that file is under concurrent edits; class B) |
| Provenance | `record/provenance.py` | `qiskit_aer`/`aer_build` from the installed distribution (`qiskit-aer` → cpu, `qiskit-aer-gpu-rocm` → rocm) instead of the hard-coded `cpu` |

## 3. Justification (evidence)
- User directive (time box 1–2 h, deadline 02:00 EDT).
- The image ships the ROCm 10.0 runtime only: no HIP CMake config or rocThrust/rocPRIM headers; no `rocm-sdk-devel==10.0.0` exists on repo.amd.com (gfx110X-all ends at 7.13.0). `lab/20261011-f2-w7900-s1/NOTES.md`.
- The card reports **"AMD Radeon Pro W7900D"** (gfx1100, 49136 MB). ChP-0032 C names "Radeon PRO W7900"; the W7900D is the same family (48 GB, gfx1100), so the identity rule matches the substring "W7900" plus gfx1100. Other gfx1100 cards (RX 7900 XTX) are rejected (unit-tested).

## 4. Deviations from ChP-0032 / specs (all visible in output)
1. Report title is "EXPERIMENTAL — qscore statevector simulation on AMD ROCm", never ChP-0032's qualified title.
2. `hardware-profile.json` and `probe-results.txt` are not produced; `gpu-identity.json` carries the identity and evidence instead.
3. The Aer build uses the ROCm **7.13** SDK while the runtime is ROCm **10.0** (HIP major 7 both); both versions are recorded. The differential check is the correctness gate.
4. Engine venv on the instance uses the image's Python 3.14 (uv's Python download needs GitHub, which is blocked).
5. `scheduled` scoring does not yet use the GPU (no simulation metrics exist yet: T20). The GPU is used by `qscore bench` only.

## 5. Impact
| Area | Impact |
|---|---|
| MVP / CPU path | None. CPU-only installs never import ROCm tooling; `amd-smi` absent → no GPU. |
| Contracts | None (existing `BenchResult` v0.2; `crossover` dict carries `double` and `fusion_best_double`). |
| Fallbacks | None added. GPU requested but unavailable → exit 3. |
| Tests | `tests/unit/rocm/` (20 CPU tests incl. truncation, device mismatch, differential mismatch, sampler failure), `tests/gpu/test_differential.py` (`-m gpu`, W7900 only). No golden values. |
| Cost | ≤ ~2 GPU hours this session. |

## 6. Rollback
Delete the listed modules/CLI command; revert the two-line provenance change. Evidence files stay in `lab/`.

## 7. Decision
- Decided by: user · 2026-10-11 · approved (downscale directive). Applied to specs: not applied (ChP-0032 text is also unapplied).
- Review: spec-auditor 2026-10-11 ~00:50 EDT — no blockers; 5 should-fix + nits addressed the same session (typed amd-smi subprocess errors, fusion admission + differential, T/F/R record, UNVERIFIED label, tests). Observable/`num_qubits` change is reflected in §2 above.
