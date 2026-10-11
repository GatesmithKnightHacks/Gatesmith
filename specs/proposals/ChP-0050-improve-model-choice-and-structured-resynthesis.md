# ChP-0050: `qscore improve --model` + 10 §4 structured resynthesis in the reference layer

- **Status:** approved
- **Class:** A (CLI surface: new `--model` flag). The reference-layer part is alignment with 10 §4 (class B, lead).
- **Author:** lead · **Date:** 2026-10-11 06:40 UTC
- **Related tasks:** ChP-0049 slice (T24/T25 downscaled) · **Blocks:** nothing (implemented in the uncommitted ChP-0049 slice, experimental)
- **Decision needed by:** before the judged demo, so the CLI shown matches the spec

## 1. Summary
(1) Add `--model <id>` to `qscore improve`, picking one model pinned in `improve/models.yaml` (the ★ default when omitted). This lets you compare pinned models without editing YAML. (2) The ChP-0049 `reference-qiskit` `block_resynthesis` handler ran only level-3 on the region. It now also runs the handlers 10 §4 already specifies (`synth_cnot_count_full_pmh` for linear blocks, `synth_clifford_full` for Clifford blocks). It also drops level-3 outputs whose permutation was elided into `layout.final_layout`. (3) A1 evidence: commutation-aware routing is not worth building now.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/05-pipeline.md` §CLI table, `qscore improve` row
- Before:
  > `qscore improve --item ID --layers reference-qiskit,local`
- After:
  > `qscore improve --item ID --layers reference-qiskit,hf [--model MODEL_ID]`. `--model` applies to `hf` only and must name a model pinned in `improve/models.yaml`, otherwise exit 4 (ConfigError). It is never a switch made at run time: the record carries the model id.
- File/section: `specs/10-improvement-loop.md` §4, `block_resynthesis` row: append
  > Level-3 resynthesis of the region (fixed seed) is also proposed. An output whose permutation level 3 elided into `layout.final_layout` is not a candidate.

### 2.2 Implementation sketch (done, uncommitted)
- `services.improve_once(..., model: str | None = None)`: unknown id → `ConfigError("… not pinned …")`; `model` with a non-hf layer → `ConfigError`.
- `cli.improve --model`.
- `improve/reference_qiskit.py`: `structured_synthesis(region)` (gate-name check: linear ⊂ {cx, swap}, Clifford ⊂ fixed Clifford set), then translation to the target basis with `optimization_level=1`. This gives up to 2 distinct proposals, and `version` becomes `rq-2026.2`.
- Tests: `tests/unit/improve/test_hf_layer.py` adds 3 tests (model pinning, 10 §4 synthesis, elided permutation).

## 3. Justification (evidence)
- `lab/20261011-commuting-routing/NOTES.md`: on sidechain QAOA (12 q, FakeTorino), SwapStrategy + Commuting2qGateRouter gave a 2q-gate minimum of 434 against 321 for level 3, about 35 % worse. A2 is dropped by the user's decision (2026-10-11).
- `lab/20261011-improve-eval/`: using level 3 only, the reference layer never improved anything. With the 10 §4 handlers:
  - The synthetic `seed_cx_parity` case dropped from 7 to 1 two-qubit gates.
  - QASMBench `fredkin_n3` dropped from 12 to 10 (−17 %).
  - Both whole circuits were checked Operator-equivalent by an independent script, and both results reproduce over 20 fresh seeds (`check_improved.py`).
- Level 3 on a pure SWAP region returned an empty circuit with `final_layout` [1,0,…]. The verifier rejected it ("qubit counts differ"), so the layer should not have proposed it.
- The ★ model (gpt-oss-120b) returned `{"candidates": []}` on every region tried, so comparing models needs a selector.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is | No change | Comparing models means editing the `default:` flag in YAML. | Error-prone; the flag is explicit and recorded. |
| Env var for the model | No CLI change | Hidden configuration | Less visible than a flag |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (MVP done; experimental T1 slice) |
| Gates and timeline (hours) | none; about 0.5 h, already spent |
| Contracts / schemas / stored data | none. `improve-once.json` already records the layer version. The hf call records already carry the model. |
| Other specs and sections that must change | 05 CLI table, 10 §4 row (text above) |
| Modules and public functions | `services.improve_once` (new kw), `cli.improve`, `improve/reference_qiskit.py` |
| Tests and golden values | +3 unit tests; no golden values |
| Score version (metrics/thresholds) | none |
| Fallback registry | none: no automatic model switch, and an unknown model fails loudly |
| Overall architecture | none |
| Sponsor tracks / demo | Helps the demo: a verified, reproducible improved circuit on a real benchmark |
| Cost | HF: about $0.001 per call |

## 6. Risks and rollback
Clifford synthesis can be longer than the input, but the 08 §4 strictly-better decision rejects such candidates. Rollback: remove the flag and the `structured_synthesis` call.

## 7. Decision
- Decided by: user · Date: 2026-10-11 02:35 EDT · Outcome: approved · Notes: "I approve both"
- Applied to specs in: 05 CLI table, 10 §4 (uncommitted, 2026-10-11) · CHANGELOG line added: yes
