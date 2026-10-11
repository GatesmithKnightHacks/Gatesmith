# ChP-0049: Downscaled `hf` layer — one verified round (experimental), plus C39/C45 review fixes

- **Status:** approved (user directive 2026-10-11 ~01:40 EDT: "downscale the HF layer … completed by 3AM; the improvement mechanics don't have to be set out completely; a small aspect of the loop is ideal") — spec text applied 2026-10-11 (03, 05, 08, 10 §5, CHANGELOG; user: "I approve everything"); T24/T25 stay open. As built, the round also re-scores logical splices and writes `improve-once.json` + `improved/<item>.qasm` (05 CLI row), superseding the "no acceptance, no re-score" wording of §1/§2.1
- **Class:** A (scope of T25, new CLI behaviour, dev dependency)
- **Author:** lead · **Date:** 2026-10-11 ~06:00 UTC
- **Related tasks:** T23, T24, T25 · **Blocks:** nothing

## 1. Summary
Ship an **experimental slice** of the improvement loop with the `hf` layer of ChP-0048: score one item, build its requests, send the first region request to the ★ pinned model once, and verify every candidate exactly on its region. No acceptance, no re-score, no multi-round loop. The full loop (T24) and the rest of T25 stay open with their current spec.

## 2. Proposed change
### 2.1 What is built (matches 10 §5/§6 except where noted)
- `improve/models.yaml`: the four pinned `model:provider` entries of 10 §5, plus `default: true` on the ★ entry (the spec marks ★ only in a table).
- `improve/prompts.py`: `PROMPT_VERSION = "p-2026.1"`, comment stripping, `render(request)`, `candidate_schema(max)`. **No few-shot examples** yet (10 §6 asks for two). *Superseded: p-2026.3 adds them (ChP-0052).*
- `improve/hf_layer.py`: `HfLayer` — one call per request with `response_format` json_schema strict, `temperature 0`, `max_tokens 2048` (*superseded: 8192, ChP-0051*), timeout `layer_timeout_s`; strict parse (no repair); bad QASM / wrong width / extra candidates dropped and recorded; 429/5xx/timeout/connection → ≤ 3 attempts with backoff then `LayerError`; 400/401/403 → `LayerError` at once; privacy guard + region-only; `hf_max_calls` / `hf_max_cost_usd` → `HfBudgetExhausted`; `CallRecord` per call. **Not built:** catalog check (`GET /v1/models`) and `qscore models check`.
- `verify/equivalence.py::region_operator` — only the 08 §2 "region requests" rung (≤ 12 qubits, convex region, `method: region_operator`); candidate with measure/reset → `failed`; global phase per invariants. Rest of T23 unchanged/open. Note: 08 §2 says `Operator.equal`; Qiskit has no such method — exact equality is `Operator.__eq__` (used).
- `services.try_hf_once(manifest, item, out)` and CLI **`qscore improve MANIFEST --item ID [--layers hf] [--out DIR]`**, labelled EXPERIMENTAL; any other `--layers` → exit 4. Output `<out>/hf-once.json`: request, proposals, verification per candidate, region size before/after (2q count, size, depth), call record (never the token). Compiled-scope regions reject gates outside the target basis (10 §9).
- Config: `HF_TOKEN` (`SecretStr`), `hf_max_calls` 30, `hf_max_cost_usd` 1.00, `layer_timeout_s` 60.
- Dev group gains `openai>=1.50` so recorded-response tests run in the default environment (`uv run` removes extras). openai 3.x uses `httpx2`, not `httpx`.

### 2.2 Review fixes for ChP-0039 / ChP-0045 (independent review, 2026-10-11)
- `.qscore` added to the discovery skip set (spec 03 intake/discover row + 05 §2 need the same word): `qscore deps` puts a venv under `<root>/.qscore/`, which discovery otherwise walks.
- `check_relative_constraint` refuses `kind: statistical` metrics (`VerificationError`; 08 §4 interval rule applies) and non-numeric factors.
- Minor review items (error class of interpreter failures, previous-venv retention message, shown install argv, proxy variables, deps hint test, positive-pick empty tokens, exact manifest diff test): **fixed 2026-10-11** with tests (see progress-log). Strict-primary tests stay with T24.

## 3. Justification
User time limit (3 AM) and request for a small working piece of the loop. Evidence: `tests/unit/improve/test_hf_layer.py` (17 recorded-response cases), stub end-to-end on `sidechain_qaoa` with external inference on: 1 of 2 candidates verified (`region_operator`), junk QASM recorded, call cost estimated.

## 4. Alternatives considered
| Option | Why not chosen |
|---|---|
| Full T23+T24+T25 (~9–13 h) | Not possible by 3 AM |
| HF layer without any loop | User asked for a small aspect of the loop |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (MVP done); T24/T25 remain open |
| Contracts / schemas | none (proposal v0.2 reused; `hf-once.json` is an experimental, unversioned output) |
| Other specs | 05 §11 `qscore improve` row (positional manifest, experimental); 03/05 skip list (`.qscore`); 08 §2 `Operator.equal` wording; 10 §5 `default` field |
| Modules | improve/{hf_layer,prompts,models.yaml}, verify/equivalence, services, cli, config, discover, improve/loop |
| Tests | +17 hf tests, +2 constraint tests, discover skip case |
| Live smoke | `-m llm` not run: needs `HF_TOKEN` from the user |
