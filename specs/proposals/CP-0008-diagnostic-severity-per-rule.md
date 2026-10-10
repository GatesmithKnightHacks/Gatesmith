# CP-0008: Severity function for every diagnostic rule (D03, D05, D09, D10 expectation)

- **Status:** approved (spec text to apply)
- **Class:** A (thresholds/severity, score version)
- **Author:** lead (from Codex review F-27) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T14, T20 · **Blocks:** T14 (rule severity tests)
- **Decision needed by:** before T14

## 1. Summary
Severity is defined as `(value − threshold)/threshold` for "≥" rules, but D03 (two criteria), D05 (a range), D09 (two alternative criteria) have no single scalar, and D10's "CI upper bound below the criterion" is the wrong direction for expectation error (larger is worse).

## 2. Proposed change
### 2.1 Spec text (exact)
Add to `07` §2 after the severity bullet:
> Per-rule margin: **D03** `min((ops − min_ops)/min_ops, (qubits − min_qubits)/min_qubits)` for the largest run; **D05** always `warning` (a structural opportunity, not a magnitude); **D09** `high` if both criteria fire, else `warning`; **D10** for `known_output`/`distribution`: `high` when the CI **upper** bound < criterion, else `warning`; for `expectation`: `high` when the CI **lower** bound of `abs_error` > `task.tolerance`, else `warning`.

### 2.2 Implementation sketch
`diagnose/rules.py` per-rule `severity()`; boundary tests per `07` §6.

## 3. Justification
`07` §1 D03 "≥ 6 two-qubit ops on ≥ 4 qubits"; D05 "3–9 qubits"; D09 "…, or …"; D10 expectation fires on `abs_error > tolerance` — the stated "upper bound below the criterion" test is inverted for it.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep spec | — | Implementer invents severities → score-version drift | R1 |
| All non-scalar rules `warning` | Simplest | D03 is a demo rule; loses "high" | Partial |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~10 min T14 |
| Contracts / stored data | none |
| Other specs | `07` §2 |
| Modules | `diagnose/rules.py` |
| Tests and golden values | Boundary tests per rule; no golden values |
| Score version | Part of the initial `qscore-2026.1` definition (nothing scored yet), same choice as CP-0007 |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Demo shows D01 high / D03 severity consistently |
| Cost | none |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
