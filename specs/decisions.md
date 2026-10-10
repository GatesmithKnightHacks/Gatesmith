# Decision log

> Decisions already made in these specs, so agents don't relitigate them. Changing one needs a change proposal (class shown). New decisions are appended by the lead (class B) or after the user approves a proposal (class A), with the proposal id.

| ID | Decision | Alternatives considered | Class to change | Where |
|---|---|---|---|---|
| D-001 | The scoring engine is the MVP; consumers are thin and built last | Build the loop or UI first | A | 01 |
| D-002 | `src/` layout: package at `qscore/src/qscore/` (the v2 doc's tree showed `qscore/` at the root as shorthand) | Flat layout | B | 03 §1 |
| D-003 | Five import layers enforced by import-linter | Convention only | A | 03 §2 |
| D-004 | Pydantic v2 models are the source of truth; JSON Schemas exported and drift-checked | Hand-written JSON Schema; msgspec | A | 04 §1 |
| D-005 | Manifest `qscore.project/v0.2` with intents, invariants, permitted changes | Single-circuit manifest v0.1 | A | 04 §2 |
| D-006 | Builders run in the engine's own environment in the MVP (`runner.env: engine`), so QPY always matches | Repo's own `uv` env (later; FB-07) | B | 05 §4.2 |
| D-007 | Sandbox: process mode with rlimits and stripped env; container mode later | Podman/Docker everywhere | B | 05 §4.2 |
| D-008 | Baseline = Qiskit level 3 across 8 fixed seeds; representative = best by primary objective | Benchpress level-2 settings; single seed | A | 05 §6 |
| D-009 | Metric definitions and thresholds belong to score version `qscore-2026.1` | Unversioned | A | 06, 07 |
| D-010 | `mirror_score` is a separate labelled metric, never a substitute for `simulated_task_score` | Mirror as fallback (retired FB-06) | A | 06 §2.4 |
| D-011 | Verification ladder: reversible classical ≤ 24 input bits; Operator ≤ 12 q; GPU unitary 13–15 q double; QCEC beyond; four statuses | Random-state tests as proof (rejected) | A | 08 |
| D-012 | Acceptance: strictly better primary, constraints hold, ties keep current, statistical needs ≥ 5 trials and non-overlapping CIs | Score sums; Pareto acceptance | A | 08 §4 |
| D-013 | Single precision screens; double confirms and is the only reported precision | Single everywhere | A | 09 §4 |
| D-014 | Profiler sweeps fusion width 2–5 per precision and decides the setting | Fixed Aer default | B | 09 §5 |
| D-015 | Memory planning: 1.2× overhead, 10 % margin; budgets 43.2 GiB exclusive / 25.9 GiB with the 8B model at 40 % | Ad hoc batch sizes | A | 09 §2 |
| D-016 | Local model `Qiskit/granite-3.3-8b-qiskit` on vLLM at 40 % memory; 14B only in exclusive mode; 24B does not fit | 24B (needs ~48 GB) | A | 10 §5 |
| D-017 | One OpenAI-compatible client for local and HF Inference Providers | Separate SDKs | A | 10 §5 |
| D-018 | Neon is queue + system of record; `claim_job()` with `FOR UPDATE SKIP LOCKED`; boolean capability flags | Redis/pgmq/platform API | A | 11 |
| D-019 | Hub layout content-addressed; attempts as one Parquet file **per job** under `attempts/date=…/` (the v2 doc said one file per date; per-job avoids read-modify-write) | One Parquet per date | B | 11 §7 |
| D-020 | Worker heartbeat 10 s, stale after 60 s, max 3 attempts; failed jobs are not retried automatically | Automatic retries | A | 11 §5 |
| D-021 | Processes + uv venvs on the W7900 (no Docker assumed); Compose on laptop/Vultr | Containers everywhere | B | 02 §8, 13 |
| D-022 | Destroy the GPU machine between sessions; three sessions, 14–18 h | Keep it running | A (credits) | 13 |
| D-023 | Platform accepts only OpenQASM uploads and bundled examples; builders only in laptop mode | Run uploaded Python on workers | A | 12 §1.2 |
| D-024 | Gradio Blocks for the UI and the Space | Streamlit; HTMX | B | 12 |
| D-025 | All fallbacks off by default; `demo` profile enables only approved ones; `FallbackRefused` when needed but off | Graceful degradation everywhere | A | 00 R3, 17 |
| D-026 | `reference-qiskit` includes a pass-based `reversible_rewrite` so the S-box example has an MVP strategy | No reversible strategy in the MVP | B | 10 §4 |
| D-027 | `sbox_oracle` example = four PRESENT S-boxes on 16 bits + 4 ancillas (20 qubits), X/CX/CCX only | Small 4-bit S-box; ripple-carry adder | B | 14 §3.2 |
| D-028 | Codex runs via `codex exec` in manual git worktrees by default; plugin/MCP optional | Plugin only | B | 16 §4 |
| D-029 | Handoffs are hook-enforced: checkpoint every 100 main-session tool calls (raised from 50 by the user, 2026-10-10); final at ≥ 90 % context | Instructions only | A (user's requirement) | 00 R9 |
| D-030 | Exit codes 0 clean, 1 findings ≥ `--fail-on`, 2 invalid input, 3 runtime failure, 4 configuration error | 0–3 only | A | 05 §11 |
