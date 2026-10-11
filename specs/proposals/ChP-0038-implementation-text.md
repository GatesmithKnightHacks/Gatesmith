# ChP-0038 implementation text for the read-only base specs

- **Status:** implementation text for approved ChP-0038; base specs not edited.
- **Author:** Codex · **Date:** 2026-10-11
- This annex supplies R1's complete standard and the concrete corpus document layout.
  The current workspace instruction keeps base `specs/` read-only; these edits are staged
  here under the permitted proposals directory. The implementation follows approved
  ChP-0038; the handoff records the remaining base-spec synchronization.

## Apply to 04 §3 extension table

| Extension | Meaning |
|---|---|
| `x-reference` | `{benchpress: measurement or {error:{type,message}}, placement: {metric: {band,n,percentile,median} or {band,n,reason}}, corpus: {score_version,sha256} or null}`. Omit benchpress for unsupported bases/no representative; omit placement for absent corpus/target coverage. Ignored by scoring/diff objectives. A reference measurement error makes a card partial even when no metric failed, and forbids complete status. |

## New 04 §15: qscore.reference/v0.1

Required fields: `schema`, `score_version`, `created_at`, `sources`, `targets`, `failures`,
`provenance`. Source records carry `id`, `url`, full `commit`, `license`, `modifications`.
`targets` maps target name to metric ID to active-width band to a distribution:
`{n, quantiles: {"5", "25", "50", "75", "95"}, circuit_ids, values}`.
The sorted finite values align with the circuit IDs, whose count equals n and whose IDs
are unique. Retained samples are derived numbers, not circuits; they make empirical ranks
possible without assuming a distribution from five quantiles. Quantiles use NumPy linear
interpolation; percentile is `100 * (count_below + count_equal/2) / n`.
Failures carry `circuit_id`, issue `codes`, and `error`. Provenance records Qiskit version,
lock hash, engine git commit and catalog hash. Unknown non-extension keys are rejected.

## Apply to 05 §11

| CLI | Service | Behavior |
|---|---|---|
| `qscore reference build [--out DIR]` | `build_reference` | Maintainer command; pinned clones and per-entry default scoring; default output directory `./qscore-reference-src`. Writes source checkouts, score artifacts, failure ledger and `corpus-<score_version>.json`. Exit codes as score: 0 complete, 2 invalid entries, 3 runtime/partial failure, 4 configuration failure. |

## Apply to 15 / index / 06 §5

Add R1 standard document, R2 Benchpress convention block, R3 corpus build, R4 placement tasks
with acceptance from ChP-0038 §2.2. README index adds `20-reference-standard.md`. 06 §5 links
from generated metric documentation to the standard. CHANGELOG records ChP-0038 implementation
without changing SCORE_VERSION (measurements/placement are descriptive extensions).

## New 20-reference-standard.md (user copy: qscore/docs/standard.md)

# qscore reference standard

This standard explains each measurement's relationship to published practice. It does not
certify circuits or reproduce a cross-SDK leaderboard. Metric definitions remain in
[metrics.md](metrics.md); the score version is `qscore-2026.2`.

## Measurement conventions

The table distinguishes identical formulas from related ideas. qscore normally compiles at
optimization level 3 over seeds 11, 23, 37, 41, 53, 67, 79, 97, then reports the representative
chosen by its objective. References to compiled circuits below mean that representative.

| Metric | Convention and source | Same as | Differs in | Why |
|---|---|---|---|---|
| `width` | Qiskit circuit resources; [Benchpress][bp] | Counts qubits used by a circuit | qscore counts active physical qubits; Benchpress reports allocated `num_qubits` | Padding to a backend's full width must not inflate circuit width |
| `size` | Qiskit `QuantumCircuit.size` | Non-directive operation count | Includes measurements and resets, rather than a gate-only count | State the actual execution operations |
| `depth` | Qiskit `QuantumCircuit.depth` | Dependency depth, excluding directives | Compiled representative rather than the submitted logical circuit | Measure mapped execution cost |
| `two_qubit_count` | Benchpress `output_gate_count_2q` | On a single native 2q basis, the gate count | Counts any non-directive arity-2 instruction; level 3 and best-of-eight instead of level 2 once | Reproducible optimization-sensitive scoring; separate level-2 comparison below |
| `two_qubit_depth` | Benchpress `output_depth_2q` | Layers containing native 2q operations | qscore filters arity; Benchpress filters selected gate name; compile settings also differ | Same single-native-gate interpretation, with settings made explicit |
| `measurement_count` | Qiskit logical `measure` count; [QASMBench][qasmb] measurement-density context | Counts measurement instructions | This is a count, not QASMBench's logarithmic measurement-density formula | Avoid conflating circuit operations with a normalized density |
| `toffoli_count` | Qiskit `ccx` and two-control `mcx` | Logical Toffoli count | No claim of a corresponding Benchpress or QASMBench score | Preserve a useful reversible-circuit objective |
| `routing_overhead` | qscore definition, using Qiskit routing | No published numeric counterpart claimed | `(R-A)/R`, same basis/seeds, minimum all-to-all count A; R=0 gives zero | Isolate connectivity cost; negative values remain visible |
| `swaps_inserted` | Qiskit routing-stage SWAPs | Number of inserted SWAP instructions before decomposition | Does not infer SWAPs from final CX/CZ count | Preserve routing evidence |
| `compile_ratio` | qscore definition | No published numeric counterpart claimed | Representative 2q count / level-0 basis translation 2q count; zero denominator is unavailable | Distinguish routing/optimization from basis expansion |
| `reliability_heuristic` | [mapomatic][mapomatic] calibration-cost family; expected-fidelity style also used by MQT Predictor | Product of available per-operation `(1-error)` factors | No claim of exact mapomatic score parity; no idle decoherence, missing errors counted, error=1 gives zero and faulty-op evidence | A calibration-based reliability heuristic, not a success probability |
| `scheduled_duration` | Qiskit `ALAPScheduleAnalysis` | Critical-path time using target durations | Not QASMBench's `log(depth)` retention lifespan; evidence also compares duration with median active-qubit T2 | Preserve physical units and calibration context |
| `seed_spread` | qscore definition | No published numeric counterpart claimed | `(max-min)/median` across the fixed compile seeds | Expose compiler seed sensitivity |
| `supermarq_profile` | [SupermarQ features][supermarq] | Six source formulas: communication, critical depth, entanglement, parallelism, liveness, measurement | Undefined denominators give 0 with evidence; qscore avoids mutating the input | Consistent features for empty and one-qubit circuits; never a quality score |
| `entanglement_variance` | QASMBench entanglement-imbalance idea | Measures uneven two-qubit participation | qscore uses population variance over active qubits and CV. QASMBench uses `log(1 + sum((c_i-mean)^2))/n`, with CX-equivalent decomposition counts | Simpler gate-count units; the two numeric values are not interchangeable |
| `structure` | Qiskit `CollectCliffords`, `CollectLinearFunctions`; qscore diagonal runs | Qiskit block membership for the first two | Diagonal-gate runs are qscore's documented subset of commuting structure | Locate candidate regions without claiming exhaustive algebraic structure |
| `resynthesis_potential` | Qiskit exact `TwoQubitBasisDecomposer` (KAK) | Exact synthesis into the selected native 2q gate | qscore sums current-minus-synthesized counts across collected blocks; no separate published aggregate score claimed | Locate unrealized local savings; synthesized counts avoid Qiskit 2.5.2's SWAP-class `num_basis_gates` issue |
| `scalability` | Power-law log-log least squares; [MQT Bench][mqt] size families | Compare a circuit family at several sizes | qscore rebuilds declared sweeps and fits separate logical/compiled exponents; not an MQT leaderboard score | Describe the user's family, without substituting another algorithm |
| `simulated_task_score` | [QED-C application-oriented benchmarks][qedc]; Qiskit Hellinger fidelity | Distribution tasks use raw Hellinger fidelity; known-output tasks use observed probability | Not QED-C polarization fidelity rescaled against a uniform/thermal floor; expectation tasks use qscore's declared normalization | Evaluate the stated task. Simulation availability is governed by the engine, never supplied by corpus placement |
| `mirror_score` | Mirror-circuit return-probability idea | Probability of all-zero output after forward/inverse execution under noise | No claim of full randomized mirror-benchmark protocol parity | Noise accumulation, not task quality; never substitutes for a task score |

QASMBench's gate density `(single+2*dual)/(depth*n)`, retention lifespan `log(depth)` and
measurement density `log(n*depth)/measurements` are not qscore metrics. SupermarQ's measurement
feature instead concerns reset-containing layers after removing final measurements.
IBM layer fidelity and EPLG are device-level measurements requiring hardware experiments;
a circuit and calibration snapshot do not supply them.

## Benchpress-convention measurement

For a target with a native CX, CZ or ECR basis gate and a representative compile, qscore also
compiles the logical circuit at optimization level 2. It records the representative seed,
native 2q gate count and depth, and the convention pin
`benchpress@b695f30e83a32bac05b9b4d8e98d37ba9aae5236 device_transpile` in
`x-reference.benchpress`. Benchpress leaves its transpiler seed unset; qscore fixes it.
Unsupported bases have no block. If there is no representative, no seed is invented.
A reference compile error is logged and recorded as `{error: {type, message}}`, and the card
is partial. This block never changes objectives or diagnostics.

This follows Benchpress's output measurement convention, not its full timing harness or its
published software/backend versions. A same-named backend may have different calibration data.

## Corpus and placement

The pinned [catalog](../reference/corpus.yaml) contains 67 QASMBench small/medium circuits at
`357b942396d5c2b7cbc1c229c585a6ef5ccaebac`, and 38 MQT Bench `create_circuit` builders at
sizes 4, 8, 12 and 16 at `613281fc367189485c7ca7b5f6b7c2ed04f3ec43`: 219 entries in total.
Not every builder supports every size or the current engine. Every failed entry is recorded
with its error and issue codes and excluded from distributions. No failed circuit is repaired.
MQT's generated `_version.py` stub is an explicit, recorded preparation step; `graphstate`
uses explicit seed 10. Sources and licences are in the catalog and generated corpus.

Run `qscore reference build --out qscore-reference-src` from the engine environment. This
maintainer command clones the pinned public sources and executes builders through the normal
sandbox. It retains source checkouts, per-entry artifacts, and
`corpus-qscore-2026.2.json`. Exit 2 indicates invalid entries, exit 3 runtime/partial failures,
and exit 4 configuration failures. Failed entries are still recorded in the final document
when the build can continue; infrastructure failures abort. Existing clone destinations are
not overwritten. A release ships the derived JSON under `src/qscore/reference/`, never circuits.

Distributions contain only finite, computed scalar metrics from complete cards on the same
target. Width is the active compiled width, with bands 2–5, 6–10, 11–20, 21–50 and 51+.
Zero- and one-qubit circuits have no declared band. Each distribution retains sorted values
and aligned circuit IDs, sample count n, and linearly interpolated 5/25/50/75/95 quantiles.
The additional retained values let placement compute empirical percentile exactly:
`100 * (number strictly below + 0.5 * number equal) / n` (midrank for ties).

For n < 5, placement reports `too few reference circuits` with band and n, without a percentile.
A missing corpus for the score version yields no placement block and an explicit report note.
A corrupt or mismatched corpus is an error. The scorecard records the corpus score version and
SHA-256. Target names, widths and counts are shown beside percentiles; versions are recorded in
the corpus provenance. Custom calibration differences require care even when target names match.

Reports say “compared with public benchmark circuits of similar width.” Different algorithms
are not directly comparable. Percentiles describe numerical position, never acceptance,
diagnostic severity, or whether an algorithm is better.

## Source verification

- Benchpress: pinned `benchpress/qiskit_gym/utils/io.py`, `default.conf`, and
  `device_transpile/test_hamiltonians.py`; [commit metadata][bpcommit] checked 2026-10-11.
- QASMBench: pinned README and `metrics/QMetric.py` (density and variance formulas).
- SupermarQ: source pinned to `dcf831888f6cf036a02bf85911c00820e29310f9`;
  local experiment `lab/20261010-1535-supermarq-features/` records formula comparisons.
- MQT Bench: pinned `src/mqt/bench/benchmarks/*.py` signatures and licences.
- QED-C: `qedclib/metrics.py::polarization_fidelity` at
  `21dfc331ce61a2170b06f88259aa19f901c021bc`; raw versus rescaled fidelity distinguished above.
- Qiskit APIs: installed 2.5.2 source and existing qscore regression tests. The mapomatic
  attribution is to its published calibration-cost approach, not a verified identical API.

[bp]: https://github.com/Qiskit/benchpress/blob/b695f30e83a32bac05b9b4d8e98d37ba9aae5236/benchpress/qiskit_gym/utils/io.py
[bpcommit]: https://github.com/Qiskit/benchpress/commit/b695f30e83a32bac05b9b4d8e98d37ba9aae5236
[qasmb]: https://github.com/pnnl/QASMBench/blob/357b942396d5c2b7cbc1c229c585a6ef5ccaebac/metrics/QMetric.py
[supermarq]: https://github.com/Infleqtion/client-superstaq/blob/dcf831888f6cf036a02bf85911c00820e29310f9/supermarq-benchmarks/supermarq/features.py
[mqt]: https://github.com/munich-quantum-toolkit/bench/tree/613281fc367189485c7ca7b5f6b7c2ed04f3ec43
[mapomatic]: https://arxiv.org/abs/2209.15512
[qedc]: https://arxiv.org/abs/2110.03137
