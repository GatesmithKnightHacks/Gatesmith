# CP-0012: When the plan is final (pre- vs post-compile) and per-method crossover

- **Status:** approved (spec text to apply)
- **Class:** A (pipeline stage semantics, `Plan`/`HardwareProfile` contracts)
- **Author:** lead (from Codex review F-33, F-41) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T10, T15, T18a/b, T19 · **Blocks:** T10 (`plan` output), T19 (planner)
- **Decision needed by:** before T10

## 1. Summary
The user confirms a plan before compile (`05` §5), yet simulation memory must be sized from active qubits **after routing** (`09` §2), which only exists after compile. Also, the planner needs a crossover "for that method/precision" but the profile stores crossover per precision only and measures statevector only.

## 2. Proposed change
### 2.1 Spec text (exact)
- `05` §5 add: "The confirmed plan uses **pre-compile estimates**: active qubits = logical width (lower bound) and, for routed targets, an upper bound `min(target qubits, 2 × logical width)`; GPU memory checks use the upper bound and say so. After compile (stage 6), the planner recomputes from real active qubits. Reconfirmation is required only if a planned metric would change device or become `skipped`/`unaffordable`; otherwise the final plan is recorded in the run record next to the confirmed one."
- `04` §9 Plan: add `basis: estimate|final` and per metric `active_qubits_used`.
- `04` §11 profile — Before: "`crossover_qubits {single, double}`". After: "`crossover_qubits {statevector: {single, double}, density_matrix: {double}|null}`". `09` §3: "`unitary` (verification) always GPU at 13–15 q by the ladder (`08`), not by crossover; `density_matrix` without a measured crossover → GPU when available (design rule, recorded)."
- `09` §5 item 3 adds density-matrix timing at 8–14 qubits.

### 2.2 Implementation sketch
`sim/planner.plan(items, profile, basis)`; `interpret/summary` shows "estimate"; `score/engine` re-plans after compile.

## 3. Justification
`05` §5 "Never: starts compute before confirmation" vs `09` §2 "Plan from the compiled circuit's active qubits" (F-33). `09` §3 `choose_device` per method/precision vs `04` §11 per precision (F-41).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Compile before confirmation | Exact plan | Violates "nothing runs before confirm"; compile is minutes on FakeTorino | Principle 2 |
| Plan only from logical width | Simple | Underestimates GPU memory after routing | Unsafe |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~20 min T10/T19; +a few minutes of profiler time in S2 |
| Contracts / stored data | `Plan.basis`, `MetricPlan.active_qubits_used`, profile crossover shape (pre-freeze) |
| Other specs | `04` §9/§11, `05` §5, `09` §3/§5 |
| Modules | `sim/planner.py`, `hardware/profiler.py`, `interpret/summary.py`, `score/engine.py` |
| Tests and golden values | Planner unit tests (`09` §2 tables unchanged); no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Confirm screen labels estimates honestly |
| Cost | negligible |

## 6. Risks and rollback
Upper bound 2× may be loose; it only affects affordability warnings.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
