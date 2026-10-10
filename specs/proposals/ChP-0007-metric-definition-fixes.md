# ChP-0007: Metric definition fixes (expectation score range, estimator shots, simulation seeds, zero cases, objective-capable metrics)

- **Status:** approved (spec text to apply)
- **Class:** A (metric definitions; score version stays `qscore-2026.1` because nothing has been scored yet — see §5)
- **Author:** lead (from Codex review F-12, F-13, F-14, F-25, F-26, F-36) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T01, T13, T14, T19, T20, T23 · **Blocks:** T13 (seed_spread, scalability), T20 (simulated_task_score); T01 only for the objective-capable flag
- **Decision needed by:** before T13

## 1. Summary
Several definitions in `06` are mathematically incomplete or contradictory: the expectation score can be negative or divide by zero; `EstimatorV2` has no shot semantics; simulation seeds ignore the manifest's `seed_simulator` and differ between original and candidate (breaking "shared seeds"); `seed_spread` and the scalability fit have zero/degenerate cases; `scalability` is "deterministic" but dict-valued, so validation accepts it as an objective; the property test "metrics never negative" contradicts routing overhead.

## 2. Proposed change
### 2.1 Spec text (exact)
1. `06` §2.4 `simulated_task_score`, expectation — Before: "`expectation` → `1 − |E_noisy − E_ideal| / Σ|coeff|`". After: "`expectation` → `max(0, 1 − |E_noisy − E_ideal| / (2·Σ|coeff_non-identity|))` (the identity term's coefficient cancels in the difference; `2·Σ|c|` bounds the difference, so the score is in [0, 1] and the clamp never binds). An observable with no non-identity terms → `unavailable` ('observable is constant')."
2. Same row, trials: "Each trial measures **simulated shots**: for `expectation`, sample `task.shots` shots per Pauli-basis group (Aer `SamplerV2` / `AerSimulator.run(shots=…)`) and estimate E from counts; `EstimatorV2` is used only for the ideal reference `E_ideal` (`precision=0`). For `known_output`/`distribution`, counts from `task.shots` shots per trial. Trials differ only in `seed_simulator`."
3. `09` §4 Seeds — Before: "`seed_simulator` = `int(sha256(item_sha256 + ":" + job_index).hexdigest()[:8], 16)`". After: "trial *k* of a metric on item *i* uses `seed = int(sha256(f"{execution.seed_simulator}:{baseline_item_sha256}:{metric_id}:{k}").hexdigest()[:8], 16)`. Candidates of item *i* reuse the **baseline's** item hash, so original and candidate share seeds (`08` §2 step 6)."
4. `06` §2.2 `seed_spread`: "median = 0 → value 0.0 if all counts are 0, else `unavailable` ('median two-qubit count is zero')."
5. `06` §2.4 `scalability`: "sizes whose count is 0 are excluded from that fit (listed in evidence); fewer than 3 distinct `n` with positive counts → that fit's `b`/`r2` are `null` and the metric is `unavailable` if both fits are null. D09 needs both `b` values non-null for the exponent rule; the monotonic-overhead rule needs ≥ 3 sizes."
6. `06` §1 add to `Metric` protocol: `objective_capable: bool` (true only for scalar-valued deterministic/heuristic/statistical metrics). `04` §2.2 `objective.primary` and `constraints[]` — Before: "Must be a registered metric id with `kind` deterministic or statistical". After: "Must be a registered metric with `objective_capable = true` (Q103)." (`scalability` is false.) Also note: `reliability_heuristic` is `heuristic` but used as a default constraint — `objective_capable` replaces the kind check for constraints.
7. `14` §2 property row — Before: "metrics never negative". After: "count metrics never negative; `routing_overhead` ≤ 1 (may be negative, tested by a dedicated case)".

### 2.2 Implementation sketch
`metrics/research/simulated.py`, `sim/tasks.py` (seed function in one place), `metrics/hardware/seeds.py`, `metrics/research/scalability.py`, `metrics/base.py`, `schemas/manifest.py` validator.

## 3. Justification
- Observable `Z`, E_ideal = +1, E_noisy = −1 → `1 − 2/1 = −1` ∉ [0,1] (F-12).
- Aer `EstimatorV2` defaults to exact expectation (`precision` 0) → identical trials, CI of width 0, while the manifest specifies `shots` (F-13).
- Candidate `item_sha256` ≠ baseline's ⇒ different seeds, contradicting `08` §2 step 6 "with shared seeds" (F-14); `04` `execution.seed_simulator: 1234` is otherwise unused.
- `04` §2.2 accepts `scalability` (deterministic, dict) as objective; `06` §1 value convention forbids it (F-25). The default constraint `reliability_heuristic` is `heuristic`, which the current rule would reject.
- `06` §2.2 says routing overhead "may be slightly negative"; `14` §2 says "metrics never negative" (F-36).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep spec | — | Negative "scores"; zero-width CIs; seed mismatch | Breaks D10 and acceptance stats |
| Normalise by `Σ|coeff|` and clamp at 0 | Closer to old text | Clamp hides magnitude for large errors | Factor 2 is the exact bound |
| Use Estimator `precision` for shot noise | One call | Gaussian approximation, not shots | Honest numbers |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~30 min T13/T20 |
| Contracts / stored data | `Metric.objective_capable`; nothing stored yet |
| Other specs | `06` §1/§2.2/§2.4, `09` §4, `04` §2.2, `08` §2 step 6, `14` §2, `07` D09 text |
| Modules | listed in §2.2 |
| Tests and golden values | New edge-case tests; **no golden value changes** (all §4 rows unaffected) |
| Score version | Definitions change before any scorecard exists. Proposal: keep `qscore-2026.1` and record this ChP in the CHANGELOG as part of the initial definition. If you prefer strictness, bump to `qscore-2026.2` — say which |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | D10 and the AMD differential tests become meaningful |
| Cost | Shot sampling is cheaper than or equal to density-matrix runs; no GPU budget change |

## 6. Risks and rollback
Shot-based expectation for 12-qubit Hamiltonians needs one circuit per commuting Pauli group — more circuits per trial. Grouping via `SparsePauliOp.group_commuting(qubit_wise=True)`.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
