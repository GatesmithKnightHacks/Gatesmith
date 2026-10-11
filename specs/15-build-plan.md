# 15 · Build plan: phases, gates, tasks, cut list

> **Status:** binding for order and acceptance; the lead may reorder tasks **within** a phase (class B, recorded) · **Read:** at session start (with `progress.md`) and before picking a task.
> Build the contracts first, a CPU-only scorecard second, the GPU third and the consumers last. Each phase ends at a gate you can test (`01-mvp.md` §5). If a gate slips, cut scope from the next phase (cut list, §4) rather than moving the freeze.

## 1. Phases and timing (hours from kickoff)

| Phase | Hours | Gate | GPU session |
|---|---|---|---|
| P0 Workspace + P1 Contracts | 0–3 | G1 | S1 (setup) runs in parallel, tonight |
| P2 CPU scorecard | 3–14 | G2 (Saturday noon; cut list enforced) | — (machine destroyed) |
| P3 GPU and queue | 14–22 | G3 | S2 |
| P4 Consumers | 22–30 | G4 (feature freeze) | — |
| P5 Harden | 30–36 | G5 (demo twice) | S3 |

## 2. Workstreams

| Stream | Owns | Hands off to |
|---|---|---|
| A · Intake and validation | Discover, draft, validate, resolve, sandbox, interpret, issue catalog | B: resolved items; D: issues and summaries |
| B · Compile, metrics, diagnosis | Targets, compile, CPU metrics, rules, scorecard assembly, requests | C: simulation jobs; D: scorecards |
| C · GPU and simulation | GPU sessions, Aer ROCm build, profiler, planner, simulation metrics, verification ladder, bench | B: task scores; D: telemetry and bench |
| D · Records, UI, platform | Worker, platform job API client, Hub, loop service, UI, Vultr, Space, model clients, leaderboard | Everyone |

## 3. Tasks

Legend — **Tier** (0/1/2) · **WS** workstream · **Dep** dependencies · **Delegable**: `lead` (keep in the main session), `sub` (Claude subagent in a worktree), `codex` (Codex in a worktree), `any`. Delegation rules: `16-agents-and-codex.md`.

### 3a · The MVP (ChP-0023): fast-track scoring slice S1–S6 (ChP-0022), then M1–M4 — built first

`qscore score --manifest qscore.yaml` → scorecards + Markdown report for both examples on the QASM path, CPU only. Tasks S1–S6 are subsets of T03/T07/T10–T15 (table in ChP-0022 §2.1); their remaining scope stays with the original task. MVP tasks after the slice: **M1** single-file mode `qscore score PATH.qasm [--target]` with the manual-upload defaults, plus MVP-relevant validation codes (Q100–Q107, Q200, Q206, Q304, Q400–Q408) · **M2** remaining CPU metrics (`scheduled_duration`, `supermarq_profile`, Clifford/linear blocks, `scalability`) and D07, D09, regions, suppression · **M3** builder path via the sandbox (preferred input) · **M4** review, docs (`docs/metrics.md`), golden record+approve values. **G-MVP** = both examples and a single QASM file score end to end. Acceptance of the slice: both example manifests score end to end; golden rows of `06` §4 that the spec approves pass; ruff/mypy/pytest pass; one spec-auditor pass over the slice.

### P0 · Workspace

| ID | Task | Tier | WS | Dep | Delegable | Acceptance criteria |
|---|---|---|---|---|---|---|
| T00 | Bootstrap workspace and repo: verify layout and tools (`git`, `uv`, Python ≥ 3.11, `codex` presence/integration mode per `16` §4); verify hooks (status line shows context %, tool-call counter increments); use the team repo `Gatesmith/` (github.com/GridGxly/Gatesmith; specs committed in `Gatesmith/specs/`); scaffold the engine in `Gatesmith/qscore/`: `pyproject.toml` (src layout, extras, entry points, markers), `src/qscore/__init__.py`, `errors.py`, `config.py` (profiles + fallback switches), `logging.py`, empty CLI with `--help`; copy `specs/templates/repo-AGENTS.md` → `Gatesmith/AGENTS.md` and `repo-CLAUDE.md` → `Gatesmith/CLAUDE.md`; `.gitignore`, LICENSE (Apache-2.0), README stub; CI workflow at `Gatesmith/.github/workflows/ci.yml`; `.importlinter` | 0 | — | — | lead | `uv run qscore --help` works; `uv run pytest` runs; `uv run lint-imports` passes; CI green on GitHub (if pushed); `progress.md` shows T00 done with the Codex integration mode recorded |

### P1 · Contracts (→ G1)

| ID | Task | Tier | WS | Dep | Delegable | Acceptance criteria |
|---|---|---|---|---|---|---|
| T01 | Schemas: `schemas/common.py`, `manifest.py`, `scorecard.py`, `improvement.py`, `run.py`, `records.py`, `versions.py`, `export.py` per `04-contracts.md`; export JSON Schemas to `qscore/schemas/`; drift test | 0 | B | T00 | lead (contracts are the spine) | Every example in `04-contracts.md` validates (as test fixtures); invalid variants raise; drift test passes; `x-` keys preserved |
| T02 | Issue model and catalog: `validate/issues.py`, `catalog.py`, `locate.py`; `qscore explain`; `docs/issues.md` generation | 0 | A | T01 | codex or sub | Every code in `05-pipeline.md` §12 present with message/hint; `qscore explain Q202` prints it; doc generated and committed |
| T03 | Fixtures: `examples/sidechain_qaoa` (builder, params, Hamiltonian generator, yaml), `examples/sbox_oracle` (generator + QASM + yaml), `examples/broken/*` (one per code, `expected.json`); `tests/golden/values.yaml` with the spec's approved values | 0 | A/B | T01 | sub (generators), lead (golden file) | Both example manifests load into `ProjectManifest`; generators are deterministic (hash of outputs stable across two runs); sbox generator self-verifies; golden file matches `06-metrics.md` §4 exactly |
| T04 | Service stubs + CLI skeleton: every command in `05-pipeline.md` §11 wired to a `services.py` stub that returns fixture objects which validate; `Event` emission; exit codes | 0 | D | T01 | codex or sub | CLI tests for exit codes 0/2/3/4 with stubs; `--json` outputs validate against schemas |
| T05 | Platform job API contract (11 §3) agreed with the platform owner; `record/jobs_client.py` skeleton + fake job API fixture; create Hub repos (user provides tokens) | 0 | D | T01 | lead (needs the user's secrets) | Against the fake job API: claim returns a job for matching caps and none for non-matching; a second claimant gets nothing; heartbeat after lost claim → 409 handled |
| T06 | CI: ruff, mypy, import-linter, pytest CPU, schema drift | 0 | — | T00 | any | Workflow green on a PR |

**G1:** schemas export; both examples load; CI green; stubs validate. Tag `g1`.

### P2 · CPU scorecard (→ G2, Saturday noon)

| ID | Task | Tier | WS | Dep | Delegable | Acceptance criteria |
|---|---|---|---|---|---|---|
| T07 | `manifest/yamlio.py`, `manifest/resolve.py` (positions, defaults → profile → item, `item_hash`, `origin_of`) | 0 | A | T01 | sub | Round-trip keeps comments/order; every field path locates to a line/column; hashes stable; origin flags correct |
| T08 | Validation stages 1–2: schema and reference checks; `validate/pipeline.py` skeleton | 0 | A | T02, T07 | sub | All Q1xx/Q2xx broken fixtures produce exact codes and locations |
| T09 | Intake: `discover.py`, `draft.py`, `loaders.py`, `runner.py`, `sandbox.py` (process mode) | 0 | A | T07 | sub (sandbox reviewed by lead) | Discovery finds exactly the expected candidates incl. decoys; Q3xx fixtures produce exact codes; tokens absent from the child env (test); timeout kills the child |
| T10 | Semantic + feasibility checks; `interpret/summary.py` + templates; `qscore validate` and `qscore plan` end to end | 0 | A | T08, T09, T18a | sub | All Q4xx/Q5xx fixtures exact; summaries mark defaults; `plan` prints the resolved manifest and per-metric plan |
| T11 | Targets: registry (FakeTorino, all-to-all, line-N, grid-RxC, heavy-hex-D), custom targets, calibration snapshots | 0 | B | T01 | codex | Targets build; calibration ids stable; `line-5` basis `cx,rz,sx,x`; missing calibration → reliability `unavailable` path testable |
| T12 | Compile: pipeline (process pool, seeds, all-to-all reference, raw translation), `route_only`, `select`; `score/cache.py` | 0 | B | T11 | sub | Golden line-5 GHZ values; results sorted by seed; cache hit on rerun; different seeds never mixed |
| T13 | Metrics: base/registry/selection + resources + hardware (routing, reliability, timing, seeds) + opportunities (features, structure, resynthesis) + `scalability` (CPU) | 0 | B | T12 | codex (leaf metrics) + sub; lead reviews `base.py` | All `06-metrics.md` §4 golden values pass; property tests pass; each metric documented in `docs/metrics.md` |
| T14 | Diagnose: rules D01–D09, `thresholds.yaml`, policy, profiles, regions (`convex_blocks`) | 0 | B | T13 | codex or sub | Rule boundary tests (at/below/above, severity); convexity test; findings stable on examples |
| T15 | `score/context.py`, `score/engine.py`, `record/scorecard.py`, `provenance.py`, `run_record.py`, `report.py`; `qscore score` end to end on CPU; snapshots | 0 | B | T10, T14 | lead | Both examples: validate → confirm (`--yes`) → scorecards on CPU; snapshot tests; determinism test; `partial`/exit 3 path tested |
| T16 | `improve/requests.py`: `build_requests`, `extract_region`, `splice` | 0 | B | T14 | sub | `splice(extract(c, r)) == c` property test; requests validate; region-only respected |
| T18a | Hardware profiler, CPU part (no GPU): cores, RAM, Aer build detection, CPU timings; `qscore profile` | 0 | C | T01 | sub | Profile validates; cached; CPU curve recorded on the laptop |

**G2:** both examples validate/confirm/score on CPU; broken fixtures exact; golden + property pass. **Apply the cut list (§4) here.** Tag `g2`.

### P3 · GPU and queue (→ G3; GPU session S2)

| ID | Task | Tier | WS | Dep | Delegable | Acceptance criteria |
|---|---|---|---|---|---|---|
| T17 | **GPU session S1 (tonight, parallel to P1):** machine checks, Aer ROCm wheel, smoke tests, one benchmark, `scripts/build_aer_rocm.sh` and `bootstrap_radeon.sh`; teardown | 0 | C | — | lead + user | Checks recorded in `lab/`; wheel on the private Hub repo with SHA256; GPU==CPU smoke passes; credits ledger updated; machine destroyed (user's go) |
| T18b | Profiler GPU part: crossover, time-vs-qubits, cache knee, fusion sweep, overhead factor, `probe_rocm_options()`, telemetry source | 0 | C | T17, T18a | lead (on the GPU) | Profile with GPU fields recorded; options probe results recorded |
| T19 | `sim/`: backends, planner (memory modes, grouping, batching), tasks (known_output, distribution, expectation, mirror), jobs (GPU thread + CPU pool; OOM → `GpuOutOfMemory`), telemetry | 0 | C | T18a | sub (CPU parts) + lead (GPU validation) | Planner unit tests reproduce `09` §2 tables exactly; CPU runs of every task type; OOM path raises in `ci` |
| T20 | `metrics/research/simulated.py` + `mirror_score` + D10; differential tests | 0 | C | T19, T14 | lead | `pytest -m gpu` differential suite passes on the W7900 within tolerances; scorecards show GPU method and CI |
| T21 | Benchmark suite + charts data; results to the Hub | 0 | C | T19, T18b | lead | Dated bench run on the Hub; crossover, cache knee and precision × fusion grid present |
| T22 | Records + worker: `record/jobs_client.py`, `record/hub.py`, `worker.py`; queue fault tests | 0 | D | T05, T15 | sub (job client/Hub code), lead (worker loop) | `pytest -m platform` passes (kill → requeue; replay idempotent); a score job submitted on the platform runs on the W7900 worker and lands on the Hub |
| T23 | Verification ladder: `verify/reduce.py`, `equivalence.py`, `permitted.py`, `task.py`, `ladder.py` | 0 | C | T12 | codex (CPU rungs) + lead (GPU rung) | Mutation tests fail every broken candidate; positive tests pass; QCEC mapping; GPU rung passes 13–15 q tests on the W7900 |

**G3:** GPU task scores match CPU; benchmark + sweep recorded; Hub records; worker survives a kill. Tag `g3`.

### P4 · Consumers (→ G4, feature freeze)

| ID | Task | Tier | WS | Dep | Delegable | Acceptance criteria |
|---|---|---|---|---|---|---|
| T24 | `improve/protocol.py`, `reference_qiskit.py` (all six strategies), `loop.py`, `services.improve_item()`; attempts recorded | 1 | D/B | T16, T23 | lead + sub | One D01/D03 finding on the QAOA example yields a verified, accepted `reference-qiskit` proposal; sbox `reversible_rewrite` verified classically; stop rules tested |
| T25 | `hf` layer (`improve/hf_layer.py`), `prompts.py`, `improve/models.yaml` + catalog check, `qscore models check`, privacy guard, budgets (ChP-0048) | 1 | D | T24 | lead | Recorded-response tests (valid, unparsable, bad QASM, wrong width, retries, auth, catalog, privacy, budget); live smoke `-m llm` on the ★ model with `HF_TOKEN` |
| C39a | `--not NAME` negation + `--pick not:` exclusion (`cli.py`, `intake/draft.py`) (ChP-0039) | 1 | F1 | T09 | lead/codex | Invalid names/picks, repeats, exclusions, empty selection, mode guards, trust/confirm parity tested |
| C39b | `qscore deps`: `intake/deps.py`, `services.prepare_dependencies` (ChP-0039, 05 §4.5) | 1 | F1 | C39a | lead/codex | Offline synthetic projects: conflict, decline, no declarations, missing uv, failed upgrade keeps env, exact manifest diff |
| C39c | `runner.env: uv` builder runs with Python/Qiskit version checks (ChP-0039, 05 §4) | 1 | F1 | C39b | lead/codex | A builder importable only from the prepared env scores end to end |
| T26 | `conformance.py`, `qscore conform`, exports (attempts parquet, `leaderboard.parquet`), dataset card | 1 | D | T25, T22 | sub | Kit passes reference + stub, fails the broken layer; leaderboard parquet on the Hub |
| T27 | UI: `ui/backend.py` (Local + Queue), screens per `12` §1.2 | 1 | D | T15, T22 | sub (screens) + lead (backend) | Full flow in the UI on the laptop (Local) and via the platform (Queue); accessibility checklist items present |
| T28 | Platform on Vultr: `api/app.py`, compose, Caddy, deploy | 1 | D | T27 | lead (deploy needs the user) | Public HTTPS URL works with the GPU machine off; jobs queue and wait; GPU indicator correct |
| T29 | Space: leaderboard app from `leaderboard.parquet` | 1 | D | T26 | codex or sub | Space builds and shows the table; no DB credentials in the Space |
| T30 | (Tier 2) ADK assistant on Gemini, read-only tools + allow-list callback | 2 | D | G4 | sub | Answers "why did D01 fire?" from records; refuses writes |

**G4:** one finding → request → verified proposal from `reference-qiskit` and ≥ 1 model layer; UI full flow; platform + Space work with the GPU off. Tag `g4`. **Feature freeze:** after G4 only bug fixes, docs and Tier 2 items the user approves.

### P5 · Harden (→ G5; GPU session S3)

| ID | Task | Tier | WS | Dep | Delegable | Acceptance criteria |
|---|---|---|---|---|---|---|
| T31 | Demo script (`01-mvp.md` §7) as `docs/demo.md` with exact commands/clicks; README with benchmark numbers and charts; make dataset and Space public (user's go); submission texts per track | 1 | all | G4 | lead | Two full rehearsals logged in `progress.md` |
| T32 | Final review: spec-auditor full pass + Codex adversarial review on `main`; fix blockers only | 1 | all | T31 | sub + codex | No open blocker; `fallbacks_used` empty in dev runs; demo profile's fallbacks match the approved list |

**G5:** the demo runs live twice in a row. Tag `g5`.

## 4. Cut list (apply at G2, in this order, only as far as needed)

1. The assistant (T30).
2. The Space's CPU demo (the leaderboard stays).
3. The platform's CPU worker.
4. `scheduled_duration` with rule D07.
5. Size sweeps beyond three sizes.

Further cuts need the user: write a class A proposal listing what to cut and what it costs each track.

## 5. Rules for the team and its agents (summary of `16-agents-and-codex.md`)

- One agent implements a component; a different one reviews it against the written contract.
- Agents may suggest test changes; only a person approves them, and only a person edits golden values.
- Schemas freeze at G1, so parallel work can rely on them (changes after G1 are class A).
- At most three delegated implementers at once, each in its own worktree, on disjoint files.
