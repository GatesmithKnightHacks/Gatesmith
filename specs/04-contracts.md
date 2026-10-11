# 04 · Contracts: schemas, versions and identifiers

> **Status:** binding; changes are class A (R5) · **Read:** before touching `schemas/`, anything that reads or writes JSON/YAML, Neon rows, Hub files, or the platform API.
> Pydantic models in `qscore/src/qscore/schemas/` implement these contracts; exported JSON Schemas live in `qscore/schemas/`. Values in examples are illustrative.

## 1. Schema ids and versioning

| Schema id | Model | Public standard? |
|---|---|---|
| `qscore.project/v0.2` | `ProjectManifest` | Yes |
| `qscore.scorecard/v0.3` | `Scorecard` | Yes |
| `qscore.request/v0.2` | `ImprovementRequest` | Yes |
| `qscore.proposal/v0.2` | `Proposal` | Yes |
| `qscore.attempt/v0.2` | `AttemptRecord` | Internal (published in the dataset) |
| `qscore.job/v0.2` | `JobSpec` | Internal |
| `qscore.event/v0.2` | `Event` | Internal |
| `qscore.plan/v0.2` | `Plan` | Internal |
| `qscore.issues/v0.2` | `IssueReportModel` | Internal |
| `qscore.profile/v0.2` | `HardwareProfile` | Internal |
| `qscore.bench/v0.2` | `BenchResult` | Internal (published) |
| `qscore.conformance/v0.2` | `ConformanceReport` | Internal (published) |
| `qscore.run/v0.3` | `RunRecord` (§13) | Internal |
| `qscore.values/v0.1` | `DraftValues` (§14, ChP-0029) | Internal (input only) |

- Every document carries `schema: "<id>"` as its first field.
- **Semantic versioning:** new optional fields bump the minor version; any change of meaning bumps the major; each step ships a `migrate()` function and `qscore migrate`.
- Unknown fields are rejected, except keys starting with `x-`, which are preserved and ignored (extension point for other tools).
- **Score version** `SCORE_VERSION = "qscore-2026.1"` covers metric definitions (`06-metrics.md`) and diagnostic thresholds and profiles (`07-diagnostics.md`). Any change to either bumps it (`qscore-2026.2`, …). Scorecards from different score versions are never compared silently: `diff` refuses unless `--allow-score-version-mismatch`.

## 2. Project manifest `qscore.project/v0.2`

One `qscore.yaml` at the repo root lists the circuits the user chose. Each item inherits project defaults, states its **invariants** (what must not change) and lists the variations it **permits**.

```yaml
schema: qscore.project/v0.2
project:
  name: sidechain-packing
  root: .                              # repo path, relative to this file
  runner: {env: engine, timeout_s: 60, mem_mb: 4096}   # env: engine (★ MVP) | uv (later)
defaults:
  target: {backend: FakeTorino, calibration: from_backend}   # calibration: from_backend | none | {file: path}
  objective:
    primary: two_qubit_count
    direction: minimize
    constraints:
      - {metric: two_qubit_depth, max_vs_baseline: 1.0}
      - {metric: reliability_heuristic, min_vs_baseline: 1.0}
    report: [depth, routing_overhead]
  evidence: {verification: exact, on_inconclusive: reject}  # verification: exact | probabilistic_ok
  execution:
    device: auto                       # auto | cpu | gpu
    precision: {screen: single, confirm: double}
    transpiler_seeds: [11, 23, 37, 41, 53, 67, 79, 97]
    seed_simulator: 1234
    shots: 4000
  budget: {wall_time_s: 900, gpu_time_s: 600, max_rounds: 4, max_proposals: 4, layer_timeout_s: 60}
  diagnose: {profile: null, groups: [resources, hardware, opportunities, research], ignore: []}
  privacy: {external_inference: false, send_region_only: true}
circuits:
  - id: packing_qaoa_p2
    source:
      builder: src/packing/qaoa.py::build_qaoa
      args: {n_residues: 4, rotamers: 3, p: 2}
      parameters: {file: params/qaoa_p2.json}       # values for unbound angles, by parameter name
    size_sweep: {arg: n_residues, values: [2, 3, 4, 5, 6]}
    invariants:
      intent: expectation
      global_phase: ignore
      final_permutation: allowed
      task: {observable: hamiltonians/packing_4.json, tolerance: 0.02, shots: 4000}
      reliability: {min_vs_baseline: 1.0}
    permitted:
      changes: [layout, routing, commuting_reorder, block_resynthesis]
      ancillas: {add: 0, reuse: true}
      approximation: none
      scope: region                    # region | whole
    diagnose: {profile: qaoa}
  - id: sbox_oracle
    source: {qasm: circuits/sbox_layer_4x.qasm}     # 4 PRESENT S-boxes on 16 bits + 4 ancillas = 20 qubits
    invariants: {intent: reversible_function, final_permutation: forbidden}
    objective: {primary: toffoli_count, direction: minimize}
    permitted: {changes: [reversible_rewrite], ancillas: {add: 0, reuse: true}}
```

### 2.1 Intents (what stays the same)

| `intent` | What stays the same | Requires | Checked by |
|---|---|---|---|
| `exact_unitary` (default) | The whole operation, up to global phase, and up to final qubit order when layout/routing are permitted | No mid-circuit measurement; final measurements are stripped for the check | The verification ladder |
| `reversible_function` | The classical input→output function | Only `x`, `cx`, `ccx`, `swap` (and `measure` at the end) | Classical simulation over inputs; QCEC beyond ~24 input bits |
| `known_output` | A named outcome stays above a probability threshold | `task: {bitstring, min_probability, shots}`; measurements present | Ideal and noisy simulation |
| `distribution` | The output distribution within a Hellinger tolerance | `task: {tolerance, shots}`; measurements present | Simulation (`hellinger_fidelity`) |
| `expectation` | An observable's expectation within a tolerance | `task: {observable, tolerance, shots}` | Simulation with Aer's `EstimatorV2` |
| `structure_only` | Exact equivalence only; no task score | Nothing | The verification ladder |

Invariant defaults: `global_phase: ignore`, `final_permutation: allowed`. A candidate checked with `final_permutation: allowed` may permute output qubits only as recorded in its layout (`TranspileLayout`); an unrecorded permutation is a failure.

Bitstrings use **Qiskit's order: qubit 0 is the rightmost bit.** Say so in every UI/report place that shows outcomes.

### 2.2 Validation rules (cross-field)

| Field | Rule (issue code) |
|---|---|
| `schema` | Required; unknown major version refused (Q106). |
| `circuits[].id` | Unique, `^[a-z0-9_][a-z0-9_\-]{0,63}$` (Q105, Q103). |
| `source` | Exactly one of `qasm` or `builder` (Q103). Builder format `path/to/file.py::name` or `path/to/file.ipynb::name` (Q103); optional `source.line: int ≥ 1` (ChP-0037). Without `line`: `name` is a function, imported and called with `args`. With `line`: qscore runs the file's top-level statements whose first line is ≤ `line`, then takes `name`: a `QuantumCircuit` (then `args` must be empty, Q103) or a function called with `args`. Notebook lines count in the code-cell script printed by `qscore discover` (code cells joined, `%`/`!` lines removed). A notebook builder requires `line` (Q103). |
| `invariants.intent` | `reversible_function` only when every gate is `x`/`cx`/`ccx`/`swap` (Q400). `known_output`/`distribution`/`expectation` require `task` (Q104) and, for the first two, measurements (Q401). `exact_unitary` forbids mid-circuit measurement (Q402). |
| `invariants.final_permutation` | Must be `allowed` whenever `layout` or `routing` is permitted (Q408). |
| `invariants.task.observable` | JSON file of Pauli terms (§2.4); width must equal circuit width (Q403). |
| `target` | Named backend, or `{coupling_map, basis_gates}`; circuit qubits ≤ target qubits (Q404). Reliability needs calibration (else the metric is `unavailable`, not an error). `calibration` default: `from_backend` for named backends (e.g. `FakeTorino`), `none` for synthetic targets (`line-N`, `grid-RxC`, `heavy-hex-D`, custom); shown as "(default)" in the summary. It is not inherited from the built-in defaults when the item or the manifest sets the target; it then takes this kind-based default (ChP-0025). `backend` and `{coupling_map, basis_gates}` are alternatives when merging: a layer that sets one removes the other inherited from earlier layers (ChP-0028). A custom `basis_gates` names distinct standard Qiskit gates and must not list `measure`, `reset` or `delay`, which are always added (Q103). |
| `objective.primary` | Must be a registered metric id with `kind` deterministic or statistical (Q103). |
| `objective.constraints[]` | Each names a registered metric and exactly one bound: `max_vs_baseline`, `min_vs_baseline`, `max`, `min` (Q103). |
| `permitted.approximation` | Anything other than `none` under `exact_unitary` or `reversible_function` is a contradiction (Q405). |
| `permitted.changes` | Each must map to a strategy (§2.3) whose requirements can be met (Q409). |
| `budget` | Required (defaults supply it); the loop stops at the first limit reached. |
| `evidence` | Defaults `exact` + `reject`. `probabilistic_ok` is opt-in and labelled on every record it touches. |
| `execution.transpiler_seeds` | Non-empty, unique ints; the baseline and every candidate use the same list. |
| `privacy` | External inference off by default; when on, `send_region_only` must be `true` in the MVP (Q410). |
| `diagnose.ignore[]` | Each entry `{rule, reason}` with a non-empty reason (Q104). |
| Placeholders | Any value `<required>` left in the file is an error (Q107). |

**No silent defaults:** every default appears in the interpretation summary marked "(default)"; `qscore plan` prints the fully resolved manifest.

A manual QASM upload with no manifest gets: `exact_unitary` intent, `FakeTorino`, `two_qubit_count` objective, the default budget, all marked as defaults.

### 2.3 Permitted changes → strategies

| `permitted.changes` value | Strategy id(s) | Served by (MVP) |
|---|---|---|
| `layout` | `layout_search`, `noise_aware_layout` (needs calibration) | `reference-qiskit`, model layers |
| `routing` | `routing_search` | `reference-qiskit`, model layers |
| `commuting_reorder` | `commutation_aware_routing` | `reference-qiskit`, model layers |
| `block_resynthesis` | `block_resynthesis` | `reference-qiskit`, model layers |
| `reversible_rewrite` | `reversible_rewrite` (gate-set-preserving rewrites on `x`/`cx`/`ccx`/`swap`) | `reference-qiskit` (pass-based, MVP), model layers |
| `approximate_synthesis` | `approximate_synthesis` | stretch (no MVP layer) |

### 2.4 Observable file

```json
{"schema": "qscore.observable/v0.1", "num_qubits": 12,
 "terms": [{"pauli": "ZZIIIIIIIIII", "coeff": 0.75}, {"pauli": "IZIIIIIIIIII", "coeff": -1.2}]}
```
Pauli strings use Qiskit's `SparsePauliOp` label order (qubit 0 is the rightmost character).

### 2.5 Item identity

`item_sha256 = sha256(canonical_json(resolved_item_without_source_contents) + sha256(source file bytes) + sha256(parameters/observable/calibration file bytes))` (the calibration file changes scores, ChP-0028). Editing an item changes its hash, which marks only that scorecard stale. `circuit_sha256 = sha256(QPY bytes)` of the resolved circuit (the QPY version is recorded in provenance).

## 3. Scorecard `qscore.scorecard/v0.3`

```json
{
  "schema": "qscore.scorecard/v0.3",
  "item": {"id": "packing_qaoa_p2", "item_sha256": "…", "circuit_sha256": "…",
           "manifest_sha256": "…", "score_version": "qscore-2026.1"},
  "status": "complete",
  "target": {"name": "FakeTorino", "num_qubits": 133, "basis": ["cz", "rz", "sx", "x"],
             "calibration_id": "…", "calibration_assumed": false},
  "compile": {"seeds": [11, 23, 37, 41, 53, 67, 79, 97], "representative_seed": 37,
              "selection_policy": "min primary; tie: two_qubit_depth, seed order",
              "per_seed": [{"seed": 11, "two_qubit_count": 219, "two_qubit_depth": 77, "depth": 301, "time_s": 1.92}],
              "all_to_all": {"two_qubit_count": 131}, "route_only": {"swaps_inserted": 27}},
  "metrics": [
    {"id": "two_qubit_count", "group": "resources", "version": "1", "kind": "deterministic",
     "scope": "compiled", "value": 212, "unit": "gates", "status": "computed"},
    {"id": "routing_overhead", "group": "hardware", "version": "1", "kind": "deterministic",
     "value": 0.38, "unit": "ratio", "status": "computed",
     "evidence": {"routed_two_qubit": 212, "all_to_all_two_qubit": 131, "swaps_inserted": 27}},
    {"id": "simulated_task_score", "group": "research", "version": "1", "kind": "statistical",
     "value": 0.71, "unit": "1 - relative energy error", "status": "computed",
     "uncertainty": {"ci95": [0.68, 0.74], "trials": 5},
     "method": {"device": "GPU", "aer_method": "density_matrix", "precision": "double", "shots": 4000}},
    {"id": "scheduled_duration", "group": "hardware", "status": "unavailable",
     "reason": "target has no gate durations"}
  ],
  "findings": [
    {"id": "D01#1", "rule": "D01", "title": "Routing-dominated", "severity": "high",
     "confidence": "rule_fired", "threshold": {"name": "routing_overhead", "value": 0.30, "margin": 0.08},
     "evidence": {"routing_overhead": 0.38}, "region": {"scope": "compiled", "qubits": [3, 4, 5, 6],
     "layers": [12, 40], "gate_indices": [140, 141, 142]},
     "strategies": ["layout_search", "routing_search", "commutation_aware_routing"], "suppressed": null}
  ],
  "requests": ["packing_qaoa_p2/r0/D01#1"],
  "resources": {"wall_s": 48.1, "cpu_s": 41.2, "gpu_s": 6.8, "peak_vram_mib": 5120},
  "fallbacks_used": [],
  "provenance": {"qscore": "0.1.0", "git_commit": "…", "git_dirty": false, "lock_sha256": "…",
                 "python": "3.12.3", "qiskit": "2.x", "qiskit_aer": "0.17.x", "aer_build": "rocm",
                 "mqt_qcec": "3.x", "rocm": "10.0.0", "gpu": {"name": "Radeon PRO W7900", "arch": "gfx1100"},
                 "hardware_profile_id": "…", "profile": "dev", "fallbacks_enabled": [],
                 "seeds": {"transpiler": [11, 23, 37, 41, 53, 67, 79, 97], "simulator_base": 1234},
                 "thresholds_sha256": "…", "started_at": "2026-10-10T15:02:11Z", "finished_at": "2026-10-10T15:02:59Z"},
  "created_at": "2026-10-10T15:02:59Z"
}
```

| Field | Rules |
|---|---|
| `status` | `complete` (every selected metric computed/skipped/unavailable with reasons), `partial` (≥1 metric `failed`), `failed` (scoring could not produce metrics; `error` field set). |
| `metrics[]` | One entry per **selected** metric; excluded metrics appear with `status: skipped` and `reason` (`not selected`, `skipped by flag`, `unaffordable`, or `budget: <elapsed> s >= wall_time_s <limit>`; wall time is not reproducible, so the budget reason records what tripped it, ChP-0028). |
| `MetricResult.status` | `computed` (value set) · `skipped` (reason) · `unavailable` (a declared requirement is absent; reason) · `failed` (exception; `error: {type, message}`). Never blank. |
| `MetricResult.kind` | `deterministic`, `heuristic`, `statistical` (must carry `uncertainty`), `context` (shown, never scored). |
| `findings[].confidence` | `rule_fired` or `measured` (after a counterfactual probe; T2). |
| `findings[].suppressed` | `{by: profile|manifest|cli, reason}`; suppressed findings stay in the list. |
| `fallbacks_used[]` | `{id: "FB-04", reason, at, scope: "metric:simulated_task_score"}`; must be empty in `dev`/`ci`. |
| `compile.representative_seed` | `null` when no representative could be chosen (the objective metric failed); `per_seed` is still recorded (v0.3, ChP-0028; v0.2 → v0.3 migration is the identity). |
| `x-run`, `x-interpretation` | Written by qscore: `x-run: {run_id, manifest_sha256, confirmation_mode}` links the card to its run record (§13); `x-interpretation` is this item's interpretation text (05 §5), so a card shared alone describes itself. |

## 4. Improvement request `qscore.request/v0.2`

```json
{
  "schema": "qscore.request/v0.2",
  "request_id": "packing_qaoa_p2/r0/D01#1",
  "item": {"id": "packing_qaoa_p2", "item_sha256": "…", "score_version": "qscore-2026.1"},
  "finding": {"id": "D01#1", "rule": "D01", "severity": "high",
              "region": {"scope": "compiled", "qubits": [3, 4, 5, 6], "layers": [12, 40]},
              "evidence": {"routing_overhead": 0.38}},
  "circuit": {"format": "openqasm3", "scope": "region", "qasm": "OPENQASM 3.0; …",
              "qubit_map": {"0": 3, "1": 4, "2": 5, "3": 6}, "num_qubits": 4},
  "target": {"backend": "FakeTorino", "basis": ["cz", "rz", "sx", "x"],
             "coupling_map": [[0, 1], [1, 2], [2, 3]]},
  "objective": {"primary": "two_qubit_count", "direction": "minimize"},
  "permitted": {"changes": ["routing", "commuting_reorder"], "ancillas": {"add": 0, "reuse": true}},
  "invariants": {"intent": "expectation", "verification": "exact", "global_phase": "ignore"},
  "budget": {"max_proposals": 4, "timeout_s": 60},
  "proposal_schema": "qscore.proposal/v0.2"
}
```

- `circuit.scope` is `region` unless the manifest says `permitted.scope: whole`. The region is a **convex** block cut with `diagnose/regions.convex_blocks()`; `qubit_map` maps region-local qubit indices to circuit qubits; `coupling_map` is restricted to the mapped physical qubits.

## 5. Proposal `qscore.proposal/v0.2`

```json
{
  "schema": "qscore.proposal/v0.2",
  "request_id": "packing_qaoa_p2/r0/D01#1",
  "layer": {"name": "local", "version": "0.1", "model": "Qiskit/granite-3.3-8b-qiskit",
            "provider": "vllm", "prompt_version": "p-2026.1"},
  "candidate": {"format": "openqasm3", "scope": "region", "qasm": "OPENQASM 3.0; …"},
  "claims": {"metric": "two_qubit_count", "direction": "decrease", "estimate": -6, "equivalent": true},
  "rationale": "Reorder commuting RZZ terms so interacting qubits are adjacent."
}
```

Claims are recorded, never trusted. A proposal that fails to parse against this schema, or whose QASM fails to parse, counts against the layer's **parse rate**.

## 6. Attempt record `qscore.attempt/v0.2`

```json
{
  "schema": "qscore.attempt/v0.2",
  "attempt_id": "…uuid…", "job_id": "…", "round": 1,
  "item": {"id": "packing_qaoa_p2", "item_sha256": "…"},
  "request_id": "packing_qaoa_p2/r0/D01#1", "finding": {"rule": "D01", "region": {"…": "…"}},
  "layer": {"name": "reference-qiskit", "version": "0.1", "model": null, "provider": null, "prompt_version": null},
  "strategy": "commutation_aware_routing",
  "proposal_sha256": "…", "parse_ok": true,
  "prediction": {"metric": "two_qubit_count", "direction": "decrease", "estimate": -22},
  "verification": {"method": "gpu_unitary_fp64", "status": "passed", "time_s": 3.1, "evidence": {}},
  "permitted_check": {"ok": true, "violations": []},
  "measured": {"two_qubit_count": {"before": 212, "after": 186}, "two_qubit_depth": {"before": 74, "after": 61}},
  "constraints": [{"metric": "reliability_heuristic", "ok": true, "before": 0.41, "after": 0.44}],
  "decision": "accepted", "decision_reason": "primary strictly better; all constraints hold",
  "compute": {"cpu_s": 41.2, "gpu_s": 6.8, "device": "Radeon PRO W7900", "latency_ms": null, "tokens": null},
  "fallbacks_used": [], "provenance": {"…": "…"}, "created_at": "…"
}
```

`decision ∈ {accepted, rejected, inconclusive, invalid}`: `invalid` = parse failure or permitted-change violation; `inconclusive` = verification inconclusive/unsupported (with `on_inconclusive: reject` the circuit is not changed) or statistical comparison without separation.

## 7. Job spec `qscore.job/v0.2` (the `jobs.payload` column)

```json
{
  "schema": "qscore.job/v0.2",
  "kind": "score",
  "project": "sidechain-packing", "manifest_sha256": "…", "items": ["packing_qaoa_p2"],
  "options": {"groups": null, "metrics": null, "skip": [], "device": "auto", "precision": null,
              "seeds": null, "no_cache": false},
  "improve": null, "bench": null, "conform": null,
  "requires": {"gpu": true, "aer_gpu": true, "local_model": false},
  "budget": {"wall_time_s": 900, "gpu_time_s": 600}
}
```

- `requires` uses only boolean flags so that matching is `requires <@ capabilities` (JSONB containment) in `claim_job()`. Flags: `gpu`, `aer_gpu`, `local_model`, `hub_write`, `neon_write`.
- `improve`: `{layers: ["reference-qiskit","local"], rounds: 4, max_proposals: 4}`; `bench`: `{suite: "default", devices: ["cpu","gpu"], reps: 3}`; `conform`: `{layer: "hf", model: "…", fixtures: "default"}`.

## 8. Event `qscore.event/v0.2`

```json
{"schema": "qscore.event/v0.2", "run_id": "…", "job_id": "…", "seq": 42, "at": "…Z",
 "kind": "metric_done", "stage": "measure", "item_id": "packing_qaoa_p2",
 "message": "two_qubit_count computed", "data": {"metric": "two_qubit_count", "time_s": 0.02}}
```
`kind ∈ {run_started, stage_started, stage_finished, item_started, item_finished, metric_done, warning, error, fallback_used, telemetry, run_finished}`.

## 9. Plan `qscore.plan/v0.2`

Per item and metric: `{metric, device: cpu|gpu, method, precision, est_bytes, est_seconds, status: planned|skipped|unavailable, reason}`; per item totals; the memory mode used (`model_loaded` or `exclusive`) and the hardware profile id.

## 10. Issue report `qscore.issues/v0.2`

```json
{"schema": "qscore.issues/v0.2", "manifest": "qscore.yaml", "errors": 1, "warnings": 0,
 "issues": [{"code": "Q202", "severity": "error", "item": "packing_qaoa_p2",
             "location": {"file": "qscore.yaml", "line": 14, "column": 16, "field": "circuits[0].source.builder"},
             "message": "Function 'build_qaoa2' not found in src/packing/qaoa.py",
             "hint": "Did you mean 'build_qaoa'?", "docs": "docs/issues.md#q202"}]}
```

## 11. Hardware profile `qscore.profile/v0.2` and bench result `qscore.bench/v0.2`

- Profile: `profile_id` (hash), `measured_at`, `cpu {model, cores, ram_gib}`, `gpu {name, arch, vram_gib, rocm, driver}|null`, `aer {version, build: cpu|rocm, gpu_available, options_supported: {batched_shots_gpu, runtime_parameter_bind_enable, fusion, max_parallel_experiments}}`, `crossover_qubits {single, double}`, `overhead_factor`, `fusion_best {single, double}`, `cache_knee_qubits {single, double}`, `notes []`.
- Bench: `suite`, `devices`, `reps`, `warmup`, `rows [{circuit, qubits, method, precision, fusion_max_qubit, device, median_s, p10_s, p90_s, throughput}]`, `crossover`, `provenance`.

## 12. Compatibility and migration rules

- `check_compatible(document)` accepts same major, any minor ≤ current; refuses newer minor with a clear error naming the version.
- Stored JSON (Neon `jsonb`, Hub files) always includes `schema`; readers dispatch on it.
- Exported JSON Schemas are committed under `qscore/schemas/<id with / replaced by _>.json`; `tests/contract/test_schema_drift.py` fails if they differ from `export_json_schemas()`.

## 13. Run record `qscore.run/v0.3` (`<out>/run.json`; ChP-0004, ChP-0028, ChP-0034, ChP-0035)

Written last by every confirmed scoring run.

```json
{
  "schema": "qscore.run/v0.3",
  "run_id": "run-20261010T150211",
  "job_id": null,
  "command": "score",
  "manifest_sha256": "…",
  "items": ["sbox_oracle"],
  "confirmation": {"mode": "yes_flag", "at": "2026-10-10T15:02:11Z", "manifest_sha256": "…"},
  "interpretation": "Interpretation (CPU scoring and diagnostics): …",
  "settings_profile": "dev",
  "fallbacks_enabled": [],
  "fallbacks_used": [],
  "started_at": "2026-10-10T15:02:10Z",
  "finished_at": "2026-10-10T15:02:59Z",
  "status": "complete",
  "exit_code": null,
  "scorecards": [{"item_id": "sbox_oracle", "item_sha256": "…", "path": "scorecards/sbox_oracle.json", "sha256": "…"}],
  "compiled": [{"item_id": "sbox_oracle", "path": "compiled/sbox_oracle.qasm", "sha256": "…", "seed": 37}],
  "compiled_skipped": [],
  "project_source": {"url": "https://github.com/org/repo", "commit": "…", "dirty": false},
  "provenance": {"qscore": "0.1.0", "score_version": "qscore-2026.1", "git_commit": "…", "git_dirty": false,
                 "lock_sha256": "…", "python": "3.12.3", "qiskit": "2.x"}
}
```

| Field | Rules |
|---|---|
| `confirmation.mode` | `interactive` (prompt or Confirm screen), `yes_flag` (`--yes`), `stored` (queued job); the same values as Neon `manifests.confirmed_mode` (11 §1). |
| `interpretation` | The full summary shown before confirmation (05 §5). |
| `status` | `complete` if every scorecard is complete, `failed` if every one failed, else `partial`. |
| `exit_code` | `null` from the CLI/services (the CLI applies `--allow-partial`/`--fail-on` afterwards, 05 §11); the worker sets it for queued jobs. |
| `scorecards[]` | `path` is relative to the output directory; `sha256` hashes the scorecard file bytes. |
| `compiled[]` | One per item with a representative compile (ChP-0034, 05 §9): `path` relative to the output directory; `sha256` hashes the file bytes; `seed` equals the scorecard's `compile.representative_seed`. |
| `compiled_skipped[]` | Items without an exported circuit and why, e.g. `{"item_id": "…", "reason": "no representative compile (objective metric failed)"}`. |
| `project_source` | Read at score time from `project.root` with git (ChP-0035): `url` = `remote.origin.url` with any userinfo removed (null when no remote), `commit` = `HEAD`, `dirty` = uncommitted changes present. `null` when `project.root` is not inside a git work tree; `{"error": "git not installed"}` when git is missing, and `{"error": "<git's message>"}` for any other git read failure (no commit yet, `git status` failed, timeout). Applies to every run. |
| `provenance` | Run-wide versions; per-item seeds and settings stay in each scorecard's provenance. |
| Migration | v0.2 → v0.3 adds `compiled: []`, `compiled_skipped: []`, `project_source: null`. |

## 14. Draft values `qscore.values/v0.1` (ChP-0029)

Input to `qscore discover --draft --values FILE` only. It never takes part in scoring and is not part of the item hash.

```yaml
schema: qscore.values/v0.1
builders:
  src/packing/qaoa.py::build_qaoa:       # same reference format as source.builder
    args: {rotamers: 3, p: 2}             # scalars only
    sweep: {n_residues: "2..6"}           # at most one key; range string (a..b or a..b..s) or int list
    parameters: {file: params/qaoa_p2.json}   # optional; copied to source.parameters (ChP-0029 amendment)
```

Unknown top-level or per-builder keys → Q101; a parse error → Q100; a non-scalar arg → Q102; a bad range string or more than one sweep key → Q103; a key that matches no discovered builder → Q202; an argument not in the signature → Q203; a sweep argument not in the signature → Q204; an unknown key inside `parameters` → Q101; a `parameters.file` that does not exist → Q200. Files under `tests/**` and `test_*.py` are call-site sources only, never candidates. Every issue is located in the values file (line:column).
