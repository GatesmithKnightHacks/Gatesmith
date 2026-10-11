# ChP-0041: `reliability_heuristic` and D06 when a compiled operation is calibrated as faulty (error ≥ 1)

- **Status:** approved, applied
- **Class:** A  (metric definition and its value range; D06 rule input — 00-operating-rules.md R5)
- **Author:** lead · **Date:** 2026-10-11 01:15 UTC
- **Related tasks:** F1 demo runs (repo link → diagnostics) · **Blocks:** nothing (the metric fails loudly meanwhile)
- **Decision needed by:** before the F1 demo; any circuit that routes over a dead coupler gets `reliability_heuristic: failed` and a `partial` card (exit 3).

## 1. Summary
FakeTorino's calibration snapshot marks 22 `cz` couplers with `error = 1.0` (faulty). A compiled circuit that uses one makes `math.log1p(-1.0)` raise `ValueError: math domain error`. The metric then fails, the card becomes `partial`, and `qscore score` exits 3. Mathematically the product `∏(1 − e)` is exactly 0, but the spec's range is (0, 1] and the evidence (`−log(1 − e)` per qubit/edge) is infinite. This proposal defines the faulty case explicitly.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/06-metrics.md` §2.2, row `reliability_heuristic`
- Before:
  > `exp(Σ log(1 − e_op))` over compiled gates and measurements with error data (`target[op_name][qargs].error`; `None` or 0 for virtual `rz` contributes nothing). Evidence: per-qubit and per-edge contributions of `−log(1 − e)`, the five largest contributors, `ops_without_error`. … | probability-like (0, 1] | COMPILED, CALIBRATION |
- After:
  > `exp(Σ log(1 − e_op))` over compiled gates and measurements with error data (`target[op_name][qargs].error`; `None` or 0 for virtual `rz` contributes nothing). **An operation with `e ≥ 1` is faulty (the backend calibration marks it unusable): the value is exactly 0; faulty operations are listed in evidence `faulty_ops` (`[{op, qargs, error, count}]`, sorted by qargs) and left out of the per-qubit/per-edge contributions, and `total_neg_log` is `null`. `e > 1` is not a valid error rate: the metric fails with `ValueError` naming the op and qargs.** Evidence: per-qubit and per-edge contributions of `−log(1 − e)`, the five largest contributors, `ops_without_error`, `faulty_ops`. … | probability-like **[0, 1]** (0 only with faulty ops) | COMPILED, CALIBRATION |
- File/section: `specs/07-diagnostics.md` §1, row D06
- Before:
  > One qubit or edge carries `≥ 25 %` of total `−log reliability`
- After:
  > One qubit or edge carries `≥ 25 %` of total `−log reliability`, **or the compiled circuit uses a faulty operation (`faulty_ops` non-empty; severity high; evidence lists every faulty op with its count; region: the faulty qubits/edges)**

### 2.2 Implementation sketch
- `metrics/hardware/reliability.py`: split ops into `faulty` (`e ≥ 1`) and normal; raise `ValueError(f"error {e} > 1 for {op} on {qargs}")` for `e > 1`; value `0.0` when `faulty` is non-empty, otherwise unchanged; evidence gains `faulty_ops`; `total_neg_log = None` with faulty ops. `reliability_from_ops` gets the same rule (it is also used by `sim/` cross-checks).
- `diagnose/rules.py` D06: fire on `faulty_ops` first (high), otherwise the existing 25 % rule computed over the non-faulty contributions.
- Tests: unit tests with a synthetic target (one `cz` with error 1.0 → value 0, `faulty_ops` listed, D06 high; error 1.2 → failed); e2e: the qopt `run/hw_native_test_1_circ.py` case is not a fixture (external repo). Instead, add a builder fixture compiled with `initial_layout` onto a FakeTorino faulty edge (15,19).

## 3. Justification (evidence, not opinion)
- Demo run 2026-10-11 01:14Z: `qscore score` on qiskit-community/qopt-best-practices `run/hw_native_test_1_circ.py::qaoa_circ` (a 127-qubit hardware-native QAOA problem, parameters bound from a values file) → card `partial`, `reliability_heuristic` `{status: failed, error: ValueError "math domain error"}`, exit 3.
- Checked with `FakeTorino().target`: 22 `(cz, qargs)` entries have `error == 1.0` (e.g. (15,19), (19,20), (21,34), (57,58), (86,87), (97,110)). The compiled circuit uses 11 of them, 6 times each, because the problem graph needs nearly every heavy-hex edge and Sabre routing does not avoid high-error edges.
- IBM's calibration convention: an error of 1.0 marks a gate as non-operational. The product rule (mapomatic "expected fidelity", MQT Predictor) gives 0 for such a circuit, which is the honest answer: it would not run usefully on that device snapshot.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is | No change | Any circuit that touches a dead coupler gets a failed metric + partial card; a Python traceback is the only explanation | Fails on real research circuits; message is unhelpful |
| Clamp `e` to `1 − ε` | Finite evidence | Invents a number; hides the fault | Forbidden (defaults that hide failures, R3) |
| Drop faulty ops from the Target before compiling (as IBM runtime does for real backends) | Compiler avoids dead couplers; scores match what a real job would see | Changes compilation and every FakeTorino score (score version bump); the library behaviour must be checked in `lab/` first; a fully connected problem may then not fit at all | Larger change; can follow as its own proposal after a lab check. This proposal is needed either way for custom calibrations |
| Metric fails with a typed, explained message | Small | Still `partial`/exit 3 for a valid circuit | 0 is the defined value of the formula |

## 5. Impact analysis
| Area | Impact (write "none" explicitly where none) |
|---|---|
| MVP scope and tiers | none (MVP signed off; this fixes an edge case in an MVP metric) |
| Gates and timeline (hours) | ~1 h including tests |
| Contracts / schemas / stored data (Neon, Hub) | Metric evidence gains `faulty_ops`; `total_neg_log` may be `null` (evidence is free-form in the scorecard schema; no schema change). Stored scorecards: none change |
| Other specs and sections that must change | 06 §2.2 row, 07 §1 D06 row, `docs/metrics.md` reliability entry |
| Modules and public functions | `metrics/hardware/reliability.py`, `diagnose/rules.py` (D06) |
| Tests and golden values | New unit + e2e tests; golden values unchanged (no golden circuit touches a faulty op — to confirm when implementing) |
| Score version (metrics/thresholds) | Strictly a definition change → 04 §1 says bump to `qscore-2026.2`. No previously computed value changes (those cases failed before). **Lead recommendation: bump**, to follow the rule; user may waive |
| Fallback registry | none |
| Overall architecture (hosts, data flow, security) | none |
| Sponsor tracks / demo | Makes hardware-native research circuits score `complete` with a clear high finding instead of `partial` |
| Cost (GPU credits, HF credits, time) | none |

## 6. Risks and rollback
Risk: a value of 0 could be read as "the circuit is wrong" rather than "the device snapshot has dead couplers"; the D06 message and evidence must say which couplers and that the calibration marks them faulty. Rollback: revert the two functions; the metric fails again as today.

## 7. Decision
- Decided by: lead, under the user's explicit delegation ("For 41 42 I'll leave it to your discretion") · Date: 2026-10-11 · Outcome: approved · Notes: score version bumped to `qscore-2026.2`
- Applied to specs in: uncommitted on `lead/post-mvp`, 2026-10-11 · CHANGELOG line added: yes
