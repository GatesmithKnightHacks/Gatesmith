# 18 · Risks, pitfalls and the watchlist

> **Status:** guidance (keep current; add items as you learn) · **Read:** at session start skim §1; before working in an area, read its section in §2.
> When a watchlist item bites, it goes to `progress.md` → *Broken / blocked* (R4), and if it changes a spec, to a proposal (R5).

## 1. Top risks

| Risk | Likelihood | Impact | Mitigation (planned) | If it happens |
|---|---|---|---|---|
| Aer's ROCm build fails on the image | Medium | High | First thing in S1, timeboxed 90 min; notes and wheel cached on the Hub | Stop; ask the user about FB-01 |
| vLLM will not run on gfx1100 | Medium | Medium | Timebox 60 min in S1; AMD lists W7900 support | Ask about FB-02 (llama.cpp + GGUF); the client is unchanged |
| GPU credits run short | Medium | High | Destroy between sessions; credits ledger; short S2 if the rate is > ~2.9/h | Cut benchmarks to the minimal set; CPU worker carries small jobs |
| Port 5432 blocked from Radeon Cloud | Low | Medium | Check in S1 | FB-03 decision |
| Model proposals rarely pass verification | High | Low | `reference-qiskit` carries the loop; the comparison is the leaderboard's point | Report it honestly; it is a result |
| Builders hang or crash | Medium | Medium | Sandbox timeouts and limits; curated repos | Q300–Q303 errors |
| Scope creep | High | High | Tiers, gates, the cut list; R2 | Apply the cut list at G2; ask the user for more cuts |
| Host RAM too small for 15-qubit unitary checks | Medium | Low | Check in S1 | Class A proposal to cap the GPU rung at 14 qubits |
| Determinism breaks (seeds, ordering) | Medium | Medium | Determinism tests from G2 on | Treat as a blocker (snapshots depend on it) |
| Session context runs out mid-task | High | Medium | Hooks: checkpoint every 100 calls, final handoff at 90 % | New session resumes from `handoff.md` |

## 2. Watchlist by area

### Qiskit (2.x)
- Fake backends live in `qiskit_ibm_runtime.fake_provider` (`FakeTorino`), not `qiskit.providers.fake_provider`.
- `qiskit.qasm3.loads` needs the separate `qiskit-qasm3-import` package; `qasm2.loads` is built in.
- Use `generate_preset_pass_manager(optimization_level=3, target=..., seed_transpiler=...)`; avoid deprecated `transpile` keyword combos; check routing/layout method names exist in the installed version before relying on them (e.g. `lookahead`).
- `count_ops()` includes barriers; filter directives. Compiled circuits are as wide as the target (133 qubits on Torino); use active qubits and the `TranspileLayout`.
- QPY is forward-compatible only (newer Qiskit reads older QPY); keep runner and engine on the same Qiskit (MVP default).
- Pulse was removed in Qiskit 2.0; durations come from the `Target`; scheduling via `ALAPScheduleAnalysis` with target durations.
- Qiskit's transpiler runs Rust code in parallel threads; inside a process pool set `RAYON_NUM_THREADS=1` (or similar) to avoid oversubscription, and record it.
- Bit order: qubit 0 is the rightmost bit in bitstrings and Pauli labels.

### Aer, ROCm, the W7900
- Aer docs describe the NVIDIA build; every GPU option must be probed on the ROCm build (`probe_rocm_options()`).
- Never install CPU `qiskit-aer` and the ROCm build in the same venv (same module name). Pin which one each venv has; record `aer_build` in provenance.
- `libomp.so` import errors were reported for wheels built outside the right environment; check `ldd` on the compiled extension.
- FP64 is 1/32 of FP32 on RDNA 3: double-precision runs with wide fusion become compute-bound. Never assume MI300X-like FP64 numbers from AMD's Instinct blogs.
- Plan memory in GiB with the overhead factor; Aer's own `max_memory_mb` default is not our plan — pass it explicitly.
- Unitary results come back to host memory (16 GiB at 15 qubits): check host RAM.
- Truncation: Aer simulates only active qubits; planner sizes from active qubits after routing.
- vLLM pre-allocates its share of memory (`--gpu-memory-utilization 0.40`) at start: the planner's `model_loaded` budget assumes exactly that value — keep them in sync (one constant in config).
- Two HIP processes (vLLM + Aer) share the GPU: memory is partitioned by budget, compute is not; measure tokens/s and simulation throughput together once (S2).
- No `HSA_OVERRIDE_GFX_VERSION` (gfx1100 is supported). `HIP_VISIBLE_DEVICES=0` if more than one device appears.

### vLLM and models
- Wheels are for Python 3.14 only; separate venv; pick the pairing for the image's ROCm version.
- First requests compile kernels: warm up before measuring or demoing.
- Use `--max-model-len` to bound KV cache within the 40 % share; record the value.
- Model ids: `Qiskit/granite-3.3-8b-qiskit` (local), `Qiskit/Qwen2.5-Coder-14B-Qiskit` (exclusive mode only), GGUF variants for FB-02. Check licenses on each model card before publishing outputs.

### Neon
- Free plan: 1 GB storage, 100 CU-hours/month, suspend after 5 idle minutes; polling keeps it awake.
- Direct vs pooled endpoints (PgBouncer transaction mode breaks session features and server-side prepared statements).
- `requires <@ capabilities` only works for flat boolean flags; keep requirements simple.
- Cold starts: bounded retries, then raise.
- Roles: test that each role can do only what it should (T05).

### Hugging Face
- Batch commits per job; HTTP 429 → bounded retries then `HubError`.
- Private repos during the event: the Space needs a read token until the dataset goes public.
- Dataset viewer needs consistent Parquet schemas across files: fix the attempts columns and types in one place.
- Inference Providers: model availability and prices change; pin ids in `improve/models.yaml`; record provider per attempt; watch the event's HF credits.
- Structured-output support differs by provider; parse strictly regardless.

### Determinism and statistics
- Derive every seed from content hashes (`09` §4); never use `random` without a seed.
- Sort pool results; avoid set iteration order; canonical JSON for hashes.
- GPU floating-point reductions may differ in the last bits from the CPU: structural metrics exact, simulated within tolerance (`14` §2).
- Statistical acceptance needs ≥ 5 trials and non-overlapping 95 % intervals; otherwise `inconclusive`.

### Verification
- Compiled circuits must be reduced to virtual qubits through the recorded layout before comparison (`08` §2).
- Final measurements stripped for unitary checks; measurement maps compared separately.
- QCEC "probably equivalent" is **not** passed.
- Region splicing must keep convexity; test `splice ∘ extract`.

### Security and privacy
- The process sandbox is not a security boundary: curated repos only; strip secrets from the child environment.
- Strip QASM comments from prompts (prompt injection); never execute model output.
- External inference off by default; region-only when on.
- Never put secrets in handoffs, proposals, briefs, logs, or the Space.

### Hackathon logistics
- Check the event's rules on pre-written code and on what must be built during the event; specs and plans are fine to have, code is written during the event.
- Submission needs: repo link, demo video, track selections, descriptions; prepare in T31.
- Keep the platform URL and Space working when the GPU machine is off (judging may happen at any time).

## 3. Open questions (owner → status)

| Question | Owner | Status |
|---|---|---|
| Does a stopped Radeon Cloud instance bill? Snapshots? Inbound connections? Docker? SSH? Credit rate per hour? | User → AMD reps | open |
| Which Hub org/user name hosts `qscore-runs`, `qscore-wheels` and the Space? | User | open |
| GitHub repo name and visibility (public for judging)? | User | open |
| Which HF Inference Providers models to include on the leaderboard (budget ≤ the event's HF credits)? | User + lead (T25) | open |
| Domain for the Vultr platform, or `sslip.io`? | User (T28) | open |
| Approve the `demo` profile's fallbacks (FB-04, FB-05)? | User | open |
