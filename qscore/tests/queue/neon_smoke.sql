-- neon_smoke.sql: end-to-end check of 0001-0003 (tables, queue functions, role grants).
-- Run on a DEV branch or a throwaway Postgres, as the owner, AFTER applying 0001-0003.
-- Everything happens inside one transaction that is rolled back, so no test rows remain.
-- The last statement prints one row per check; every `ok` must be true.
--
-- If `set role` is refused on Neon, run once first:  grant qscore_worker, qscore_platform,
-- qscore_readonly to current_user;   (the roles are NOLOGIN, so this is safe)

begin;

create temp table qs_results (n serial, check_name text, ok boolean, detail text);
grant all on qs_results to public;
grant usage on sequence qs_results_n_seq to public;

create function pg_temp.qs_check(p_name text, p_ok boolean, p_detail text default '')
returns void language sql as $$
  insert into qs_results (check_name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;

-- ---------------------------------------------------------------- setup (owner)
insert into projects (id, name) values ('00000000-0000-0000-0000-0000000000a0', 'qs-test');
insert into manifests (id, project_id, sha256, schema_version, yaml)
  values ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000a0',
          'qs_sha', 'qscore.project/v0.2', 'schema: qscore.project/v0.2'),
         ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a0',
          'qs_sha2', 'qscore.project/v0.2', 'schema: qscore.project/v0.2');
-- A: any worker.  B: needs a GPU.  C: any worker (will be cancelled).
insert into jobs (id, kind, payload, requires, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', 'validate', '{}', '{}', 'qs-test'),
  ('00000000-0000-0000-0000-0000000000c2', 'score', '{}', '{"gpu": true, "aer_gpu": true}', 'qs-test'),
  ('00000000-0000-0000-0000-0000000000c3', 'validate', '{}', '{}', 'qs-test');

-- ---------------------------------------------------------------- platform
set role qscore_platform;
do $$
declare r boolean; jid uuid;
begin
  insert into jobs (kind, payload, requires, created_by)       -- nobody has a local model
    values ('score', '{}', '{"local_model": true}', 'qs-platform') returning id into jid;
  perform pg_temp.qs_check('platform can insert a job', jid is not null);

  perform pg_temp.qs_check('platform sees seeded manifest',
    exists (select 1 from manifests where sha256 = 'qs_sha'));

  select cancel_job('00000000-0000-0000-0000-0000000000c3') into r;
  perform pg_temp.qs_check('platform cancels a queued job', r is true, coalesce(r::text, 'null'));

  select confirm_manifest('qs_sha', 'stored') into r;
  perform pg_temp.qs_check('platform confirms a manifest', r is true);
  select confirm_manifest('qs_sha', 'yes_flag') into r;
  perform pg_temp.qs_check('second confirmation is idempotent and keeps the first mode',
    r is true and (select confirmed_mode from manifests where sha256 = 'qs_sha') = 'stored');
  select confirm_manifest('no_such_sha', 'stored') into r;
  perform pg_temp.qs_check('confirming an unknown hash returns false', r is false, coalesce(r::text, 'null'));

  begin
    perform confirm_manifest('qs_sha2', 'bogus');   -- qs_sha2 is unconfirmed, so the update runs
    perform pg_temp.qs_check('invalid confirmation mode is rejected', false, 'bogus mode accepted');
  exception when check_violation then
    perform pg_temp.qs_check('invalid confirmation mode is rejected', true, sqlerrm);
  end;

  begin
    update jobs set state = 'done' where id = '00000000-0000-0000-0000-0000000000c1';
    perform pg_temp.qs_check('platform cannot update jobs directly', false, 'update succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('platform cannot update jobs directly', true, sqlerrm);
  end;

  begin
    insert into scorecards (job_id, item_id, item_sha256, score_version, status, scorecard)
      values ('00000000-0000-0000-0000-0000000000c1', 'x', 'x', 'v', 'complete', '{}');
    perform pg_temp.qs_check('platform cannot write scorecards', false, 'insert succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('platform cannot write scorecards', true, sqlerrm);
  end;

  begin
    perform claim_job('qs_cpu', '{}');
    perform pg_temp.qs_check('platform cannot claim jobs', false, 'claim succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('platform cannot claim jobs', true, sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- worker: claiming
set role qscore_worker;
do $$
declare cpu_job uuid; cpu_job2 uuid; gpu_job uuid; hb job_state; hb_wrong job_state; n int;
begin
  insert into workers (id, capabilities) values
    ('qs_cpu', '{"gpu": false}'), ('qs_gpu', '{"gpu": true, "aer_gpu": true}')
  on conflict (id) do update set last_seen_at = now();
  perform pg_temp.qs_check('worker can register itself',
    (select count(*) from workers where id in ('qs_cpu', 'qs_gpu')) = 2);

  select id into cpu_job from claim_job('qs_cpu', '{"gpu": false}');
  perform pg_temp.qs_check('CPU worker claims the CPU-capable job',
    cpu_job = '00000000-0000-0000-0000-0000000000c1', coalesce(cpu_job::text, 'null'));

  select id into cpu_job2 from claim_job('qs_cpu', '{"gpu": false}');
  perform pg_temp.qs_check('CPU worker gets nothing else (GPU job skipped, cancelled job skipped)',
    cpu_job2 is null, coalesce(cpu_job2::text, 'null'));

  select id into gpu_job from claim_job('qs_gpu', '{"gpu": true, "aer_gpu": true}');
  perform pg_temp.qs_check('GPU worker claims the GPU job',
    gpu_job = '00000000-0000-0000-0000-0000000000c2', coalesce(gpu_job::text, 'null'));
  perform pg_temp.qs_check('claim sets state, owner and attempts',
    (select state = 'claimed' and claimed_by = 'qs_gpu' and attempts = 1
       from jobs where id = '00000000-0000-0000-0000-0000000000c2'));

  select heartbeat('00000000-0000-0000-0000-0000000000c2', 'qs_gpu') into hb;
  perform pg_temp.qs_check('heartbeat returns the job state to its owner', hb = 'claimed', coalesce(hb::text, 'null'));
  select heartbeat('00000000-0000-0000-0000-0000000000c2', 'qs_cpu') into hb_wrong;
  perform pg_temp.qs_check('heartbeat from a non-owner returns NULL (claim lost)', hb_wrong is null);

  update jobs set state = 'running', started_at = now()
   where id = '00000000-0000-0000-0000-0000000000c2' and claimed_by = 'qs_gpu';
  select heartbeat('00000000-0000-0000-0000-0000000000c2', 'qs_gpu') into hb;
  perform pg_temp.qs_check('worker can mark its job running', hb = 'running', coalesce(hb::text, 'null'));

  begin
    update jobs set payload = '{"x": 1}' where id = '00000000-0000-0000-0000-0000000000c2';
    perform pg_temp.qs_check('worker cannot rewrite job payload', false, 'update succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('worker cannot rewrite job payload', true, sqlerrm);
  end;

  begin
    update jobs set requires = '{}' where id = '00000000-0000-0000-0000-0000000000c2';
    perform pg_temp.qs_check('worker cannot rewrite job requirements', false, 'update succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('worker cannot rewrite job requirements', true, sqlerrm);
  end;

  begin
    delete from jobs where id = '00000000-0000-0000-0000-0000000000c2';
    perform pg_temp.qs_check('worker cannot delete jobs', false, 'delete succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('worker cannot delete jobs', true, sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------- platform: cancel after claim
set role qscore_platform;
do $$
declare r boolean;
begin
  select cancel_job('00000000-0000-0000-0000-0000000000c1') into r;   -- already claimed
  perform pg_temp.qs_check('platform cannot cancel a claimed job', r is not true, coalesce(r::text, 'null'));
end $$;
reset role;

-- ---------------------------------------------------------------- worker: writing results
set role qscore_worker;
do $$
declare n int;
begin
  insert into job_events (job_id, seq, at, kind, data) values
    ('00000000-0000-0000-0000-0000000000c2', 1, now(), 'run_started', '{}'),
    ('00000000-0000-0000-0000-0000000000c2', 2, now(), 'stage_started', '{}');
  insert into job_events (job_id, seq, at, kind, data)
    values ('00000000-0000-0000-0000-0000000000c2', 1, now(), 'run_started', '{}')
    on conflict (job_id, seq) do nothing;
  select count(*) into n from job_events where job_id = '00000000-0000-0000-0000-0000000000c2';
  perform pg_temp.qs_check('job_events insert works (bigserial) and a replayed seq is ignored', n = 2, n::text);

  insert into scorecards (job_id, item_id, item_sha256, score_version, status, primary_metric,
                          primary_value, worst_severity, findings_count, scorecard)
    values ('00000000-0000-0000-0000-0000000000c2', 'item1', 'item_sha', 'qscore-2026.1', 'complete',
            'two_qubit_count', 212, 'high', 2, '{"schema": "qscore.scorecard/v0.2"}')
    on conflict (job_id, item_sha256) do nothing;
  insert into scorecards (job_id, item_id, item_sha256, score_version, status, scorecard)
    values ('00000000-0000-0000-0000-0000000000c2', 'item1', 'item_sha', 'qscore-2026.1', 'complete', '{}')
    on conflict (job_id, item_sha256) do nothing;
  select count(*) into n from scorecards where job_id = '00000000-0000-0000-0000-0000000000c2';
  perform pg_temp.qs_check('scorecard insert works and a replay does not duplicate', n = 1, n::text);

  insert into telemetry (job_id, worker_id, at, gpu_util)
    values ('00000000-0000-0000-0000-0000000000c2', 'qs_gpu', '2026-10-10 12:00:00+00', 0.5)
    on conflict (job_id, at) do nothing;
  insert into bench_results (worker_id, suite, result) values ('qs_gpu', 'default', '{}');
  perform pg_temp.qs_check('worker can write telemetry and bench results', true);

  -- Leaderboard fixture: layer qs-layer, 3 requests (r1 two parsed proposals, r2 parse failure, r3 empty).
  insert into layer_calls (call_id, job_id, round, request_id, layer, layer_version, model, provider,
                           prompt_version, outcome, n_proposals, latency_ms, cost_usd, record) values
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2', 1, 'r1',
     'qs-layer', '1', 'm1', 'p1', 'v1', 'proposals',     2, 100, 0.001, '{}'),
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 1, 'r2',
     'qs-layer', '1', 'm1', 'p1', 'v1', 'parse_failure', 0, 300, 0.002, '{}'),
    ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c2', 1, 'r3',
     'qs-layer', '1', 'm1', 'p1', 'v1', 'empty',         0, 200, 0.000, '{}');
  insert into attempts (job_id, call_id, item_sha256, request_id, proposal_sha256, layer, layer_version,
                        model, provider, prompt_version, parse_ok, verification_status, decision, record) values
    ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d1', 'item_sha', 'r1',
     'pa', 'qs-layer', '1', 'm1', 'p1', 'v1', true, 'passed', 'accepted', '{}'),
    ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d1', 'item_sha', 'r1',
     'pb', 'qs-layer', '1', 'm1', 'p1', 'v1', true, 'failed', 'rejected', '{}');
  insert into attempts (job_id, call_id, item_sha256, request_id, proposal_sha256, layer, layer_version,
                        parse_ok, decision, record)
    values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d1', 'item_sha', 'r1',
            'pa', 'qs-layer', '1', true, 'accepted', '{}')
    on conflict (job_id, call_id, proposal_sha256) do nothing;
  select count(*) into n from attempts where job_id = '00000000-0000-0000-0000-0000000000c2';
  perform pg_temp.qs_check('attempts and layer_calls insert; replayed attempt key is ignored', n = 2, n::text);
end $$;
reset role;

-- ---------------------------------------------------------------- stale jobs
update jobs set heartbeat_at = now() - interval '2 minutes'
 where id = '00000000-0000-0000-0000-0000000000c2';
set role qscore_worker;
do $$
declare n int; j jobs;
begin
  select requeue_stale() into n;
  select * into j from jobs where id = '00000000-0000-0000-0000-0000000000c2';
  perform pg_temp.qs_check('a job with no heartbeat for 60 s goes back to queued',
    n = 1 and j.state = 'queued' and j.claimed_by is null and j.attempts = 1,
    format('n=%s state=%s claimed_by=%s attempts=%s', n, j.state, j.claimed_by, j.attempts));
  perform pg_temp.qs_check('the other worker''s fresh job was left alone',
    (select state = 'claimed' from jobs where id = '00000000-0000-0000-0000-0000000000c1'));
end $$;
reset role;

-- third lost attempt: the job fails with LostWorker instead of requeueing
update jobs set state = 'claimed', claimed_by = 'qs_gpu', attempts = 3,
                heartbeat_at = now() - interval '2 minutes'
 where id = '00000000-0000-0000-0000-0000000000c2';
set role qscore_worker;
do $$
declare j jobs;
begin
  perform requeue_stale();
  select * into j from jobs where id = '00000000-0000-0000-0000-0000000000c2';
  perform pg_temp.qs_check('after max_attempts the job fails with LostWorker',
    j.state = 'failed' and j.error ->> 'type' = 'LostWorker' and j.finished_at is not null,
    coalesce(j.error::text, 'null'));
end $$;
reset role;

-- ---------------------------------------------------------------- read-only role and views
set role qscore_readonly;
do $$
declare lb record;
begin
  perform pg_temp.qs_check('readonly can read jobs', (select count(*) from jobs) >= 3);

  select * into lb from leaderboard where layer = 'qs-layer';
  perform pg_temp.qs_check('leaderboard requests = 3 distinct requests', lb.requests = 3, lb.requests::text);
  perform pg_temp.qs_check('leaderboard proposals = 2', lb.proposals = 2, lb.proposals::text);
  perform pg_temp.qs_check('leaderboard parse_rate = 2 / (2 + 1 parse failure)',
    round(lb.parse_rate, 4) = 0.6667, lb.parse_rate::text);
  perform pg_temp.qs_check('leaderboard verified_rate = 1 passed / 2 parsed',
    round(lb.verified_rate, 4) = 0.5, lb.verified_rate::text);
  perform pg_temp.qs_check('leaderboard verified_improvement_rate = 1 accepted request / 3',
    round(lb.verified_improvement_rate, 4) = 0.3333, lb.verified_improvement_rate::text);
  perform pg_temp.qs_check('leaderboard median latency per call = 200 ms',
    lb.median_latency_ms = 200, lb.median_latency_ms::text);
  perform pg_temp.qs_check('leaderboard cost = sum over calls = 0.003', lb.cost_usd = 0.003, lb.cost_usd::text);

  perform pg_temp.qs_check('job_status shows the GPU worker last seen',
    (select gpu_last_seen is not null from job_status limit 1));

  begin
    perform count(*) from telemetry;
    perform pg_temp.qs_check('readonly cannot read telemetry', false, 'select succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('readonly cannot read telemetry', true, sqlerrm);
  end;

  begin
    insert into projects (name) values ('nope');
    perform pg_temp.qs_check('readonly cannot insert', false, 'insert succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('readonly cannot insert', true, sqlerrm);
  end;

  begin
    perform claim_job('qs_ro', '{}');
    perform pg_temp.qs_check('readonly cannot claim jobs', false, 'claim succeeded');
  exception when insufficient_privilege then
    perform pg_temp.qs_check('readonly cannot claim jobs', true, sqlerrm);
  end;
end $$;
reset role;

select n, check_name, ok, detail from qs_results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from qs_results;

rollback;
