# ChP-0051: `hf` max_tokens 8192 for reasoning models; record truncation and provider error codes

- **Status:** approved (user, 2026-10-11 "I approve everything, go in logical order"), applied to 10 §5 + CHANGELOG
- **Class:** B (a pinned call parameter and record fields; no contract change)
- **Author:** lead · **Date:** 2026-10-11
- **Related tasks:** T25 (ChP-0048/0049 slice)

## 1. Summary
Raise the `hf` layer's `max_tokens` from 2048 to 8192. Record each call's `finish_reason`. When an HTTP 4xx `LayerError` occurs, name the provider's short error `code` (never the body).

## 2. Proposed change
- 10 §5: `max_tokens = 8192`. `hf_layer.MAX_TOKENS = 8192`.
- `CallRecord.finish_reason`. An unparsable reply's reason starts with `finish_reason=<value>:`.
- A non-retried HTTP error becomes `LayerError("<model>: HTTP <status> (<code>)")` when the body is a dict with a string `code` of 64 characters or fewer.

## 3. Justification (evidence)
`lab/20261011-hf-prompt3/groq400.py` on QASMBench fredkin_n3, `openai/gpt-oss-20b:groq`:
- `max_tokens 2048`: every call failed with HTTP 400, `{"code": "json_validate_failed", "failed_generation": ""}`. The output was empty, so groq's strict-schema validator saw no JSON.
- `max_tokens 8192`: all 3 calls succeeded. They used 4524–6374 `reasoning_tokens` (completion 4539–6389), then a valid JSON reply.
The 2048 cap cuts gpt-oss (and other reasoning models) off before the JSON. This also explains the 2 unparsed gpt-oss-120b replies and 5 Qwen replies in `lab/20261011-improve-eval` (p-2026.2).
Cost impact: about 6k output tokens × $0.50/Mtok ≈ $0.003 per call at most. This stays inside `hf_max_cost_usd` 1.00.

## 4. Alternatives
| Option | Why not |
|---|---|
| `reasoning_effort: low` | Not uniform across providers/models; changes model behaviour; 8192 is simpler and recorded |
| Keep 2048 | Leaves one pinned model unusable and silently lowers the others' parse rate |

## 5. Impact
| Area | Impact |
|---|---|
| MVP | none |
| Contracts | none (`improve-once.json` is experimental; `calls[]` gains `finish_reason`) |
| Specs | 10 §5 (two sentences) |
| Modules | improve/hf_layer.py |
| Tests | max_tokens assertion updated to 8192; +2 tests (provider code, truncated reply) |
