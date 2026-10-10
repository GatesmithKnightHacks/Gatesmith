# qscore metrics

qscore scores a quantum circuit on the CPU: it compiles the circuit for a target across several
transpiler seeds, picks a representative compile (best seed by the primary objective; ties by
two-qubit depth, then seed order), and computes the metrics below. Every metric result carries a
`status`: `computed`, `unavailable` (a declared requirement is absent, e.g. no calibration),
`skipped` (not selected, or over budget) or `failed` (an error, with its message).

- **Kinds.** `deterministic` values are exact for the given compile; `heuristic` values are
  approximations with a stated label; `statistical` values come from repeated noisy simulation
  with a 95 % interval; `context` values describe the circuit and are never scored.
- **Scope.** `logical` = the circuit as submitted; `compiled` = the representative compile.
  Counts exclude directives (barriers) everywhere.
- **Score version.** These definitions are score version `qscore-2026.1`; changing one is a
  class A change and bumps the version. The source of truth is `specs/06-metrics.md`.

This file is generated from the metric class docstrings (`src/qscore/metrics/`); do not edit it
by hand.

## Resources

### `width`

How many physical qubits the compiled circuit actually uses.

Number of active qubits (touched by at least one non-directive operation) in the representative compiled circuit; physical qubits after layout. Evidence: `logical` (the same count on the logical circuit).

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | qubits | compiled, logical | 1 |

Reference: Qiskit `QuantumCircuit`; qscore definition (06 §2.1).

### `size`

Total number of operations after compilation.

`circuit.size()` of the compiled circuit, directives excluded, measurements and resets included. Evidence: `logical`.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | ops | compiled, logical | 1 |

Reference: Qiskit `QuantumCircuit.size`.

### `depth`

Number of time steps (layers) of the compiled circuit.

`circuit.depth()` of the compiled circuit. Evidence: `logical`.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | layers | compiled, logical | 1 |

Reference: Qiskit `QuantumCircuit.depth`.

### `two_qubit_count`

Number of two-qubit gates after compilation, usually the main cost driver; the default objective.

Number of instructions with `operation.num_qubits == 2` in the compiled circuit. Evidence: `logical` and `logical_multi_qubit_ops` (operations on three or more qubits).

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | gates | compiled, logical | 1 |

Reference: qscore definition (06 §2.1).

### `two_qubit_depth`

Number of layers of two-qubit gates after compilation.

`circuit.depth(filter_function=...)` counting only two-qubit, non-directive instructions of the compiled circuit. Evidence: `logical`.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | layers | compiled, logical | 1 |

Reference: Qiskit `QuantumCircuit.depth` with a filter.

### `measurement_count`

How many measurements the circuit makes.

Number of `measure` instructions in the logical circuit.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | logical | ops | logical | 1 |

Reference: qscore definition (06 §2.1).

### `toffoli_count`

How many Toffoli gates the logical circuit uses; the objective for reversible circuits.

Number of `ccx` instructions (and `mcx` with exactly two controls) in the logical circuit.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | logical | gates | logical | 1 |

Reference: qscore definition (06 §2.1).

## Hardware

### `routing_overhead`

Share of two-qubit gates that exist only because the hardware's connectivity forced extra routing.

`(R - A) / R`, where `R` is the two-qubit count of the representative compile and `A` the minimum two-qubit count over the all-to-all reference compiles (same basis, same seeds). `R = 0` gives 0.0. May be slightly negative because compiles are stochastic; reported as is. Evidence: `R`, `A`, `swaps_inserted`, the five qubit pairs with the most SWAPs.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | ratio | all_to_all, compiled, routing_stage | 1 |

Reference: qscore definition (06 §2.2); routing via Qiskit's preset pass managers.

### `swaps_inserted`

How many SWAPs the router added to fit the circuit onto the hardware.

Number of `swap` instructions in the route-only output (init, layout and routing stages) for the representative seed, counted before SWAPs are decomposed. Evidence: per-pair counts.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | gates | routing_stage | 1 |

Reference: Qiskit preset pass manager stages.

### `compile_ratio`

How compilation changed the two-qubit gate count compared with a plain translation.

`R / L0`, where `R` is the representative compile's two-qubit count and `L0` the two- qubit count of the raw translation to the target basis. `L0 = 0` gives `unavailable` ("no two-qubit operations").

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | ratio | compiled, raw_translation | 1 |

Reference: qscore definition (06 §2.2).

### `reliability_heuristic`

Rough calibration-based estimate of how error-prone the compiled circuit is; a heuristic, not a success probability.

`exp(sum(log(1 - e_op)))` over the compiled circuit's gates and measurements that have error data (`target[op][qargs].error`; `None` or 0, e.g. virtual `rz`, contributes nothing). Evidence: per-qubit and per-edge contributions of `-log(1 - e)`, the five largest contributors, `ops_without_error`. Labelled everywhere "calibration-based reliability heuristic, not a success probability".

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| heuristic | compiled | probability-like, in (0, 1] | calibration, compiled | 1 |

Reference: Expected-fidelity style of mapomatic (Nation & Treinish, PRX Quantum 4, 010327, 2023) and MQT Predictor.

### `scheduled_duration`

How long the compiled circuit takes to run, compared with how long the qubits keep their state.

Critical-path duration of the compiled circuit from ALAP scheduling with the target's gate durations. Evidence: `ratio_to_median_t2` (duration / median T2 of the active physical qubits), `median_t2_s`. `unavailable` when the target has no durations or no T2 data for the active qubits.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| heuristic | compiled | s | compiled, durations | 1 |

Reference: Qiskit `ALAPScheduleAnalysis`.

### `seed_spread`

How much the result depends on the compiler's random seed.

`(max - min) / median` of the two-qubit count across the transpiler seeds. Evidence: min, median, max and the per-seed table.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | ratio | compiled | 1 |

Reference: qscore definition (06 §2.2).

## Opportunities

### `supermarq_profile`

Six standard features describing the circuit's shape; shown for context, never scored.

SupermarQ's six features on the logical circuit: program communication, critical depth, entanglement ratio, parallelism, liveness and measurement, each in [0, 1]. Where a formula divides by zero (program communication with fewer than 2 qubits; entanglement ratio with no gates; liveness or measurement with depth 0) the feature is 0.0 and the case is listed in `evidence.undefined_as_zero` (ChP-0026).

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| context | logical | dict of 6 values in [0, 1] | logical | 1 |

Reference: Tomesh et al., "SupermarQ: A Scalable Quantum Benchmark Suite", HPCA 2022 (arXiv:2202.11045); formulas ported from the published SupermarQ source.

### `entanglement_variance`

How unevenly the two-qubit gates are spread over the qubits.

Population variance of `c_i`, the number of two-qubit operations touching logical qubit `i`, over the active logical qubits. Evidence: per-qubit counts, mean, `cv = std / mean` (0 when the mean is 0). Inspired by QASMBench's entanglement variance, but not identical to it.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | logical | gates^2 | logical | 1 |

Reference: Inspired by Li et al., "QASMBench", ACM TQC 2023 (arXiv:2005.13018); not the same formula.

### `structure`

Regions of the circuit that special-purpose techniques could rewrite; shown for context.

On the logical circuit: (a) commuting runs, maximal connected DAG runs of two-qubit gates diagonal in the computational basis (`cz`, `cp`, `crz`, `rzz`), where one-qubit diagonal gates do not break a run; (b) Clifford blocks via `CollectCliffords`; (c) linear-function blocks via `CollectLinearFunctions`. Each block lists its qubits, layer range and gate indices.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| context | logical | dict of lists | logical | 1 |

Reference: Qiskit `CollectCliffords`, `CollectLinearFunctions`; qscore commuting-run detection (06 §2.3).

### `resynthesis_potential`

How many two-qubit gates could be saved by re-synthesizing small two-qubit blocks optimally.

Sum over two-qubit blocks of the compiled circuit (`Collect2qBlocks` + `ConsolidateBlocks`) of the block's current two-qubit gates minus `TwoQubitBasisDecomposer(<target's two-qubit gate>).num_basis_gates(block unitary)`. Evidence: the top blocks with locations, and the same sum on the raw translation (`raw_potential`, informational).

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | compiled | gates | compiled, raw_translation | 1 |

Reference: KAK decomposition: Vidal & Dawson, PRA 69, 010301 (2004); Qiskit `TwoQubitBasisDecomposer`.

## Research

### `scalability`

How the gate count grows as the problem gets bigger.

For each `size_sweep` value: rebuild the circuit in the sandbox, compile with the first 3 seeds, record logical (raw translation) and compiled two-qubit counts and `routing_overhead`. Fit `y = a * n^b` by least squares on `log y` against `log n`, where `n` is the qubit count of the built circuit. Value `{b_logical, b_compiled, r2_logical, r2_compiled}`; evidence: the per-size table. No `size_sweep` gives `unavailable`.

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| deterministic | both | dict | builder | 1 |

Reference: Log-log ordinary least squares power-law fit (06 §2.4).

### `simulated_task_score`

How well the compiled circuit still does its job under realistic noise (needs GPU simulation; not in the MVP build).

Noisy simulation of the representative compiled circuit under the target's noise model, compared with the ideal result; higher is better, in [0, 1]. `known_output`: noisy P(bitstring); `distribution`: `hellinger_fidelity(ideal, noisy)`; `expectation`: `1 - |E_noisy - E_ideal| / sum|coeff|`. At least 5 trials, value = mean, 95 % t-interval. MVP build: `unavailable` ("intent has no task" or "simulation is not in the MVP build (ChP-0023)").

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| statistical | compiled | score | compiled, simulation, task | 1 |

Reference: Qiskit Aer; `hellinger_fidelity` from `qiskit.quantum_info`.

### `mirror_score`

How much noise builds up when the circuit runs forwards then backwards; noise accumulation, not task quality.

Probability of returning to |0...0> after the compiled circuit followed by its inverse, under noise; same trial and interval rules as `simulated_task_score`. Selected by default only for items whose intent has no task; never substituted for `simulated_task_score`. MVP build: `unavailable` or `skipped` (ChP-0023, ChP-0026).

| Kind | Scope | Unit | Requires | Version |
|---|---|---|---|---|
| statistical | compiled | probability | compiled, simulation | 1 |

Reference: Mirror circuits: Proctor et al., Nature Physics 18, 75 (2022).
