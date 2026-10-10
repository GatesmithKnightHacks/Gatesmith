# ChP-0001: Verification ladder correctness (GPU tolerance, global phase, QCEC mapping and timeout, mutation test)

- **Status:** approved (spec text to apply)
- **Class:** A (verification rules)
- **Author:** lead (from Codex review F-05, F-06, F-07, F-09, F-10, F-11 + lab/20261010-0453-qiskit-api-check) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T23, T24 · **Blocks:** T23 (verify/), not T00–T22
- **Decision needed by:** start of T23 (P3); no earlier work depends on it

## 1. Summary
Six defects in `08-verification.md` would let the ladder report `passed` for non-equivalent circuits or crash on valid QCEC outputs: the GPU trace test is too loose, `Operator.equal` does not exist, three rungs ignore `global_phase: exact`, two QCEC outcomes are unmapped, QCEC's timeout is not a hard limit, and one mandated mutation test is not a mutation.

## 2. Proposed change
### 2.1 Spec text (exact)
- `08-verification.md` §2 step 4 — Before:
  > check `|Tr(U)| / 2ⁿ ≥ 1 − 1e-9` (identity up to phase)
- After:
  > compute `V = U / (Tr(U)/|Tr(U)|)` (removing the global phase only when `global_phase: ignore`; otherwise `V = U`) and require `max_ij |V_ij − δ_ij| ≤ 1e-8` (entrywise; double precision). Record the observed max deviation in `evidence.max_abs_dev`. This is a numerical equivalence check with a stated tolerance; label the method `gpu_unitary_fp64` and say "numerically exact to 1e-8" in docs.
- §2 "Global phase" — Before:
  > otherwise use `Operator.equal` (exact including phase).
- After:
  > otherwise compare `Operator(a) == Operator(b)` (Qiskit's `__eq__`, default `atol=1e-8`, `rtol=1e-5`) on the reduced circuits. Every rung honours the phase invariant: step 3 uses `.equiv` only under `ignore`; step 4 as above; step 5 maps `equivalent_up_to_global_phase` to `passed` only under `ignore`, and to `failed` under `exact`. Because QCEC's default configuration reports a pure global-phase difference as `equivalent` (lab experiment), QCEC is not used for `global_phase: exact` above 15 qubits → `unsupported`.
- §2 step 5 — Before:
  > mapping: `equivalent`, `equivalent_up_to_global_phase` → `passed`; `not_equivalent` → `failed`; `probably_equivalent`, `no_information`, timeout → `inconclusive`. Default timeout 60 s
- After:
  > mapping (all 7 `mqt.qcec.pyqcec.EquivalenceCriterion` members; record `.name`): `equivalent` → `passed`; `equivalent_up_to_global_phase` → `passed` under `global_phase: ignore`, else `failed`; `equivalent_up_to_phase` (relative phases differ — **not** equivalent) → `failed`; `not_equivalent` → `failed`; `probably_not_equivalent` → `inconclusive` (no counterexample proof); `probably_equivalent`, `no_information`, timeout → `inconclusive`. An unknown member raises `VerificationError`. QCEC runs in a child process killed at `timeout_s + 5 s` (hard deadline); QCEC's own `timeout=timeout_s` is also passed. A kill is `inconclusive` with `evidence.killed = true`.
- §6 Reversible test — Before:
  > S-box layer vs the same layer with one Toffoli control swapped → `failed`
- After:
  > S-box layer vs the same layer with one Toffoli control **replaced by a different data qubit** (and, separately, a control exchanged with the target) → `failed` with the counterexample input.
- Add to §6: "**Local phase:** a 15-qubit identity with one diagonal entry `exp(0.001i)` → `failed` on the GPU rung."

### 2.2 Implementation sketch
`verify/equivalence.py`: `gpu_unitary_identity(a, b, phase)` returns max deviation; `operator_equiv(a, b, allow_permutation, phase)`; `qcec_check` wraps `mqt.qcec.verify` in `multiprocessing` (spawn) with join timeout. `.claude/rules/verification.md` line on QCEC updated to the 7-outcome mapping.

## 3. Justification
- F-05: at 15 qubits, `|Tr|/2ⁿ` for identity with one entry `exp(0.001i)` = 0.9999999999847416 ≥ 1 − 1e-9 (reproduced locally) → a wrong circuit passes.
- F-06: `hasattr(Operator, "equal")` is `False` in qiskit 2.5.2 (reproduced).
- QCEC 3.11.0 `EquivalenceCriterion` has 7 members incl. `equivalent_up_to_phase`, `probably_not_equivalent` (lab `qcec_check.out`); `verify(X, e^{0.5i}X)` returns `equivalent`.
- F-09: `Operator(ccx(0,1,2)).equiv(Operator(ccx(1,0,2)))` is `True` (reproduced) — the mandated "mutation" is equivalent, so the test would wrongly expect `failed`.
- F-11: QCEC docs describe `timeout` as best-effort; the loop budget needs a hard bound.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec | No work | Passes wrong circuits; crashes on 2 QCEC outcomes | Violates "exact" status semantics |
| Tighten trace bound to 1e-14 | One-line change | Below FP64 accumulation noise at 2¹⁵ terms → false failures | Not robust |
| Entrywise deviation (chosen) | Detects local phases; tolerance meaningful | Needs the full matrix (already computed) | — |
| Treat `probably_not_equivalent` as `failed` | Conservative for acceptance | `failed` means a counterexample was found (§1) | Status semantics |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~30 min in T23 (subprocess wrapper, extra tests) |
| Contracts / stored data | `VerificationResult.evidence` gains `max_abs_dev`, `killed` (free-form evidence dict; no schema change) |
| Other specs | `08` §2, §3 table note, §6; `.claude/rules/verification.md`; `18-risks` watchlist line on QCEC enum location |
| Modules | `verify/equivalence.py`, `verify/ladder.py` |
| Tests and golden values | New: local-phase GPU test, QCEC 7-outcome mapping, hard-timeout kill test; reversible mutation redefined. No golden values |
| Score version | none (verification is not a metric) |
| Fallback registry | none |
| Architecture | none (child process on the same host) |
| Sponsor tracks / demo | Strengthens the demo's "verifier proves equivalence" claim |
| Cost | none |

## 6. Risks and rollback
1e-8 entrywise may be tight for very deep 15-qubit circuits in FP64; measure on the W7900 in S2 and propose a different bound with data if needed. Rollback = previous text (known unsound).

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
