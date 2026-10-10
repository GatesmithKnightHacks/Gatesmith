# ChP-0005: Neon queue functions as SECURITY DEFINER, complete grants, and `requires` matching

- **Status:** approved (spec text to apply)
- **Class:** A (Neon schema, security posture)
- **Author:** lead (from Codex review F-01, F-20) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T05, T22, T28 · **Blocks:** T05
- **Decision needed by:** before T05

## 1. Summary
As written, `claim_job()`/`heartbeat()`/`requeue_stale()` run as the caller (SQL default `SECURITY INVOKER`), but `qscore_worker` lacks `update` on the columns they write (`claimed_by`, `claimed_at`, `heartbeat_at`, `attempts`); the platform cannot record confirmations; workers cannot read rows needed for the idempotency comparison. Separately, the job example's `"local_model": false` makes JSONB containment reject workers that do have a local model.

## 2. Proposed change
### 2.1 Spec text (exact)
- `11` §3.1: every function is `security definer set search_path = public, pg_temp`, owned by the migration owner; `revoke all on function … from public`; `grant execute` per role table. Add `confirm_manifest(p_sha text, p_mode text)` (definer) for the platform.
- `11` §3.2 additions: `qscore_worker`: `select` on `scorecards`, `attempts`, `layer_calls`, `job_events` (idempotency comparison, §4). `qscore_platform`: `execute confirm_manifest, cancel_job`.
- `04` §7 — Before:
  > `"requires": {"gpu": true, "aer_gpu": true, "local_model": false},`
  > `requires` uses only boolean flags so that matching is `requires <@ capabilities`
- After:
  > `"requires": {"gpu": true, "aer_gpu": true},`
  > `requires` contains **only flags whose value is `true`** (a needed capability); a flag that is not needed is omitted, never `false`. Matching stays `requires <@ capabilities`. The schema rejects `false` values (Q103 / `InvalidInput`).

### 2.2 Implementation sketch
`scripts/neon/0002_functions.sql`, `0003_roles.sql`; `schemas/records.JobRequirements` validator (`Literal[True]` values).

## 3. Justification
PostgreSQL `CREATE FUNCTION` default is `SECURITY INVOKER`; an invoker-rights `update jobs set claimed_by = …` fails without column privileges that §3.2 does not grant. `'{"local_model": false}'::jsonb <@ '{"local_model": true}'::jsonb` is `false`. T05's acceptance ("roles can do only what §3.2 grants (tested)") would fail.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Grant workers broad `update` on `jobs` | Simple | Workers could modify any job; weakens the §3.2 posture | Security |
| Implication matching in SQL (`not (… and not …)`) | Keeps `false` flags | Harder to read/test | Omission is simpler |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~15 min T05 |
| Contracts / stored data | `JobSpec.requires` stricter; migrations 0002/0003 change (none applied yet) |
| Other specs | `04` §7, `11` §3.1/§3.2, `12` §2 (confirm endpoint uses `confirm_manifest`) |
| Modules | `scripts/neon/*`, `schemas/records.py`, `record/neon.py` |
| Tests and golden values | Role tests in T05 cover the new grants; no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | Security posture: definer functions with fixed `search_path` (standard practice) |
| Sponsor tracks / demo | Neon track works end to end |
| Cost | none |

## 6. Risks and rollback
Definer functions must pin `search_path` (included). Rollback = invoker functions + broader grants.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
