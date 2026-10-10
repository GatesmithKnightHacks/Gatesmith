# 11 · Records and the queue: Neon, the worker, the Hub

> **Status:** binding (schema changes are class A) · **Tier:** 0 · **Read:** before working on `record/neon.py`, `record/hub.py`, `worker.py`, `scripts/neon/`, the platform API.

## 1. Why this shape

The GPU machine is created and destroyed every session, so nothing that matters may live only on it. Neon is the job queue and system of record (small rows); the Hub stores files (content-addressed). Every host connects **outbound** to both; no host needs another's address.

## 2. Neon basics and limits

- Free plan (checked 2026-10-09 on neon.com/pricing): **1 GB storage per project**, **100 CU-hours per project per month** (compute suspends when exhausted until the next period), **scale-to-zero after 5 idle minutes** (always on for Free), 10 branches per project, Data API included.
- A worker polling the queue keeps the database awake (≈ continuous compute): fine for the weekend; after the event stop the CPU worker so the database sleeps between visits.
- Telemetry is sampled once a second only while a job runs, batched, and pruned after export, to stay far below 1 GB.
- Use a **dev branch** for tests (`tests/queue/`) and the `main` branch for real runs.
- **Connection string:** use the **direct** (non-pooled) endpoint for workers (transactions with `FOR UPDATE SKIP LOCKED`, session settings). If you use the pooled endpoint (PgBouncer, transaction mode), disable server-side prepared statements (`psycopg` `prepare_threshold=None`) and do not use session features (`LISTEN/NOTIFY`, advisory locks).
- Cold start after suspend can take a moment: connection attempts use bounded retries (3, backoff) and then raise `NeonError` (R3.5).

## 3. Schema (`scripts/neon/0001_init.sql`)

```sql
create extension if not exists pgcrypto;

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table manifests (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id),
  sha256          text not null,
  schema_version  text not null,
  yaml            text not null,
  confirmed_mode  text check (confirmed_mode in ('interactive','yes_flag','stored')),
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (project_id, sha256)
);

create table workers (
  id                 text primary key,               -- e.g. 'w7900-<session8>', 'vultr-cpu-1', 'laptop-<host>'
  capabilities       jsonb not null,                 -- {"gpu":true,"aer_gpu":true,"local_model":true,"hub_write":true,"neon_write":true}
  hardware_profile   jsonb,
  started_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);

create type job_state as enum ('queued','claimed','running','done','failed','cancelled');

create table jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('validate','score','improve','bench','conform','profile')),
  project_id      uuid references projects(id),
  manifest_id     uuid references manifests(id),
  payload         jsonb not null,                    -- qscore.job/v0.2
  requires        jsonb not null default '{}'::jsonb, -- boolean flags only
  state           job_state not null default 'queued',
  priority        int not null default 100,           -- lower runs first
  attempts        int not null default 0,
  max_attempts    int not null default 3,
  claimed_by      text references workers(id),
  claimed_at      timestamptz,
  heartbeat_at    timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,
  error           jsonb,                              -- {type, message, at, attempt}
  result_summary  jsonb,                              -- {status, partial, scorecards, attempts, fallbacks_used, telemetry}
  created_by      text not null,
  created_at      timestamptz not null default now()
);
create index jobs_queue_idx on jobs (priority, created_at) where state = 'queued';
create index jobs_running_idx on jobs (heartbeat_at) where state in ('claimed','running');

create table job_events (
  id      bigserial primary key,
  job_id  uuid not null references jobs(id) on delete cascade,
  seq     int not null,
  at      timestamptz not null,
  kind    text not null,
  data    jsonb not null,
  unique (job_id, seq)
);

create table scorecards (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id),
  item_id         text not null,
  item_sha256     text not null,
  score_version   text not null,
  status          text not null check (status in ('complete','partial','failed')),
  primary_metric  text,
  primary_value   double precision,
  worst_severity  text,
  findings_count  int not null default 0,
  scorecard       jsonb not null,
  hub_path        text,
  created_at      timestamptz not null default now(),
  unique (job_id, item_sha256)
);

create table attempts (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references jobs(id),
  item_sha256          text not null,
  request_id           text not null,
  proposal_sha256      text not null,
  layer                text not null,
  layer_version        text not null,
  model                text,
  provider             text,
  prompt_version       text,
  parse_ok             boolean not null,
  verification_status  text check (verification_status in ('passed','failed','inconclusive','unsupported')),
  decision             text not null check (decision in ('accepted','rejected','inconclusive','invalid')),
  latency_ms           int,
  tokens               jsonb,
  cost_usd             numeric(10,6),
  record               jsonb not null,                 -- full qscore.attempt/v0.2
  created_at           timestamptz not null default now(),
  unique (job_id, request_id, proposal_sha256)
);

create table telemetry (
  job_id        uuid not null references jobs(id) on delete cascade,
  worker_id     text not null,
  at            timestamptz not null,
  gpu_util      real,
  vram_used_mib int,
  power_w       real,
  primary key (job_id, at)
);

create table bench_results (
  id          uuid primary key default gen_random_uuid(),
  worker_id   text not null,
  suite       text not null,
  result      jsonb not null,                          -- qscore.bench/v0.2
  hub_path    text,
  created_at  timestamptz not null default now()
);

create table schema_migrations (filename text primary key, applied_at timestamptz not null default now());

create view leaderboard as
select layer, model, provider, prompt_version,
       count(distinct request_id)                                         as requests,
       count(*)                                                           as proposals,
       avg(parse_ok::int)::numeric(5,4)                                   as parse_rate,
       (count(*) filter (where verification_status = 'passed'))::numeric
         / nullif(count(*) filter (where parse_ok), 0)                    as verified_rate,
       (count(distinct request_id) filter (where decision = 'accepted'))::numeric
         / nullif(count(distinct request_id), 0)                          as verified_improvement_rate,
       percentile_cont(0.5) within group (order by latency_ms)            as median_latency_ms,
       sum(cost_usd)                                                      as cost_usd
from attempts group by layer, model, provider, prompt_version;

create view job_status as
select j.id, j.kind, j.state, j.attempts, j.claimed_by, j.heartbeat_at, j.created_at, j.finished_at,
       (select max(last_seen_at) from workers w where (w.capabilities ->> 'gpu')::boolean) as gpu_last_seen
from jobs j;
```

### 3.1 Functions (`scripts/neon/0002_functions.sql`)

```sql
-- Claim the next job this worker can run. One statement, one transaction.
create or replace function claim_job(p_worker text, p_caps jsonb)
returns setof jobs language sql as $$
  update jobs j
     set state = 'claimed', claimed_by = p_worker, claimed_at = now(),
         heartbeat_at = now(), attempts = j.attempts + 1
   where j.id = (select id from jobs
                  where state = 'queued' and requires <@ p_caps
                  order by priority, created_at
                  for update skip locked
                  limit 1)
  returning j.*;
$$;

-- Return stale jobs to the queue, or fail them after max_attempts. Called by every worker before claiming,
-- and by the platform on status reads.
create or replace function requeue_stale(p_timeout interval default interval '60 seconds')
returns int language plpgsql as $$
declare n int;
begin
  update jobs
     set state = case when attempts >= max_attempts then 'failed'::job_state else 'queued'::job_state end,
         error = case when attempts >= max_attempts
                      then jsonb_build_object('type','LostWorker','message','no heartbeat for ' || p_timeout::text,
                                              'at', now(), 'attempt', attempts)
                      else error end,
         finished_at = case when attempts >= max_attempts then now() else finished_at end,
         claimed_by = null
   where state in ('claimed','running') and heartbeat_at < now() - p_timeout;
  get diagnostics n = row_count;
  return n;
end $$;

-- Heartbeat; returns the job's state so a worker learns about cancellation or loss of its claim.
create or replace function heartbeat(p_job uuid, p_worker text)
returns job_state language sql as $$
  update jobs set heartbeat_at = now()
   where id = p_job and claimed_by = p_worker and state in ('claimed','running')
  returning state;
$$;
```

If `heartbeat` returns NULL (no row matched), the worker has lost the job: it MUST stop work on it immediately, discard unwritten results, and log `ERROR` (another worker may be running it).

```sql
-- Cancel a job that has not been claimed yet (the MVP cancels queued jobs only).
create or replace function cancel_job(p_job uuid)
returns boolean language sql as $$
  update jobs set state = 'cancelled', finished_at = now()
   where id = p_job and state = 'queued'
  returning true;
$$;
```

### 3.2 Roles (`scripts/neon/0003_roles.sql`)

| Role | Used by | Grants |
|---|---|---|
| `qscore_platform` | Vultr platform | `select` on all tables/views; `insert` on `projects`, `manifests`, `jobs`; `update (state)` on `jobs` only via a `cancel_job(id)` function that allows `queued → cancelled`; `execute requeue_stale` |
| `qscore_worker` | W7900, laptop, Vultr CPU worker | `execute claim_job, requeue_stale, heartbeat`; `update` on `jobs` (`state`, `started_at`, `finished_at`, `error`, `result_summary`) for rows it claimed (enforced in `record/neon.py` with `where claimed_by = :worker`); `insert` on `job_events`, `scorecards`, `attempts`, `telemetry`, `bench_results`; `insert/update` on its own `workers` row; `select` on `jobs`, `manifests`, `projects` |
| `qscore_readonly` | Assistant tools, analytics | `select` on views and tables (no `telemetry` needed) |

Passwords are created in the Neon console (or `CREATE ROLE … LOGIN PASSWORD` as the owner) and stored only in each host's environment (`QSCORE_NEON_DSN`). Row-level security is not used in the MVP.

## 4. Writes are idempotent

Every write carries a natural key: scorecards `(job_id, item_sha256)`, attempts `(job_id, request_id, proposal_sha256)`, events `(job_id, seq)`, telemetry `(job_id, at)`. Use `insert … on conflict do nothing` and then **compare** the stored row's content hash with the new one; a mismatch raises `RecordError` (two different results for the same key is a bug, not a merge).

## 5. Worker (`worker.py`, `qscore worker`)

```
start: settings → profile_hardware() → capabilities (from profile; override only via QSCORE_CAPABILITIES) → upsert workers row
loop:
  requeue_stale()
  job = claim_job(worker_id, capabilities)        # none → sleep poll_s (default 5 s; 30 s when idle > 10 min)
  set state running, started_at
  heartbeat thread every 10 s (heartbeat() returns NULL → claim lost → stop work on this job immediately)
  result = services.<kind>(job.payload, on_event=batched_event_writer)
  write results (local JSON → Neon rows → Hub batch commit)
  finish: state done (result_summary) | failed (error)
```

- One job at a time per worker process; GPU work is guarded by an in-process GPU lease. Run a second worker process with `capabilities.gpu=false` if you want CPU jobs to run alongside on the same machine.
- The worker never retries a failed job itself; the queue's `attempts`/`max_attempts` handle lost workers only. A job that fails with an exception is `failed`, with the error, and stays failed (a human re-submits).
- Signals: SIGTERM/SIGINT → finish writing the current event batch, mark the job `failed` with `type: WorkerStopped` (it will not be requeued automatically), exit 0.
- **Neon unreachable mid-job:** default → log ERROR, exit non-zero (the heartbeat timeout requeues the job). With **FB-05** enabled → spool results under `~/.qscore/spool/<job>/` and replay on reconnect (idempotent keys make replays safe); record `fallbacks_used`.
- Port 5432 must be reachable from the GPU machine (checked in GPU session 1). If it is not, the worker cannot start; **FB-03** options are in `17-fallbacks.md` (user decides).

## 6. Local records (laptop and every worker)

- `scorecards/<item_id>.json` written atomically (temp file + `os.replace`).
- `runs/<run_id>/run_record.json`, `events.jsonl`, `telemetry.jsonl`.
- Cache: `.qscore/cache/` (content-addressed; `05-pipeline.md` §6).
- Local files are the first write; Neon and Hub writes follow. A failed Neon/Hub write fails the job (no silent local-only success) unless FB-05 is enabled.

## 7. Hugging Face Hub layout (`record/hub.py`)

```text
<org>/qscore-runs        dataset repo: private during the event, public at submission
  circuits/<sha256>.qasm
  qpy/<sha256>.qpy
  scorecards/<job_id>/<item_sha256>.json
  attempts/date=<YYYY-MM-DD>/<job_id>.parquet     one file per job (no read-modify-write); viewer config globs the folder
  bench/<YYYY-MM-DD>-<worker_id>.json
  traces/<job_id>/                                 optional rocprofv3 traces
  leaderboard.parquet                              the only file the Space reads
  README.md                                        dataset card
<org>/qscore-wheels      private model repo: aer/<aer_version>/<python_tag>/<wheel>.whl + SHA256SUMS
<org>/qscore             the Space
```

- **Batch commits:** one `HfApi.create_commit(...)` with many `CommitOperationAdd`s per job (not one commit per file); content-addressed paths that already exist are skipped (check with `file_exists` or keep a local index).
- Respect rate limits: on HTTP 429, bounded retries with backoff, then `HubError`.
- Tokens: the W7900 and Vultr use a fine-grained token with write access to `qscore-runs` and `qscore-wheels` (and inference for the `hf` layer); the Space uses a read-only token (or none once the dataset is public).

**Upload options (★):** ★ `create_commit` batched per job · `upload_folder` from a staging dir · `CommitScheduler` background commits (convenient, but commits on a timer, which makes "this job's results are on the Hub" harder to assert) · git + LFS (no).

## 8. Exports

- `export_records(kind)`: attempts parquet for a job (columns flattened from `qscore.attempt/v0.2`: ids, layer, model, provider, prompt_version, strategy, parse_ok, verification_status, decision, before/after primary metric, latency, tokens, cost); `leaderboard.parquet` from the `leaderboard` view.
- The dataset card lists the columns and the schema id.

## 9. Queue options (★ default; others need class A)

| Option | Pros | Cons |
|---|---|---|
| ★ Postgres table + `FOR UPDATE SKIP LOCKED` in `claim_job()` | One service; transactional; history in the same place | Polling keeps Neon awake |
| `pgmq` extension | Visibility timeouts built in | Extension availability/setup on Neon; another API |
| Redis/RQ or a hosted queue | Push-based | Another service and secret; no history |
| Platform relay (workers talk HTTPS to Vultr, which talks to Neon) | Works if 5432 is blocked | Couples workers to the platform (FB-03 option) |
| Neon Data API (PostgREST, `/rpc/claim_job`) | HTTPS only | Needs JWT auth (Neon Auth or an external JWKS); more setup (FB-03 option) |
