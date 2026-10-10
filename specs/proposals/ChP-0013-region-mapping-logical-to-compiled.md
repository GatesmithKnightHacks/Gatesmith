# ChP-0013: Mapping regions between logical and compiled circuits (qubits via layout; gates via re-detection)

- **Status:** approved (spec text to apply)
- **Class:** A (diagnostics regions; request contents)
- **Author:** lead (from Codex review F-34) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T14, T16 · **Blocks:** T14 (`regions.py`), T16
- **Decision needed by:** before T14

## 1. Summary
`TranspileLayout` maps **qubits** (initial/final permutations), not gate indices or layers; level-3 optimization deletes, merges and reorders gates. The spec says logical regions map to compiled positions "only through the recorded `TranspileLayout`", which cannot produce compiled gate indices/layers.

## 2. Proposed change
### 2.1 Spec text (exact)
`07` §3 — Before:
> Logical-scope regions are mapped to compiled positions only through the recorded `TranspileLayout`; never by guesswork.
After:
> A region keeps the scope where its finding was detected. **Qubits** are mapped logical ↔ physical only through the recorded `TranspileLayout` (initial layout; final layout for outputs). **Gate indices and layers are never mapped across scopes**: a logical-scope region (D03, D05, D08) carries logical gate indices/layers only, and its compiled footprint is reported as the physical qubits only (`compiled_qubits`). Compiled-scope regions (D01, D04, D06) are detected on the compiled circuit. Requests are cut from the circuit named by the region's scope.
D01 region: "the compiled layers containing the representative compile's SWAP-derived gates" is replaced by "the physical qubit pairs with the most SWAPs in `route_only` (qubits only; whole-circuit request, see ChP-0002)".

### 2.2 Implementation sketch
`Region` gains optional `compiled_qubits`; `regions.region_for` per scope; no cross-scope gate mapping code.

## 3. Justification
Qiskit `TranspileLayout` exposes `initial_index_layout`, `final_index_layout`, `routing_permutation` (lab `api_check.out`) — qubit maps only. `07` §1 D01 region "layers/qubits where SWAPs were inserted (from `route_only`, mapped to the representative compile via layout)" needs gate correspondence that does not exist after optimization.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Track operation provenance through custom passes | Precise | Requires instrumenting Qiskit passes; large effort | Time |
| Heuristic matching by gate type/qubits | Quick | Guesswork (R3) | Forbidden |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | Saves time in T14 |
| Contracts / stored data | `Region.compiled_qubits` optional (pre-freeze) |
| Other specs | `07` §1 D01 region text, §3; `04` §3 region example; `06` §6 pitfall line |
| Modules | `diagnose/regions.py`, `improve/requests.py` |
| Tests and golden values | Region tests per scope; no golden values |
| Score version | Regions are part of findings; initial definition (as ChP-0007) |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Demo highlights the D03 region on the logical circuit (unchanged) |
| Cost | none |

## 6. Risks and rollback
Compiled-circuit highlight for D03 shows qubits only; acceptable for the demo.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
