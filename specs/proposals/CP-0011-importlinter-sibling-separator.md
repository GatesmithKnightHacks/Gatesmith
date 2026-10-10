# CP-0011: `.importlinter` — use `:` (not `|`) for siblings that may import each other

- **Status:** approved
- **Class:** A (module boundaries)
- **Author:** lead (from Codex review F-04 + lab/20261010-0503-importlinter-siblings) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T00, T06 and every later task · **Blocks:** T00 creates `.importlinter` (it will pass on the empty package either way; the problem appears from T07 on)
- **Decision needed by:** T00 (so the file is right from the start)

## 1. Summary
`03` §2 prose: "Within a layer, modules may import siblings only if no cycle results." The contract uses `|`, which import-linter treats as **independent** siblings — no imports between them at all. Verified: `qscore.metrics | qscore.sim` with `metrics` importing `sim` → BROKEN; with `:` → KEPT.

## 2. Proposed change
### 2.1 Spec text (exact)
`03` §2 — Before (each sibling line):
> `qscore.cli | qscore.worker | qscore.api | qscore.ui`
> `qscore.manifest | qscore.intake | qscore.validate | qscore.interpret | qscore.score | qscore.record | qscore.bench`
> `qscore.targets | qscore.compile | qscore.metrics | qscore.sim | qscore.diagnose | qscore.verify | qscore.improve`
> `qscore.schemas | qscore.hardware | qscore.config | qscore.errors | qscore.logging`
After: same lines with `:` instead of `|`, keeping `|` only for the interface line (`qscore.cli | qscore.worker | qscore.api | qscore.ui` — interfaces never import each other). Add: "Sibling cycles are prevented by Python import errors at test time plus a `tests/contract/test_no_import_cycles.py` using `grimp` (installed with import-linter) to assert the package-level import graph within each layer is acyclic."
Also the Foundations rule "Import nothing else from qscore" becomes: "import nothing from higher layers; `schemas`, `config`, `hardware` may import `errors`/`logging`".

### 2.2 Implementation sketch
T00 writes `.importlinter` with `:`; `tests/contract/test_no_import_cycles.py` (dev-only, grimp).

## 3. Justification
`lab/20261010-0503-importlinter-siblings/NOTES.md`. import-linter docs: `|` = independent layers, `:` = non-independent.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep `|` | Strictest | Forbids needed imports (`metrics`→`sim`, `score`→`metrics`, `validate`→`manifest`); every task fails lint | Unworkable |
| Split layers further | Finer contract | Large redesign before G1 | Time |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none (+5 min) |
| Contracts / stored data | none |
| Other specs | `03` §2 |
| Modules | `.importlinter` only |
| Tests and golden values | +1 contract test; no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | Layering rule preserved (downward only); siblings allowed as the prose already says |
| Sponsor tracks / demo | none |
| Cost | none |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
