# CP-0018: Spec consistency fixes (no behaviour change)

- **Status:** approved (spec text to apply)
- **Class:** B (documentation consistency; behaviour as already intended) — the spec edits still need the user's edit permission
- **Author:** lead (lab/20261010-0453-qiskit-api-check, own reading, Codex F-42) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T02, T05, T11, T17, T24 · **Blocks:** nothing
- **Decision needed by:** any time; lead decision recorded in `progress.md`

## 1. Summary
Small textual inconsistencies that an implementer could trip on.

## 2. Proposed change (spec text)
| # | Where | Before | After | Evidence |
|---|---|---|---|---|
| 1 | `03` §1 tree | `neon/ 0001_init.sql, 0002_roles.sql, ...` | `neon/ 0001_init.sql, 0002_functions.sql, 0003_roles.sql` | `11` §3.1–3.2 |
| 2 | `03` §3.3 `validate/catalog.py` | `CATALOG (codes in 05-pipeline.md §9)` | `… §12` | `05` §12 is the catalog |
| 3 | `03` §3.4 `improve/reference_qiskit.py` | Handlers for `layout_search`, `routing_search`, `commutation_aware_routing`, `block_resynthesis` | + `noise_aware_layout`, `reversible_rewrite` (all six of `10` §4) | `10` §4, T24 "all six strategies" |
| 4 | `05` §6.1 FakeTorino basis | `cz, rz, sx, x, plus measure/reset/delay` | `cz, rz, sx, x, id, plus measure/reset/delay and control-flow ops (for_loop, if_else, switch_case)`; scorecard `target.basis` lists gate ops only | lab `api_check.out` (qiskit-ibm-runtime 0.50.0) |
| 5 | `13` §3.2 upload | `huggingface-cli upload …` | `hf upload …` (huggingface_hub ≥ 1.0) | F-42; `huggingface-cli` removed in huggingface_hub 1.0 |
| 6 | `18` watchlist add | — | "`mqt.qcec` `EquivalenceCriterion` lives in `mqt.qcec.pyqcec`; record `.name`, not `str()`" | lab `qcec_check.out` |

## 3. Justification
See Evidence column.

## 4. Alternatives considered
Keep as is — leaves traps for delegates.

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none |
| Contracts / stored data | none |
| Other specs | `03`, `05`, `13`, `18` as listed |
| Modules | none |
| Tests and golden values | none |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | none |
| Cost | none |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
