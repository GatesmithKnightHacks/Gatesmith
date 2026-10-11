# ChP-0032: AMD Radeon PRO W7900 tuning and evidence

- **Status:** approved (spec text and implementation deferred behind researcher intake tasks)
- **Class:** A (hardware planning, benchmark/report surface, delivery acceptance)
- **Author:** lead · **Date:** 2026-10-10 22:52 UTC
- **Related tasks:** T17, T18a/b, T19, T20, T21, T31 · **Blocks:** only this proposal's additional behavior; G4 work can continue
- **Decision needed by:** implementation of the W7900 profiler/report additions, before the AMD demo
- **Replaces:** the scope of Gemini's unnumbered `CP-00XX` draft; that draft was never approved
- **Numbering:** ChP-0030 and ChP-0031 are reserved by the handoff for previously approved decisions.

## 1. Summary

Deliver a named **AMD Radeon PRO W7900 acceleration profile** within qscore's existing simulation architecture. The portable CPU/default path remains available; on a validated W7900, qscore uses an Aer ROCm build targeting `gfx1100`, measured fusion settings and CPU/GPU crossover, and memory-aware simulation batches. A reproducible AMD report shows which capabilities were tested, which were actually used, and their measured benefit.

The sponsor-facing claim is: **qscore recognizes the W7900, tunes quantum simulation for that card, and provides evidence of its contribution to circuit evaluation.** This is one GPU, one backend, and the existing planner/profiler/benchmark pipeline. Most underlying work is already specified in 09; this proposal adds explicit W7900 qualification, runtime memory sizing, and a compact evidence deliverable.

## 2. Proposed change

### 2.1 Spec text (exact)

**A. `09-gpu-and-simulation.md` §1, memory row**

Before:
> Memory | 48 GB GDDR6 (treat as 48 GiB usable before margins) | Limits in §2.

After:
> Memory | 48 GB GDDR6 nominal; record runtime-reported capacity and free memory in bytes, displaying GiB explicitly | Production plans use measured capacity and current available memory. The 48 GiB examples in §2 remain illustrative arithmetic fixtures, not a promise of usable capacity.

**B. `09-gpu-and-simulation.md` §2, planning rule**

Before:
> Planning rule (from v1): **1.2 × overhead, 10 % margin.** Budget = usable × 0.9.

After:
> Planning rule: workload memory uses the measured overhead factor, or the declared initial estimate 1.2 before measurement. Keep a 10% safety margin. For the selected GPU, let T be runtime-reported total bytes, F be runtime-reported free bytes sampled under the GPU lease immediately before admission, and R be the declared local-model reservation (0 in exclusive mode; 0.40 × T in model_loaded mode). Budget = floor(0.9 × min(T − R, F)). Using min avoids subtracting the same resident model allocation twice. Check host RAM separately for jobs that return large arrays. Record T, F, R, the overhead factor and resulting budget with the run's planning evidence. A batch is admitted only when its estimated memory fits. Insufficient capacity or failed runtime memory inspection raises a typed SimulationError before dispatch; an actual allocation failure raises GpuOutOfMemory. Neither changes the method, precision or device. The single GPU lease and the existing worker-owned model lifecycle still apply. The §2 tables are examples for a synthetic 48 GiB capacity with sufficient free memory; retain their arithmetic tests.

**C. `09-gpu-and-simulation.md` §5, add after item 6**

Before:
> Every scorecard carries the profile id in provenance; the bench and the planner read the profile. `refit_from_telemetry()` updates time estimates from real runs.

After:
> Every scorecard carries the profile id in provenance; the bench and the planner read the profile. `refit_from_telemetry()` updates time estimates from real runs.
>
> **W7900 qualification and tuning.** Recognize a Radeon PRO W7900 from the runtime device identity and `gfx1100` together; architecture alone does not identify this model. Qualify only the selected single visible GPU. The reproducible AMD runbook exposes one device before starting the process; multiple visible devices do not enable extra workers or pooled memory. Keep the existing `device: auto|cpu|gpu` contract. On other hardware, use the existing device policy without a W7900 qualification claim.
>
> Hardware discovery and successful backend qualification are distinct. The W7900 profile is qualified only after the pinned Aer ROCm build passes the CPU/GPU differential smoke check. Record actual driver, HIP/ROCm and Aer versions; an image label is not a runtime version. Run the §4 option probes and record each supported/unsupported result with its reason in the profile notes and saved probe log. An unexpected probe crash is a visible failure, not an unsupported result. GPU jobs requesting an unsupported feature fail as specified in §4.
>
> Apply measured fusion settings from the existing precision-specific sweep and the measured per-method crossover from ChP-0012. Record the exact selected fusion setting and threshold in the benchmark evidence and pass them to the simulator. Select the fastest median on the stated sweep fixtures, with ties resolved by the smaller fusion width; report it as the best measured setting for those fixtures, not a universal optimum. Compare tuning against the same pinned ROCm Aer build with its recorded default fusion configuration. Single precision remains screening/benchmark work; final scorecard numbers and numerical verification use double precision. Cache-knee observations are measurements; the absence of a clear knee does not fail qualification.
>
> Reuse a cached W7900 profile only when device identity, runtime-reported capacity, driver, HIP/ROCm, Aer build/version and profiler revision match its recorded fingerprint. Refresh the profile when any of these changes. CPU-only execution does not import or require ROCm tooling. Existing profile fields hold measured settings; `notes` identifies the W7900 qualification, fingerprint and probe evidence. No new manifest mode or schema field is introduced.

**D. `09-gpu-and-simulation.md` §7, add after fairness rules**

Before:
> Fairness rules: same circuits, same seeds, warm caches, no other GPU job running, and the result records host, versions and the hardware profile id.

After:
> Fairness rules: same circuits, same seeds, warm caches, no other GPU job running, and the result records host, versions and the hardware profile id.
>
> **W7900 evidence report.** For a W7900 benchmark, persist `hardware-profile.json`, `bench.json`, `probe-results.txt`, `telemetry.jsonl`, and `amd-w7900.md` under the selected benchmark output directory before any Hub export. The Markdown report is derived from those files and includes:
> 1. Runtime device identity, measured capacity, versions, profile id and qualification/probe results.
> 2. Identical-work CPU versus W7900 FP64 statevector timings, speedup = CPU median / GPU median, and the measured crossover. Show slower GPU rows honestly. Timed regions include simulator execution and required result transfer; report setup/warm-up separately.
> 3. Default versus tuned ROCm fusion timings on the same fixtures and the selected settings. FP32 rows are separately labelled and are never used as the numerator/denominator of an FP64 speedup claim.
> 4. A memory-planned batch of independent 28-qubit FP64 simulations, with batch size, elapsed time and circuits/second compared with sequential execution of the same circuits on the same GPU. Record available memory and peak usage when telemetry provides it. A submitted list of circuits is not proof of concurrent execution; identify actual supported parallel execution settings. If the plan can admit only one circuit or the parallel option is unsupported, report that limitation and make no batching-speedup claim.
> 5. AMD telemetry: utilization, peak VRAM and power where available, together with source and missing-field reasons under §6. Separate nominal specifications, estimates and measurements throughout.
>
> Use the existing fixed benchmark circuits, seeds, 3 measured repetitions and 1 warm-up. Budget checks occur before each workload; unrun workloads are explicitly marked unmeasured with the budget/feasibility reason in the report, never assigned invented timing rows. A computation error fails the benchmark; it cannot be relabelled unmeasured. Telemetry absence follows §6 and does not invalidate an otherwise correct timing measurement.
>
> Emit the title **AMD Radeon PRO W7900 — measured ROCm acceleration** only for a qualified profile with completed benchmark evidence. The ordinary score report identifies actual device/backend and profile provenance for GPU-computed metrics; CPU-only work on a GPU host is not labelled GPU-accelerated. Public performance claims link to the dated evidence files. Local LLM tokens/s and 13–15-qubit verification throughput remain their existing follow-on deliverables, not dependencies of this report's initial statevector demonstration.

**E. `03-code-structure.md` §3.3, report row**

Before:
> `record/report.py` | `render(scorecards, run_record, format)` (Markdown/HTML via Jinja2).

After:
> `record/report.py` | `render(scorecards, run_record, format)` (Markdown/HTML via Jinja2); benchmark presentation includes `render_w7900(profile, bench, evidence) -> str`, a pure Markdown renderer for the W7900 evidence report in 09 §7. It performs no profiling, simulation, network access or resource allocation. `evidence` is the validated internal presentation data collected by the benchmark service from probe/timing/telemetry outputs.

**F. `05-pipeline.md` §11, benchmark row**

Before:
> `qscore bench` | `run_bench` | CPU vs GPU suite.

After:
> `qscore bench` | `run_bench` | CPU vs GPU suite. On a qualified W7900, also writes the local evidence files specified in 09 §7 to the shared `--out` directory. Missing AMD hardware never causes a report claiming W7900 acceleration. Existing exit codes apply. No `--mode amd-hetero` or `--gpus` flag is added.

**G. `13-gpu-runbook.md` §3, append §3.7; `15-build-plan.md` T21 and T31 acceptance, append**

Before:
> No W7900 evidence-bundle acceptance requirement.

After:
> W7900 evidence: use one visible W7900, the recorded Aer ROCm build targeting gfx1100, and exclusive memory mode for the CPU/GPU and fusion comparisons. Run differential tests before and after measurement, refresh the hardware profile, and run the existing benchmark command. Save the 09 §7 local evidence bundle before teardown. T21 produces the bundle; T31 links it in the README/demo and explains the measured crossover, selected fusion settings and memory-limited batching. Hardware identity alone does not satisfy this criterion. Cloud operations and publication retain their existing explicit authorization requirements.

### 2.2 Implementation sketch and scope

| Deliverable | Existing work reused | Small addition |
|---|---|---|
| W7900 backend qualification | T17 Aer ROCm build and differential smoke checks | Explicit model + arch recognition and saved capability evidence |
| Card-specific tuning | T18b crossover, fusion and overhead profiler | Profile validity fingerprint; measured settings visibly applied |
| Memory-aware execution | T19 planner, grouped jobs, GPU lease | Runtime capacity/free-memory admission using the formula above |
| AMD evidence | T21 benchmark and AMD SMI sampling | Local bundle and compact Markdown rendering, linked in T31 |

Modules: `hardware/profiler.py`, `sim/backends.py`, `sim/planner.py`, `sim/jobs.py`, `sim/telemetry.py`, `bench/suite.py`, `services.py`, `record/report.py`; existing build/bootstrap scripts and `docs/demo.md`. Services coordinates backend probes, profiling, benchmark execution and report rendering, respecting import layers. No additional scheduler or distributed runtime.

Reuse `HardwareProfile`, `BenchResult`, existing provenance, profile notes and raw telemetry. Extra experimental detail lives in the evidence files; the renderer validates required inputs and refuses malformed evidence. Do not use an `x-` payload as hidden executable planner configuration. Approved ChP-0012 supplies per-method crossover; apply that existing decision before relying on it.

The bounded implementation excludes multi-GPU execution, DDP, tensor/model parallelism, GPU routing or structural metrics, new LLM strategies, new metric definitions, and changes to acceptance or representative selection. Local inference remains the existing T25/local-layer work, with its existing residency budget. The one-GPU CPU-pool/simulation overlap already specified in 09 remains the execution architecture.

### 2.3 Acceptance and delivery order

1. **Prerequisite:** T17 establishes a working ROCm Aer backend. Keep the existing 90-minute build investigation timebox; a failed build blocks the AMD claim and surfaces the existing error/decision path. This proposal authorizes no substitute backend.
2. **Profile/planner:** test W7900 versus another gfx1100 identity, stale-profile invalidation, CPU-only importability, memory admission with reduced free VRAM, and unchanged explicit-GPU failure semantics. Preserve current arithmetic fixtures and all differential tolerances.
3. **GPU evidence:** run existing differential checks on the W7900, then capture CPU/GPU, fusion and batch measurements. A report may show no speedup; truthfulness and reproducibility are required, not an invented performance threshold. At least one completed FP64 workload on both CPU and GPU and the completed fusion sweep are required for the initial demonstration. Unsupported optional batching is explicitly reported.
4. **Presentation:** renderer tests prevent unsupported/untested features being presented as used, timings from being mixed across precisions, and missing telemetry being fabricated. Include the artifact links and a short explanation in the demo.
5. **Integration:** required quick suite, lint/types/import-layer checks and independent review before integration. No new golden numeric values are set by this proposal; human approval remains required for any new goldens.

## 3. Justification (evidence, not opinion)

- The user requested a manageable, visible AMD-specific capability targeting the W7900 while retaining a portable default. That is the reason to add explicit qualification and the report; raw GPU count is not the desired outcome.
- `progress-log.md:117` records the A1 machine as gfx1100/W7900 and records its actual PyTorch/HIP values. A1 validated CPU qscore on that host; Aer GPU functionality and speedups have not yet been demonstrated.
- Specs 09 §§2–7 already prescribe ROCm probes, fusion/crossover measurements, batch planning and telemetry. T18/T19/T21 can deliver this scope without introducing a second execution architecture.
- `compile/pipeline.py:62` already parallelizes seeds on CPU. The earlier proposal duplicated this work and assigned nonexistent meanings to D01/D05; see `worktrees/.reports/amd-hetero-proposal-review.md` at workspace root.
- [AMD's W7900 specification](https://www.amd.com/en/products/graphics/workstations/radeon-pro/w7900.html) lists 48 GB GDDR6 and 864 GB/s bandwidth. These motivate memory-aware simulation; they do not establish usable capacity or application speedup.
- [AMD's architecture table](https://rocm.docs.amd.com/en/docs-6.2.2/reference/gpu-arch-specs.html) identifies the W7900 family as RDNA 3/gfx1100. [Aer build instructions](https://github.com/Qiskit/qiskit-aer/blob/main/CONTRIBUTING.md) describe ROCm build configuration. Neither source substitutes for testing the pinned wheel and enabled options on the allocated machine.
- Current `HardwareProfile`/`BenchResult` fields and profile notes can carry the selected settings and measurements. This limited proposal needs no new schema version, database migration, mandatory CPU dependency, or GPU-count API.

## 4. Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Existing specs alone | Already substantially AMD-aware | No compact, explicit W7900 qualification/evidence requirement; nominal memory assumption | Keep their architecture, add the bounded delta above |
| Generic GPU benchmark and AMD banner | Minimal implementation | Does not demonstrate applied tuning or capability use | Insufficient for the user's objective |
| Gemini's 1/2/4-GPU engine | Potential suite throughput at larger scale | Unverified shapes, more credits, scheduling/contracts/model complexity | Outside this deliverable |
| Custom HIP kernels or PyTorch simulator | More custom AMD code | New correctness burden and backend maintenance | Aer ROCm is the existing planned path |
| W7900 tuning + evidence (chosen) | Uses existing tasks; explicit device specialization; measurable result | Requires real GPU validation | Smallest credible AMD-specific scope |

## 5. Impact analysis

| Area | Impact |
|---|---|
| MVP scope and tiers | None on the completed CPU MVP. This is post-MVP AMD delivery within T17–T21/T31. |
| Gates and timeline (hours) | G4 can continue. Add evidence acceptance to T21/T31; retain other G3/G5 requirements. Planning estimate: 4–8 engineering hours beyond already-planned profiler/planner/bench work, plus 1–2 GPU hours for incremental evidence capture after T17 succeeds. These are estimates, not measurements or the total cost of T17–T21. |
| Contracts / schemas / stored data (Neon, Hub) | No schema/version or DB migration. Existing profile/bench/provenance fields plus local presentation/log artifacts. Apply approved ChP-0012 separately. Existing export rules remain. |
| Other specs and sections that must change | 03 §3.3; 05 §11; 09 §§1,2,5,7; 13 §3; 15 T21/T31. No changes to 06 metrics, 07 diagnostics, 08 verification/acceptance, 10 improvement strategies or 11 queue architecture. |
| Modules and public functions | Existing modules listed in §2.2; one pure report renderer. Existing CLI commands and shared `--out` suffice. |
| Tests and golden values | Add capability/cache/memory/report tests and real GPU evidence. Keep existing tolerances and synthetic arithmetic fixtures. No golden values changed or invented. |
| Score version (metrics/thresholds) | None. Tuning affects execution settings, not metric definitions or diagnostic thresholds. Record settings in provenance. |
| Fallback registry | None; no new fallback, automatic model change or backend substitution. |
| Overall architecture (hosts, data flow, security) | Existing host, CPU pool and single-GPU lease. Local evidence before existing exports. No new service, port or cloud resource. |
| Sponsor tracks / demo | W7900 identification, actual ROCm execution, applied card-specific tuning, memory use and reproducible measured comparison. |
| Cost (GPU credits, HF credits, time) | One W7900 only. Incremental capture estimate 1–2 GPU hours at the confirmed session rate; at A1's historical 1 credit/hour that would be 1–2 credits, not a verified future price. HF inference spend: none for this deliverable. No cloud spending authorized by drafting the proposal. |

## 6. Risks and rollback

- **Aer ROCm build or option support:** T17 is the first gate. Keep unsupported optional features visible; never claim they ran. Failure of the required statevector backend blocks this deliverable.
- **Tuning does not generalize:** retain fixture names, settings and measured curves. Report workload-specific results and end-to-end limitations, including CPU compilation time; do not advertise universal speedup.
- **Telemetry restricted by virtualization:** use 09 §6 behavior; timings can remain valid with explicitly unavailable power/utilization readings. Runtime memory information is required for GPU admission.
- **Memory availability changes:** sample under the lease; a later allocation failure still raises GpuOutOfMemory. The safety margin is not a guarantee against external processes.
- **Schedule pressure:** deliver the statevector/fusion report first. The existing local-LLM and numerical-verification demos follow their own dependencies. Do not claim completion of all GPU tasks from this report alone.
- **Rollback:** remove the W7900-specific qualification/report additions and leave recorded evidence intact. Keep the completed CPU MVP usable; a failed requested GPU run remains a visible failure. Any reversal of an approved production memory-planning rule requires an explicit decision, not a silent return to nominal capacity assumptions.

## 7. Decision

- Decided by: user · Date: 2026-10-10 · Outcome: approved
- Notes: approved in the conversation ("I approve the proposal"); the user then prioritized completing handoff tasks that reduce researcher overhead (repository intake and custom manifests) before AMD implementation. The approved scope is one W7900 with measurable AMD-specific tuning and evidence.
- Applied to specs in: not applied · CHANGELOG line added: no
- Proposal index: registered as approved; spec application remains tracked explicitly until the researcher intake work is complete.
