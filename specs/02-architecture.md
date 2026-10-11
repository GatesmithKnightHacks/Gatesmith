# 02 · Architecture (overall), with the MVP marked

> **Status:** binding · **Read:** before touching anything that crosses a module or host boundary (worker, records, platform, UI, Space, GPU machine).
> **Tier tags:** `[T0]` Engine MVP · `[T1]` Demo MVP · `[T2]` Stretch · `[Post]` roadmap.
> **Origin:** "Quantum Optimization Engine: Architecture v2" (Claude Doc, 2026-10-09). This file is the agent-facing version and wins on conflict.

## 1. Decisions this architecture rests on

1. **The engine decides; models only propose.** Acceptance, ranking and stopping are deterministic code. Language models submit candidates in the same request format as every other strategy. `[T0]`
2. **The scoring engine is the MVP.** Everything else consumes its two outputs: scorecards and improvement requests. `[T0]`
3. **One W7900 does the heavy work:** batched verification, noisy simulation and benchmarks, under memory budgets. No language model runs on our hardware (ChP-0048). `[T0]`
4. **The GPU machine holds nothing you can't lose.** The job queue lives behind the platform's HTTPS job API, records and large files on the Hugging Face Hub, and one script rebuilds the machine. `[T0]`
5. **Work arrives through a queue.** Workers claim jobs from the platform job API over outbound HTTPS only, so no host needs another's address. Any worker whose capabilities match a job can run it. `[T0]`
6. **One client for every language model.** Open-weight models via Hugging Face Inference Providers through the OpenAI-compatible router, pinned `model:provider`, compared on identical requests. `[T1]`
7. **One UI, two backends:** in-process on a laptop, queue-backed on the platform. `[T1]`
8. **Public surfaces are read-only.** The Space never touches the job API or the GPU. `[T1]`
9. **Everything is versioned and traceable:** schema, score, threshold and prompt versions, with provenance on every record. `[T0]`

## 2. Hosts

```
                         (all arrows = outbound connections, opened by the arrow's tail)

  ┌──────────────────────────┐        ┌───────────────────────────┐
  │ Radeon PRO W7900 machine │        │ Vultr server (always on)  │
  │ (created per session,    │        │  platform: FastAPI +      │
  │  destroyed when idle)    │        │  Gradio UI [+ ADK T2]     │
  │  - qscore worker (GPU)   │        │  CPU worker [T2]          │
  │  - Aer ROCm build        │        └──────┬───────────┬────────┘
  │  - benchmark/data jobs   │               │           │
  └───────┬──────────┬───────┘               │           │
          │          │   HTTPS: claim/heartbeat/finish   │
          │          └───────────────────────────────►  (platform job API, 11 §3)
          │                                          │           ▼
          └────────────────────────────────────────────►┌──────────────────────────┐
  ┌──────────────────────────┐                          │ Hugging Face             │
  │ Laptop (development)     │                          │  Hub repos (dataset,     │
  │  same package, CPU only  │ ───────────────────────► │  wheels, models)         │
  └──────────────────────────┘                          │  Inference Providers     │
                                                        │  Space (read-only)       │
                                                        └──────────────────────────┘
```

| Host | Lifetime | Runs | Tier |
|---|---|---|---|
| Radeon PRO W7900 on Radeon Cloud | Created per session, destroyed when idle | Engine worker, Aer's ROCm build, benchmark and data jobs | T0 |
| Laptop | During development | The same package and UI on CPU; tests; the lead Claude Code session | T0 |
| Hugging Face | Always on | Hub repos (dataset, Aer wheel, models), Inference Providers, the Space | T0 (Hub), T1 (rest) |
| Vultr server | Always on | Platform API incl. the job API and its job store (11 §3), Gradio UI, (ADK assistant T2, CPU worker T2) | T1 |

**Connection rule:** every connection starts at a worker or the platform and ends at the platform job API or Hugging Face (HTTPS). The GPU machine needs no public address and accepts no inbound connections from other hosts.

## 3. Components

| Component | Responsibility | Never does | Spec | Tier |
|---|---|---|---|---|
| **Engine (`qscore` package)** | Intake, validation, compilation, metrics, diagnosis, scorecards, improvement requests, verification, simulation planning | Accept a change it has not verified; read secrets it does not need | 03–09 | T0 |
| **Worker (`qscore worker`)** | Claims jobs from the platform job API whose requirements its capabilities cover, heartbeats, runs one service call, writes results | Run two GPU jobs at once; keep state that matters only on its disk | 11 | T0 |
| **Records (`record/jobs_client.py`, `record/hub.py`)** | Job API calls (claim, heartbeat, events, finish), content-addressed Hub uploads, dataset and leaderboard exports | Write without an idempotency key | 11 | T0 |
| **Proposers (improvement layers)** | Answer improvement requests with proposals: `reference-qiskit` (deterministic), `hf` (open-weight models via Inference Providers) | Decide acceptance; see more than the region unless allowed | 10 | T1 |
| **Platform (Vultr)** | Submits jobs, renders records, hosts the UI | Compute scores; hold GPU credentials | 12 | T1 |
| **UI (Gradio)** | The confidence flow: validate → review → confirm → score → improve → export | Contain logic; it calls `services.py` (local) or the platform API (queue) | 12 | T1 |
| **Space** | Leaderboard from `leaderboard.parquet`; (CPU demo T2) | Touch the job API or the GPU; hold write tokens | 12 | T1 |
| **Assistant (ADK + Gemini)** | Explains scorecards from records, drafts manifest edits as suggestions | Accept changes; write to the database | 12 | T2 |

## 4. Engine internals (summary; details in 03–09)

```
 qscore.yaml + repo/QASM
        │
  1 Discover ─ 2 Draft ─ 3 Validate (schema, references) ─ 4 Resolve & check (sandbox, semantic, feasibility)
        │                                                         │  (any error → full issue report, stop)
  5 Interpret & confirm  ◄────────────────────────────────────────┘
        │ (confirmed)
  6 Compile (seeds in parallel + all-to-all reference + routing-only)
  7 Measure (CPU metrics in a process pool; simulation jobs → sim/ → GPU)   ← the only GPU stage in normal scoring
  8 Diagnose (D01–D10, policy, regions)
  9 Scorecard + improvement requests (local JSON → Hub → platform `finish`)
 10 Verify (used by the loop): proposals → ladder → re-score → accept/reject → attempt record
```

Five code layers import only downward: **Interfaces** (`cli.py`, `worker.py`, `api/`, `ui/`) → **Services** (`services.py`) → **Pipeline** (`manifest/`, `intake/`, `validate/`, `interpret/`, `score/`, `record/`, `bench/`) → **Engines** (`targets/`, `compile/`, `metrics/`, `sim/`, `diagnose/`, `verify/`, `improve/`) → **Foundations** (`schemas/`, `hardware/`, `config.py`, `errors.py`). See `03-code-structure.md`.

## 5. How a job flows `[T0]`

Every unit of work is a job in the platform's job store (11 §3), so a job submitted while the GPU machine is off simply waits, and a dead worker loses nothing.

**Job states:** `queued → claimed → running → done | failed`; `queued → cancelled`. A job whose heartbeat stops for 60 s returns to `queued` with its attempt count raised; after its 3rd lost attempt it becomes `failed` with the last error.

**Job kinds:** `validate` (CPU), `score` and `improve` (CPU or GPU, decided by the plan), `bench` (GPU), `conform` (any worker; model calls go to Inference Providers), `profile` (any worker).

**Path of one scoring run**

1. **Static checks.** The platform (or the CLI) parses the manifest and checks schema and references without running anything; every issue is shown together.
2. **Validate job.** A worker resolves each circuit (builders run in its sandbox), runs semantic and feasibility checks, and writes the issue report, the plain-language summary and the compute plan.
3. **Confirm.** The user reads what the engine understood and confirms. The confirmation is stored with the manifest hash.
4. **Score job.** Queued with `requires.gpu = true` if any planned metric needs the GPU, otherwise CPU.
5. **Claim.** A worker whose capabilities cover the job claims it atomically (`POST /api/worker/claim`), and marks it running.
6. **Run.** The engine compiles, measures, diagnoses and writes scorecards and improvement requests. Heartbeat every 10 s; progress events stream to the platform in batches; GPU telemetry goes to `telemetry.jsonl` and the job summary.
7. **Finish.** Scorecards land on the Hub and the platform records the job's `result_summary`. The job closes with its compute summary.
8. **Display.** The UI polls the job and renders each scorecard as it lands.

An `improve` job adds one step between Run and Finish: proposers answer the requests; the engine verifies and re-scores every proposal and records every attempt, accepted or not.

### When something fails

| Situation | What happens (default `dev`/`ci`) | With an approved fallback enabled (`demo`) |
|---|---|---|
| A worker dies mid-job | No heartbeat for 60 s → requeued with attempts+1; after 3 attempts → `failed` with the last error | same (this is the design, not a fallback) |
| The GPU machine is off | GPU jobs wait and show "waiting for GPU"; CPU jobs run on any CPU worker | same |
| GPU out of memory | The metric fails with status `failed` and an error naming the planner estimate vs the real limit (a planner bug to fix) | FB-04: retry with half the batch, then CPU; recorded on the metric and in `fallbacks_used` |
| A proposer times out or returns invalid JSON | Counted against that layer's parse rate; the loop continues with the other layers (this is the design) | same |
| The worker loses the platform job API mid-job | Worker logs the error and exits non-zero; the job is requeued by heartbeat timeout | FB-05: buffer results to a local spool and replay on reconnect (idempotent keys) |
| A budget runs out | The job stops; unfinished metrics are `skipped` with reason `budget: <elapsed> s >= wall_time_s <limit>` (ChP-0028) | same |
| Aer's ROCm build unusable | GPU metrics are `unavailable` with reason "no working GPU simulator"; the GPU gate (G3) is failing → raise it | FB-01 only if the user approves (torch statevector backend) |
| A pinned `hf` model/provider is not live | The layer raises `LayerError` naming it; other layers continue | none (no automatic model or provider switch) |

## 6. Data and contracts `[T0]`

- Four versioned public schemas form the standard: **project manifest** (`qscore.project/v0.2`), **scorecard** (`qscore.scorecard/v0.2`), **improvement request** (`qscore.request/v0.2`), **proposal** (`qscore.proposal/v0.2`). Internal records: attempt, job, event, plan, issue report, hardware profile, bench result. See `04-contracts.md`.
- Pydantic models are the source of truth; JSON Schemas are exported to `qscore/schemas/` and checked for drift in CI.
- The platform job store holds job state; the Hub holds records and anything large, named by content hash. Nothing crosses a host boundary in any other form. See `11-records-and-queue.md`.
- **Score version** (`qscore-2026.2`) covers metric definitions and diagnostic thresholds; changing any threshold bumps it.

## 7. Compute on the W7900 `[T0]`

RDNA 3 (gfx1100), 48 GB GDDR6, 96 MB Infinity Cache, 864 GB/s, FP64 1.92 TFLOPS vs FP32 61.32 TFLOPS (1/32). Planning rule: 1.2× memory overhead, 10 % margin. Statevector limit: 31 qubits double, 32 single; with the 8B model resident at 40 % of memory: 30 double, 31 single. Unitary/density matrix: 14 qubits = 4 GiB, 15 = 16 GiB, 16 = 64 GiB (does not fit). Single precision screens; double confirms and is the only precision for reported numbers. The profiler sweeps fusion width 2–5 per precision. Details: `09-gpu-and-simulation.md`; operations: `13-gpu-runbook.md`.

## 8. Deployment summary

| Where | How | Tier |
|---|---|---|
| Laptop | `uv` venv; `uv run qscore ...`; optional Docker Compose `lite` profile | T0 |
| W7900 | Plain processes in `uv` venvs (engine venv with `--system-site-packages` to reuse the image's ROCm PyTorch), started by `scripts/bootstrap_radeon.sh`, run under tmux | T0 |
| Hub | Repos created once; uploads via `huggingface_hub` | T0 |
| Vultr | One small server, Docker Compose (`platform`, optional `worker`), Caddy for HTTPS | T1 |
| Space | Gradio Space built from `qscore/space/` | T1 |

## 9. Security and privacy (summary; rules R10)

- Builder functions run in a separate process with timeout, memory/CPU limits, a temporary directory, and no API tokens in the environment. On Linux, `unshare -n` cuts the network where permitted. The sandbox is not a security boundary for hostile code: the MVP runs only curated example repos and uploaded QASM.
- Uploads are OpenQASM only. QPY is accepted only from the engine's own runner.
- External inference is off by default (`privacy.external_inference: false`). When on, only the targeted region leaves the machine, and the `hf` layer refuses to run otherwise.
- Each worker has its own platform bearer token; the Space has a read-only Hub token and no job-API access; the assistant reads records only, and an ADK callback checks every tool call against an allow-list.

## 10. What is deliberately not here

No service mesh, no message broker besides the platform job API, no Kubernetes, no auth system, no microservices inside the engine. If you feel the need for one, write a change proposal (R5) with evidence.
