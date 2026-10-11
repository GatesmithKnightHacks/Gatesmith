# Improvement loop — what we tried, what worked, what didn't (2026-10-11)

This file collects every attempt to make `qscore improve` produce a verified, measured improvement.
It covers the deterministic layer, the HF model layer, prompting, alternative strategies and HF-hosted
synthesis models. Detailed evidence lives in `lab/` (workspace, not this repo); paths are given per section.
Specs: `specs/10-improvement-loop.md`, `specs/08-verification.md`; proposals ChP-0048–0052.

## 1. The pipeline (as built, experimental — ChP-0049)

```
qscore improve qscore.yaml --item ID --layers hf|reference-qiskit [--model ORG/MODEL]
```

score (manifest seeds, target) → findings → region requests (`improve/requests.py`) → one layer proposes
region rewrites → permitted-change / coupling check → **exact region verification** (`verify/equivalence.py`,
Operator comparison) → splice into the circuit → **re-score** with the manifest seeds → accept only if strictly
better on the primary objective and every constraint holds (08 §4) → write `improved/<item>.qasm` and
`improve-once.json`, which records every call, candidate, claim, verdict and cost.

- Default objective: `two_qubit_count` (minimize). Constraints: `two_qubit_depth ≤ baseline` and
  `reliability_heuristic ≥ baseline`.
- Layers:
  - `reference-qiskit` (`improve/reference_qiskit.py`): deterministic. Linear blocks → `synth_cnot_count_full_pmh`,
    Clifford blocks → `synth_clifford_full`, plus Qiskit level-3 on the region.
  - `hf` (`improve/hf_layer.py`): 4 pinned open-weight models via HF Inference Providers (`improve/models.yaml`),
    strict JSON schema, temperature 0, call/cost budget, prompt `p-2026.3` with two verified few-shot rewrites
    (`improve/prompts.py`).
- One round only, no multi-round loop. Model claims (`equivalent: true`, estimates) are recorded and never trusted.

## 2. Results summary

| Attempt | Where | Outcome |
|---|---|---|
| `reference-qiskit` on 16 QASMBench small + 2 examples | `lab/20261011-improve-eval/full-ref` | **fredkin_n3 12 → 10 two-qubit gates (−17 %)**, verified, reproduces on 20 fresh seeds; all other circuits no gain |
| `reference-qiskit` on synthetic seeded cases | `…/seeded-ref2` | seed_cx_parity 7 → 1 (synthetic, never presented as a benchmark) |
| `hf`, prompt p-2026.2, 4 models | `…/full-hf` | 14 candidates, 0 verified, 0 improved; many unparsed replies |
| `hf`, p-2026.3 + few-shot + max_tokens 8192, 2 runs | `…/hf3a`, `…/hf3b` | 0 unparsed (non-groq); 44 / 46 candidates; 1 verified per run (no gain); **0 improved** |
| `hf` live re-run on fredkin_n3, all 4 models (06:00, this session) | scratch | gpt-oss-120b and gpt-oss-20b: empty lists; DeepSeek: 6 candidates, all non-equivalent; Qwen: 5 candidates, 1 equivalent and no gain |
| A1 commutation-aware routing | `lab/20261011-commuting-routing` | 434 vs 321 two-qubit gates (35 % **worse** than level 3) → dropped |
| `reversible_rewrite` passes (InverseCancellation + CommutativeCancellation) | `…/seeded/probe_rr.py` | synthetic only (38 → 18 on one seed case); QASMBench: no change → not built |
| HF RL synthesis models (`Qiskit/ai-transpiler_cliffords`, `_linear-functions`) | `lab/20261011-hf-ai-synthesis` | Large gains on big synthetic CNOT networks (−36…−87 % after compile); **no gain on any of the 68 QASMBench circuits** → not integrated |

Totals across the 3 eval runs: **104 model candidates. 102 were non-equivalent and all were caught by exact
verification. 2 were equivalent but not better. 0 false improvements shipped.** Total HF spend ≈ $0.13.

## 3. Details and lessons

### 3.1 Deterministic layer (`reference-qiskit`)
- 6 of 18 circuits produced at least one request (adder_n4, fredkin_n3, toffoli_n3, basis_trotter_n4, simon_n6, sbox_oracle).
  22 candidates, 21 verified. The one rejection was a level-3 output with an elided final permutation; it was caught, and the layer now filters such outputs.
- The fredkin gain comes from *compiler sensitivity*: rewriting a 2-CX Clifford region into native gates
  (same region 2q count) lets the whole-circuit level-3 compile find a result 2 gates cheaper. It is real and
  reproducible, but it is not a smarter region.
- Common outcome: Qiskit level 3 is already locally optimal for the regions our diagnostics flag. qscore reports "no gain" rather than inventing one.

### 3.2 HF model layer
- Format problems, all fixed:
  - Reasoning models (gpt-oss) use 4.5–6.4k reasoning tokens, so `max_tokens` went to 8192 (ChP-0051).
  - The groq HTTP 400 is `json_validate_failed`, now recorded with `finish_reason` and the provider code.
  - Few-shot examples (ChP-0052) took unparsed replies to 0 for 3 of the 4 models.
- Remaining format issue: gpt-oss-20b on groq still fails intermittently with `json_validate_failed`. The cause is unconfirmed.
- **Correctness is the blocker.** Models cannot do exact unitary bookkeeping, even on a 6-CX linear block where
  a 1-CX answer exists:
  - Typical errors: adding H gates to "convert CX to CZ" without undoing them, and claiming "2 CX → 1 CZ" on non-reducible blocks.
  - The default gpt-oss-120b often returns an empty list, which is honest but useless.
- Framing for judges: the HF layer is safe, budgeted, auditable plumbing (pinned models, recorded cost, exact
  verification), ready for stronger models. It is not an optimizer today.

### 3.3 Why small regions limit everything
The request regions our diagnostics produce are small: 2–6 two-qubit gates on 2–4 qubits. Real circuits interleave
rotations and Toffolis, which cut Clifford/linear blocks to 2–3 gates. Qiskit's synthesis is already near-optimal at that size,
so neither models nor RL synthesis can beat it there.

### 3.4 HF-hosted RL synthesis (IBM, arXiv 2405.13196)
- **Setup:** run locally on CPU with `qiskit-gym 0.4.1` / `twisterl 0.5.1`, using the line-topology models.
  `qiskit-ibm-transpiler 0.18.0` does not import on Qiskit 2.5.2.
- **Random targets** (10 per model, on the model's own coupling map): the RL output won all 40 against Qiskit synthesis + level 3, using 40–60 % fewer CX.
  All outputs were equivalent.
- **Through the qscore compile** (FakeTorino, level 3, 8 seeds):
  - 5-qubit linear blocks: −77…−87 %.
  - 8-qubit linear blocks: −36…−52 %.
  - Dense Cliffords: mixed.
- **Whole-circuit test on 68 QASMBench small+medium circuits:**
  - Only vqe_n4 had blocks the RL model shrank, and after compile the count was unchanged (9 → 9).
  - Forcing every replacement made results worse (cat_state_n4 3 → 7, basis_test_n4 6 → 19).
- **Integration cost** (class A ChP needed):
  - Torch dependency.
  - `huggingface-hub<0.35` conflicts with the `hf` extra (`>=1.0`).
  - Model choice depends on region size and topology.

### 3.5 Teammate branch (`origin/platform-integration`, github-app PR #4)
It contains a separate `hf_layer.py` (an adapter with budget, catalog validation and retries, but no verification and no loop) and a lab check
(`lab/20261011-real-score-hf-request`) showing that a real scorecard → request → HF adapter produced one schema-valid,
unverified proposal from Qwen3-Coder-30B. Its proposal numbers ChP-0049–0053 collide with this branch's. It is not merged:
reconcile it with the verified pipeline here, renumbering one side's proposals.

## 4. What might work next (not done)
1. **Diagnostics for larger regions.** Add a 3-qubit non-Clifford redundancy rule (collect 3q blocks → unitary → detect identity /
   2q-reducible), and allow larger Clifford/linear regions. This is the precondition for any layer, model or RL, to show gains.
2. **RL synthesis layer** (`Qiskit/ai-transpiler_*`) once regions are larger. Use an isolated env or uv extra conflicts for the dependencies;
   verification stays unchanged.
3. **Stronger models** in the `hf` layer, or tool use (let the model call a synthesis function rather than writing QASM).
4. Multi-round loop (T24) and the T23 verify-ladder blockers (see `progress.md`).

## 5. Reproduce
```bash
cd qscore
uv run qscore improve <manifest> --item fredkin_n3 --layers reference-qiskit --out out/ref      # 12 → 10
HF_TOKEN=… uv run qscore improve <manifest> --item fredkin_n3 --layers hf --model Qwen/Qwen3-Coder-30B-A3B-Instruct --out out/hf
```
Use the fredkin manifest from `lab/20261011-improve-eval/full-ref/work/fredkin_n3/qscore.yaml` (QASMBench small, with
`privacy.external_inference: true` for `hf`). Eval harness: `lab/20261011-improve-eval/run_eval.py`; independent check:
`check_improved.py`.
