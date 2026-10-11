# ChP-0037: Score circuits from packages, scripts and notebooks

- **Status:** approved (user 2026-10-10: "Run the workarounds for proposal 37 in parallel"; spec text applied at integration)
- **Class:** A (manifest field, sandbox working directory, new runner mode)
- **Author:** lead · **Date:** 2026-10-10
- **Related tasks:** T09, ChP-0035 · **Blocks:** MQT Bench / notebook demos
- **Delegation:** D1 runner side, D2 discovery side, D3 is ChP-0034 (export); lead owns contracts, `services.py`, `cli.py`, merging

## 1. Summary
Testing real repositories (2026-10-10) showed three blockers between "repo link" and "scored":
(1) builder files inside packages use relative imports (MQT Bench ★131: every
`benchmarks/*.py::create_circuit` fails Q301 "attempted relative import with no known parent
package"); (2) circuits built at the top level of scripts and notebooks cannot be drafted
(qopt-best-practices ★48 `run/hw_native_test_1_circ.py`, notebooks generally); (3) notebooks
written for Qiskit < 1.0 fail on removed APIs (`execute`, `from qiskit import Aer`) with a bare
ImportError. This proposal fixes (1) and (2) and turns (3) into a precise, located hint.

## 2. Proposed change
### 2.1 Spec text (exact)

**A. `04-contracts.md` §2 manifest, `source` (additive, schema id unchanged `qscore.project/v0.2`)**
> `source.builder: "<file>.py::<name>" | "<file>.ipynb::<name>"`; optional `source.line: int ≥ 1`.
> Without `line`: `name` is a function, imported and called with `args` (today's behaviour).
> With `line`: qscore runs the file's top-level statements whose first line is ≤ `line`, then takes
> `name`: a `QuantumCircuit` (then `args` must be empty, Q103) or a function called with `args`.
> Notebook lines count in the code-cell script printed by `qscore discover` (code cells joined,
> `%`/`!` lines removed). A notebook builder requires `line` (Q103).

**B. `05-pipeline.md` §4.1 Builders, append**
> **Packages:** if the builder file is inside a regular package (its directory has
> `__init__.py`), the runner imports it by its dotted module name with the top package's parent
> directory on `sys.path` (e.g. `src/mqt/bench/benchmarks/ghz.py` → `mqt.bench.benchmarks.ghz`
> with `src/` on the path), so relative imports work and the package's `__init__` runs. Otherwise
> it is imported as a single file, as today.
> **Line mode (`source.line`):** the engine extracts the script text (`.py` file text or notebook
> code-cell script), keeps the top-level statements starting at or before `line`, and sends that
> text to the runner, which executes it in a fresh module namespace named `__qscore_script__`
> (so `if __name__ == "__main__":` blocks do not run), with the file's directory as working
> directory and on `sys.path` (relative data paths work as when the researcher runs it), plus the
> project root. A `line` past the end of the file, or a missing `name` after execution, is Q103 /
> Q302 respectively, naming the line. Code after `line` never runs.
> **Removed Qiskit APIs:** discovery reports, per file, uses of APIs removed in Qiskit 1.0/2.0
> (table in `intake/compat.py`, each entry with its replacement), as warnings with file:line.
> A Q301/Q302 from such a file carries the same hint. No code is rewritten.

**C. `05-pipeline.md` §2 Draft, append**
> Module-level circuit variables in `.py` files and notebook candidates (variables and functions)
> are draftable (ChP-0037; replaces ChP-0029 "notebooks listed only" and ChP-0033's "module-level
> circuit variables … cannot be drafted"). The draft writes `line`, defaulting to: for a `.py`
> variable, the last line of the run of consecutive top-level statements starting at the
> candidate's statement that mention `name`; for a notebook candidate, the last line of the
> candidate's cell; for a function, the end of its `def`. The comment says
> `# runs lines 1–<line>; move it to choose a later point`.

**D. `05-pipeline.md` §4.2:** the working directory for line mode is the file's directory (not
a temporary directory); function mode keeps the temporary directory.

### 2.2 Integration outline (binding for D1/D2/D3; lead merges in this order: D3, D1, D2)

Shared contracts (already in the lead checkout; delegates must not change them):
- `schemas/manifest.py`: `BuilderSource.line`, `BUILDER_PATTERN` accepting `.ipynb`, notebook-needs-line (Q103). JSON schema regenerated.
- `intake/discover.py::notebook_source(path, rel) -> str` — signature and output frozen (D1 reads it; D2 must not change it).

| Owner | Files (exclusive) | Delivers |
|---|---|---|
| **D1 runner** | `intake/runner.py`, `intake/sandbox.py`, `intake/script.py` (new), `intake/loaders.py`, `validate/reference_checks.py`, their tests | `script.prefix(text, until_line, rel) -> str` (Q103 past end); `BuilderRequest` gains `source_text: str \| None = None`, `cwd: Path \| None = None`, `name` (rename of `function`, keep a `function` alias only if callers need it — lead decides); runner: package-aware import, line mode execution, callable-or-circuit dispatch, `args` with a circuit → Q103 via a new status kind `args_for_circuit`; loaders build line-mode requests (text via `notebook_source` for `.ipynb`); reference checks accept a top-level binding of `name` at or before `line` (Q202 otherwise) |
| **D2 discovery** | `intake/discover.py` (except `notebook_source`), `intake/draft.py`, `intake/compat.py` (new), their tests | `Candidate.default_line: int \| None`; `compat.removed_apis(tree, rel) -> list[CompatHit(line, used, replacement)]`; discovery attaches hits per file (new field `Candidate.compat: tuple[CompatHit, ...]`); draft writes `line` + comment, stops refusing notebooks/module variables; hints formatted by a pure helper `compat.describe(hit) -> str` |
| **D3 export** (ChP-0034) | `record/export.py` (new), `schemas/run.py`, `schemas/versions.py`, `schemas/qscore.run_v0.3.json`, their tests | `export_compiled(...)`; run record v0.3 with `compiled`, `compiled_skipped`, `project_source` (ChP-0035 §D shape), v0.2→v0.3 migration |
| **Lead** | `services.py`, `cli.py`, `errors.py`, specs, README | wiring events/warnings, Q301 + compat hint join, ChP-0035/0036, run record assembly |

Cross-cutting rules: no delegate edits another's files; any needed change in a foreign file is
reported in `spec_deviations` instead. Issue codes only from 05 §12. No new dependencies.

## 3. Justification (evidence, not opinion)
- MQT Bench (★131) at `613281f`: drafting `ghz.py::create_circuit` and
  `cdkm_ripple_carry_adder.py::create_circuit` with `num_qubits: 6` → `Q301 … from ._registry
  import register_benchmark — ImportError: attempted relative import with no known parent package`.
- qopt-best-practices (★48) `run/hw_native_test_1_circ.py`: circuit at lines 17–19, followed by
  `QiskitRuntimeService(...)` at line 30 (cloud login) and a relative data path
  `data/hardware_native_127.json` (file lives in `run/data/`) → needs prefix execution and the
  file's directory as cwd.
- Quantum-Adder notebook: `from qiskit import ... execute, Aer` (removed in Qiskit 1.0).
- QASMBench (★182) `small/adder_n10` already scores complete (D01 warning, D08 info) — QASM path unaffected.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec | Nothing to build | Main real-world repo shapes unscoreable | — |
| Run the whole script/notebook | Simplest | Runs cloud logins, simulations, plots | Prefix stops before them |
| Rewrite old Qiskit code | Fewer manual edits | Silent "repair" of user code (R3) | Hint only |
| Ask researchers to write wrappers | No engine change | Overhead the feature exists to remove | Kept only for operator-typed args |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | Additive; function-mode builders unchanged |
| Gates and timeline (hours) | ~4–5 h parallel (D1, D2) + 1 h integration |
| Contracts / schemas / stored data (Neon, Hub) | Optional `source.line`; `.ipynb` builders. Schema id unchanged (additive). Item hash includes `line` (it changes the circuit) |
| Other specs and sections that must change | 04 §2; 05 §2, §4.1, §4.2; 03 intake rows (script.py, compat.py); ChP-0029/0033 notes superseded |
| Modules and public functions | per §2.2 table |
| Tests and golden values | New tests per module; MQT Bench / qopt / notebook fixtures as small local copies (no network in tests). Golden values none |
| Score version (metrics/thresholds) | none |
| Fallback registry | none (package import is chosen by file layout, not on failure) |
| Overall architecture (hosts, data flow, security) | Line mode cwd = repo directory: user code may read/write there (it is their code, run after confirmation; ChP-0035 notice applies) |
| Sponsor tracks / demo | MQT Bench and notebooks become demo-able |
| Cost (GPU credits, HF credits, time) | none |

## 6. Risks and rollback
- Package `__init__` imports heavy dependencies → Q301 with the module name (ChP-0035 import warning shows it earlier).
- Prefix stops too early/late → the researcher moves `line`; the comment says so.
- Unbound parameters (QAOA ansatz in qopt) still need ChP-0030 (approved, not yet implemented) to score compile-only metrics.
- Rollback: drop `line`; package import can be reverted independently.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved ("Run the workarounds for proposal 37 in parallel")
- Applied to specs in: not applied (at integration) · CHANGELOG line added: no
