# 05 · The pipeline, stage by stage (plus CLI, exit codes and the issue catalog)

> **Status:** binding · **Tier:** 0 · **Read:** before working on `intake/`, `validate/`, `interpret/`, `compile/`, `score/`, `cli.py`, `services.py`.
> Ten stages, each with one input, one output and one thing it must never do. Stages 1–5 spend no compute, so a bad manifest fails in seconds.

## 1. Discover (`intake/discover.py`)

- **Does:** finds candidate circuits under the given path: `.qasm` files (version read from the header) and Python functions that build a `QuantumCircuit`, found by parsing source with `ast`.
- **Builder signals:** a `-> QuantumCircuit` return annotation; a returned `QuantumCircuit(...)`; a return from a known library builder (`QFT`, `QAOAAnsatz`, `TwoLocal`, `EfficientSU2`, …); a returned name bound to a circuit-returning method of a bound circuit (`qc2 = qc.decompose()`; methods: `assign_parameters`, `compose`, `control`, `copy`, `decompose`, `inverse`, `power`, `repeat`, `reverse_bits`, `reverse_ops`; lead decision 2026-10-10); a module-level circuit variable (weaker signal, flagged).
- **Records:** each candidate's signature; size-like arguments (`n`, `num_qubits`, `n_qubits`, `size`, `n_residues`, `depth`, `p`, `reps`) as suggested sweeps.
- **Never:** imports or runs user code.
- **Done when:** both example repos, plus a repo of decoys (`tests/validation/decoys/`), yield exactly the expected candidates.
- **Notebooks (ChP-0029):** `.ipynb` files are read as JSON. Code cells are joined; lines starting with `%` or `!` are dropped. The same `ast` scan runs on the result, and candidates are listed with `source_kind: notebook`. They are drafted and scored in line mode (`source.line`, ChP-0037, §2 and §4.1); line numbers count in this joined code-cell script.
- **Call-site suggestions (ChP-0029):** for each builder, literal keyword or positional arguments at call sites in the same file are recorded as suggestions, with the source line. Literal means an int, float, str, bool or None constant, or a unary minus applied to one. Call sites are searched in the `if __name__ == "__main__":` block, at module level, and in `tests/**/test_*.py` under the root. Suggestions are never applied silently: the prompt shows them, and `--no-input` writes them as the value with a `# suggested from <file>:<line>` comment.

## 2. Draft the manifest (`intake/draft.py`)

- **Does:** writes `qscore.yaml` entries for the candidates the user picks (`--pick 1,3` by list number or `--pick build_qaoa` by function name; without `--pick`, an interactive numbered prompt). Explicit values-file arguments or sweeps (`--values FILE`, `qscore.values/v0.1`, 04 §14) override signature defaults. Otherwise, use a literal signature default; leave a nonliteral default in the builder without evaluating or copying it. Required arguments use the interactive prompt (unless `--no-input`), then literal call-site suggestions only with `--no-input`, then a `<required>` placeholder (later Q107). An empty interactive answer leaves a placeholder. Size-like arguments without an explicit range are suggested in comments; they do not cause an invented sweep. It also writes `exact_unitary` invariants and the suggested sweeps, each with a comment saying where the value came from (`default`, `values file`, `entered`, `suggested from <file>:<line>`, `required`). (ChP-0029) Builtin annotation checks accept an integer for `float` without changing its value; booleans are not integers. Explicit quoted builtin annotations have the same checks as bare annotations. Giving the same argument in `args` and `sweep` is Q103, including arguments accepted through `**kwargs`. Missing `--pick` with `--no-input` is Q104. Unknown picked names are Q202; ambiguous names and invalid indices are Q103. Python syntax errors are located Q301; malformed notebooks are Q103; missing paths are Q200. When a folder scan still finds candidates, unreadable files are reported as located warnings ("not scanned; its circuits are not listed") and discovery continues (exit 0). A single-file PATH, or a scan with no candidates, still fails with the located issues (exit 2). (ChP-0044) Discovery does not validate incomplete circuit entries for scoring: it reads the existing document and `project.root`, preserving placeholders and researcher edits for later validation. (ChP-0033)
- **Values and ranges (ChP-0029):** a value is a YAML scalar. A range is `a..b` (inclusive, step 1), `a..b..s`, or a list `[a, b, c]`. Ranges are for int arguments only, and a range becomes `size_sweep: {arg, values}` with `args.<arg>` set to the first value. At most one argument per item may have a range; a second one is Q103. A typed value is checked against the annotation when there is one (`int`, `float`, `bool`, `str`); a mismatch is Q102 and is never coerced.
- **Scripts and notebooks (ChP-0037):** module-level circuit variables in `.py` files and notebook candidates (variables and functions) are draftable (replaces ChP-0029 "notebooks listed only" and ChP-0033 "module-level circuit variables cannot be drafted"). The draft writes `line`, defaulting to: for a `.py` variable, the last line of the run of consecutive top-level statements starting at the candidate's statement that mention `name`; for a notebook candidate, the last line of the candidate's cell. A `.py` function drafts without `line` (function mode). The comment says `# runs lines 1–<line>; move it to choose a later point`. An existing item counts as already listed when its builder and `line` both match. A values file may name notebook functions as builder keys; module variables take no args (Q202).
- **How:** ruamel.yaml round-trip so comments and order survive; shows a diff before saving; writes `qscore.yaml.draft` when a manifest already exists.
- **Repository links (ChP-0035).** `PATH` may be a git URL (`https://…`, `ssh://…`, `git@host:owner/repo[.git]`, `file://…`); anything else is a local path. qscore runs `git clone --depth 1 [--branch REF] --no-recurse-submodules -c core.symlinks=false` with `GIT_LFS_SKIP_SMUDGE=1` and `GIT_TERMINAL_PROMPT=0` into `--into DIR` (default `./<repo-name>`). `--ref` accepts a branch, a tag or a full commit SHA (a SHA is fetched with depth 1 and checked out). An existing non-empty destination is refused (Q103 at `--into`; use `qscore discover <dir>` to work on it). The clone is a normal checkout the researcher keeps and edits; qscore never deletes it. URLs carrying credentials (`user:secret@`, any userinfo on `https`) are refused (Q103); authentication uses the researcher's own git configuration. A failed clone raises `FetchError` (exit 3) with git's message; no retry, no other transport. Discovery after cloning is the same static scan; no repository code runs before scoring is confirmed. `--path SUBDIR` limits discovery to a subdirectory of the clone (or of a local root). The trust notice is shown when one command both fetches and scores (`discover URL --score`); a later `qscore score <clone>` treats the clone like any local project (the ordinary confirmation applies). A failed SHA fetch leaves the partially initialised destination in place (qscore never deletes it); the `FetchError` message names it. (ChP-0042)
- **Single candidate (ChP-0035).** When discovery finds exactly one candidate and no `--pick` is given, it is picked and announced ("Only one circuit found: `<ref>` — drafting it"), with or without `--no-input`. With several, the numbered prompt (or `--pick`) is required as before; qscore never picks the first of several.
- **Engine-environment check (ChP-0035).** For each picked builder, top-level absolute imports are checked statically (`ast` + `importlib.util.find_spec` on the top-level name, after resolving modules that exist under the project root, the file's directory or the top package's parent). A module the engine environment cannot find is reported as a warning naming the module and file:line ("scoring will fail with Q301 unless it is installed there"). The check never imports repository code.
- **Discover then score (ChP-0035).** `--score` (requires `--draft`) continues with `score_project` on the file just written, with `--out` (default `<project.root>/qscore-out`) and the normal confirmation (`--yes` allowed). If the draft still holds `<required>` placeholders, it stops with the located Q107 report (exit 2) before anything runs.
- **Never:** overwrites a user's edit.

## 3. Validate: schema and references (`validate/schema_checks.py`, `reference_checks.py`)

- **Schema pass:** Pydantic validation of the YAML; every error becomes an `Issue` with `file:line:column` from the `PositionMap`; unknown keys get "did you mean" suggestions (`difflib.get_close_matches`); `x-` keys kept.
- **Reference pass (parses, never runs):** files exist (QASM, parameters, observables); the builder's file and function exist (checked with `ast`); arguments match its signature; the size-sweep argument exists; observables parse into Pauli terms; the target name is known.
- **Never:** stops at the first error. One run reports everything.

## 4. Resolve and check (`intake/loaders.py`, `intake/sandbox.py`, `validate/semantic_checks.py`, `validate/feasibility.py`)

### 4.1 Loading

- **QASM:** `qiskit.qasm2.loads` (v2) or `qiskit.qasm3.loads` (v3; needs the `qiskit-qasm3-import` package; `openqasm3` is declared too, for its `QASM3ParsingError`, ChP-0027). Parse errors → Q304 with the parser's line/column.
- **Builders:** the sandbox runs `intake/runner.py`, which imports the file, calls the function with the manifest's arguments, checks it returned a `QuantumCircuit`, and writes QPY plus a status JSON. Failures → Q300 timeout, Q301 import error, Q302 user exception (traceback trimmed to user files), Q303 not a circuit.
- **Packages (ChP-0037):** if the builder file is inside a regular package (its directory has `__init__.py`), the runner imports it by its dotted module name with the top package's parent directory on `sys.path` (e.g. `src/mqt/bench/benchmarks/ghz.py` → `mqt.bench.benchmarks.ghz` with `src/` on the path), so relative imports work and the package's `__init__` runs. The walk up stops below `project.root`: the root itself is never treated as a package, so no directory above it reaches `sys.path`. **src layout:** directories without `__init__.py` (PEP 420 namespace packages, like `mqt/` in the example) between an enclosing `src/` (at or below the project root) and the top regular package are part of the dotted name, and `src/` goes on the path; without an enclosing `src/`, namespace directories are not climbed (lead decision, 2026-10-10). Otherwise the file is imported as a single file.
- **Line mode (`source.line`, ChP-0037):** the engine extracts the script text (`.py` file text or notebook code-cell script), keeps the top-level statements starting at or before `line`, and sends that text to the runner, which executes it in a fresh module namespace named `__qscore_script__` (so `if __name__ == "__main__":` blocks do not run), with the file's directory as working directory and on `sys.path`, plus the project root. A `line` past the end of the file is Q103; an exception while running the kept statements is Q301; a missing `name` after execution is Q302, naming the line; a circuit with non-empty `args` is Q103. Code after `line` never runs.
- **Removed Qiskit APIs (ChP-0037):** discovery reports uses of APIs removed in Qiskit 1.0/2.0 (table in `intake/compat.py`, each entry with its replacement) as warnings with file:line, once per file. A Q301/Q302 from such a file carries the same hint. No code is rewritten.
- **Then:** bind parameters by name from the manifest's parameter file; any left unbound → Q305; names the circuit does not have → Q207 (ChP-0028). Hash the circuit's QPY bytes (`circuit_sha256`).

### 4.2 Sandbox (options; ★ default)

| Option | Isolation | Availability | Use |
|---|---|---|---|
| ★ **Process mode** | `subprocess.run` with timeout; `resource.setrlimit` (RLIMIT_AS = `mem_mb`, RLIMIT_CPU); temp working dir (line mode: the builder file's directory, ChP-0037); env stripped of every `*_TOKEN`, `*_KEY`, `*_DSN`, `*SECRET*`, `HF_*`, `GEMINI_*`, `OPENAI_*`; `-I` isolated mode; cwd = temp dir with repo on `sys.path` via the request | Everywhere (Linux/macOS; on Windows no rlimits → fail with ConfigError unless `sandbox_mode=process-unlimited` is set explicitly) | MVP |
| Process + `unshare -n` | Also no network | Linux where unprivileged user namespaces are allowed; check on the W7900 (root in a container may not allow it) | If it works, enable by setting `sandbox_network=off` |
| Container (`podman`/`docker run --network=none -v repo:ro`) | Strong | Laptop/Vultr; probably not on the W7900 | Later |

The sandbox is not a security boundary for hostile code (R10). In laptop mode, builders run from the user's own repo, curated examples, or a repository the user fetched by link (ChP-0035): fetching it is the user's decision to run its code, as with `git clone` followed by `python`. Before any builder from a fetched repository runs (builders run while resolving, §4.1, before the §5 summary), the user confirms: "N builder function(s) from `<url>@<commit>` will run as your user, with network access. The sandbox limits time and memory and removes secrets from the environment; it is not a security boundary." (with `--yes` it is shown as a warning); the same text heads the interpretation summary. OpenQASM-only items run no repository code. The API and the queued worker do not accept repository links (they need the container sandbox, later).

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
- **Confirm:** interactive prompt (CLI), the Confirm screen (UI), `--yes`, or the stored confirmation for a queued job. The confirmation (mode, time, manifest hash) is stored in the run record (`<out>/run.json`, 04 §13) and, for queued jobs, by the platform with the job (11 §3). `services` takes `confirm` as a required keyword: a callback (interactive) or the literal `"yes"` (`--yes`); there is no silent default (ChP-0028).
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
| `all-to-all` | `Target` with full connectivity on the item's qubit count | as the routing reference: same basis as the target it shadows; as a manifest target: `cx, rz, sx, x` (ChP-0028) | none |
| `line-N` | `CouplingMap.from_line(N)` | `cx`, `rz`, `sx`, `x` | none, unless the manifest supplies a calibration file |
| `grid-RxC` | `CouplingMap.from_grid(R, C)` | `cx`, `rz`, `sx`, `x` | none |
| `heavy-hex-D` | `CouplingMap.from_heavy_hex(D)` | `cz`, `rz`, `sx`, `x` | none |
| custom | `{coupling_map, basis_gates}` in the manifest → `Target.from_configuration` | as given (distinct standard gates; `measure`/`reset`/`delay` are added automatically, Q103) | optional `{file}`; otherwise `none`: reliability metrics are `unavailable` (ChP-0025, ChP-0028; the ChP-0009 assumed errors are withdrawn) |

`calibration: none` makes `reliability_heuristic` and `scheduled_duration` `unavailable` (with that reason), never estimated.

## 7. Measure (`score/engine.py`, `metrics/`)

- **Does:** runs the selected metrics on the shared compile results. CPU metrics run in the process pool; simulation metrics become jobs for `sim/` (the only GPU stage in normal scoring).
- **Never:** drops a metric silently. Each returns `computed`, `skipped`, `unavailable` or `failed` with a reason or error.

## 8. Diagnose (`diagnose/`)

Rules D01–D10 turn metric values into findings with evidence, severity, region and strategies; the policy applies profiles and suppressions. Details: `07-diagnostics.md`. **Never** uses a threshold that is not part of the score version (or an explicit, recorded manifest override).

## 9. Scorecard and requests (`record/scorecard.py`, `improve/requests.py`)

- **Does:** writes one scorecard per item (atomic write to `scorecards/<item_id>.json` locally; then the Hub when configured), keyed by item hash and score version.
- **Then:** for each unsuppressed finding that some layer can serve, builds an improvement request (`04-contracts.md` §4): the region cut out as a convex block in OpenQASM 3, a qubit map, objective, permitted changes, invariants and budget.
- **Compiled circuit export (ChP-0034).** For every item with a representative compile, write `compiled/<item_id>.qasm` under the output directory: `qiskit.qasm3.dumps` of the representative compiled circuit, preceded by one `// <key>: <JSON>` comment line each for, in order, `qscore`, `score_version`, `item_id`, `item_sha256`, `target` (`{"name", "num_qubits"}`), `transpiler_seed`, `optimization_level`, `initial_layout` (`Layout.initial_index_layout()`, ancillas included) and `final_index_layout` (one entry per virtual qubit); both layouts are `null` when the circuit has no layout. OpenQASM 3 does not carry a layout or the device width: a reloaded file has only as many physical qubits as its highest index uses. The file is the exact circuit scored; it is not re-optimized, re-routed or rewritten. Items without a representative (`representative_seed: null`) get no file; the run record says why (04 §13 `compiled_skipped`). An exporter error raises `RecordError` naming the item (exit 3) after that item's scorecard is written; it is never replaced by QASM 2, QPY or a partial file. The write is atomic.
- **Never:** sends more than the region when the manifest says region only; omits provenance.

## 10. Verify (used by the loop)

Proves a returned candidate keeps the invariants before anything is scored as better. Details: `08-verification.md`. **Never** trusts a proposal's own claims.

---

## 11. CLI commands and exit codes

| Command | Service | Notes |
|---|---|---|
| `qscore init [PATH]` | `init_project` | Creates `qscore.yaml` skeleton (no overwrite). |
| `qscore discover [PATH]` | `discover_candidates` | Prints candidates; `--draft` writes `qscore.yaml.draft` (or `qscore.yaml` when none exists). Draft flags: `--pick`, `--values FILE`, `--no-input` (ChP-0029). Exit 2 on invalid values or picks. `PATH` may be a git URL; `--ref REF`, `--into DIR`, `--path SUBDIR`, `--score` (with `--out`, `--yes`, `--allow-partial`, `--fail-on`) (ChP-0035, ChP-0042). With `--score`, the output, exit codes (0/1/2/3/4), `--allow-partial`, `--fail-on` and the "not confirmed; nothing scored" message are exactly those of `qscore score` on the drafted manifest. Exit 3 on a failed clone. |
| `qscore validate` | `validate_project` | Stages 3–4; prints the issue report; `--json`. |
| `qscore plan` | `plan_project` | Validate + interpret + plan; prints the resolved manifest and the plan. |
| `qscore score` | `score_project` | Full run; asks to confirm unless `--yes`. `PATH` is one of: a manifest (`*.yaml` / `*.yml`; same as `--manifest PATH`), a directory (its `qscore.yaml`; missing → Q200 naming that file), a single OpenQASM file (any other file), or `-` to read pasted OpenQASM from stdin (requires `--yes`; the text is saved as `<out>/input/pasted.qasm`, item id `pasted`, and the report is printed to stdout). `PATH` and `--manifest` together → exit 2; `--target` with a manifest → exit 2. Before anything runs the CLI names the mode used (`Input: manifest <path>`, `Input: single file <path>`, `Input: pasted OpenQASM (stdin)`). (ChP-0036) Writes `<out>/compiled/<item_id>.qasm` per item (§9, ChP-0034); the CLI prints each written path (`compiled → <path>`) with the report, in every mode. |
| `qscore improve --item ID --layers reference-qiskit,local` | `improve_item` | Runs the loop for one item (T1). |
| `qscore report` | `render_report` | Markdown/HTML from scorecards. |
| `qscore diff A B` | `diff_scorecards` | Field-by-field with tolerances. |
| `qscore bench` | `run_bench` | CPU vs GPU suite. |
| `qscore models check` | `check_models` | Checks every pinned `hf` model:provider in `improve/models.yaml` against the live Inference Providers catalog (live + structured output); exit 0 all ok, 3 otherwise (ChP-0048). |
| `qscore profile [--refresh]` | `profile_hardware` | Prints and caches the hardware profile. |
| `qscore conform LAYER` | `run_conformance` | T1. |
| `qscore explain CODE` | `catalog.explain` | e.g. `qscore explain Q202`. |
| `qscore rerun SCORECARD` | `rerun` | Repeats inputs and compares. |
| `qscore migrate FILE` | `versions.migrate` | Upgrades documents. |
| `qscore worker` | `worker.run_worker` | Queue loop. |
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
| Q207 | error | Parameters file invalid (unreadable, non-numeric values, or names the circuit does not have) |
| Q208 | error | Calibration file invalid (`qscore.calibration/v0.1`, ChP-0009) |
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

Services emit `Event`s (`04-contracts.md` §8) through `on_event`. The CLI renders a progress bar; the worker batches events to the platform (`POST /api/jobs/{id}/events`) every 2 s or 50 events; the UI shows live updates. Events are informative only: never parse an event to drive logic.

## 14. Practices the pipeline must show (from the build guide)

Validate everything before computing and report every issue at once · show the normalized interpretation and ask · round-trip YAML edits with a diff · no silent defaults · never run untrusted code in the engine's process · reproducibility by construction (lockfile, seeds, hashes, versions) · say what "deterministic" means (structural metrics repeat exactly; simulated metrics within a stated tolerance given the same seeds) · explain each metric twice (one plain line + precise definition) · explicit statuses, never blanks · cache by content · respect Qiskit's bit order · fail loudly on unsupported input · CLI and UI parity.
