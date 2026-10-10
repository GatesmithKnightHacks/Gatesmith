# 05 · The pipeline, stage by stage (plus CLI, exit codes and the issue catalog)

> **Status:** binding · **Tier:** 0 · **Read:** before working on `intake/`, `validate/`, `interpret/`, `compile/`, `score/`, `cli.py`, `services.py`.
> Ten stages, each with one input, one output and one thing it must never do. Stages 1–5 spend no compute, so a bad manifest fails in seconds.

## 1. Discover (`intake/discover.py`)

- **Does:** finds candidate circuits under the given path: `.qasm` files (version read from the header) and Python functions that build a `QuantumCircuit`, found by parsing source with `ast`.
- **Builder signals:** a `-> QuantumCircuit` return annotation; a returned `QuantumCircuit(...)`; a return from a known library builder (`QFT`, `QAOAAnsatz`, `TwoLocal`, `EfficientSU2`, …); a module-level circuit variable (weaker signal, flagged).
- **Records:** each candidate's signature; size-like arguments (`n`, `num_qubits`, `n_qubits`, `size`, `n_residues`, `depth`, `p`, `reps`) as suggested sweeps.
- **Never:** imports or runs user code.
- **Done when:** both example repos, plus a repo of decoys (`tests/validation/decoys/`), yield exactly the expected candidates.

## 2. Draft the manifest (`intake/draft.py`)

- **Does:** writes `qscore.yaml` entries for the candidates the user picks: defaults from signatures, `<required>` placeholders, `exact_unitary` invariants, suggested sweeps, each with a comment.
- **How:** ruamel.yaml round-trip so comments and order survive; shows a diff before saving; writes `qscore.yaml.draft` when a manifest already exists.
- **Never:** overwrites a user's edit.

## 3. Validate: schema and references (`validate/schema_checks.py`, `reference_checks.py`)

- **Schema pass:** Pydantic validation of the YAML; every error becomes an `Issue` with `file:line:column` from the `PositionMap`; unknown keys get "did you mean" suggestions (`difflib.get_close_matches`); `x-` keys kept.
- **Reference pass (parses, never runs):** files exist (QASM, parameters, observables); the builder's file and function exist (checked with `ast`); arguments match its signature; the size-sweep argument exists; observables parse into Pauli terms; the target name is known.
- **Never:** stops at the first error. One run reports everything.

## 4. Resolve and check (`intake/loaders.py`, `intake/sandbox.py`, `validate/semantic_checks.py`, `validate/feasibility.py`)

### 4.1 Loading

- **QASM:** `qiskit.qasm2.loads` (v2) or `qiskit.qasm3.loads` (v3; needs the `qiskit-qasm3-import` package; `openqasm3` is declared too, for its `QASM3ParsingError`, CP-0027). Parse errors → Q304 with the parser's line/column.
- **Builders:** the sandbox runs `intake/runner.py`, which imports the file, calls the function with the manifest's arguments, checks it returned a `QuantumCircuit`, and writes QPY plus a status JSON. Failures → Q300 timeout, Q301 import error, Q302 user exception (traceback trimmed to user files), Q303 not a circuit.
- **Then:** bind parameters by name from the manifest's parameter file; any left unbound → Q305. Hash the circuit's QPY bytes (`circuit_sha256`).

### 4.2 Sandbox (options; ★ default)

| Option | Isolation | Availability | Use |
|---|---|---|---|
| ★ **Process mode** | `subprocess.run` with timeout; `resource.setrlimit` (RLIMIT_AS = `mem_mb`, RLIMIT_CPU); temp working dir; env stripped of every `*_TOKEN`, `*_KEY`, `*_DSN`, `*SECRET*`, `HF_*`, `NEON_*`, `GEMINI_*`, `OPENAI_*`; `-I` isolated mode; cwd = temp dir with repo on `sys.path` via the request | Everywhere (Linux/macOS; on Windows no rlimits → fail with ConfigError unless `sandbox_mode=process-unlimited` is set explicitly) | MVP |
| Process + `unshare -n` | Also no network | Linux where unprivileged user namespaces are allowed; check on the W7900 (root in a container may not allow it) | If it works, enable by setting `sandbox_network=off` |
| Container (`podman`/`docker run --network=none -v repo:ro`) | Strong | Laptop/Vultr; probably not on the W7900 | Later |

The sandbox is not a security boundary for hostile code (R10). The MVP accepts builders only from curated example repos (and the user's own repo in laptop mode).

**Runner environment:** `project.runner.env: engine` (★ MVP) runs the builder with the engine's own Python and Qiskit, so QPY versions always match. `env: uv` (the repo's own environment) is later; if its Qiskit is newer than the engine's, QPY may not load (Q306; FB-07 would export OpenQASM 3 instead, and is off).

### 4.3 Semantic pass

Intent vs circuit (`04-contracts.md` §2.2): reversible gate set (Q400); measurements for `known_output`/`distribution` (Q401); mid-circuit measurement vs `exact_unitary` (Q402); observable width (Q403); qubits vs target (Q404); contradictions such as approximation under an exact intent (Q405); dynamic circuits / classical control (Q406, error in the MVP); opaque gates without definitions (Q407); `final_permutation` vs permitted layout/routing (Q408); permitted change without a serving strategy (Q409).

### 4.4 Feasibility pass

- Estimates memory and time for every selected metric from the hardware profile (`09-gpu-and-simulation.md` §3) and the plan's device.
- Marks unaffordable metrics `skipped` (reason `unaffordable`, Q500 warning) and suggests cheaper settings (fewer shots, smaller sweep, single precision screening).
- `device: gpu` requested but no working GPU simulator → Q503 **error** (not a silent CPU run). `device: auto` with no GPU → CPU plan (design rule), with a Q502 info issue saying so.
- **Never:** runs a builder inside the engine's own process; ranks issues (that is the report's job).

## 5. Interpret and confirm (`interpret/summary.py`, `templates.py`)

- **Does:** a plain-language summary per item: source, qubits, gate counts, parameters, measurements, the intent in one sentence, permitted changes, target, planned compute, what will **not** be checked, and each default marked "(default)".
- **How:** fixed sentence templates, no generated prose, so the summary doubles as alt text for the circuit drawing.
- **Confirm:** interactive prompt (CLI), the Confirm screen (UI), `--yes`, or the stored confirmation for a queued job. The confirmation (mode, time, manifest hash) is stored in the run record and in Neon (`manifests.confirmed_*`).
- **Never:** starts compute before confirmation.

## 6. Compile (`compile/pipeline.py`, `stages.py`, `select.py`)

- **Does:** `generate_preset_pass_manager(optimization_level=3, target=bundle.target, seed_transpiler=s).run(circuit)` once per seed, in a process pool. The manifest's seed list is shared by the baseline and every candidate.
- **Also:** compiles with all-to-all connectivity (same basis, same seed list) as the routing reference; runs only the init/layout/routing stages (`route_only`) to count inserted SWAPs before they decompose.
- **Picks** the representative compile: best seed by the primary objective; ties by two-qubit depth, then seed order. Records the spread.
- **Cache:** results keyed by `sha256(circuit QPY, target id + calibration id, seeds, optimization level, qiskit version, score version)`.
- **Never:** mixes targets or seeds between items.

### 6.1 Targets (`targets/registry.py`)

| Name | Built from | Basis | Calibration |
|---|---|---|---|
| `FakeTorino` | `qiskit_ibm_runtime.fake_provider.FakeTorino().target` | the backend's (`cz`, `rz`, `sx`, `x`, plus measure/reset/delay) | `from_backend` (error rates, durations, T1/T2) |
| `all-to-all` | `Target` with full connectivity on the item's qubit count | same basis as the reference target it shadows | none |
| `line-N` | `CouplingMap.from_line(N)` | `cx`, `rz`, `sx`, `x` | none, unless the manifest supplies a calibration file |
| `grid-RxC` | `CouplingMap.from_grid(R, C)` | `cx`, `rz`, `sx`, `x` | none |
| `heavy-hex-D` | `CouplingMap.from_heavy_hex(D)` | `cz`, `rz`, `sx`, `x` | none |
| custom | `{coupling_map, basis_gates}` in the manifest → `Target.from_configuration` | as given | optional `{file}`; otherwise uniform default errors labelled `assumed` (shown as defaults in the summary) |

`calibration: none` makes `reliability_heuristic` and `scheduled_duration` `unavailable` (with that reason), never estimated.

## 7. Measure (`score/engine.py`, `metrics/`)

- **Does:** runs the selected metrics on the shared compile results. CPU metrics run in the process pool; simulation metrics become jobs for `sim/` (the only GPU stage in normal scoring).
- **Never:** drops a metric silently. Each returns `computed`, `skipped`, `unavailable` or `failed` with a reason or error.

## 8. Diagnose (`diagnose/`)

Rules D01–D10 turn metric values into findings with evidence, severity, region and strategies; the policy applies profiles and suppressions. Details: `07-diagnostics.md`. **Never** uses a threshold that is not part of the score version (or an explicit, recorded manifest override).

## 9. Scorecard and requests (`record/scorecard.py`, `improve/requests.py`)

- **Does:** writes one scorecard per item (atomic write to `scorecards/<item_id>.json` locally; then Neon and Hub when configured), keyed by item hash and score version.
- **Then:** for each unsuppressed finding that some layer can serve, builds an improvement request (`04-contracts.md` §4): the region cut out as a convex block in OpenQASM 3, a qubit map, objective, permitted changes, invariants and budget.
- **Never:** sends more than the region when the manifest says region only; omits provenance.

## 10. Verify (used by the loop)

Proves a returned candidate keeps the invariants before anything is scored as better. Details: `08-verification.md`. **Never** trusts a proposal's own claims.

---

## 11. CLI commands and exit codes

| Command | Service | Notes |
|---|---|---|
| `qscore init [PATH]` | `init_project` | Creates `qscore.yaml` skeleton (no overwrite). |
| `qscore discover [PATH]` | `discover_candidates` | Prints candidates; `--draft` writes `qscore.yaml.draft`. |
| `qscore validate` | `validate_project` | Stages 3–4; prints the issue report; `--json`. |
| `qscore plan` | `plan_project` | Validate + interpret + plan; prints the resolved manifest and the plan. |
| `qscore score` | `score_project` | Full run; asks to confirm unless `--yes`. `PATH` may be a single OpenQASM file, or `-` to read pasted OpenQASM from stdin (requires `--yes`; the text is saved as `<out>/input/pasted.qasm`, item id `pasted`, and the report is printed to stdout). |
| `qscore improve --item ID --layers reference-qiskit,local` | `improve_item` | Runs the loop for one item (T1). |
| `qscore report` | `render_report` | Markdown/HTML from scorecards. |
| `qscore diff A B` | `diff_scorecards` | Field-by-field with tolerances. |
| `qscore bench` | `run_bench` | CPU vs GPU suite. |
| `qscore profile [--refresh]` | `profile_hardware` | Prints and caches the hardware profile. |
| `qscore conform LAYER` | `run_conformance` | T1. |
| `qscore explain CODE` | `catalog.explain` | e.g. `qscore explain Q202`. |
| `qscore rerun SCORECARD` | `rerun` | Repeats inputs and compares. |
| `qscore migrate FILE` | `versions.migrate` | Upgrades documents. |
| `qscore worker` | `worker.run_worker` | Queue loop. |
| `qscore db migrate` | `record.neon` | Applies `scripts/neon/*.sql` in order, recording applied files in `schema_migrations`. |
| `qscore db ping` | `record.neon` | Connects with the configured role, prints server version, role and applied migrations; exit 4 on failure. |
| `qscore export` | `export_records` | Attempts/leaderboard to the Hub (T1). |

**Exit codes:** `0` clean · `1` findings at or above `--fail-on` (default: never) · `2` invalid input (issue report has errors) · `3` runtime failure (any uncaught `QscoreError`, including `FallbackRefused`) · `4` configuration error (missing settings/secrets, incompatible environment).

## 12. Issue catalog (stable codes; `validate/catalog.py` is generated from this table's structure)

| Code | Severity | Title |
|---|---|---|
| Q100 | error | YAML could not be parsed |
| Q101 | error | Unknown field (with suggestion) |
| Q102 | error | Wrong type |
| Q103 | error | Invalid value or format |
| Q104 | error | Missing required field |
| Q105 | error | Duplicate item id |
| Q106 | error | Unsupported schema version |
| Q107 | error | `<required>` placeholder not filled |
| Q200 | error | File not found (QASM, parameters, observable) |
| Q201 | error | Builder file not found |
| Q202 | error | Builder function not found |
| Q203 | error | Builder arguments do not match the signature |
| Q204 | error | Size-sweep argument not in the signature |
| Q205 | error | Observable file invalid |
| Q206 | error | Unknown target |
| Q207 | error | Parameters file invalid |
| Q300 | error | Builder timed out |
| Q301 | error | Builder import failed |
| Q302 | error | Builder raised an exception |
| Q303 | error | Builder did not return a `QuantumCircuit` |
| Q304 | error | QASM parse error |
| Q305 | error | Unbound parameters |
| Q306 | error | QPY version mismatch between runner and engine |
| Q400 | error | Intent does not fit the gate set (reversible) |
| Q401 | error | Intent needs measurements |
| Q402 | error | Mid-circuit measurement under `exact_unitary` |
| Q403 | error | Observable width ≠ circuit width |
| Q404 | error | More qubits than the target has |
| Q405 | error | Contradictory permissions (approximation under exact intent) |
| Q406 | error | Dynamic circuit / classical control unsupported in the MVP |
| Q407 | error | Opaque gate without a definition |
| Q408 | error | `final_permutation` must be `allowed` when layout/routing are permitted |
| Q409 | error | Permitted change has no serving strategy |
| Q410 | error | External inference requires `send_region_only: true` in the MVP |
| Q500 | warning | Metric unaffordable; skipped (with cheaper suggestion) |
| Q501 | warning | Exceeds GPU memory budget; skipped |
| Q502 | info | No GPU; `device: auto` plans the CPU |
| Q503 | error | `device: gpu` requested but no working GPU simulator |

Each catalog entry: `code`, `severity`, `title`, `message` template, `hint` template, `docs` anchor. `docs/issues.md` is generated from the catalog; a test checks every code has one broken fixture in `examples/broken/` (except Q306, which needs the later `uv` runner).

## 13. Events and progress

Services emit `Event`s (`04-contracts.md` §8) through `on_event`. The CLI renders a progress bar; the worker batches events to Neon `job_events` every 2 s or 50 events; the UI shows live updates. Events are informative only: never parse an event to drive logic.

## 14. Practices the pipeline must show (from the build guide)

Validate everything before computing and report every issue at once · show the normalized interpretation and ask · round-trip YAML edits with a diff · no silent defaults · never run untrusted code in the engine's process · reproducibility by construction (lockfile, seeds, hashes, versions) · say what "deterministic" means (structural metrics repeat exactly; simulated metrics within a stated tolerance given the same seeds) · explain each metric twice (one plain line + precise definition) · explicit statuses, never blanks · cache by content · respect Qiskit's bit order · fail loudly on unsupported input · CLI and UI parity.
