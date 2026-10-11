# ChP-0038: Reference-backed standard: qscore measurements tied to Benchpress, QASMBench, MQT Bench, SupermarQ and mapomatic, plus placement against a public reference corpus

- **Status:** approved
- **Class:** A  (new spec file, new scorecard extension and document schema, new default work per item — 00-operating-rules.md R5)
- **Author:** lead · **Date:** 2026-10-11 02:05 UTC
- **Related tasks:** F3 (feature tracker) · new tasks R1–R4 below · **Blocks:** nothing in F1/F2
- **Decision needed by:** before F3 starts (~3.5 h of work after approval). The user's deadline for F3 is 12–1 AM EDT.

## 1. Summary
A qscore number such as "`two_qubit_count` 412" means little on its own. A researcher needs to know (a) that it was measured the way the field measures it, and (b) where it sits among comparable public circuits. This proposal adds three things:
1. **A standard document** (`specs/20-reference-standard.md`, user copy `qscore/docs/standard.md`) that maps every qscore metric to the published convention it follows (Benchpress, QASMBench, SupermarQ, MQT Bench, mapomatic/MQT Predictor, QED-C). For each one it says *same as / differs in / why*.
2. **A Benchpress-convention measurement** of each item, beside qscore's own: one extra compile at Benchpress's settings, reporting Benchpress's two output numbers.
3. **Placement against a reference corpus.** QASMBench and MQT Bench circuits are scored once per score version by qscore itself, and their per-metric distributions ship with the package. Each card then states the percentile of its value among corpus circuits of a similar width on the same target.

It deliberately does **not** run Benchpress's cross-SDK comparison (user discussion 2026-10-10: narrow scope).

## 2. Proposed change
### 2.1 Spec text (exact)
**A. New file `specs/20-reference-standard.md`** (19 is reserved by ChP-0040). Outline, binding text to be written in task R1:
> **§1 Purpose.** Every qscore metric names the published convention it follows and every difference from it. A metric with no published counterpart says so.
> **§2 Mapping table** (one row per metric in 06 §2). Columns: metric · convention and source · same as · differs in · why. Seed rows:
> | `two_qubit_count`, `two_qubit_depth` | Benchpress `output_gate_count_2q`, `output_depth_2q` (Nation et al., *Nat. Comput. Sci.* 2025; repo Qiskit/benchpress) | count of the target's 2q gate; depth over 2q gates only | qscore compiles at optimization level 3 over 8 fixed seeds and reports the representative; Benchpress uses `generate_preset_pass_manager(2, backend)` once, unseeded | qscore reports best-of-N deterministically (D02 seed sensitivity); the Benchpress-convention block (§3) gives the comparable number |
> | `entanglement_variance`, `measurement_count`, … | QASMBench metrics (gate density, retention lifespan, measurement density, entanglement variance; Li et al., *ACM TQC* 2023) | … | … | … |
> | `supermarq_profile` | SupermarQ feature vectors (Tomesh et al., HPCA 2022) | … | … | … |
> | `reliability_heuristic` | mapomatic expected fidelity (Nation & Treinish, *PRX Quantum* 2023), MQT Predictor | product of (1 − e) | faulty ops (ChP-0041) | … |
> | `simulated_task_score` | QED-C application-oriented benchmarks (normalized fidelity) | … | … | … |
> | (none) | IBM layer fidelity / EPLG | — | — | device-level metrics measured on hardware, not computable from a circuit and a calibration snapshot; cited as out of scope |
> **§3 Benchpress-convention block.** For each item whose target has a 2q basis gate in {cx, cz, ecr}, qscore also compiles the logical circuit with `generate_preset_pass_manager(optimization_level=2, target)`, `seed_transpiler` = the item's representative seed (Benchpress leaves it unseeded; qscore fixes it for reproducibility and says so). It records `x-reference.benchpress = {convention: "benchpress@<commit> device_transpile", optimization_level: 2, seed, gate_count_2q, depth_2q, two_q_gate}`. The block never feeds diagnostics or objectives. A compile failure here is recorded as `{error}` in the block and makes the card `partial` (fail loud, like any metric).
> **§4 Reference corpus.** The pinned list `qscore/reference/corpus.yaml` contains QASMBench small + medium at commit `357b942` (67 circuits) and MQT Bench `create_circuit` builders at sizes 4, 8, 12, 16 (commit `613281f`), each with its source and licence. `qscore reference build` scores it with the default manifest settings and writes `qscore/reference/corpus-<score_version>.json` (`qscore.reference/v0.1`: per metric, per target, per width band [2–5, 6–10, 11–20, 21–50, 51+]: n, quantiles 5/25/50/75/95, and the circuit ids in the band). Only derived numbers are shipped, never circuits.
> **§5 Placement.** When a corpus file for the current score version and the card's target exists, every scalar metric in the card gets `x-reference.placement[metric] = {band, n, percentile, median}`. With `n < 5` in the band, the entry is `{band, n, reason: "too few reference circuits"}`, with no percentile. A missing corpus file for the current score version means no placement block, and the report says "no reference corpus for <score_version>" (it is not an error: the corpus is data shipped with a release). The report shows one line per metric: "412 · 78th percentile of 14 reference circuits (11–20 qubits, FakeTorino)". Placement is descriptive. It is never a pass/fail and never a diagnostic.
> **§6 Wording rule.** Reports say "compared with public benchmark circuits of similar width". They never say "better than" or "worse than". Different algorithms are not directly comparable, and the report says so once.

**B. `specs/04-contracts.md` §3 (scorecard), extension table — append:**
> | `x-reference` | Written by qscore (ChP-0038): `{benchpress: {...} \| {error}, placement: {metric: {...}}, corpus: {score_version, sha256} \| null}` (20 §3–§5). Ignored by `diff` for scoring. |

**C. `specs/04-contracts.md` — new §15 `qscore.reference/v0.1`** (corpus statistics document, 20 §4).

**D. `specs/05-pipeline.md` §11 — new row:**
> | `qscore reference build [--out DIR]` | `build_reference` | Scores the pinned corpus (network: clones the two pinned repos into `--out`, default `./qscore-reference-src`) and writes `corpus-<score_version>.json`. Maintainer command; exit codes as `score`. |

**E. `specs/README.md` index** gets row 20, and **`specs/15-build-plan.md`** gets tasks R1–R4.

### 2.2 Implementation sketch
- **R1 (1 h, lead):** write `specs/20-reference-standard.md` §2 in full. Each row must be checked against the cited source: the README/paper text, or the Benchpress code (`benchpress/qiskit_gym/utils/io.py::qiskit_output_circuit_properties`, `default.conf`). Copy it to `qscore/docs/standard.md`, and add a link from each metric's entry in `docs/metrics.md`.
- **R2 (45 min):** `score/reference.py::benchpress_block(logical, target, seed) -> dict`, called from `score/engine.py` after the main compile, written to the card as `x-reference.benchpress`. Tests: `gate_count_2q == count_ops()[two_q_gate]` and `depth_2q == depth(filter 2q)` on GHZ-5/FakeTorino; determinism with a fixed seed; error path → `{error}` + partial.
- **R3 (1.25 h):** `qscore/reference/corpus.yaml` (pinned list), `services.build_reference`, `record/reference.py` (quantiles, bands, schema `qscore.reference/v0.1` in `schemas/`), CLI `reference build`. Build the first `corpus-qscore-2026.2.json` on the laptop (CPU; estimated ≤ 20 min for ~100 items on FakeTorino) and ship it under `src/qscore/reference/`.
- **R4 (30 min):** `score/reference.py::place(card, corpus)`, the report lines (20 §5–§6), and tests: band edges, `n < 5`, missing corpus → no block + report note, wording snapshot.

## 3. Justification (evidence, not opinion)
- **Benchpress measures exactly two output numbers per transpile test** (Qiskit gym, `benchpress/qiskit_gym/utils/io.py`, read 2026-10-11): `output_gate_count_2q = count_ops().get(two_qubit_gate)` and `output_depth_2q = depth(filter_function=name == two_qubit_gate)`, after `generate_preset_pass_manager(OPTIMIZATION_LEVEL, BACKEND)`. `default.conf`: `backend_name = 'fake_torino'`, `[qiskit] optimization_level = 2`, basis `cz`. qscore's default target is also FakeTorino, so the convention block costs one extra compile and gives a number directly comparable with the Benchpress paper's Qiskit results.
- **The full Benchpress suite is out of reach and off-purpose.** README: "a full execution of all the SDKs requires a system with 96+Gb of memory"; "Running the full suite of tests will easily take a week or more if executed in serial"; it compares 8 SDKs. qscore scores a researcher's circuit; it does not rank SDKs.
- **qscore currently uses optimization level 3 over 8 seeds** (`compile/pipeline.py: OPTIMIZATION_LEVEL = 3`; 04 §2 `transpiler_seeds`). Without the convention block, a researcher comparing with Benchpress tables would compare different settings without knowing it.
- **QASMBench defines the circuit-property metrics** that qscore partly implements ("gate density, retention lifespan, measurement density, and entanglement variance", README; it also lists SupermarQ features per benchmark). QASMBench small = 42 and medium = 25 circuits locally at `357b942`. Its licence (Battelle/PNNL, BSD-style) permits redistribution; we ship only derived statistics anyway.
- **The F1 demo runs show the corpus is scorable today:** QASMBench `adder_n10` and the MQT Bench ghz/qft/cdkm builders scored complete on 2026-10-10. MQT Bench needs the `_version.py` stub until ChP-0039 `qscore deps`, so the corpus builder writes that stub explicitly in its source folder and records that it did.
- Practice: Benchpress itself reuses QASMBench circuits ("compares SDKs' abilities to generate QASMBench…", README). MQT Bench offers the same algorithms at several abstraction levels. Placing a circuit against these public suites is how the papers present results.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is (citations in `docs/metrics.md` only) | No work | Numbers stay context-free; settings silently differ from Benchpress | The user asked for a unified standard, not citations |
| Run Benchpress's Qiskit gym as-is | Exact Benchpress numbers | pytest-benchmark harness, hours of runtime, unseeded, measures SDK speed | Wrong question for a researcher's circuit |
| Switch qscore's compile to level 2 / single seed | One number, Benchpress-identical | Loses best-of-N and D02; changes every score (score-version bump); worse results | Convention block gives comparability without changing scoring |
| Placement by algorithm family (user declares `family: qaoa`) | Fairer comparison | New manifest field; most user circuits match no family | Later extension; width bands work for every circuit and are labelled honestly |
| Compute the corpus at install time | Always current | Network and ~20 min at install | Ship a versioned file; rebuild on each score-version bump |

## 5. Impact analysis
| Area | Impact (write "none" explicitly where none) |
|---|---|
| MVP scope and tiers | none (post-MVP feature F3) |
| Gates and timeline (hours) | ~3.5 h (R1 1 h, R2 0.75 h, R3 1.25 h, R4 0.5 h) + ~20 min corpus build |
| Contracts / schemas / stored data (Neon, Hub) | Scorecard gains `x-reference` (extension key, no version bump); new document schema `qscore.reference/v0.1`; stored scorecards unchanged |
| Other specs and sections that must change | new 20; 04 §3 extension table + new §15; 05 §11 new command row; README index; 15 build plan (R1–R4); 06 §5 `docs/metrics.md` links to the standard |
| Modules and public functions | new `score/reference.py`, `record/reference.py`, `services.build_reference`, `cli reference build`, `schemas/reference.py`; `score/engine.py` calls the block; `record/report.py` renders placement |
| Tests and golden values | New unit/e2e tests; golden values unchanged (the convention block is not a metric). Corpus file is data, regenerated by command, not person-set golden values |
| Score version (metrics/thresholds) | none (no metric or threshold changes); the corpus is keyed by score version, so a bump needs a rebuild (the report says when it is missing) |
| Fallback registry | none (missing corpus → no placement, stated in the report; that is the defined behaviour, not a fallback) |
| Overall architecture (hosts, data flow, security) | `reference build` clones two pinned public repos (maintainer-only, network); scoring itself stays offline. Corpus builders run in the sandbox like any builder |
| Sponsor tracks / demo | Demo line: "your circuit vs public benchmarks, measured the way IBM's Benchpress measures" |
| Cost (GPU credits, HF credits, time) | +1 compile per item (level 2, one seed; ≈ 1/8 of the current compile cost); no GPU |

## 6. Risks and rollback
- *Misreading percentiles as quality.* Mitigated by the §6 wording rule and a one-line caveat in every report.
- *Width bands mix algorithms.* Stated in the report, and `n` is always shown.
- *Benchpress changes its settings.* The block records the Benchpress commit it follows; the R1 table is re-checked when we bump it.
- *Corpus build fails on some circuits* (Q301, missing deps). Failed entries are listed in the corpus file with their issue codes and left out of the statistics, never silently dropped.
- Rollback: delete `x-reference` writing and the command; scorecards stay valid (extension key); the standard document can stay as documentation.

## 7. Decision
- Decided by: user · Date: 2026-10-10 ~21:55 EDT · Outcome: approved ("I approve that direction") · Notes: spec text and R1–R4 to follow
- Applied to specs in: — · CHANGELOG line added: no
