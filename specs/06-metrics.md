# 06 · Metrics: catalog, definitions, golden values

> **Status:** binding; definitions are part of the score version `qscore-2026.1` (changing one is class A and bumps the version) · **Tier:** 0 · **Read:** before working on `metrics/`, `score/`, `compile/`, `docs/metrics.md`.

## 1. Plugin interface (`metrics/base.py`)

```python
class Requirement(StrEnum):
    LOGICAL = "logical"            # resolved logical circuit
    COMPILED = "compiled"          # representative compiled circuit + compile set
    ALL_TO_ALL = "all_to_all"      # all-to-all reference compiles
    ROUTING_STAGE = "routing_stage"  # route_only result (SWAPs before decomposition)
    RAW_TRANSLATION = "raw_translation"  # logical circuit translated to the target basis at optimization level 0, no coupling map
    CALIBRATION = "calibration"    # error rates
    DURATIONS = "durations"        # gate durations and T1/T2
    BUILDER = "builder"            # can rebuild at other sizes (size_sweep)
    TASK = "task"                  # intent with a task
    SIMULATION = "simulation"      # needs sim/ (GPU preferred)

class Metric(Protocol):
    id: str
    group: MetricGroup             # resources | hardware | opportunities | research
    version: str                   # bump on any definition change (also bumps SCORE_VERSION)
    kind: MetricKind               # deterministic | heuristic | statistical | context
    scope: Literal["logical", "compiled", "both"]
    requires: frozenset[Requirement]
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"]
    def compute(self, ctx: ScoringContext) -> MetricResult: ...
```

- A metric's `compute()` MUST NOT catch exceptions to hide them. The engine wraps each call: an exception becomes `status: failed` with `error: {type, message}`, logged at ERROR, and the scorecard becomes `partial` (R4). `qscore score` then exits 3 unless `--allow-partial`; the worker finishes the job with `result_summary.partial = true` and the UI shows a red banner.
- Helpers: `computed(value, unit, evidence=…, method=…, uncertainty=…)`, `skipped(reason)`, `unavailable(reason)`. `unavailable` only when a declared requirement is absent (e.g. no calibration, no task, no size_sweep). Never use it for an exception.
- `registry.py` loads built-ins plus the `qscore.metrics` entry-point group; `order(selected)` sorts so shared requirements are prefetched once.
- `selection.py`: `select(groups, metrics, skip, item.diagnose, plan) -> Selection`. Every excluded metric gets a recorded reason: `not selected`, `skipped by flag`, `unaffordable`, `budget`.

**Value convention:** a metric's `value` is a single number for anything usable as an objective or constraint (`two_qubit_count`, `routing_overhead`, …). Structured results (`structure`, `supermarq_profile`, `scalability`) put a dict in `value` and are `kind: context` or not allowed as objectives. Logical-vs-compiled comparisons go in `evidence`.

## 2. Catalog

Scope "compiled" means the representative compiled circuit (`compile/select.py`). Counting excludes directives (barriers) everywhere.

### 2.1 Resources (`metrics/resources/counts.py`)

| id | Kind | Definition | Unit | Notes |
|---|---|---|---|---|
| `width` | deterministic | Number of active qubits (touched by ≥1 non-directive operation) in the compiled circuit; evidence `logical` | qubits | Physical qubits after layout. |
| `size` | deterministic | `circuit.size()` of the compiled circuit (directives excluded; measurements and resets included); evidence `logical` | ops | |
| `depth` | deterministic | `circuit.depth()` of the compiled circuit; evidence `logical` | layers | |
| `two_qubit_count` | deterministic | Number of instructions with `operation.num_qubits == 2` in the compiled circuit; evidence `logical` and `logical_multi_qubit_ops` (≥3-qubit ops) | gates | Primary default objective. |
| `two_qubit_depth` | deterministic | `circuit.depth(filter_function=lambda i: i.operation.num_qubits == 2 and not directive)` on the compiled circuit; evidence `logical` | layers | |
| `measurement_count` | deterministic | Number of `measure` instructions (logical) | ops | |
| `toffoli_count` | deterministic | Number of `ccx` instructions (and `mcx` with exactly 2 controls) in the **logical** circuit | gates | Objective for reversible items. |

### 2.2 Hardware suitability (`metrics/hardware/`)

| id | Kind | Definition | Unit | Requires |
|---|---|---|---|---|
| `routing_overhead` | deterministic | `(R − A) / R` where `R` = `two_qubit_count` of the representative compile and `A` = the minimum two-qubit count over the all-to-all reference compiles (same basis, same seeds). `R = 0` → value 0.0. May be slightly negative (stochastic compiles); report as is. Evidence: `R`, `A`, `swaps_inserted`, the five qubit pairs with the most SWAPs | ratio | COMPILED, ALL_TO_ALL, ROUTING_STAGE |
| `swaps_inserted` | deterministic | Number of `swap` instructions in the `route_only` output for the representative seed; evidence: per-pair counts | gates | ROUTING_STAGE |
| `compile_ratio` | deterministic | `R / L0` where `L0` = two-qubit count of the RAW_TRANSLATION. `L0 = 0` → `unavailable` ("no two-qubit operations") | ratio | COMPILED, RAW_TRANSLATION |
| `reliability_heuristic` | heuristic | `exp(Σ log(1 − e_op))` over compiled gates and measurements with error data (`target[op_name][qargs].error`; `None` or 0 for virtual `rz` contributes nothing). Evidence: per-qubit and per-edge contributions of `−log(1 − e)`, the five largest contributors, `ops_without_error`. Label everywhere: **"calibration-based reliability heuristic, not a success probability"** | probability-like (0, 1] | COMPILED, CALIBRATION |
| `scheduled_duration` | heuristic | Critical-path duration of the compiled circuit from ALAP scheduling with the target's durations; evidence `ratio_to_median_t2` = duration ÷ median T2 of the active physical qubits, `median_t2_s` | s | COMPILED, DURATIONS |
| `seed_spread` | deterministic | `(max − min) / median` of `two_qubit_count` across seeds; evidence: min, median, max, per-seed table | ratio | COMPILED |

### 2.3 Optimization opportunities (`metrics/opportunities/`)

| id | Kind | Definition | Unit |
|---|---|---|---|
| `supermarq_profile` | context | SupermarQ's six features on the logical circuit: program communication, critical depth, entanglement ratio, parallelism, liveness, measurement. Port the published formulas (cite the SupermarQ paper/source in `docs/metrics.md`). Shown, never scored | dict of 6 values in [0, 1] |
| `entanglement_variance` | deterministic | Population variance of `c_i`, the number of two-qubit operations touching logical qubit `i`, over active logical qubits. Evidence: per-qubit counts, mean, `cv = std / mean` (0 when mean = 0). Inspired by QASMBench's entanglement variance; not identical, and `docs/metrics.md` says so | gates² |
| `structure` | context | On the logical circuit: (a) **commuting runs**: maximal connected DAG runs of two-qubit gates diagonal in the computational basis (`cz`, `cp`, `crz`, `rzz`), where one-qubit diagonal gates (`rz`, `p`, `z`, `s`, `sdg`, `t`, `tdg`) do not break a run; (b) **Clifford blocks** via `CollectCliffords`; (c) **linear-function blocks** via `CollectLinearFunctions`. Each with qubits, layer range and gate indices | dict of lists |
| `resynthesis_potential` | deterministic | Σ over two-qubit blocks of the compiled circuit (`Collect2qBlocks` + `ConsolidateBlocks`) of `current two-qubit gates in the block − TwoQubitBasisDecomposer(<target's 2q gate>).num_basis_gates(block unitary)`. Evidence: top blocks with locations, and the same sum on the RAW_TRANSLATION (`raw_potential`, informational: level 3 usually realizes it) | gates |

### 2.4 Research evaluation (`metrics/research/`)

| id | Kind | Definition | Unit | Requires |
|---|---|---|---|---|
| `scalability` | deterministic (fit) | For each `size_sweep` value: rebuild through `intake/loaders.py` (sandbox), compile with the first 3 seeds, record logical (RAW_TRANSLATION) and compiled two-qubit counts and `routing_overhead`. Fit `y = a·n^b` by least squares on `log y` vs `log n`, where `n` = qubit count of the built circuit. Value `{b_logical, b_compiled, r2_logical, r2_compiled}`; evidence: per-size table (arg value, qubits, counts, overhead). No `size_sweep` → `unavailable`. MVP caps the sweep at three sizes after G2 (cut list) | dict | BUILDER |
| `simulated_task_score` | statistical | Noisy simulation of the **representative compiled circuit** under the target's noise model (`AerSimulator.from_backend(...)` or a noise model from the calibration snapshot), compared with the ideal result. Higher is better, in [0, 1]: `known_output` → P(bitstring) noisy; `distribution` → `hellinger_fidelity(ideal_probs, noisy_counts)`; `expectation` → `1 − |E_noisy − E_ideal| / Σ|coeff|`. Evidence always includes the intent's own criterion (`p`, `fidelity`, or `abs_error = |E_noisy − E_ideal|`, plus `E_ideal`, `E_noisy`). ≥ 5 trials (seeds derived from item hash and trial index); `value` = mean; `uncertainty.ci95` = mean ± t₀.₉₇₅,ₙ₋₁·s/√n. Method chosen by the planner (`09-gpu-and-simulation.md`). No task → `unavailable` ("intent has no task") | score | COMPILED, TASK, SIMULATION |
| `mirror_score` | statistical | Probability of returning to `|0…0⟩` after the compiled circuit followed by its inverse, under noise; same trials/CI rules. **Label: "noise accumulation (mirror circuit), not task quality."** Selected by default only for items whose intent has no task; never substituted into `simulated_task_score` | probability | COMPILED, SIMULATION |

### 2.5 Not metrics

- **Exact equivalence** is verification (`08-verification.md`), not a metric.
- **Compile time** is recorded in `compile.per_seed[].time_s` and `resources`, not scored.

## 3. Options (★ default; others need a class A proposal because they change scores)

| Metric | ★ Default | Alternatives |
|---|---|---|
| `reliability_heuristic` | Product of (1 − error) over gates and measurements (mapomatic / MQT Predictor "expected fidelity" style) | Add idle decoherence from T1/T2 and the schedule (ESP-style); per-layer products |
| `routing_overhead` | Two-compile comparison + route-only SWAP count as evidence | SWAP count alone; depth overhead; overhead vs a perfect-layout compile |
| `entanglement_variance` | Population variance + `cv` | QASMBench's exact published formula (adopt with citation) |
| Task-score interval | t-interval over ≥5 trials | Bootstrap over trials; Wilson interval over pooled shots for `known_output` |
| `scalability` fit | log-log OLS power law | Nonlinear least squares; exponential vs power model selection by AIC |
| Commuting-run detection | Diagonal-gate runs on the DAG | Pauli-commutation check on arbitrary 2q gates (`CommutationChecker`), slower but general |

## 4. Golden values (tests in `qscore/tests/golden/`)

Golden values are set by a person (R6). The values below are derived by hand and **approved as part of these specs**; agents MUST NOT change them. Values marked *record + approve* are produced by running code once and need the user's explicit approval of the exact numbers before they are committed with `approved_by: user`.

| Circuit / helper | Expected |
|---|---|
| Bell: `h(0); cx(0,1)` (logical) | width 2, size 2, depth 2, two-qubit count 1, two-qubit depth 1, measurements 0 |
| GHZ chain n=5: `h(0); cx(i,i+1) for i in 0..3` (logical) | width 5, size 5, depth 5, two-qubit count 4, two-qubit depth 4 |
| GHZ chain n=4, logical per-qubit two-qubit counts | `[1, 2, 2, 1]` → `entanglement_variance` 0.25, `cv` 1/3 |
| GHZ chain n=5 on target `line-5` (basis `cx, rz, sx, x`), opt. level 3, seeds `[11, 23, 37]` | `routing_overhead` 0.0, `swaps_inserted` 0, compiled two-qubit count 4, `compile_ratio` 1.0, `seed_spread` 0.0 |
| `reliability_from_ops([("cx",(0,1),0.01), ("sx",(0,),0.001), ("measure",(0,),0.02)])` helper | `0.99 × 0.999 × 0.98 = 0.9692298` (to 1e-12) |
| `resynthesis_potential` helper on a 2q block `cx(0,1); cx(0,1)` | 2 |
| same helper on `cx(0,1); cx(1,0); cx(0,1)` (a SWAP) | 0 |
| `toffoli_count` on `ccx(0,1,2); cx(0,1); ccx(1,2,3)` | 2 |
| Compiled GHZ-5 on `FakeTorino`, seed 11 (two-qubit count, two-qubit depth, depth) | *record + approve* |
| `sbox_oracle` logical `toffoli_count` | *record + approve* (from the generator, `14-testing.md` §3) |

## 5. Documentation (`docs/metrics.md`)

For each metric: a one-line plain explanation (used as a UI tooltip), the precise definition (matching this file), the unit, the kind, the requirements, and a reference. The doc is generated from metric class docstrings plus a hand-written intro; a test checks every registered metric has an entry.

## 6. Pitfalls to watch (see also `18-risks-and-watchlist.md`)

- Qiskit counts: `count_ops()` includes barriers; use explicit filters. `num_qubits` of a compiled circuit is the target's size (e.g. 133), not active qubits.
- Compiled circuits carry a `TranspileLayout`; use it (not guesses) to map logical ↔ physical qubits for regions and evidence.
- The all-to-all reference must use the **same basis gates and seeds**, or `routing_overhead` measures basis translation differences instead of routing.
- `ConsolidateBlocks` needs the target's basis/2q gate to decide; pass the target, not just a basis list.
- Products of many `(1 − e)` underflow precision: sum logs.
- Process-pool results arrive in completion order: sort by seed before use.
