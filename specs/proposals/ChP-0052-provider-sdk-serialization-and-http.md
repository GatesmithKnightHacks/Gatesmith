# ChP-0052: Provider SDK serialization and bounded HTTP configuration

- Status: approved by integration coordinator; Class B; Date: 2026-10-11
- Related: spec19 §9, spec12 §5, operating rule R3.5.

## Exact implementation choices

Gemini's primary request uses `GenerateContentConfig.response_json_schema` with the unchanged `ReviewDraft.model_json_schema(by_alias=True)`, followed by strict `ReviewDraft` validation. The originally named `response_schema` SDK conversion rejects the existing dictionary's `additionalProperties` in Developer API mode. No fields, constraints or extra-field checks are removed. There is no retry with another schema or model.

ChP-0053 subsequently limits only the primary generation schema's comment maximum to ten. The public contract and local validation remain unchanged.

The standalone Space explicitly pins the already-required Hub HTTP dependency `httpx2` and configures the public Hub client factory. Before importing Hub/Gradio it disables Xet, Hub telemetry and Gradio analytics. Per-refresh context-local counters stop before a fourth actual request to the same normalized HTTP operation. The primary data source remains `hf_hub_download` of only `leaderboard.parquet`. SDK retry URL logging is replaced by safe attempt counts; failures remain visible.

## Evidence and justification

- Installed google-genai 2.29.0 rejects `t_schema(ReviewDraft)` locally with an additionalProperties ValueError. Its public response_json_schema serializer preserves JSON Schema; Google's structured-output documentation lists additionalProperties support: https://ai.google.dev/gemini-api/docs/structured-output . A fake HTTP transport test and live coordinator smoke must validate the corrected path.
- Installed huggingface_hub 2.2.0 performs up to five internal retries and may request agent-harness metadata while building telemetry headers. Its public client factory and documented disabling flags permit the required same-operation retry bound without patching private SDK internals. Offline transport and concurrent-refresh tests exercise those limits.

## Impact

Internal SDK plumbing only; identical JSON output contracts, strict validation, models, providers, budgets and data sources. No changes to engine scoring, acceptance, verification, golden values, architecture, MVP scope or fallback registry. The Space pins a mandatory transitive dependency already present in the approved Hub SDK. Existing HF/UI extras are installed in CI so their offline tests can collect.

## Decision

Coordinator records these primary implementation choices. No failure causes schema weakening, cached success, model/provider substitution or fabricated data. Runtime exceptions propagate or produce an explicit failed view/check.
