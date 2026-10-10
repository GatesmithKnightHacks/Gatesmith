# 10 · The improvement loop: layers, model client, conformance, leaderboard

> **Status:** binding · **Tier:** 1 (the `reference-qiskit` layer and `services.improve_item()` are needed for G4; the request builder is Tier 0) · **Read:** before working on `improve/`, `services.improve_item()`, `space/`.

## 1. The standard in one sentence

The scorecard says what is wrong, the improvement request says what may change and how success is judged, and a proposal is the only thing a layer may return. The engine, not the layer, verifies and re-scores.

## 2. Layer protocol (`improve/protocol.py`)

```python
class ImprovementLayer(Protocol):
    name: str                      # "reference-qiskit" | "local" | "hf" | plugin names
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
            record attempt (accepted or not)  → Neon `attempts`, local JSON, Hub parquet at job end
    if a candidate was accepted: current = best accepted; re-score and re-diagnose (new scorecard)
    if should_stop(history, budget): break
final: scorecard of the final circuit + attempts + diff vs baseline
```

- Candidates within a round are verified in **one batch** where possible (GPU unitary checks at 13–15 qubits are grouped by the planner).
- Model layers and GPU verification alternate naturally (propose → verify); never run a GPU simulation batch while vLLM is generating if memory mode is `exclusive`.
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

## 5. Model layers via one OpenAI-compatible client (`improve/openai_compat.py`) `[T1]`

`OpenAICompatLayer(name, base_url, model, api_key_env, provider_label)`:

| Layer | `base_url` | Model (★ default) | Notes |
|---|---|---|---|
| `local` | `http://127.0.0.1:8000/v1` (vLLM on the W7900; llama-server if FB-02 is approved) | `Qiskit/granite-3.3-8b-qiskit` | Resident at 40 % GPU memory. The 14B `Qiskit/Qwen2.5-Coder-14B-Qiskit` (~30 GB) joins leaderboard runs only in `exclusive` mode (Tier 2). The 24B (~48 GB) does not fit. |
| `hf` | `https://router.huggingface.co/v1` (Inference Providers) | Chosen from the router's catalog at build time (record exact ids, e.g. a large open coder model); optional `:provider` suffix | Uses `HF_TOKEN`; spends the event's HF credits — track cost per attempt. |

- Same request, same prompt version, same budget for every model → comparable leaderboard rows.
- Temperature 0 (or the lowest the backend accepts), `max_tokens` capped (default 2048), `seed` when supported.
- **Structured output (★ options):** ★ JSON-schema-constrained output where the backend supports it (vLLM structured outputs / guided JSON; `response_format={"type":"json_schema",...}` where the router's provider supports it) · prompt-only JSON + strict parse · tool/function calling. Whatever is used, the reply is parsed against `qscore.proposal/v0.2`; failure → `parse_ok = false` (no repair, R3).
- **Privacy guard:** the `hf` layer refuses to run unless `privacy.external_inference: true` for the item and the request scope is `region`; it raises `LayerError("external inference disabled")` otherwise. `local` is not external.
- Log per call: model, provider, latency, prompt/completion tokens, cost estimate (HF), prompt version. Never log the token.
- **Bounded retries:** 429/5xx/connection reset → up to 3 attempts with exponential backoff (R3.5); then `LayerError`. Never switch to another model or provider automatically.

**Client options (★):** ★ `openai` Python SDK with `base_url` · `httpx` raw · `huggingface_hub.InferenceClient` (chat completions) · LiteLLM (extra dependency; not needed).

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

- Neon view `leaderboard` (`11-records-and-queue.md` §3) aggregates attempts per (layer, model, provider, prompt_version): requests, proposals, parse rate, verified rate, verified-improvement rate, median latency, tokens, cost estimate.
- After each `conform` or `improve` job the worker exports `leaderboard.parquet` and the job's attempts parquet to the Hub dataset (`11-records-and-queue.md` §7).
- The Space reads only `leaderboard.parquet` (`12-platform-ui-space.md` §5).
- Dataset card (`README.md` in the dataset repo): what an attempt is, fields, license (Apache-2.0 for our data; circuits from examples), how verification works, caveats (evidence vs proof), the qscore version and score version.

## 9. Pitfalls

- Models output OpenQASM 2 when asked for 3 (and vice versa): accept both via the same loaders, record the format; anything else is a parse failure.
- Gate names outside the target basis in model output: allowed for logical-scope regions (they get compiled), rejected for compiled-scope regions (permitted check).
- `splice` must respect the region's qubit map and convexity; test splice ∘ extract = identity on fixtures.
- Inference Providers' catalog and prices change: pin model ids in a config file (`improve/models.yaml`) chosen at build time and record them per attempt.
- vLLM's first requests are slow (kernel compilation/warm-up): warm up before benchmarks and the demo; exclude warm-up from tokens/s.
