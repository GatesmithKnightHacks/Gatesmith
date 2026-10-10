# CP-0026: Simulation metrics listed in MVP scorecards; SupermarQ undefined cases → 0

- **Status:** approved and applied (user, 2026-10-10 "Go ahead with changes")
- **Class:** A (metric definition edge cases; scorecard contents)
- **Author:** lead · **Date:** 2026-10-10 15:45 UTC
- **Related tasks:** M2 (CP-0023) · **Blocks:** nothing
- **Decision needed by:** G-MVP (scorecard snapshot stability)

## 1. Summary
(a) The MVP build has no `sim/`, so `simulated_task_score` and `mirror_score` were absent from `metrics[]`, which 04 §3 forbids ("never blank"). They now appear in every scorecard with an explicit status and reason. (b) SupermarQ's source divides by zero for some trivial circuits; the port made the metric `failed` (partial scorecard, exit 3). Those features are now defined as 0.0, matching how the same source already treats parallelism.

## 2. Proposed change
### 2.1 Spec text (exact)
- `specs/06-metrics.md` §2.4, add after the table:
  > **MVP build (CP-0023, CP-0026):** `sim/` is final product. Until it exists, `simulated_task_score` is `unavailable` with reason "intent has no task" when the intent has no task, otherwise "simulation is not in the MVP build (CP-0023)"; `mirror_score` is `skipped` ("not selected") for items whose intent has a task, otherwise `unavailable` ("simulation is not in the MVP build (CP-0023)").
- `specs/06-metrics.md` §2.3 `supermarq_profile` row, append:
  > Where a feature's formula divides by zero (program communication with < 2 qubits; entanglement ratio with no gates; liveness or measurement with depth 0), the feature is 0.0 and the case is listed in `evidence.undefined_as_zero` (CP-0026).

### 2.2 Implementation sketch
- `metrics/research/simulated.py`: `SimulatedTaskScore`, `MirrorScore` (metadata per 06 §2.4; `compute` returns the statuses above; no simulation code). Registered in `metrics/registry.py`.
- `metrics/base.ScoringContext` + `score/context.py`: `has_task: bool` (intent has a task).
- `metrics/opportunities/supermarq.py`: undefined → 0.0, recorded in evidence.

## 3. Justification
- 04 §3: "`MetricResult.status` … Never blank"; `metrics[]` "one entry per selected metric". 06 §1: `unavailable` "only when a declared requirement is absent" — SIMULATION is a declared requirement, and the MVP build cannot meet it.
- Lab `lab/20261010-1535-supermarq-features/NOTES.md`: SupermarQ source raises ZeroDivisionError in these cases and returns 0 for parallelism in the analogous case.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep sim metrics absent | No code | Violates 04 §3 "never blank"; readers can't tell they exist | User chose the change |
| Keep undefined features `failed` | Literal port | A 1-qubit or empty circuit gives a partial scorecard and exit 3 | User chose the change |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (no simulation built) |
| Gates and timeline | +15 min |
| Contracts / schemas / stored data | none (statuses already in the schema) |
| Other specs | 06 §2.3, §2.4 text above |
| Modules | `metrics/research/simulated.py` (new), `metrics/registry.py`, `metrics/base.py`, `score/context.py`, `metrics/opportunities/supermarq.py` |
| Tests and golden values | new unit tests; no golden value changes |
| Score version | stays `qscore-2026.1`: `supermarq_profile` was introduced in this same unreleased version; no scorecard was published with the old behaviour |
| Fallback registry | none (0.0 is a definition recorded in evidence, not a substitute for a failure) |
| Architecture / demo / cost | none |

## 6. Risks and rollback
Final product: when `sim/` lands, replace the MVP-build reasons with the real computation (T20). Rollback: delete the two classes and restore the raises.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "Go ahead with changes"
- Applied to specs in: 06 §2.3 and §2.4, 2026-10-10 (uncommitted); code + tests same day · CHANGELOG line added: no
