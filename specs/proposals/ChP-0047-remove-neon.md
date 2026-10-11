# ChP-0047: Remove Neon — queue behind the platform's HTTPS job API, records on local files + the Hub

- **Status:** approved by the user (directive 2026-10-11 ~01:05 EDT: "Remove neon from specs and any support for it should be dropped"); applied
- **Class:** A (architecture, contracts, fallbacks, sponsor scope) · **Author:** lead · **Date:** 2026-10-11
- **Supersedes:** D-018 (Neon as queue + system of record); FB-03; the Neon sponsor track
- **Related:** ChP-0046 (F2), specs 01, 02, 03, 04, 05, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, decisions, README, templates

## 1. Summary
Neon is removed from the design and the code. The job queue moves behind the **platform's HTTPS job API** (the platform owns its own storage; the platform is teammate-owned). Workers keep the same queue semantics (atomic claim by capability, 10 s heartbeat, 60 s stale requeue, 3 attempts, idempotent writes) but talk HTTPS only. Records are local files (first write) plus the Hugging Face Hub dataset (durable history); the leaderboard is computed into `leaderboard.parquet` instead of a SQL view. The Neon sponsor track is dropped.

## 2. Change
| Area | Before | After |
|---|---|---|
| Queue | Neon `jobs` table, `claim_job()` with `FOR UPDATE SKIP LOCKED`, worker connects to Postgres on 5432 | Platform job API (11 §3): `POST /api/worker/claim`, `/heartbeat`, `/events`, `/finish`, `/fail`; the platform guarantees one claimant per job in its own store |
| System of record | Neon rows + Hub files | Local records (first write) + Hub dataset `qscore-runs` (scorecards, attempts parquet, bench, leaderboard parquet) |
| Leaderboard | Neon view `leaderboard` | `export_records()` writes `leaderboard.parquet` from the attempts parquet files (same columns) |
| Telemetry | rows batched to Neon | `telemetry.jsonl` locally; summary in the job result; optional live samples via `/events` |
| Capability flag | `neon_write` | removed (`requires` flags: `gpu`, `aer_gpu`, `local_model`, `hub_write`) |
| Code | `config.neon_dsn`, `config.neon_transport`, `errors.NeonError`, `schemas.records.WorkerCapabilities.neon_write`, extra `[neon]` (psycopg), pytest marker `neon`, planned `record/neon.py`, `scripts/neon/`, `qscore db migrate/ping` | all removed; planned `record/jobs_client.py` (`JobsClient`, HTTPS) + `PlatformError(RecordError)` when the worker is built |
| Fallbacks | FB-03 (5432 blocked), FB-05 (lost Neon → spool) | FB-03 **retired** (no 5432); FB-05 retargeted: worker loses the **platform API** mid-job → spool + replay |
| Secrets | `QSCORE_NEON_DSN` per host role | `QSCORE_PLATFORM_URL` + `QSCORE_WORKER_TOKEN` (per-worker bearer token issued by the platform) |
| Sponsor tracks | AMD, Hugging Face, Neon, Vultr | AMD, Hugging Face, Vultr |

Secret-stripping patterns (`_DSN`, `_KEY`, `_TOKEN`, `NEON_` …) in `logging.py` and the sandbox are **kept**: they are defensive redaction, not Neon support, and removing a pattern would weaken a check.

## 3. Justification
- User directive (2026-10-11). Neon is optional/low priority, and the platform is teammate-owned.
- Measured on the Radeon Cloud machine (`lab/20261011-f2-w7900-s1/NOTES.md`): egress only via an HTTP proxy; HTTPS works (PyPI, repo.amd.com); Postgres on 5432 through the proxy is unverified. An HTTPS job API removes that risk entirely (FB-03 becomes moot).
- No Neon code existed beyond settings/errors/a schema flag (grep 2026-10-11): removal is cheap now and the queue design survives unchanged in semantics.

## 4. Impact
| Area | Impact |
|---|---|
| MVP | None (CPU engine untouched). |
| Contracts | `WorkerCapabilities.neon_write` removed (internal record, not one of the four public schemas). Job payload `qscore.job/v0.2` unchanged; `requires` flags lose `neon_write`. Platform job API added to 11 §3 (teammate implements it). |
| Gates | G3: "scorecards land in Neon and on the Hub" → "on the Hub"; "a queued job survives a killed worker" stays (platform API semantics). |
| Fallbacks | FB-03 retired; FB-05 retargeted. |
| Tests | Marker `neon` and `test_neon_transport_alternatives_need_fb03` removed with the feature; queue fault tests move to marker `platform` against a local fake job API when the worker is built. No check on remaining behaviour is weakened. |
| Cost | Saves one service, one secret per host. |

## 5. Rollback
Restore from git history (`specs/` and `qscore/` at the pre-change revision); D-018 and FB-03 return.

## 6. Decision
- Decided by: user · 2026-10-11 · approved (directive). Applied to specs and code the same session; CHANGELOG line added.
