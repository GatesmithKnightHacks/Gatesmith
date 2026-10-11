# ChP-0048: Model improvement layer via Hugging Face Inference Providers only (API, open-weight models; no local model)

- **Status:** **approved by the user** 2026-10-11 ~01:20 EDT ("I approve the spec for HF"); applied to specs; **implementation deferred by the user** (class A). Direction set by the user 2026-10-11 ~01:05 EDT: "not load the models on any hardware and just call the api for the HF track (ofc open source models)".
- **Class:** A (architecture, dependencies, fallbacks, sponsor scope) · **Author:** lead · **Date:** 2026-10-11
- **Supersedes on approval:** the `local` layer (vLLM on the W7900), FB-02, the `local_model` capability, the `model_loaded` memory mode, 13 §3.3 (vLLM setup)
- **Related:** spec 10 (rewritten §5), 02, 01 §8, 04, 09 §2, 13, 15 T25/T26, 17, 18; ChP-0032/0046 (W7900 stays a simulation/verification machine); ChP-0047 (records)

## 1. Summary

One model layer, `hf`, calls **open-weight models through Hugging Face Inference Providers** (the HF router, OpenAI-compatible chat completions). No model is loaded on any of our hardware. The layer turns an improvement request into one chat call with a **JSON-schema-constrained** reply, parses it strictly into `qscore.proposal/v0.2`, and hands it to the engine, which verifies and re-scores exactly as for every other layer (the engine decides; models only propose). Models are pinned as `org/model:provider` in `improve/models.yaml`, checked against the live router catalog, and compared on identical requests in the leaderboard. The W7900 keeps doing simulation and verification only.

This is the mainstream pattern: an OpenAI-compatible client against a hosted open-model router, structured output, and generate-then-verify (the same principle as IBM's Qiskit HumanEval, which judges generated Qiskit code by executing checks rather than trusting the model).

## 2. Spec text

### 2.1 `10-improvement-loop.md` §5 — replace the whole section

> ## 5. The `hf` model layer (`improve/hf_layer.py`) `[T1]`
>
> **What it is.** `HfLayer(model_entry)` — one instance per pinned model in `improve/models.yaml`. Name `hf`; `version` = `hf-<PROMPT_VERSION>`; serves the strategies listed for that model (default: `block_resynthesis`, `reversible_rewrite`, `commutation_aware_routing`; layout/routing strategies stay with `reference-qiskit`).
>
> **Transport.** The `openai` Python SDK with `base_url = https://router.huggingface.co/v1` (settings `hf_router_base_url`) and `api_key = HF_TOKEN` (fine-grained token with "Make calls to Inference Providers"). Model string is always `"<org>/<model>:<provider>"` — the provider is **pinned**, never `:fastest`/`:cheapest`/auto, so structured-output behaviour and cost are stable and recorded.
>
> **Pinned models (`improve/models.yaml`).** Each entry: `id`, `provider`, `license`, `strategies`, `pricing_usd_per_mtok: {input, output}` (snapshot), `checked_at`. Only open-weight models (license on the model card is an OSI/open-weights license; recorded). Initial panel (checked 2026-10-11 against `GET /v1/models`: live, `supports_structured_output: true`):
>
> | ★ | Model : provider | Why |
> |---|---|---|
> | ★ | `openai/gpt-oss-120b:cerebras` | Strong general reasoning, Apache-2.0, fastest throughput in the catalog |
> | | `Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway` | Code-specialised |
> | | `deepseek-ai/DeepSeek-V4-Flash:deepinfra` | Strong and cheap |
> | | `openai/gpt-oss-20b:groq` | Small baseline (shows the size/quality trade-off on the leaderboard) |
>
> The demo profile enables the ★ model; leaderboard runs (`qscore conform`, `improve --layers hf:*`) use the whole panel. Qiskit's own fine-tunes (`Qiskit/granite-3.3-8b-qiskit`, `Qiskit/Qwen2.5-Coder-14B-Qiskit`) are not served by Inference Providers (catalog check 2026-10-11) and are out of scope.
>
> **Catalog check.** At layer start, one `GET /v1/models` (cached for the job). If a pinned `id` is absent, or its `provider` is not `live` or lacks `supports_structured_output`, the layer raises `LayerError("<id>:<provider> not available: <reason>")`. It never substitutes another model or provider. `qscore models check` prints the same check for every entry (maintainers run it before a demo).
>
> **One call per request.**
> - Messages from `prompts.render(request)` (§6). The reply format is `response_format = {"type": "json_schema", "json_schema": {"name": "qscore_candidates", "schema": <CandidateSet schema>, "strict": true}}`.
> - `CandidateSet` = `{"candidates": [{"format": "openqasm3"|"openqasm2", "qasm": str, "rationale": str (≤ 600 chars), "estimate": number, "equivalent": bool}]}` (as applied: `estimate`/`equivalent` fill the proposal contract's `claims`), at most `max_proposals` (default 3) items. The engine wraps each candidate into a `qscore.proposal/v0.2` (`layer`, `layer_version`, `model`, `provider`, `prompt_version`, region id, circuit payload) — the model never writes ids, hashes or scope fields.
> - `temperature = 0`, `max_tokens = 2048`, `seed` when the provider accepts it; `timeout = layer_timeout_s` (default 60 s).
>
> **Parsing (no repair, R3).** The reply must be valid JSON against `CandidateSet`; each `qasm` must load with the same loaders as uploads (OpenQASM 3 or 2) and act only on the region's qubits. Anything else → `parse_ok = false` for that candidate (an unparsable reply = one failed proposal). No regex fixing, no re-asking with the error, no second model.
>
> **Verification and acceptance.** Unchanged: splice → verify (08) → re-score with the same seeds → decide (08 §4). The model's claims (`estimate`, `equivalent`) are shown, never trusted.
>
> **Privacy guard.** Unchanged: the layer refuses unless `privacy.external_inference: true` for the item and the request scope is `region` → `LayerError("external inference disabled")`. QASM comments are stripped from the region payload (§6).
>
> **Budgets and cost.** Per job: `hf.max_calls` (default 30) and `hf.max_cost_usd` (default 1.00). Cost per call = response `usage` tokens × the entry's pinned pricing; recorded per attempt as an **estimate** (provider billing is authoritative). Reaching a limit stops the loop with `stop_reason: budget: hf <calls|cost>`; unfinished requests are `skipped` with that reason.
>
> **Errors.** 429/5xx/connection reset/timeout → up to 3 attempts with exponential backoff (R3.5), then `LayerError`; the loop records it and continues with other layers. 401/403 → `LayerError` at once (token). Never switch model or provider automatically.
>
> **Logged per call** (attempt record + log): model, provider, latency ms, prompt/completion tokens, cost estimate, prompt version, HTTP status, retries. Never the token.
>
> **Client options (★):** ★ `openai` SDK with `base_url` (HF's documented OpenAI-compatible route) · `huggingface_hub.InferenceClient` (same router; fine, one more API surface) · raw `httpx` · LiteLLM (extra dependency; not needed).

### 2.2 Other spec edits (applied together on approval)

| Spec | Change |
|---|---|
| 02 §1 | Decision 3: the W7900 does "batched verification, noisy simulation and benchmarks" (no local model). Decision 6: "One client for every language model: Hugging Face Inference Providers through the OpenAI-compatible router; models are compared on identical requests." Hosts: drop vLLM from the W7900 box and table. Components: Proposers = `reference-qiskit` (deterministic), `hf` (Inference Providers). |
| 01 §8 | Hugging Face row: "Open-weight models via Inference Providers (API), attempts dataset published, leaderboard Space"; AMD row: drop "tokens/s for the local model". Tier 1: "at least one model layer (`hf`)". |
| 04 | `requires` flags: `gpu`, `aer_gpu`, `hub_write` (drop `local_model`). Attempt record: `provider` required for `hf`; add optional `cost_usd_estimate`. |
| 09 §2 | Memory planning: exclusive mode only (R = 0); remove `model_loaded` and the 40 % reservation. ChP-0032's model-reservation term becomes 0 permanently. |
| 10 §3, §9 | Drop the vLLM/exclusive-mode alternation note and the vLLM warm-up pitfall; keep catalog-churn pitfall (now enforced by the catalog check). |
| 13 | Remove §3.3 (vLLM) and bootstrap step 4; no model downloads on the instance. |
| 15 | T25 → "`hf` layer + `models.yaml` + catalog check + recorded-response tests"; T26 unchanged (leaderboard). Remove vLLM items from T17. |
| 17 | FB-02 **retired** (no local server). |
| 18 | Models watchlist: the pinned panel; licenses from model cards; provider status changes. |
| config | `hf_router_base_url` (exists); remove `local_llm_base_url`; add `hf_max_calls`, `hf_max_cost_usd`. |

## 3. Justification (evidence)

- **User direction** (2026-10-11): API only, open-source models, HF track.
- **Router catalog, fetched 2026-10-11 05:11 UTC** (`GET https://router.huggingface.co/v1/models`): 129 models; each provider entry carries `status`, `supports_structured_output`, `pricing`, `context_length`, `throughput`. Live with structured output: `openai/gpt-oss-120b` (cerebras $0.35/$0.75 per Mtok, ~1014 tok/s; groq; nscale; novita), `Qwen/Qwen3-Coder-30B-A3B-Instruct` (scaleway $0.228/$0.912), `deepseek-ai/DeepSeek-V4-Flash` (deepinfra $0.09/$0.18), `openai/gpt-oss-20b` (groq $0.10/$0.50, ~788 tok/s). No `Qiskit/*` model is served.
- **HF's structured-output guide** (huggingface.co/docs/inference-providers/guides/structured-output) uses `response_format: {type: json_schema, json_schema: {schema, strict: true}}` with either the OpenAI client or `InferenceClient`, and advises selecting a specific provider for structured outputs "to avoid incompatibility issues between the model, provider and the schema" — hence pinned `:provider`.
- **Cost** at the ★ model: a request is ~3–4 k prompt tokens + ≤ 2 k output → ≈ $0.003 per call; the default $1.00 job cap allows far more than `max_calls = 30`.
- **No GPU contention or setup risk:** dropping vLLM removes the 40 % VRAM reservation, the gfx1100 vLLM build risk (FB-02), and model downloads on a machine whose Hugging Face egress timed out (measured 2026-10-11).
- **Mainstream practice:** OpenAI-compatible clients against hosted open-model routers are HF's documented route; generate-then-verify matches how IBM evaluates generated Qiskit code (Qiskit HumanEval executes checks) and how qscore already treats every proposer.

## 4. Alternatives

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Local vLLM on the W7900 (current spec) | No per-token cost; AMD story | Build/runtime risk on gfx1100; 40 % VRAM reserved; model download blocked/slow; one model at a time | User direction; risk and time |
| HF Inference Endpoints (dedicated) | Any model incl. Qiskit fine-tunes | Paid always-on GPU; setup; not "just call the API" | Cost and scope |
| Provider auto-routing (`:fastest`/`:cheapest`) | Simpler config | Provider changes silently → structured-output and cost drift; not reproducible | Violates "no silent switch" (R3) |
| ★ Pinned `model:provider` via router + catalog check | Reproducible, cheap, comparable, zero hardware | Catalog churn (checked at start) | Chosen |

## 5. Impact

| Area | Impact |
|---|---|
| MVP | None (CPU engine). Tier 1 model layer becomes `hf` only. |
| Contracts | `requires.local_model` removed; attempt `provider` required for `hf`; optional `cost_usd_estimate`. No public schema version bump beyond these internal records (no stored data exists). |
| Gates | G4 (improvement loop) needs `reference-qiskit` + `hf`; no vLLM criterion. |
| Fallbacks | FB-02 retired. No new fallback (no model/provider substitution). |
| Dependencies | `openai` (already in extra `[hf]`). No vLLM, no model weights. |
| Tests | Unit: recorded responses (valid set, invalid JSON, schema-valid but bad QASM, out-of-region qubits, 429→retry→LayerError, catalog-missing → LayerError, privacy refusal, budget stop). Live: `-m llm` smoke on the ★ model, ≤ 5 calls, needs `HF_TOKEN`. Conformance kit unchanged. |
| Sponsor tracks | HF: open models via Inference Providers + dataset + Space. AMD: W7900 simulation/verification/bench (ChP-0046). |
| Cost | HF credits only; ≈ $0.003/call at the ★ model; per-job cap $1.00 by default. |

## 6. Risks and rollback

- **Catalog/provider churn:** caught by the start-of-job check (loud `LayerError`); update `models.yaml` deliberately (class B, with a fresh `checked_at`).
- **Weaker Qiskit knowledge than Qiskit fine-tunes:** mitigated by the prompt (target basis, region QASM, few-shot verified rewrites) and by verification; the leaderboard reports it honestly.
- **Structured output quirks per provider:** pinned providers flagged `supports_structured_output`; parse failures count against the layer, never repaired.
- **Rollback:** restore spec 10 §5 and the listed sections from git; the `local` layer design returns unchanged.

## 7. Decision

- Decided by: user · 2026-10-11 · Outcome: **approved**.
- Applied to specs (02, 01, 03, 04, 05 §11 `qscore models check`, 09 §2, 10 §5 rewritten, 11, 13, 15 T25, 17 FB-02 retired, 18, README). **Not implemented**: the user asked (2026-10-11 ~01:25 EDT) not to implement the improvement layer now; a first implementation was removed again before any commit. T25 remains open. Licenses verified from model cards 2026-10-11.
