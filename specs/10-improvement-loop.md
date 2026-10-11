# 10 · The improvement loop: layers, model client, conformance, leaderboard

> **Status:** binding · **Tier:** 1 (the `reference-qiskit` layer and `services.improve_item()` are needed for G4; the request builder is Tier 0) · **Read:** before working on `improve/`, `services.improve_item()`, `space/`.

## 1. The standard in one sentence

The scorecard says what is wrong, the improvement request says what may change and how success is judged, and a proposal is the only thing a layer may return. The engine, not the layer, verifies and re-scores.

## 2. Layer protocol (`improve/protocol.py`)

```python
class ImprovementLayer(Protocol):
    name: str                      # "reference-qiskit" | "hf" | plugin names
    version: str
    def capabilities(self) -> list[str]: ...          # strategy ids it serves
    def propose(self, request: ImprovementRequest) -> list[Proposal]: ...
```

- Layers load from the `qscore.layers` entry-point group plus built-ins (`load_layers()`).
- A layer receives only the region unless `permitted.scope: whole`.
- A layer MUST NOT raise for "no idea": it returns `[]`. It MUST raise `LayerError` for infrastructure failures (connection refused, HTTP 5xx after bounded retries, timeouts); the loop records the failure in the attempt stream and continues with other layers (design rule, not a fallback).
- Proposals that fail to parse count against the layer's parse rate.

## 3. The loop (`services.improve_item()` + `improve/loop.py`)

```
baseline scorecard (round 0) ─┐
                              ▼
for round in 1..max_rounds:
    requests = build_requests(current scorecard, ctx, policy)      # top findings first (policy.rank)
    for each request, for each enabled layer serving its strategies:
        proposals = layer.propose(request)                           # ≤ max_proposals, ≤ layer_timeout_s
        for each proposal:
            parse → splice into current circuit → verify (08) → re-score with the same seeds → decide (08 §4)
            record attempt (accepted or not)  → local JSON, Hub parquet at job end
    if a candidate was accepted: current = best accepted; re-score and re-diagnose (new scorecard)
    if should_stop(history, budget): break
final: scorecard of the final circuit + attempts + diff vs baseline
```

- Candidates within a round are verified in **one batch** where possible (GPU unitary checks at 13–15 qubits are grouped by the planner).
- Model calls go to Inference Providers (no local model), so proposing never competes with GPU verification for memory.
- Budgets: `max_rounds`, `max_proposals` per request per layer, `layer_timeout_s` per call, `wall_time_s`, `gpu_time_s`; the first limit reached stops the loop with `stop_reason`.

## 4. `reference-qiskit` layer (`improve/reference_qiskit.py`) — deterministic

Wraps existing Qiskit passes; same input → same output. Handlers:

| Strategy | Implementation (★ default) | Output scope |
|---|---|---|
| `layout_search` | Re-run level-3 compile of the **whole** circuit with more seeds (the manifest's seeds × 4, derived deterministically) and, alternatively, `layout_method` ∈ {`sabre`, `dense`} with `VF2PostLayout`; return the best 1–3 distinct results | Whole (compiled) |
| `noise_aware_layout` | Same as above, scoring layouts by `reliability_heuristic` (mapomatic-style) | Whole (compiled) |
| `routing_search` | Re-route with `routing_method` ∈ {`sabre` (more trials), `lookahead`} on the representative layout | Whole (compiled) |
| `commutation_aware_routing` | For a D03 run: build a `SwapStrategy` for the coupling map (`SwapStrategy.from_line` on a line embedded in the device, or the device's own strategy) and route the commuting block with `Commuting2qGateRouter`; then compile the rest normally | Region (logical) → whole compiled |
| `block_resynthesis` | Clifford blocks: `synth_clifford_full` / greedy synthesis; linear blocks: `synth_cnot_count_full_pmh`; optionally IBM's AI synthesis passes (`qiskit-ibm-transpiler`, local mode) when installed (extra `[ai]`, later) | Region |
| `reversible_rewrite` | `InverseCancellation([XGate(), CXGate(), CCXGate(), SwapGate()])` + `CommutativeCancellation` restricted so output stays in `x/cx/ccx/swap` | Region or whole (logical) |

Every handler states its exact pass configuration in the proposal's `rationale` and `layer.version`.

## 5. The `hf` model layer (`improve/hf_layer.py`) `[T1]` (ChP-0048)

**What it is.** `HfLayer(entry)`, one instance per pinned model in `improve/models.yaml`: open-weight models through **Hugging Face Inference Providers**. No model runs on our hardware. Name `hf`; `version` = `hf-<PROMPT_VERSION>`; serves the strategies listed for the entry (default: `block_resynthesis`, `reversible_rewrite`, `commutation_aware_routing`; layout/routing strategies stay with `reference-qiskit`).

**Transport.** The `openai` Python SDK (extra `[hf]`) with `base_url = https://router.huggingface.co/v1` (setting `hf_router_base_url`) and `api_key = HF_TOKEN` (fine-grained token with "Make calls to Inference Providers"). The model string is always `"<org>/<model>:<provider>"`: the provider is **pinned**, never `:fastest`/`:cheapest`/auto, so structured-output behaviour and cost are stable and recorded.

**Pinned models (`improve/models.yaml`).** Entry fields: `id`, `provider`, `license` (from the model card; open weights only), `strategies`, `pricing_usd_per_mtok: {input, output}` (snapshot for estimates), `checked_at`. Panel checked 2026-10-11 (`GET /v1/models`: live, `supports_structured_output: true`; licenses from the model cards):

| ★ | Model : provider | License | Why |
|---|---|---|---|
| ★ | `openai/gpt-oss-120b:cerebras` | Apache-2.0 | Strong general reasoning; fastest throughput in the catalog |
| | `Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway` | Apache-2.0 | Code-specialised |
| | `deepseek-ai/DeepSeek-V4-Flash:deepinfra` | MIT | Strong and cheap |
| | `openai/gpt-oss-20b:groq` | Apache-2.0 | Small baseline (size/quality trade-off on the leaderboard) |

The demo uses the ★ model; leaderboard runs use the whole panel. Qiskit's own fine-tunes are not served by Inference Providers (catalog check 2026-10-11) and are out of scope.

**Catalog check.** Before its first call the layer fetches `GET /v1/models` once (bounded retries, then `LayerError`). If the pinned `id` is absent, or its `provider` is not `live` or lacks `supports_structured_output`, it raises `LayerError("<id>:<provider> not available: <reason>")`; it never substitutes another model or provider. `qscore models check` runs the same check for every entry (exit 0 all ok, 3 otherwise).

**One call per request.**
- Messages from `prompts.render(request)` (§6). `response_format = {"type": "json_schema", "json_schema": {"name": "qscore_candidates", "schema": <CandidateSet>, "strict": true}}`.
- `CandidateSet` = `{"candidates": [{"format": "openqasm3"|"openqasm2", "qasm": str, "rationale": str (≤ 600 chars), "estimate": number, "equivalent": bool}]}` with at most `max_proposals` items. The engine wraps each candidate into `qscore.proposal/v0.2`: `layer` (name, version, model, provider, prompt version), `candidate.scope = region`, `claims = {metric: objective.primary, direction from objective, estimate, equivalent}`. The model never writes ids, hashes or scope.
- `temperature = 0`, `max_tokens = 2048`, client timeout `layer_timeout_s` (default 60 s), SDK retries off (the layer owns retries).

**Parsing (no repair, R3).** The reply must be JSON valid against `CandidateSet`; each `qasm` must load with the OpenQASM 2/3 parsers used for uploads and have exactly the region's qubit count. A reply that fails → no proposals and one recorded failure; a candidate that fails is dropped and recorded; extra candidates beyond `max_proposals` are cut and recorded. No regex fixing, no re-asking, no second model.

**Verification and acceptance.** Unchanged: splice → verify (08) → re-score with the same seeds → decide (08 §4). Claims are shown, never trusted.

**Privacy guard.** The layer refuses unless `privacy.external_inference: true` for the item and the request scope is `region` → `LayerError("external inference disabled …")`. QASM comments are stripped from the region (§6).

**Budgets and cost.** Per job: `hf_max_calls` (default 30) and `hf_max_cost_usd` (default 1.00). Cost per call = response `usage` × the entry's pinned pricing, recorded as an **estimate** (provider billing is authoritative). Reaching a limit raises `HfBudgetExhausted` (a `LayerError`); the loop stops with `stop_reason: budget: hf calls|cost`.

**Errors.** 429/5xx/connection/timeout → up to 3 attempts with exponential backoff (R3.5), then `LayerError`; the loop records it and continues with other layers. Other HTTP errors (401/403/400) → `LayerError` at once. Anything unrecognised propagates. Never switch model or provider automatically.

**Logged per call** (`CallRecord`, copied into the attempt record): model, provider, prompt version, latency ms, prompt/completion tokens, cost estimate, retries, reply parsed, proposals, invalid candidates with reasons. Never the token.

**Client options (★):** ★ `openai` SDK with `base_url` (HF's documented OpenAI-compatible route) · `huggingface_hub.InferenceClient` (same router) · raw `httpx` · LiteLLM (extra dependency; not needed).

## 6. Prompts (`improve/prompts.py`) `[T1]`

- `PROMPT_VERSION = "p-2026.1"`; any change bumps it (class B; recorded on every attempt).
- `render(request) -> list[messages]`: system message (role, rules: output only JSON matching the schema, keep the gate set, never change measurements, region-only), user message with: the finding (rule, evidence), the region's OpenQASM 3, the qubit map, the target basis and coupling restricted to the region, the objective, permitted changes, invariants, and the proposal JSON Schema. Two short verified example rewrites (few-shot) from `reference-qiskit` outputs on fixtures.
- Prompts are data in code (no prompt text in the UI or DB except the version id).
- Prompt injection: request content comes from circuits (QASM comments could contain text). Strip QASM comments from region payloads before rendering.

## 7. Compatibility kit (`improve/conformance.py`, `qscore conform LAYER`) `[T1]`

`run_conformance(layer, fixtures) -> ConformanceReport`:
- Fixture requests (`tests/conformance/fixtures/*.json`, ≥ 12: each strategy × two sizes × both example items, plus malformed-edge cases).
- Checks: schema validity of every proposal; timeouts respected; scope rules (no qubits outside the region; measurements untouched); declared capabilities honoured.
- Rates: **parse rate** = proposals that parse ÷ proposals returned (a call that returns nothing counts as 0 of 1 for parse rate if the reply was non-empty garbage, and as "no proposal" otherwise); **verified rate** = passed ÷ parsed; **verified-improvement rate** = accepted ÷ requests attempted.
- A layer that meets the kit's minimums (schema-valid on all fixtures, no scope violations, timeouts respected) is "qscore-compatible" and joins the leaderboard. Rates are reported, not thresholded.
- Tests: both `reference-qiskit` and a recorded-response stub of a model layer pass; a deliberately broken layer (`tests/conformance/broken_layer.py`) fails.

## 8. Leaderboard and dataset `[T1]`

- `leaderboard.parquet` (`11-records-and-queue.md` §8) aggregates attempts per (layer, model, provider, prompt_version): requests, proposals, parse rate, verified rate, verified-improvement rate, median latency, tokens, cost estimate.
- After each `conform` or `improve` job the worker exports `leaderboard.parquet` and the job's attempts parquet to the Hub dataset (`11-records-and-queue.md` §7).
- The Space reads only `leaderboard.parquet` (`12-platform-ui-space.md` §5).
- Dataset card (`README.md` in the dataset repo): what an attempt is, fields, license (Apache-2.0 for our data; circuits from examples), how verification works, caveats (evidence vs proof), the qscore version and score version.

## 9. Pitfalls

- Models output OpenQASM 2 when asked for 3 (and vice versa): accept both via the same loaders, record the format; anything else is a parse failure.
- Gate names outside the target basis in model output: allowed for logical-scope regions (they get compiled), rejected for compiled-scope regions (permitted check).
- `splice` must respect the region's qubit map and convexity; test splice ∘ extract = identity on fixtures.
- Inference Providers' catalog and prices change: model ids and providers are pinned in `improve/models.yaml`, checked at layer start (`qscore models check` before a demo), and recorded per attempt.
- Provider latency varies; record it per call and keep `layer_timeout_s` explicit.
