# CP-0003: Declare data/ancilla qubits for `reversible_function` items

- **Status:** approved (spec text to apply)
- **Class:** A (manifest contract)
- **Author:** lead (from Codex review F-08) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T01, T03, T23, T24 · **Blocks:** T01 (`Invariants` model), T03 (sbox yaml)
- **Decision needed by:** before T01

## 1. Summary
Classical verification must enumerate inputs on data qubits with ancillas fixed at 0 and check ancillas return to 0, but the manifest never says which qubits are data and which are clean ancillas. The S-box item (20 qubits, 16 data + 4 ancillas) cannot be verified "over all 2¹⁶ inputs" without it.

## 2. Proposed change
### 2.1 Spec text (exact)
- `04-contracts.md` §2.1 `reversible_function` row, Requires — Before:
  > Only `x`, `cx`, `ccx`, `swap` (and `measure` at the end)
- After:
  > Only `x`, `cx`, `ccx`, `swap` (and `measure` at the end); `invariants.io: {data: [qubit indices], ancillas: [qubit indices]}` (required; disjoint; union = all qubits). Inputs enumerate `data` (≤ 24 bits for the classical rung); `ancillas` start at 0 and must end at 0; outputs are read from `data` (in place).
- §2.2 add row: "`invariants.io` | Required for `reversible_function`; disjoint, covers every qubit, indices < width (Q104 missing, Q103 invalid)."
- §2 example `sbox_oracle`: `invariants: {intent: reversible_function, final_permutation: forbidden, io: {data: [0..15], ancillas: [16, 17, 18, 19]}}` (exact indices fixed by the generator in T03).
- `08-verification.md` §2 step 2: "number of input bits" := `len(io.data)`.

### 2.2 Implementation sketch
`schemas/manifest.py`: `ReversibleIO` model + validator; `verify/equivalence.reversible_check(a, b, io)`.

## 3. Justification
`08` §2 step 2 requires "ancillas initialised to 0 and required to return to 0"; `04` and `14` §3.2 never identify them. Without the declaration the verifier would either enumerate 2²⁰ inputs (wrong: ancillas non-zero) or guess.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep spec | — | Unimplementable as stated | — |
| Infer ancillas (qubits that end where they start for all inputs) | No manifest field | Guessing — R3 forbids; also wrong for in-place functions | R3 |
| Optional field, default "all data" | Backward compatible | S-box needs it anyway; default hides mistakes | No silent defaults |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~10 min T01, T03 |
| Contracts / stored data | `qscore.project/v0.2` `Invariants.io` (pre-freeze) |
| Other specs | `04` §2/§2.1/§2.2, `08` §2, `14` §3.2 |
| Modules | `schemas/manifest.py`, `validate/semantic_checks.py`, `verify/equivalence.py` |
| Tests and golden values | New broken fixture for missing `io` (uses Q104); no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Required for demo step 5 (S-box verification) |
| Cost | none |

## 6. Risks and rollback
None significant.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
