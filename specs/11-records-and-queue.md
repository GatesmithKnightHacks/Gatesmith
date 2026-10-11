# 11 · Records and the queue: the platform job API, the worker, the Hub

> **Status:** binding (schema and API changes are class A) · **Tier:** 0 · **Read:** before working on `record/jobs_client.py`, `record/hub.py`, `worker.py`, or the platform job API.
> **ChP-0047 (2026-10-11):** The queue lives behind the platform's HTTPS job API; records are local files plus the Hugging Face Hub.

## 1. Why this shape

The GPU machine is created and destroyed every session, so nothing that matters may live only on it. The **platform** (Vultr, teammate-owned) keeps the job queue in its own store and exposes it over HTTPS; the **Hub** stores files and the durable history (content-addressed). Every worker connects **outbound over HTTPS** to both; no host needs the GPU machine's address, and the GPU machine needs only HTTPS egress (true on Radeon Cloud through its proxy).

## 2. Job model (unchanged semantics)

- Job document: `qscore.job/v0.2` (04 §9). States: `queued → claimed → running → done | failed`; `queued → cancelled`.
- `requires` holds boolean flags only (`gpu`, `aer_gpu`, `hub_write`); a worker may claim a job when every `true` flag in `requires` is `true` in its capabilities.
- Claim is **atomic**: the platform guarantees a job has at most one claimant (e.g. a transaction or compare-and-set in its store).
- Heartbeat every 10 s; a job with no heartbeat for 60 s returns to `queued` with `attempts + 1`; after `max_attempts` (3) lost attempts it becomes `failed` with error type `LostWorker`.
- A failed job stays failed (a human re-submits); the worker never retries a failed job itself.

## 3. Platform job API (the contract the platform implements)

Base URL `QSCORE_PLATFORM_URL`; every worker request carries `Authorization: Bearer <QSCORE_WORKER_TOKEN>` (one token per worker, issued by the platform). JSON bodies; all responses include the job's current `state`.

| Method & path | Caller | Body → response | Rules |
|---|---|---|---|
| `POST /api/jobs` | platform UI/CLI | `qscore.job/v0.2` payload → `{id, state: "queued"}` | stores the confirmation (05 §5) with the manifest hash |
| `POST /api/jobs/{id}/cancel` | platform | → `{state}` | only `queued → cancelled` |
| `GET /api/jobs/{id}` | anyone with platform access | → job + `result_summary` | read-only |
| `POST /api/worker/register` | worker | `{worker_id, capabilities, hardware_profile}` → `{ok}` | upserts the worker; sets `last_seen_at` (GPU-online indicator) |
| `POST /api/worker/claim` | worker | `{worker_id, capabilities}` → job or `204 No Content` | requeues stale jobs first; claims the oldest highest-priority matching job atomically |
| `POST /api/jobs/{id}/heartbeat` | worker | `{worker_id}` → `{state}` | `409` if the worker no longer holds the claim → the worker MUST stop work on the job immediately, discard unwritten results and log `ERROR` |
| `POST /api/jobs/{id}/start` | worker | `{worker_id}` → `{state: "running"}` | |
| `POST /api/jobs/{id}/events` | worker | `[Event]` (≤ 50 per call, every ≤ 2 s) → `{ok}` | idempotent on `(job_id, seq)` |
| `POST /api/jobs/{id}/finish` | worker | `{worker_id, result_summary, hub_paths}` → `{state: "done"}` | idempotent; a second finish with different content → `409` |
| `POST /api/jobs/{id}/fail` | worker | `{worker_id, error: {type, message, at, attempt}}` → `{state: "failed"}` | |

Transient errors (network, 5xx, 429): bounded retries (3, backoff) then `PlatformError` (R3.5). Any other non-2xx is an error, never ignored.

## 4. Writes are idempotent

Every write carries a natural key: scorecards `(job_id, item_sha256)`, attempts `(job_id, request_id, proposal_sha256)`, events `(job_id, seq)`. Hub paths are content-addressed. Re-sending the same content is a no-op; the same key with different content raises `RecordError` (two different results for the same key is a bug, not a merge).

## 5. Worker (`worker.py`, `qscore worker`)

```
start: settings → profile_hardware() → capabilities (from profile; override only via QSCORE_CAPABILITIES) → POST /api/worker/register
loop:
  job = POST /api/worker/claim                    # 204 → sleep poll_s (default 5 s; 30 s when idle > 10 min)
  POST start
  heartbeat thread every 10 s (409 → claim lost → stop work on this job immediately)
  result = services.<kind>(job.payload, on_event=batched_event_writer)
  write results (local JSON → Hub batch commit → POST finish with hub_paths)
  on exception: POST fail (error)
```

- One job at a time per worker process; GPU work is guarded by an in-process GPU lease. Run a second worker process with `capabilities.gpu=false` for CPU jobs alongside.
- Signals: SIGTERM/SIGINT → flush the current event batch, `fail` the job with `type: WorkerStopped` (not requeued automatically), exit 0.
- **Platform API unreachable mid-job:** default → log ERROR, exit non-zero (the heartbeat timeout requeues the job). With **FB-05** enabled → spool results under `~/.qscore/spool/<job>/` and replay on reconnect (idempotent keys make replays safe); record `fallbacks_used`.
- Client: `record/jobs_client.py` (`JobsClient`: `register`, `claim`, `start`, `heartbeat`, `events`, `finish`, `fail`) over `httpx`; errors → `PlatformError(RecordError)`.

## 6. Local records (laptop and every worker)

- `scorecards/<item_id>.json` written atomically (temp file + `os.replace`).
- `runs/<run_id>/run_record.json`, `events.jsonl`, `telemetry.jsonl`.
- Cache: `.qscore/cache/` (content-addressed; `05-pipeline.md` §6).
- Local files are the first write; Hub writes and the platform `finish` follow. A failed Hub/platform write fails the job (no silent local-only success) unless FB-05 is enabled.

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

**Upload options (★):** ★ `create_commit` batched per job · `upload_folder` from a staging dir · `CommitScheduler` background commits (commits on a timer, which makes "this job's results are on the Hub" harder to assert) · git + LFS (no).

## 8. Exports and the leaderboard

- `export_records(kind)`: attempts parquet for a job (columns flattened from `qscore.attempt/v0.2`: ids, layer, model, provider, prompt_version, strategy, parse_ok, verification_status, decision, before/after primary metric, latency, tokens, cost).
- `leaderboard.parquet` is computed from all `attempts/**.parquet` on the Hub, grouped by (layer, model, provider, prompt_version): requests, proposals, parse rate, verified rate (passed ÷ parsed), verified-improvement rate (requests with an accepted proposal ÷ requests), median latency, tokens, cost. Regenerated at the end of each `improve` job (one commit with the job's attempts file).
- The dataset card lists the columns and the schema id.

## 9. Queue options (★ default; others need class A)

| Option | Pros | Cons |
|---|---|---|
| ★ Platform HTTPS job API (§3) over the platform's own store | HTTPS only (works through the Radeon Cloud proxy); one integration point; the platform already exists | The platform must be up for workers to get work |
| Hosted queue (Redis/RQ, SQS) | Push-based | Another service and secret; no history |
| Hub-dataset queue (jobs as files) | No extra service | No atomic claim; races between workers |
