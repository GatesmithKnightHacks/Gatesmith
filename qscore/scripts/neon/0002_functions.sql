-- 0002_functions.sql: the queue functions.
-- Source: specs/11-records-and-queue.md §3.1, amended by CP-0005: every function is
-- SECURITY DEFINER with a fixed search_path (so a role may call it without holding the column
-- privileges it needs), and execute is revoked from PUBLIC. Per-role grants are in 0003.
-- Apply as the project owner: the owner's rights are what the functions run with.

-- Claim the next job this worker can run. One statement, one transaction.
create or replace function claim_job(p_worker text, p_caps jsonb)
returns setof jobs
language sql
security definer
set search_path = public, pg_temp
as $$
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

-- Return stale jobs to the queue, or fail them after max_attempts. Called by every worker before
-- claiming, and by the platform on status reads.
create or replace function requeue_stale(p_timeout interval default interval '60 seconds')
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
-- NULL means no row matched: the worker has lost the job and MUST stop work on it immediately.
create or replace function heartbeat(p_job uuid, p_worker text)
returns job_state
language sql
security definer
set search_path = public, pg_temp
as $$
  update jobs set heartbeat_at = now()
   where id = p_job and claimed_by = p_worker and state in ('claimed','running')
  returning state;
$$;

-- Cancel a job that has not been claimed yet (the MVP cancels queued jobs only).
create or replace function cancel_job(p_job uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  update jobs set state = 'cancelled', finished_at = now()
   where id = p_job and state = 'queued'
  returning true;
$$;

-- Record a manifest confirmation (CP-0005; used by POST /manifests/{sha}/confirm).
-- The first confirmation wins: a repeat call keeps the original mode and time and still returns
-- true. Returns false when no manifest has that hash. An invalid mode raises check_violation.
create or replace function confirm_manifest(p_sha text, p_mode text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update manifests
     set confirmed_mode = p_mode, confirmed_at = now()
   where sha256 = p_sha and confirmed_at is null;
  return exists (select 1 from manifests where sha256 = p_sha and confirmed_at is not null);
end $$;

revoke all on function claim_job(text, jsonb)         from public;
revoke all on function requeue_stale(interval)        from public;
revoke all on function heartbeat(uuid, text)          from public;
revoke all on function cancel_job(uuid)               from public;
revoke all on function confirm_manifest(text, text)   from public;
