# CP-0015: Pin the example generators exactly (QAOA energies/encoding, S-box MMD variant)

- **Status:** approved (spec text to apply)
- **Class:** A (fixtures that define golden values)
- **Author:** lead (from Codex review F-40 + lab/20261010-0453-qiskit-api-check `sbox_mmd.py`) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T03 · **Blocks:** T03 generators and the two *record + approve* golden values derived from them
- **Decision needed by:** before T03

## 1. Summary
Both example generators leave choices open that change the circuits, hashes and golden values: the QAOA fixture fixes the RNG seed but not the energy distributions, draw order, which residue pairs interact, or the initial state; the S-box generator says "transformation-based (MMD)" without the variant (basic vs bidirectional) or bit order — basic MMD gives **25 Toffolis per S-box (100 total)**, other variants give different counts.

## 2. Proposed change
### 2.1 Spec text (exact)
`14` §3.1 add:
> Energies: `rng = numpy.random.default_rng(20261009)`; self energies `E_i(r) = rng.uniform(-1, 1)` drawn in order `i = 0..n−1, r = 0..R−1`; then pair energies `E_ij(r,s) = rng.uniform(-0.5, 0.5)` for **adjacent residues only** (`j = i+1`), drawn in order `i, r, s`. Qubit index `q(i,r) = i·R + r`. Initial state: `h` on every qubit. Cost layer order: all `rz` terms in qubit order, then `rzz` terms in lexicographic `(q1, q2)` order; mixer `rx(2·beta[k])` on every qubit; cost angles `rz(2·gamma[k]·h_q)`, `rzz(2·gamma[k]·J_qq')`. Measurements: none (intent `expectation`).
`14` §3.2 add:
> MMD variant: **basic (unidirectional, output side)** MMD, rows processed `i = 0..15`, bits LSB-first, gates applied to the outputs and emitted in reverse; S-box *k* acts on data qubits `4k..4k+3` (bit 0 = qubit `4k`), ancilla `16+k`; 3-control gates decomposed as stated. Expected per S-box: 2 X, 5 CX, 7 CCX, 6 C3X → 25 CCX.

The resulting `sbox_oracle` `toffoli_count` = **100** is then a *record + approve* golden value (computed by `lab/20261010-0453-qiskit-api-check/sbox_mmd.py`; to be reproduced by `tools/make_sbox.py`).

### 2.2 Implementation sketch
`examples/sidechain_qaoa/src/packing/qaoa.py`, `tools/make_hamiltonian.py`, `tools/make_sbox.py` exactly as above.

## 3. Justification
`14` §3.1 "generated deterministically from a fixed seed" admits many circuits (F-40); D01/D03 expectations depend on which pairs interact. Lab run: basic MMD on the PRESENT S-box = {0 ctrl: 2, 1: 5, 2: 7, 3: 6}, self-verified on all 16 inputs.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Leave to the implementer, approve whatever comes out | No spec work | Golden values depend on an unreviewed choice | R6 |
| All-pairs interactions for QAOA | Denser → D01/D03 surely fire | 66 RZZ per layer at 12 q; bigger circuits | Adjacent pairs match side-chain packing physics; can revisit with data |
| Bidirectional MMD | Fewer gates | Leaves less for `reversible_rewrite` to find in the demo | Demo value |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none (removes ambiguity from T03) |
| Contracts / stored data | none |
| Other specs | `14` §3.1–3.2; `06` §4 sbox row gets the provisional number for approval |
| Modules | example generators only |
| Tests and golden values | Fixes the generator; sbox golden 100 proposed for approval |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Demo's D01/D03 expectation becomes checkable |
| Cost | none |

## 6. Risks and rollback
If adjacent-only interactions do not trigger D03 (≥6 ops on ≥4 qubits under the `qaoa` profile `min_ops: 4`), that is reported as a finding (`14` §3.1), not tuned away.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
