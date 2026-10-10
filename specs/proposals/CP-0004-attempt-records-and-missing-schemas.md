# CP-0004: Attempt/layer-call records, request identity, proposal budgets, and the three undefined schemas

- **Status:** approved (spec text to apply)
- **Class:** A (contracts, Neon schema, leaderboard definition)
- **Author:** lead (from Codex review F-15, F-17, F-18, F-19, F-24) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T01, T05, T22, T24, T26 · **Blocks:** T01 (`schemas/records.py`, `run.py`, `improvement.py`), T05 (0001_init.sql)
- **Decision needed by:** before T01/T05

## 1. Summary
The records layer has five gaps: (a) layer calls that return `[]`, garbage, or fail have no record, yet parse rate and leaderboard denominators need them; (b) `request_id` is not globally unique, so `count(distinct request_id)` collapses repeated jobs; (c) the attempt natural key ignores the layer and `proposal_sha256` is undefined; (d) `max_proposals` means two different things; (e) `RunRecord`, `ConformanceReport`, `JobResultSummary` are required models with no contract.

## 2. Proposed change
### 2.1 Spec text (exact)
- New schema `qscore.layercall/v0.2` (`LayerCallRecord`, `04` new §6.1): `{call_id (uuid), job_id, round, request_id, layer{name,version,model,provider,prompt_version}, outcome: proposals|empty|parse_failure|layer_error, n_proposals, error{type,message}|null, latency_ms, tokens, cost_usd, created_at}`. Neon table `layer_calls` with unique `(job_id, call_id)`. Every `AttemptRecord` gains `call_id`.
- `proposal_sha256` := `sha256(canonical_json(candidate))` (the candidate object only). Attempt natural key — Before: `unique (job_id, request_id, proposal_sha256)`. After: `unique (job_id, call_id, proposal_sha256)`.
- Leaderboard view: `requests` = `count(distinct (job_id, request_id))` from `layer_calls`; `parse_rate` = parsed proposals ÷ (proposals + calls with outcome `parse_failure`); `verified_improvement_rate` = distinct `(job_id, request_id)` with an accepted attempt ÷ distinct `(job_id, request_id)` attempted.
- Budget names — Before: `budget: {…, max_proposals: 4, …}` (used both per call and as a loop stop). After: `max_proposals_per_call` (cap on proposals parsed from one layer call; extras ignored and counted in the call record) and `max_proposals_total` (loop stop). Defaults 4 and 32. Parse failures and layer errors count toward neither.
- `04` new §13 "Run/summary schemas":
  - `qscore.run/v0.2` `RunRecord`: `run_id, job_id|null, command, manifest_sha256, items[], confirmation{mode, at, manifest_sha256}, settings_profile, fallbacks_enabled[], fallbacks_used[], started_at, finished_at, status: complete|partial|failed, exit_code, scorecards[{item_id, item_sha256, path}], provenance`.
  - `JobResultSummary` (`jobs.result_summary`): `{status: complete|partial|failed, partial: bool, scorecards: [item_sha256], attempts: int, fallbacks_used: [], telemetry: {status: ok|unavailable|off, peak_vram_mib|null}}`.
  - `qscore.conformance/v0.2` `ConformanceReport`: `layer{…}, fixtures_version, n_fixtures, results[{fixture_id, ok, violations[], parse_ok, timeout}], rates{parse, verified, verified_improvement}, compatible: bool, created_at`.

### 2.2 Implementation sketch
`schemas/records.py`: `LayerCallRecord`, `JobResultSummary`; `schemas/run.py`: `RunRecord`; `schemas/improvement.py`: `ConformanceReport`; `scripts/neon/0001_init.sql`: `layer_calls`, attempts key; leaderboard view rewritten.

## 3. Justification
`10` §7 requires counting "non-empty garbage" replies in parse rate and `10` §2 requires recording layer failures "in the attempt stream", but `AttemptRecord` requires `proposal_sha256` (F-17). `03` §5 request ids `"<item_id>/r<round>/<rule>#<n>"` repeat across jobs (F-18). `04` §1 says every document carries a schema id, but `RunRecord` has none (F-24). `04` §2 and `10` §3 use `max_proposals` differently (F-15).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep spec | — | Leaderboard numbers wrong after the 2nd job | Sponsor-track credibility |
| Make request_id globally unique (prefix job id) | One change for F-18 | Breaks the documented id format; F-17 still open | Partial |
| Encode empty/failed calls as attempts with null proposal | No new table | Nullable keys; muddles attempt semantics | Cleaner as separate record |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~40 min across T01/T05/T24 |
| Contracts / stored data | New schema id `qscore.layercall/v0.2`, `qscore.run/v0.2`; Neon `layer_calls`; attempts key change; budget field rename (pre-freeze) |
| Other specs | `04` §2/§6/new §6.1/§13, `10` §3/§7/§8, `11` §3/§4/§8, `03` §3.2 |
| Modules | `schemas/*`, `record/neon.py`, `record/hub.py` exports, `improve/conformance.py`, loop |
| Tests and golden values | New contract examples; leaderboard SQL test on fixtures; no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Correct leaderboard (HF track) |
| Cost | negligible extra rows |

## 6. Risks and rollback
More schema surface before G1 (~3 h). If time is short, `ConformanceReport` (T1) may be defined at T26 but its id stays reserved.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
