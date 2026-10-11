-- 0001_init.sql: tables, indexes and views for the queue and the system of record.
-- Source: specs/11-records-and-queue.md §3, amended by CP-0004 (layer_calls, attempt key,
-- leaderboard) and CP-0005 (requires flags). Safe to re-run: every statement is idempotent.
-- Apply as the project owner. Do not put passwords or secrets in this file.

create extension if not exists pgcrypto;

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists manifests (
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
-- The platform confirms by hash alone (POST /manifests/{sha}/confirm).
create index if not exists manifests_sha_idx on manifests (sha256);

create table if not exists workers (
  id                 text primary key,               -- e.g. 'w7900-<session8>', 'vultr-cpu-1', 'laptop-<host>'
  capabilities       jsonb not null,                 -- {"gpu":true,"aer_gpu":true,"local_model":true,"hub_write":true,"neon_write":true}
  hardware_profile   jsonb,
  started_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_state') then
    create type job_state as enum ('queued','claimed','running','done','failed','cancelled');
  end if;
end $$;

create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('validate','score','improve','bench','conform','profile')),
  project_id      uuid references projects(id),
  manifest_id     uuid references manifests(id),
  payload         jsonb not null,                    -- qscore.job/v0.2
  -- Only capabilities a job NEEDS, each with value true; a flag that is not needed is omitted,
  -- never false (CP-0005). Matching is `requires <@ worker capabilities`.
  requires        jsonb not null default '{}'::jsonb,
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
create index if not exists jobs_queue_idx on jobs (priority, created_at) where state = 'queued';
create index if not exists jobs_running_idx on jobs (heartbeat_at) where state in ('claimed','running');

create table if not exists job_events (
  id      bigserial primary key,
  job_id  uuid not null references jobs(id) on delete cascade,
  seq     int not null,
  at      timestamptz not null,
  kind    text not null,
  data    jsonb not null,
  unique (job_id, seq)
);

create table if not exists scorecards (
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
-- The platform reads one scorecard by item hash (GET /scorecards/{item_sha}).
create index if not exists scorecards_item_idx on scorecards (item_sha256);

-- One row per call to an improvement layer, including calls that return nothing, garbage or an
-- error, so parse rate and leaderboard denominators are exact (CP-0004, qscore.layercall/v0.2).
-- Columns below the identity block are derived from the CP-0004 field list.
create table if not exists layer_calls (
  id              uuid primary key default gen_random_uuid(),
  call_id         uuid not null,
  job_id          uuid not null references jobs(id),
  round           int not null check (round >= 0),
  request_id      text not null,
  layer           text not null,
  layer_version   text not null,
  model           text,
  provider        text,
  prompt_version  text,
  outcome         text not null check (outcome in ('proposals','empty','parse_failure','layer_error')),
  n_proposals     int not null default 0 check (n_proposals >= 0),
  error           jsonb,                              -- {type, message} or null
  latency_ms      int,
  tokens          jsonb,
  cost_usd        numeric(10,6),
  record          jsonb not null,                     -- full qscore.layercall/v0.2
  created_at      timestamptz not null default now(),
  unique (job_id, call_id)
);

create table if not exists attempts (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references jobs(id),
  call_id              uuid not null,                 -- the layer call that produced this proposal (CP-0004)
  item_sha256          text not null,
  request_id           text not null,
  proposal_sha256      text not null,                 -- sha256(canonical_json(candidate)) (CP-0004)
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
  unique (job_id, call_id, proposal_sha256)            -- CP-0004 (was job_id, request_id, proposal_sha256)
);

create table if not exists telemetry (
  job_id        uuid not null references jobs(id) on delete cascade,
  worker_id     text not null,
  at            timestamptz not null,
  gpu_util      real,
  vram_used_mib int,
  power_w       real,
  primary key (job_id, at)
);

create table if not exists bench_results (
  id          uuid primary key default gen_random_uuid(),
  worker_id   text not null,
  suite       text not null,
  result      jsonb not null,                          -- qscore.bench/v0.2
  hub_path    text,
  created_at  timestamptz not null default now()
);

create table if not exists schema_migrations (
  filename    text primary key,
  applied_at  timestamptz not null default now()
);

-- Leaderboard per (layer, model, provider, prompt_version), CP-0004 definitions:
--   requests                   distinct (job_id, request_id) over layer calls
--   proposals                  parsed proposals returned by those calls
--   parse_rate                 proposals / (proposals + calls with outcome 'parse_failure')
--   verified_rate              attempts verified 'passed' / attempts that parsed
--   verified_improvement_rate  distinct (job_id, request_id) with an accepted attempt / requests
-- Latency and cost are per layer call (a call that returns nothing still costs time and money).
drop view if exists leaderboard;
create view leaderboard as
with calls as (
  select layer, model, provider, prompt_version,
         count(distinct (job_id, request_id))                              as requests,
         coalesce(sum(n_proposals), 0)                                     as proposals,
         count(*) filter (where outcome = 'parse_failure')                 as parse_failures,
         percentile_cont(0.5) within group (order by latency_ms)           as median_latency_ms,
         sum(cost_usd)                                                     as cost_usd
    from layer_calls
   group by layer, model, provider, prompt_version
), att as (
  select layer, model, provider, prompt_version,
         count(*) filter (where parse_ok)                                  as parsed,
         count(*) filter (where verification_status = 'passed')            as passed,
         count(distinct (job_id, request_id)) filter (where decision = 'accepted') as accepted_requests
    from attempts
   group by layer, model, provider, prompt_version
)
select c.layer, c.model, c.provider, c.prompt_version,
       c.requests,
       c.proposals,
       c.proposals::numeric / nullif(c.proposals + c.parse_failures, 0)    as parse_rate,
       a.passed::numeric / nullif(a.parsed, 0)                             as verified_rate,
       coalesce(a.accepted_requests, 0)::numeric / nullif(c.requests, 0)   as verified_improvement_rate,
       c.median_latency_ms,
       c.cost_usd
  from calls c
  left join att a
    on a.layer = c.layer
   and a.model          is not distinct from c.model
   and a.provider       is not distinct from c.provider
   and a.prompt_version is not distinct from c.prompt_version;

drop view if exists job_status;
create view job_status as
select j.id, j.kind, j.state, j.attempts, j.claimed_by, j.heartbeat_at, j.created_at, j.finished_at,
       (select max(last_seen_at) from workers w where (w.capabilities ->> 'gpu')::boolean) as gpu_last_seen
  from jobs j;
