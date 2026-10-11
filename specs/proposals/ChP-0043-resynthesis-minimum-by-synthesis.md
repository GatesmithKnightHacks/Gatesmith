# ChP-0043: `resynthesis_potential` takes the KAK minimum from the synthesized block, not `num_basis_gates`

- **Status:** approved, applied
- **Class:** A  (how a metric is computed — 00-operating-rules.md R5)
- **Author:** lead · **Date:** 2026-10-11 02:15 UTC
- **Related tasks:** F1 (found on a new repo, QED-C), M2 · **Blocks:** nothing (the wrong values stay visible until fixed)
- **Decision needed by:** before any demo that shows D04. Today D04 can fire **high** on blocks that cannot be reduced.

## 1. Summary
For SWAP-class two-qubit blocks, Qiskit 2.5.2's `TwoQubitBasisDecomposer.num_basis_gates(U)` returns 0 at some global phases. The same decomposer synthesizes those blocks with 3 gates. Routed SWAPs produce exactly these blocks, so `resynthesis_potential` overcounts and D04 reports savings that don't exist. Fix: take the minimum as the two-qubit gate count of `decomposer(U)`.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/06-metrics.md` §2.3, row `resynthesis_potential`
- Before:
  > … of `current two-qubit gates in the block − TwoQubitBasisDecomposer(<target's 2q gate>).num_basis_gates(block unitary)`. …
- After:
  > … of `current two-qubit gates in the block − (two-qubit gates in TwoQubitBasisDecomposer(<target's 2q gate>)(block unitary))`, i.e. the count of the exact KAK synthesis (basis fidelity 1). (`num_basis_gates` is not used: in Qiskit 2.5.2 it returns 0 for SWAP-class blocks at some global phases; ChP-0043.) …

### 2.2 Implementation sketch
`metrics/opportunities/structure.py::block_potential`: replace `decomposer.num_basis_gates(Operator(block).data)` with `decomposer(Operator(block).data).count_ops().get(two_qubit_gate, 0)`. Add a regression test: the 3-CZ SWAP-class block from `lab/kak-num-basis-gates/repro.py` → potential 0 at all four global phases. The golden value (`cx(0,1); cx(0,1)` → 2) is unchanged.

## 3. Justification (evidence, not opinion)
`lab/kak-num-basis-gates/NOTES.md` (2026-10-10). Block Weyl coordinates are (π/4, π/4, π/4); `num_basis_gates` gives 0, 3, 3, 0 across the four phase choices U·det^-1/4·iᵏ; synthesis gives 3. On 2,000 Haar-random unitaries the two never disagree, so this is an edge case. On real routed circuits, though, it decides the outcome. On the QED-C GroversSearch n=5 compile, the potential is 15 (D04 high) via `num_basis_gates` and 0 via synthesis, which takes 0.08 s.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is | none | False high D04 findings on routed circuits | Wrong output |
| Normalise the phase before `num_basis_gates` | Fast | Relies on undocumented behaviour; k=0 and k=3 both fail, so there is no safe single normalisation | Fragile |
| Weyl-coordinate rule of our own | No synthesis | Reimplements Qiskit internals with our own tolerances | More code, more risk |

## 5. Impact analysis
| Area | Impact (write "none" explicitly where none) |
|---|---|
| MVP scope and tiers | none (fixes an MVP metric) |
| Gates and timeline (hours) | ~20 min |
| Contracts / schemas / stored data (Neon, Hub) | none (same field, correct values) |
| Other specs and sections that must change | 06 §2.3 row; `docs/metrics.md` (regenerated from the docstring) |
| Modules and public functions | `metrics/opportunities/structure.py::block_potential` |
| Tests and golden values | New regression test; golden values unchanged |
| Score version (metrics/thresholds) | Changes values → needs a bump. **Recommendation:** fold it into `qscore-2026.2` (introduced today by ChP-0041, not yet committed or released) instead of bumping again |
| Fallback registry | none |
| Overall architecture (hosts, data flow, security) | none |
| Sponsor tracks / demo | Removes false "high" D04 findings from demos |
| Cost (GPU credits, HF credits, time) | Negligible: one 2q synthesis per block, ~0.1 s per circuit |

## 6. Risks and rollback
A future Qiskit that fixes `num_basis_gates` changes nothing here, because synthesis was always right. Rollback: restore the one line. Optionally report the bug upstream (the user's call: it's an outward-facing action).

## 7. Decision
- Decided by: user · Date: 2026-10-10 ~22:15 EDT · Outcome: approved ("Yes I approve those changes") · Notes: folded into `qscore-2026.2` as recommended
- Applied to specs in: uncommitted on `lead/post-mvp`, 2026-10-11 · CHANGELOG line added: yes
