# 03 · Code structure, layers and conventions

> **Status:** binding (tree, layers, public functions) · **Read:** before creating any file in `qscore/`, and before any refactor.
> Files marked `(T1)`, `(T2)` or `(later)` wait for their tier. Everything else is Tier 0.

## 1. Repository tree (`Gatesmith/`, the git repo; the engine in `Gatesmith/qscore/`)

```text
Gatesmith/                       git root = hackathon project root (team repo)
├── README.md                    project README
├── AGENTS.md  CLAUDE.md         from specs/templates/repo-AGENTS.md and repo-CLAUDE.md
├── .github/workflows/ci.yml     CI (steps run with working-directory: qscore)
├── specs/                       these specs (committed)
└── qscore/                      the engine — every `qscore/…` path in the specs is relative to Gatesmith/

Gatesmith/qscore/                the engine's contents:
├── pyproject.toml               package, extras, entry points, tool settings
├── uv.lock                      pinned dependency versions (committed)
├── README.md  LICENSE (Apache-2.0)  CITATION.cff  CONTRIBUTING.md
├── .importlinter                layer contract
├── schemas/                     generated JSON Schemas (committed; drift-checked)
├── scripts/
│   ├── bootstrap_radeon.sh      W7900 session setup (13-gpu-runbook.md)
│   ├── build_aer_rocm.sh        Aer ROCm wheel build for gfx1100
│   └── neon/                    0001_init.sql, 0002_roles.sql, ...
├── docker/                      (T1) compose.yaml for laptop `lite` and Vultr; Containerfile.platform; Caddyfile
├── src/qscore/
│   ├── __init__.py              public Python API
│   ├── cli.py                   Typer app (all commands)
│   ├── worker.py                queue loop
│   ├── services.py              one function per user action (the only door into the package)
│   ├── config.py                Settings (pydantic-settings), profiles dev/ci/demo, fallback switches
│   ├── errors.py                exception hierarchy
│   ├── logging.py               structured logging setup
│   ├── api/app.py               (T1) FastAPI for laptop mode and the platform
│   ├── schemas/    common.py  manifest.py  scorecard.py  improvement.py  run.py  records.py  versions.py  export.py
│   ├── manifest/   yamlio.py  resolve.py
│   ├── intake/     discover.py  draft.py  loaders.py  runner.py  sandbox.py
│   ├── validate/   issues.py  catalog.py  locate.py  schema_checks.py  reference_checks.py
│   │               semantic_checks.py  feasibility.py  pipeline.py
│   ├── interpret/  summary.py  templates.py
│   ├── targets/    registry.py  custom.py  calibration.py
│   ├── compile/    pipeline.py  stages.py  select.py
│   ├── metrics/
│   │   ├── base.py  registry.py  selection.py
│   │   ├── resources/       counts.py
│   │   ├── hardware/        routing.py  reliability.py  timing.py  seeds.py
│   │   ├── opportunities/   features.py  structure.py
│   │   └── research/        scalability.py  simulated.py
│   ├── sim/        backends.py  planner.py  tasks.py  jobs.py  telemetry.py
│   ├── diagnose/   rules.py  policy.py  regions.py  probes.py (T2)  thresholds.yaml  profiles/*.yaml
│   ├── score/      context.py  engine.py  cache.py
│   ├── verify/     ladder.py  reduce.py  equivalence.py  task.py  permitted.py
│   ├── improve/    protocol.py  requests.py  loop.py  reference_qiskit.py
│   │               openai_compat.py (T1)  prompts.py (T1)  models.yaml (T1)  conformance.py (T1)
│   ├── record/     scorecard.py  run_record.py  provenance.py  report.py  neon.py  hub.py  spool.py  templates/
│   ├── bench/      suite.py
│   ├── hardware/   profiler.py
│   └── ui/         (T1) app.py  backend.py  components.py
├── space/                       (T1) Hugging Face Space: app.py, requirements.txt, README.md (Space card)
├── examples/   sidechain_qaoa/  sbox_oracle/  broken/
├── tests/      conftest.py  contract/  golden/  validation/  unit/  property/  differential/
│               snapshots/  conformance/  queue/  e2e/
└── docs/       metrics.md  manifest.md  issues.md (generated)  glossary.md  architecture.md (short pointer)
```

**src layout** (`src/qscore/`) is the default (D-002). Tests import the installed package, never the source tree directly.

## 2. Layers (enforced by import-linter in CI)

| Layer | Modules | Rule |
|---|---|---|
| Interfaces | `cli.py`, `worker.py`, `api/`, `ui/` | Parse input, call **one** service function, render the result. No logic. |
| Services | `services.py` | One function per user action; returns schema objects; reports progress through an `on_event` callback; never prints. |
| Pipeline | `manifest/`, `intake/`, `validate/`, `interpret/`, `score/`, `record/`, `bench/` | The stages from manifest to scorecard and records. |
| Engines | `targets/`, `compile/`, `metrics/`, `sim/`, `diagnose/`, `verify/`, `improve/` | The science and the compute. Receive resolved, validated objects; never read the manifest file. |
| Foundations | `schemas/`, `hardware/`, `config.py`, `errors.py`, `logging.py` | Import nothing from higher layers (siblings such as `errors`/`logging` are fine; ChP-0011). |

Imports point **down only**. Within a layer, modules may import siblings only if no cycle results. The improvement loop needs both scoring (pipeline layer) and verification (engine layer), so its orchestration lives in `services.improve_item()`, which calls `score/`, `improve/` and `verify/`. `improve/loop.py` holds only the pure decision logic (acceptance, stopping) and imports nothing from the pipeline layer.

`.importlinter` (contract type `layers`; `:` = siblings may import each other without cycles, `|` = independent — ChP-0011):

```ini
[importlinter]
root_package = qscore

[importlinter:contract:layers]
name = qscore layers point down
type = layers
layers =
    qscore.cli | qscore.worker | qscore.api | qscore.ui
    qscore.services
    qscore.manifest : qscore.intake : qscore.validate : qscore.interpret : qscore.score : qscore.record : qscore.bench
    qscore.targets : qscore.compile : qscore.metrics : qscore.sim : qscore.diagnose : qscore.verify : qscore.improve
    qscore.schemas : qscore.hardware : qscore.config : qscore.errors : qscore.logging
```

## 3. File reference: what each file must provide

Public names below are part of the spec (R1). Private helpers are the implementer's choice.

### 3.1 Root, interfaces, services

| File | Provides |
|---|---|
| `pyproject.toml` | Package `qscore`; console script `qscore = "qscore.cli:app"`; extras `[gpu-rocm]` (marker only: the ROCm Aer wheel is installed from the Hub, never from PyPI), `[hf]` (openai, huggingface_hub, pyarrow), `[ui]` (gradio, fastapi, uvicorn), `[neon]` (psycopg[binary]); entry-point groups `qscore.metrics` and `qscore.layers`; pytest markers `gpu`, `slow`, `neon`, `hub`, `llm`; ruff, mypy, import-linter settings. **Install either CPU `qiskit-aer` or the ROCm build, never both** (both provide the `qiskit_aer` module). |
| `__init__.py` | `load_manifest()`, `validate()`, `score()`, `__version__`; re-exports schema classes. |
| `cli.py` | Commands: `init`, `discover`, `validate`, `plan`, `score`, `improve`, `report`, `diff`, `bench`, `profile`, `conform` (T1), `explain`, `rerun`, `migrate`, `worker`, `db migrate`, `db ping`, `export` (T1). Shared flags: `--manifest`, `--item`, `--group`, `--metrics`, `--skip`, `--device`, `--seeds`, `--precision`, `--budget-s`, `--no-cache`, `--json`, `--out`, `--fail-on`, `--yes`, `--profile`. Exit codes in `05-pipeline.md` §11. Rich tables and a progress bar fed by events. |
| `worker.py` | `run_worker(settings) -> NoReturn`: loop of `requeue_stale → claim_job → heartbeat thread → services call → write results → finish`. One GPU lease per process. See `11-records-and-queue.md` §5. |
| `services.py` | `init_project()`, `discover_candidates()`, `validate_project()`, `plan_project()`, `score_project()`, `improve_item()`, `render_report()`, `diff_scorecards()`, `run_bench()`, `profile_hardware()`, `run_conformance()` (T1), `rerun()`, `export_records()` (T1). Each takes typed arguments plus `on_event: Callable[[Event], None]`, returns schema objects, never prints. |
| `config.py` | `Settings` (pydantic-settings, env prefix `QSCORE_`): `profile` (`dev`/`ci`/`demo`), `fallbacks` (set of FB ids, validated against `17-fallbacks.md` ids; `dev`/`ci` force empty), `cache_dir`, `device_default`, `sandbox_mode` (`process`), `neon_dsn`, `neon_transport` (`postgres`), `hub_dataset_repo`, `hub_wheels_repo`, `local_llm_base_url`, `hf_router_base_url`, `worker_id`, `capabilities_override`. `get_settings()`. Prints the active profile and enabled fallbacks at startup (logged at INFO). |
| `errors.py` | `QscoreError` → `InvalidInput` (carries `IssueReport`), `ConfigError`, `SandboxError` (`kind`: timeout, import_error, user_exception, not_a_circuit), `CompileError`, `MetricError`, `SimulationError` (incl. `GpuOutOfMemory` with planner estimate), `VerificationError`, `RecordError` (`NeonError`, `HubError`), `LayerError`, `FallbackRefused` (a fallback was needed but not enabled — message names the FB id). |
| `logging.py` | `setup_logging(profile)`: JSON lines to stderr in worker mode, rich console in CLI; secrets redaction filter. |
| `api/app.py` (T1) | `POST /validate`, `POST /jobs`, `GET /jobs/{id}`, `GET /jobs/{id}/events`, `GET /scorecards/{item_sha}`, `GET /leaderboard`, `GET /health` (incl. "GPU online" from `workers.last_seen_at`). Token auth for write endpoints. |

### 3.2 Foundations: `schemas/`, `hardware/`

| File | Provides |
|---|---|
| `schemas/common.py` | `Severity` (error, warning, info), `FindingSeverity` (info, warning, high), `Status` (computed, skipped, unavailable, failed), `VerificationStatus` (passed, failed, inconclusive, unsupported), `MetricGroup` (resources, hardware, opportunities, research), `MetricKind` (deterministic, heuristic, statistical, context), `Location`, `Provenance`, `FallbackUse`, `canonical_json()`, `sha256_hex()`. |
| `schemas/manifest.py` | `ProjectManifest`, `ProjectInfo`, `Runner`, `Defaults`, `CircuitItem`, `QasmSource`, `BuilderSource`, `SizeSweep`, `Invariants`, `Task`, `Permitted`, `Objective`, `Constraint`, `Evidence`, `Execution`, `Budget`, `DiagnoseSettings`, `IgnoreEntry`, `Privacy`, `TargetSpec`. Cross-field validators (`04-contracts.md` §2). Unknown keys allowed only when they start with `x-`. |
| `schemas/scorecard.py` | `Scorecard`, `MetricResult`, `Uncertainty`, `MethodInfo`, `Finding`, `Region`, `Suppression`, `CompileInfo`, `SeedResult`, `ResourceUse`. |
| `schemas/improvement.py` | `ImprovementRequest`, `CircuitPayload`, `Proposal`, `Claims`, `LayerInfo`, `ConformanceReport`. |
| `schemas/run.py` | `Plan`, `ItemPlan`, `MetricPlan`, `RunRecord`, `Event`, `BenchResult`, `HardwareProfile`, `ItemSummary`, `IssueReportModel`. |
| `schemas/records.py` | `AttemptRecord`, `VerificationResult`, `JobSpec`, `JobRequirements`, `JobResultSummary`. |
| `schemas/versions.py` | `SCHEMA_VERSIONS` (dict), `SCORE_VERSION = "qscore-2026.1"`, `check_compatible(document)`, `migrate(document, to_version)` with one function per version step. |
| `schemas/export.py` | `export_json_schemas(out_dir)` via `model_json_schema()`; used by `qscore` CI drift test. |
| `hardware/profiler.py` | `profile_hardware(refresh=False) -> HardwareProfile` (cached per machine under `cache_dir/hardware/`), `refit_from_telemetry()`. See `09-gpu-and-simulation.md` §6. |

### 3.3 Pipeline

| File | Provides |
|---|---|
| `manifest/yamlio.py` | `load_yaml(path) -> tuple[CommentedMap, PositionMap]` (ruamel.yaml round-trip); `PositionMap.locate(field_path) -> Location`; `save_yaml(path, data)` atomic; `text_diff(old, new)`. |
| `manifest/resolve.py` | `resolve_items(manifest, repo_root) -> list[ResolvedItem]` (defaults → profile → item); `item_hash(item) -> str`; `origin_of(item, field) -> Literal["default","profile","item"]`. |
| `intake/discover.py` | `discover(root, subdir=None) -> list[Candidate]`; `scan_qasm(path)`; `scan_python(path)` (ast only); `signature_of(func_node)`; `size_like(name)`; skips `.venv`, `.git`, `build`, `dist`, `node_modules`. |
| `intake/draft.py` | `draft_items(candidates) -> CommentedMap`; `merge_into(manifest, items)` (never overwrites user edits); writes `qscore.yaml.draft` or shows a diff. |
| `intake/loaders.py` | `load_item(item) -> LoadedCircuit` (circuit, qpy bytes, sha256, num_qubits, parameters, op counts); `load_qasm(path)` (detects v2/v3); `load_builder(item, size=None)`; `bind_parameters(circuit, values)` by name, raising on unbound. |
| `intake/runner.py` | Script run **inside the sandbox**: reads a JSON request, imports the file via `importlib.util.spec_from_file_location`, calls the function, checks for `QuantumCircuit`, writes QPY and a JSON status with a traceback trimmed to user files. Depends only on Qiskit and the stdlib. |
| `intake/sandbox.py` | `run_builder(request, timeout_s, mem_mb) -> SandboxResult`; see `05-pipeline.md` §4. |
| `validate/issues.py` | `Issue`, `IssueReport` (`add`, `errors`, `has_errors`, `sorted`, `by_item`, `render_text`, `to_json`). |
| `validate/catalog.py` | `CATALOG` (codes in `05-pipeline.md` §9), `make_issue(code, location, **fields)`, `explain(code)`; generates `docs/issues.md`. |
| `validate/locate.py` | `locate_pydantic_error(error, positions)`, `locate_source(file, lineno)`, `suggest(name, options)`. |
| `validate/schema_checks.py`, `reference_checks.py`, `semantic_checks.py`, `feasibility.py` | The validation stages (`05-pipeline.md` §3–4). |
| `validate/pipeline.py` | `run_validation(manifest_path, settings) -> ValidationResult(report, resolved_items, circuits, plan)`. Order: schema → reference → resolve → semantic → feasibility. An item that fails a stage skips its later stages, but every item is checked. |
| `interpret/summary.py`, `templates.py` | `summarize(item, circuit, plan) -> ItemSummary`; deterministic sentence templates; `render_text()`, `render_markdown()`. |
| `score/context.py` | `ScoringContext` with lazy cached properties: `logical`, `dag`, `item`, `target`, `calibration`, `compile_set`, `representative`, `all_to_all`, `routing_stage`, `profile`, `seeds`; `prefetch(requirements)`. |
| `score/engine.py` | `score_item(item, loaded, options, on_event) -> Scorecard`; `score_items(items, ...)` with cache checks. |
| `score/cache.py` | `key(*parts)`, `get`, `put`, `invalidate(item_hash)` under `cache_dir/cache/`. |
| `record/scorecard.py` | `write_scorecard` (atomic), `read_scorecard`, `is_stale`, `diff_scorecards(a, b, tolerance)`. |
| `record/run_record.py` | `RunRecord` lifecycle; `rerun(record) -> RerunReport`. |
| `record/provenance.py` | `collect(repo_root, seeds, settings) -> Provenance`. |
| `record/report.py` | `render(scorecards, run_record, format)` (Markdown/HTML via Jinja2). |
| `record/neon.py` | `NeonStore`: `claim_job`, `heartbeat`, `start_job`, `finish_job`, `fail_job`, `requeue_stale`, `insert_scorecard`, `insert_attempts`, `insert_events`, `insert_telemetry`, `upsert_worker`, `export_leaderboard_rows`. |
| `record/hub.py` | `HubStore`: `put_circuit`, `put_scorecard`, `put_attempts_parquet`, `put_bench`, `put_leaderboard`, `commit_batch()`; content-addressed paths (`11-records-and-queue.md` §7). |
| `record/spool.py` | FB-05 only (off by default): `spool_write`, `spool_replay`. Raises `FallbackRefused` if called when FB-05 is not enabled. |
| `bench/suite.py` | `BENCH_SUITE`, `run_bench(devices, reps=3, warmup=1) -> BenchResult`; precision × fusion sweep; cache-knee check. |

### 3.4 Engines

| File | Provides |
|---|---|
| `targets/registry.py` | `get_target(spec) -> TargetBundle` (target, coupling map, basis, calibration id); built-ins `FakeTorino`, `all-to-all`, `line-N`, `grid-RxC`, `heavy-hex-D`; `all_to_all_for(bundle)`. |
| `targets/custom.py` | `build_target(coupling_map, basis_gates, errors=None, durations=None) -> Target`; uniform default errors labelled `assumed` in the calibration snapshot. |
| `targets/calibration.py` | `snapshot(target) -> CalibrationSnapshot` (id = hash of tables); `gate_error`, `readout_error`, `duration`, `median_t2`. |
| `compile/pipeline.py` | `compile_item(circuit, bundle, seeds) -> CompileSet` via `generate_preset_pass_manager(optimization_level=3, target=..., seed_transpiler=s)` in a process pool; `compile_all_to_all(circuit, bundle)`. |
| `compile/stages.py` | `route_only(circuit, bundle, seed) -> RoutedResult` (init, layout, routing stages only); `swap_counts(routed)`. |
| `compile/select.py` | `pick_representative(compile_set, objective)`; `spread(compile_set) -> SeedSpread`. |
| `metrics/*` | See `06-metrics.md`. |
| `sim/*` | See `09-gpu-and-simulation.md`. |
| `diagnose/*` | See `07-diagnostics.md`. |
| `verify/*` | See `08-verification.md`. |
| `improve/protocol.py` | `ImprovementLayer` protocol; `load_layers()` from entry points. |
| `improve/requests.py` | `build_requests(scorecard, ctx, policy)`, `extract_region(circuit, region) -> (subcircuit, qubit_map)`, `splice(original, region, candidate)`. |
| `improve/loop.py` | Pure decision logic: `decide(attempt_inputs) -> Decision`, `should_stop(history, budget) -> StopReason | None`. |
| `improve/reference_qiskit.py` | Handlers for `layout_search`, `routing_search`, `commutation_aware_routing`, `block_resynthesis`. |
| `improve/openai_compat.py` (T1) | `OpenAICompatLayer(name, base_url, model, backend)`; backends `local` and `hf`. |
| `improve/prompts.py` (T1) | `PROMPT_VERSION`, `render(request)`. |
| `improve/conformance.py` (T1) | `run_conformance(layer, fixtures) -> ConformanceReport`. |

## 4. Tooling (options; ★ = default)

| Concern | ★ Default | Alternatives (need a class B proposal) | Notes |
|---|---|---|---|
| Env and lock | **uv** (`uv sync`, `uv.lock`) | pip-tools, Poetry, pixi | uv also fetches Python 3.14 for the vLLM venv. |
| CLI | **Typer** + Rich | Click, argparse | Typer gives `--help` for free; keep commands thin. |
| Schemas | **Pydantic v2** | msgspec, attrs+cattrs | Pydantic exports JSON Schema; needed by UI and agents. |
| YAML | **ruamel.yaml** (round-trip) | PyYAML (loses comments), strictyaml | Comments and order must survive edits. |
| Lint/format | **ruff** (lint + format) | black+flake8 | Line length 100. |
| Types | **mypy** (strict on `schemas/`, `metrics/`, `diagnose/`, `verify/`) with the pydantic plugin | pyright | Gradual elsewhere. |
| Layer check | **import-linter** | custom AST test | Contract in §2. |
| Tests | **pytest** + **hypothesis** + pytest-xdist | — | Snapshot comparer is custom (tolerances). |
| Templates | **Jinja2** | f-strings | Reports only. |
| Parallelism | **ProcessPoolExecutor** (spawn context) | joblib, ray (overkill) | Set `RAYON_NUM_THREADS=1` inside pool workers to avoid oversubscription with Qiskit's Rust threads; the profiler records core counts. |

## 5. Conventions

- Python ≥ 3.11 for the engine (the W7900 engine venv uses the image's Python via `--system-site-packages`; check the version in GPU session 1).
- Every public function has type hints and a docstring stating units (qubits, seconds, bytes, GiB).
- Units: memory in **bytes** internally, **GiB** (2³⁰) in messages; time in seconds; timestamps UTC ISO 8601 with `Z`.
- IDs: `item_sha256`, `circuit_sha256`, `manifest_sha256` are lowercase hex; job ids are UUIDv4; request ids `"<item_id>/r<round>/<rule>#<n>"`.
- Canonical JSON for hashing: `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`; floats via `repr`; volatile fields (timestamps, durations) excluded from hashes.
- Logging: never `print` outside `cli.py`; no secrets in logs (redaction filter in `logging.py`).
- No global mutable state except caches keyed by content hash and the settings singleton.
- Determinism: sort any results gathered from pools by a stable key before use; never iterate over sets when order matters.
