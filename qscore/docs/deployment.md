# Deployment state: Neon, Vultr, Hugging Face

> **For:** every agent and teammate working on the worker, records, platform API, UI or deploys.
> **Owner:** deployment (branch `vepaul-deployment`). **Last updated:** 2026-10-10.
> **Precedence:** `specs/` wins on any conflict. This file records what is actually deployed, and the
> decisions and deviations that the specs do not show yet. Each deviation below needs a change
> proposal from the lead (R5); until then, the deployed database behaves as described here.

## 1. Status at a glance

| Piece | Status | Spec |
|---|---|---|
| Neon project (Postgres only; Functions, Object storage, AI gateway, Auth all **off**) | done | 11 |
| Migrations `0001`–`0003` on branches `dev` and `production` | applied | 11 §3, CP-0004, CP-0005 |
| Queue + grants smoke test (41 checks) | passing on `dev` | 14 §2 (queue faults) |
| Role passwords | set on `production` only | 11 §3.2 |
| Engine code that uses Neon (`record/neon.py`, `worker.py`, `qscore db migrate`) | **not written** | 11 §4–5, T05, T22 |
| Vultr server (Docker + Caddy, HTTPS via `<ip>.sslip.io`) | in progress | 12 §3 |
| Hugging Face org, repos, tokens | not started | 11 §7, CP-0006 |

## 2. Neon

### 2.1 Branches

| Branch | Use | Role logins |
|---|---|---|
| `production` | Real runs, the demo, the Vultr platform, the real GPU worker | enabled |
| `dev` | Development and tests (`tests/queue/`) | **disabled** (roles exist, no passwords) |

Each branch has its own host (`ep-…`), and its own role passwords. Do not develop against `production`:
test jobs and attempts land in demo data and the leaderboard.

### 2.2 Files

| File | Contents |
|---|---|
| `qscore/scripts/neon/0001_init.sql` | Tables, indexes, views `leaderboard` and `job_status` |
| `qscore/scripts/neon/0002_functions.sql` | `claim_job`, `requeue_stale`, `heartbeat`, `cancel_job`, `confirm_manifest` |
| `qscore/scripts/neon/0003_roles.sql` | Roles `qscore_platform`, `qscore_worker`, `qscore_readonly` and their grants |
| `qscore/tests/queue/neon_smoke.sql` | End-to-end check, run as the owner; rolls back, leaves no rows |

- All three migration files are idempotent and were applied by hand in the Neon SQL Editor, so
  `schema_migrations` is **empty**. `qscore db migrate` may re-apply them safely.
- **Never edit an applied migration.** Put changes in a new file (`0004_<slug>.sql`), and apply it to
  `dev`, run the smoke test, then apply to `production`.

### 2.3 Connecting

- Every process reads its connection string from **`QSCORE_NEON_DSN`** (`config.Settings.neon_dsn`).
  Keep it in an untracked `.env` or the host environment. Never commit it, log it or put it in a prompt.
- Each host uses its own role. **Nothing uses the owner role** except a person running migrations.

| Process | Role | Host |
|---|---|---|
| Worker (GPU machine, laptop, CPU worker) | `qscore_worker` | **direct** (no `-pooler`): it uses `FOR UPDATE SKIP LOCKED` and a long-lived connection (11 §2) |
| Platform API (Vultr) | `qscore_platform` | pooled (`-pooler`) is fine; with psycopg set `prepare_threshold=None` |
| Assistant tools / analytics | `qscore_readonly` | either |

Connection strings are distributed privately by the deployment owner. Ask them; do not create roles.

### 2.4 Roles must be created with SQL, never in the Neon Console

Neon makes console-, CLI- and API-created roles members of `neon_superuser`, which bypasses every
grant. `0003_roles.sql` creates the roles with SQL as `NOLOGIN`; passwords are set by hand with
`alter role … login password '…'`. **This contradicts spec 11 §3.2** ("Passwords are created in the
Neon console"). Lead: record a proposal to change that sentence.

### 2.5 What each role can do (tested)

| | `qscore_platform` | `qscore_worker` | `qscore_readonly` |
|---|---|---|---|
| Read | all tables and views | `jobs`, `manifests`, `projects`, `workers`, `scorecards`, `attempts`, `layer_calls`, `job_events`, `telemetry` | all tables and views **except** `telemetry` |
| Insert | `projects`, `manifests`, `jobs` | `job_events`, `scorecards`, `attempts`, `layer_calls`, `telemetry`, `bench_results`, `workers` | — |
| Update | — (only via functions) | `jobs (state, started_at, finished_at, error, result_summary)`; `workers` | — |
| Functions | `requeue_stale`, `cancel_job`, `confirm_manifest` | `claim_job`, `requeue_stale`, `heartbeat` | — |

All functions are `SECURITY DEFINER` with `search_path = public, pg_temp`, and `EXECUTE` is revoked
from `PUBLIC` (CP-0005). Anything not in this table fails with `insufficient_privilege` (42501).

## 3. Contract for the worker (`worker.py`, `record/neon.py`)

1. **Register before claiming.** Upsert your `workers` row (`id`, `capabilities`) first:
   `jobs.claimed_by` references `workers(id)`, so claiming with an unregistered id fails.
2. **Loop:** `select requeue_stale();` then `select * from claim_job(:worker_id, :capabilities);`.
   No row means no matching job: sleep 5 s (30 s after 10 idle minutes).
3. **Capabilities** are a flat JSON object of booleans. A job matches when `requires <@ capabilities`.
4. **Running:** `update jobs set state = 'running', started_at = now() where id = :id and claimed_by = :worker;`
   The `claimed_by` filter is required: the database grant is per column, not per row.
5. **Heartbeat every 10 s:** `select heartbeat(:job_id, :worker_id);`. It returns the job state.
   **NULL means the claim is lost:** stop work on that job immediately and discard unwritten results.
6. **Writes are idempotent** (11 §4): `insert … on conflict (<natural key>) do nothing`, then read
   the stored row back and compare; a different stored row is a `RecordError`.

   | Table | Natural key |
   |---|---|
   | `job_events` | `(job_id, seq)` |
   | `scorecards` | `(job_id, item_sha256)` |
   | `layer_calls` | `(job_id, call_id)` |
   | `attempts` | `(job_id, call_id, proposal_sha256)` (CP-0004) |
   | `telemetry` | `(job_id, at)` |

7. **Finish:** set `state` to `done` with `result_summary`, or `failed` with `error {type, message, at, attempt}`.
8. **Lost workers:** a job with no heartbeat for 60 s returns to `queued` (`attempts` + 1); the third
   loss marks it `failed` with `error.type = 'LostWorker'`.

## 4. Contract for the platform API (`api/app.py`)

- Create jobs with `insert into jobs (kind, project_id, manifest_id, payload, requires, created_by)`.
  `payload` is `qscore.job/v0.2`; `requires` holds **only `true` flags** (CP-0005).
- Confirm: `select confirm_manifest(:sha, 'stored');` returns true once confirmed (repeat calls keep
  the first confirmation and return true), false for an unknown hash.
- Cancel: `select cancel_job(:id);` returns true for a queued job, NULL otherwise (claimed jobs run to the end).
- Call `select requeue_stale();` on status reads (12 §2).
- GPU indicator: `gpu_online = now() - job_status.gpu_last_seen < 30 s` (12 §4).
- Leaderboard: `select * from leaderboard;` (definitions in `0001_init.sql`, from CP-0004).

## 5. Engine changes the database already expects (owner: engine)

The SQL follows approved proposals that `schemas/` does not implement yet:

| Change | Proposal | Model |
|---|---|---|
| `AttemptRecord.call_id` (uuid, required; `attempts.call_id` is `not null`) | CP-0004 | `schemas/records.py` |
| New `LayerCallRecord` (`qscore.layercall/v0.2`) → table `layer_calls` | CP-0004 | `schemas/records.py` |
| New `JobResultSummary` → `jobs.result_summary` | CP-0004 | `schemas/records.py` |
| `JobRequirements` accepts only `true` (a `false` flag never matches any worker) | CP-0005 | `schemas/records.py` |
| `proposal_sha256 = sha256(canonical_json(candidate))` | CP-0004 | improve/verify |
| Budget `max_proposals` → `max_proposals_per_call` (default 4) and `max_proposals_total` (default 32) | CP-0004 | `schemas/manifest.py`, `improvement.py`, `records.py` |

## 6. Deviations to record as proposals (lead)

| # | What the SQL does | Spec says | Why |
|---|---|---|---|
| 1 | Roles created by SQL, `NOLOGIN` until a password is set | 11 §3.2: passwords created in the console | Console roles get `neon_superuser` (§2.4) |
| 2 | `qscore_worker` may `select` on `telemetry` | CP-0005's select list omits it | `on conflict (job_id, at)` needs read access to the conflict columns; replays failed with 42501 in testing |
| 3 | `layer_calls` columns (`layer`, `layer_version`, `model`, `provider`, `prompt_version`, `outcome`, `n_proposals`, `error`, `latency_ms`, `tokens`, `cost_usd`, `record`) | CP-0004 gives the document fields only | Derived from the `qscore.layercall/v0.2` field list |
| 4 | Leaderboard `median_latency_ms` and `cost_usd` per layer call | Original view: per attempt | Calls that return nothing still cost time and money |
| 5 | `confirm_manifest` keeps the first confirmation; returns boolean | CP-0005 names it only | Retries are safe |
| 6 | Indexes `manifests(sha256)`, `scorecards(item_sha256)` | not listed | Lookups by hash in 12 §2 endpoints |

## 7. Vultr (platform host)

- One Cloud Compute **Regular 2 GB** server, **Docker** marketplace image, region near the Neon region.
- Vultr **firewall group**: inbound TCP 22, 80, 443 only (Docker bypasses on-host `ufw`; the cloud firewall does not).
- HTTPS by **Caddy** at `https://<ip>.sslip.io` (or a domain later), proxying to the platform on port 8080.
- Secrets in `/opt/qscore/.env` (`chmod 600`), never in the image: `QSCORE_NEON_DSN` (platform role),
  `QSCORE_PLATFORM_TOKEN`, `HF_TOKEN` (write to `qscore-runs`, CP-0006), `GEMINI_API_KEY` (Tier 2 only).
- Deploy files (`qscore/docker/compose.yaml`, `Containerfile.platform`, `Caddyfile`) are not written yet;
  install with `uv sync --frozen --extra ui --extra neon`.

## 8. Rules for agents

- Do not create, stop, reset or delete cloud resources (Neon branches or roles, Vultr servers, Hub repos) (R10.4). Ask the deployment owner.
- Never print, log or commit connection strings or passwords; never ask a person to paste one into a chat.
- Develop and test against `dev`. Run `tests/queue/neon_smoke.sql` there after any SQL change.
- Schema changes go in a new migration file and, if they change a contract, a change proposal first (R5).

## 9. Open questions

- Hugging Face org name for `qscore-runs`, `qscore-wheels` and the Space (18 §3).
- Is port 5432 reachable from the Radeon Cloud machine? Check in GPU session 1; if not, FB-03.
- Team decision on two Neon-track extras: per-PR Neon branches running the smoke test in CI, and a
  scheduled Neon Function calling `requeue_stale()` (architecture change; needs a proposal).
