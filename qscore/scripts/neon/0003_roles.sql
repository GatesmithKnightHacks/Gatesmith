-- 0003_roles.sql: one least-privilege login role per host.
-- Source: specs/11-records-and-queue.md §3.2, amended by CP-0004 (layer_calls) and CP-0005
-- (definer functions, extra select grants, confirm_manifest). Safe to re-run.
--
-- PASSWORDS: this file creates the roles as NOLOGIN, so nothing can connect until you set a
-- password yourself. Run these once in the Neon SQL Editor, with real passwords, and store each
-- connection string only in that host's environment (QSCORE_NEON_DSN). Never commit them:
--   alter role qscore_platform login password '<generated>';
--   alter role qscore_worker   login password '<generated>';
--   alter role qscore_readonly login password '<generated>';
--
-- Do NOT create these roles in the Neon Console, CLI or API. Neon makes console-created roles
-- members of neon_superuser, which bypasses every grant below. Roles made with SQL, as here,
-- get only what is granted.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'qscore_platform') then
    create role qscore_platform nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'qscore_worker') then
    create role qscore_worker nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'qscore_readonly') then
    create role qscore_readonly nologin;
  end if;
end $$;

grant usage on schema public to qscore_platform, qscore_worker, qscore_readonly;

-- qscore_platform (Vultr): reads everything, creates projects/manifests/jobs, and changes jobs
-- only through cancel_job(); records confirmations through confirm_manifest().
grant select on all tables in schema public to qscore_platform;   -- includes the views
grant insert on projects, manifests, jobs to qscore_platform;
grant execute on function requeue_stale(interval), cancel_job(uuid), confirm_manifest(text, text)
  to qscore_platform;

-- qscore_worker (GPU machine, laptops, CPU worker): claims jobs, reports progress, writes results.
-- Which jobs a worker may update is enforced in record/neon.py with `where claimed_by = :worker`.
grant execute on function claim_job(text, jsonb), requeue_stale(interval), heartbeat(uuid, text)
  to qscore_worker;
grant select on jobs, manifests, projects, workers,
                scorecards, attempts, layer_calls, job_events       -- read back for the idempotency comparison
  to qscore_worker;
-- Beyond CP-0005's list: `insert ... on conflict (job_id, at) do nothing` (specs/11 §4) needs read
-- access to the conflict columns, so replaying telemetry fails with "permission denied" without it.
grant select on telemetry to qscore_worker;
grant update (state, started_at, finished_at, error, result_summary) on jobs to qscore_worker;
grant insert on job_events, scorecards, attempts, layer_calls, telemetry, bench_results
  to qscore_worker;
grant insert, update on workers to qscore_worker;                   -- its own row (checked in record/neon.py)
grant usage on sequence job_events_id_seq to qscore_worker;         -- job_events.id is bigserial

-- qscore_readonly (assistant tools, analytics): select only, no telemetry.
grant select on projects, manifests, workers, jobs, job_events, scorecards, attempts, layer_calls,
                bench_results, leaderboard, job_status
  to qscore_readonly;
