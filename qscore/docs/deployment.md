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
| `record/neon.py` (Neon store: platform + worker methods) | written, tested locally against the MVP engine | 11 §3–5 |
| Platform API `api/app.py` | written, tested locally (direct and behind Caddy) | 12 §2, T28 |
| `worker.py` | written, tested locally (score, stop, crash + retry); run it per §3.2 | 11 §5, T22 |
| `qscore db migrate` | not written; migrations were applied by hand | 05 §11, T05 |
| Deploy files `qscore/docker/` (image, compose, Caddy, scripts) | written, tested locally | 12 §3 |
| Vultr server (Docker + Caddy, HTTPS via `<ip>.sslip.io`) | live: `https://149.28.122.224.sslip.io` | 12 §3 |
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

`qscore.record.neon.NeonStore` already implements every step above: `upsert_worker`, `touch_worker`,
`requeue_stale`, `claim_job`, `start_job`, `heartbeat`, `insert_events`, `insert_scorecard`,
`finish_job`, `fail_job`. Build it with `NeonStore.from_settings(get_settings())`.

### 3.1 What a worker must do with the MVP engine (verified 2026-10-10 against `main` at 98a5ab8)

- **A score job** carries the bundled example's folder name in `payload["x-example"]` and the
  manifest's hash in `payload["manifest_sha256"]`. Run
  `services.score_project(examples/<x-example>/qscore.yaml, out_dir, on_event=collect, confirm="yes")`,
  then `insert_events(job_id, collected)` and `insert_scorecard(job_id, card)` for each scorecard.
  The confirmation is already stored in Neon by the platform, which is why `confirm="yes"` is correct.
- **Guard the entry point.** The engine compiles in a spawn-based process pool, which re-imports the
  main module in every child. A worker started as a script without `if __name__ == "__main__":`
  breaks the pool (`BrokenProcessPool`) and every scorecard comes out `partial`.
- **Install `git`.** Provenance calls the `git` program; without it scoring crashes
  (`FileNotFoundError: 'git'`). Inside a checkout it records the commit; outside one it records none.
- **Events are coarse in the MVP:** `run_started`, `item_started`, `item_finished`, `run_finished`.
  The UI can show stage changes, not a percentage.
- **Timing measured in Docker on a laptop:** `sbox_oracle` about 1.5 min, `sidechain_qaoa` (builder via
  the sandbox, 5-size sweep) about 2.3 min. Both `complete`; QAOA gives D01 + D03, as the demo expects.

### 3.2 Running the worker (`qscore/src/qscore/worker.py`)

It only calls `services.score_project`; no engine code was changed for it. Start it from the `qscore/`
folder of an up-to-date checkout (the same commit as the platform, or score jobs fail with a manifest
hash mismatch), in a terminal that stays open (`tmux`, or `nohup … &`), not a notebook cell:

Settings come from a private `.env.worker` file at the repo root, made from the shared template:

```bash
cp .env.example .env.worker            # once; git ignores .env.worker (only .env.example is shared)
# edit .env.worker: the qscore_worker connection string (production, DIRECT host), this machine's
# capabilities, and a worker id. Get the password from the deployment owner privately.

cd qscore
uv sync --frozen --extra neon          # adds psycopg; install git too if missing
set -a; . ../.env.worker; set +a       # load the settings into this shell
uv run python -m qscore.worker
```

| Variable | Required | Value |
|---|---|---|
| `QSCORE_NEON_DSN` | yes | `qscore_worker` role, production branch, **direct** host (no `-pooler`); single-quoted (contains `&`) |
| `QSCORE_CAPABILITIES` | yes | `'{"gpu": true, "neon_write": true}'` on the AMD notebook; `"gpu": false` on a laptop |
| `QSCORE_WORKER_ID` | no | e.g. `'w7900-notebook'`; default `worker-<hostname>` |
| `QSCORE_EXAMPLES_DIR` | no | defaults to this checkout's `qscore/examples` |

The Vultr server's settings are a different file and template: `/opt/qscore/.env` from
`qscore/docker/env.example` (§7).

**Run workers from a Linux or macOS checkout** (like the AMD notebook). A Windows checkout with
`core.autocrlf=true` rewrites line endings in the example manifests, so their hash differs from the
platform's and every job fails with "this worker's copy of … differs from the platform's" (seen
2026-10-10). On Windows, use WSL or Docker, or clone with `git -c core.autocrlf=false clone …`.

| Situation | Behaviour (verified 2026-10-10) |
|---|---|
| Missing `QSCORE_CAPABILITIES`, `QSCORE_NEON_DSN`, `git` or examples | Refuses to start, exit 4, says what is missing |
| Idle | Polls every 5 s (30 s after 10 idle minutes); keeps `last_seen_at` fresh (GPU-online light) |
| Job | Claims, heartbeats every 10 s, streams events every 2 s, writes the scorecard, `done` with `result_summary` |
| Engine raises | Job `failed` with the error; the worker carries on (failed jobs are not retried, 11 §5) |
| SIGTERM / Ctrl+C mid-job | Job `failed` / `WorkerStopped` (not requeued), exit 0. The signal never reaches engine code |
| Crash (kill -9, notebook dies) | After 60 s without heartbeat the job is requeued; the next worker retries it (attempt 2 of 3) |
| Neon unreachable | Exits non-zero; the heartbeat timeout requeues the job |

A retried job's events are numbered after the previous attempt's, so the UI shows both runs in order.

## 4. Platform API (`api/app.py`): what the web app calls

Served on port 8080; Caddy exposes it under `/api` (prefix stripped). Interactive docs: `/api/docs`.

| Method and path (browser) | Returns | Notes |
|---|---|---|
| `GET /api/health` | `{ok, version, gpu_online, gpu_last_seen, examples}` | `gpu_online`: a GPU worker checked in within 30 s (12 §4) |
| `POST /api/jobs` body `{"example": "sidechain_qaoa"}` | `201 {id, state, kind, example, items}` | Open; bundled examples only. `422` unknown example, `429` limits |
| `GET /api/jobs/{id}` | `{id, kind, state, example, items, attempts, …timestamps, error, result_summary}` | Also recovers stale jobs (12 §2) |
| `GET /api/jobs/{id}/events?after=SEQ` | `[{seq, at, kind, data}]` | Poll with the last seen `seq` |
| `GET /api/jobs/{id}/scorecards` | `[{item_id, item_sha256, status, worst_severity, findings_count, scorecard, …}]` | `scorecard` is the full `qscore.scorecard/v0.2` |
| `GET /api/scorecards/{item_sha256}` | the latest scorecard for that item | `404` if none |
| `GET /api/jobs/{id}/attempts` | `[qscore.attempt/v0.2]` | Empty until the improvement loop exists |
| `GET /api/leaderboard` | leaderboard view rows | Empty until the loop exists |
| `POST /api/jobs/{id}/cancel` | `{id, state: "cancelled"}` | Needs `Authorization: Bearer <QSCORE_PLATFORM_TOKEN>`; `409` unless queued |

Job states for the UI: `queued` (waiting for a worker; show "waiting for GPU/worker"), `claimed`,
`running`, `done`, `failed` (show `error`), `cancelled`. Errors: `503` when Neon is unreachable,
`404` unknown job, `422` malformed id.

Under the hood: `create_job` writes `requires` with **only `true` flags** (CP-0005), the platform
records the confirmation with `confirm_manifest(sha, 'stored')`, and status reads call
`requeue_stale()`.

**Limits (open submission):** at most 10 unfinished web jobs in total, and 5 submissions per client per
10 minutes. Change `MAX_OPEN_JOBS`, `PER_CLIENT_LIMIT`, `PER_CLIENT_WINDOW_S` in `api/app.py`.

### 4.1 How the web app uses it (live build)

- **Live vs demo is a build setting.** `Containerfile.web` builds with `VITE_API_MODE=live`; `npm run dev`
  without it keeps the scripted demo engine, so design review and the Playwright flow test are unchanged.
- **Live flow:** S-01 pick a bundled example → S-03 *Confirm and score* → `POST /api/jobs` → the workspace
  polls `/api/jobs/{id}` and `/events` every 2 s (`web/src/data/run.ts`, `runLive`) → on `done` it loads
  `/scorecards` and shows the real findings and scorecard rows (`web/src/data/live.ts`). The run stops
  there: *Request fix* is inert and a notice says the loop is not connected yet.
- **Honest labels:** the circuit and QASM panes are marked "illustration · not this run"; failures show the
  API's message and a *Start over* button, never demo data. Deep-linked design snapshots, the scripted
  S-03 checks and the loop screens (S-06, S-07, S-09) are still design data.
- **New files:** `web/src/data/api.ts` (client), `web/src/data/live.ts` (scorecard → cards and rows),
  `web/src/screens/workspace/LiveStatus.tsx`. Edited: `run.ts` (live flow; S-01's pick now survives
  *Continue*), `S04Workspace.tsx` (data source when a live run exists).
- **Verified 2026-10-10** with the production images, a test worker running the MVP engine and headless
  Chrome: both examples submit, score and render (QAOA: 5 findings; S-box: 11), no console errors.

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
| 7 | `POST /jobs` is open (no token), limited to bundled examples, 10 open jobs, 5 per client per 10 min | 12 §2: write endpoints need the platform token | The UI is a static browser app and cannot keep a secret (decided by the user, 2026-10-10) |
| 8 | A score job names its bundled example in `payload["x-example"]`; no Hub bundle | CP-0006: inputs travel as Hub bundles | Bundled examples already exist on every worker; `.qasm` uploads will use Hub bundles |
| 9 | `POST /projects/{name}/manifests` and `POST /manifests/{sha}/confirm` not implemented | 12 §2 | Only bundled examples for now; `POST /jobs` stores the confirmation itself |

## 7. Vultr (platform host)

- One Cloud Compute **Regular 2 GB** server, **Docker** marketplace image, region near the Neon region.
- Vultr **firewall group**: inbound TCP 22, 80, 443 only (Docker bypasses on-host `ufw`; the cloud firewall does not).
- HTTPS by **Caddy** at `https://<ip>.sslip.io` (or a domain later). Caddy serves the **web app** (`web/`,
  React + Vite, built into the Caddy image) and sends **`/api/*` to the platform on port 8080 with the `/api`
  prefix removed**: the browser calls `/api/jobs`, the platform receives `/jobs` (the paths of 12 §2).
- **Deviation (lead: record a class B proposal against D-024 / 12 §1):** the UI is a static React app on
  the `design` branch, not Gradio inside the platform process; the platform is API only.
- Live: `https://149.28.122.224.sslip.io` (server `gatesmith-platform`, Atlanta, 1 vCPU / 2 GB). It tracks
  branch `vepaul-deployment`; deploys are manual (`deploy.sh`).
- Secrets in `/opt/qscore/.env` (`chmod 600`), never in the image: `QSCORE_NEON_DSN` (platform role),
  `QSCORE_PLATFORM_TOKEN`, `HF_TOKEN` (write to `qscore-runs`, CP-0006), `GEMINI_API_KEY` (Tier 2 only).
  Template: `qscore/docker/env.example` (named without a leading dot because `.gitignore` ignores `.env.*`).

### 7.1 Files in `qscore/docker/`

| File | Does |
|---|---|
| `Containerfile.platform` | `python:3.12-slim` + `uv sync --frozen --no-dev --extra ui --extra neon`; runs as non-root `qscore`; `CMD uvicorn qscore.api.app:app --port 8080` |
| `Containerfile.platform.dockerignore` | Sends only `pyproject.toml`, `uv.lock`, `README.md`, `LICENSE`, `src/` to the build |
| `Containerfile.web` | Builds `web/` with Node 22 (`npm ci && npm run build`, needs `design/tokens.css`), then copies `dist/` into a `caddy:2` image at `/srv`. Context: repo root |
| `Containerfile.web.dockerignore` | Sends only `web/` (minus `node_modules`, `dist`, test output, design PNGs) and `design/tokens.css` |
| `compose.yaml` | Services `caddy` (built from `Containerfile.web`; ports 80/443; cert volume) and `platform` (port 8080, internal only, `env_file` = `/opt/qscore/.env`) |
| `Caddyfile` | HTTPS for `{$SITE_ADDRESS}`; `/api/*` → `platform:8080` (prefix stripped); everything else → the web app (`try_files … /index.html`); API calls get a plain 503 message while the platform is down |
| `bootstrap_vultr.sh` | One time, as root: clone to `/opt/qscore/repo`, create the env file with `SITE_ADDRESS=<ip>.sslip.io`, add 2 GiB swap, run `deploy.sh`. Never overwrites existing files |
| `deploy.sh` | `git pull --ff-only`; fails if the branch has no `web/package.json` or `design/tokens.css`; then `docker compose up -d --build` (rebuilds the web app every deploy); starts **Caddy only** while `src/qscore/api/app.py` does not exist |
| `.gitattributes` | Keeps `*.sh` LF so they run on Linux when committed from Windows |

Run the scripts with `bash <script>` (the executable bit is not preserved from Windows).

### 7.2 Verified locally (2026-10-10, Docker 28.4)

- Image builds from the lockfile (1.83 GB; Python 3.12, qiskit 2.5.2, fastapi 0.143.0, gradio 6.30.0, psycopg 3.3.6); `qscore --help` works; runs as `qscore`.
- `caddy validate` passes (Caddy 2.11.7); with no platform running, the site answers `503` with the placeholder text.
- `docker compose config` resolves; scripts pass `bash -n`; IP detection and env templating tested on sample input.
- Web image builds from the `design` branch's `web/` (Node 22, `npm ci`, Vite build). Served behind a stand-in
  platform: `/` → 200 HTML, assets gzip-compressed, unknown paths → the app, `/api/health` arrives as `/health`,
  `/api/jobs/123/events` as `/jobs/123/events`; with the platform stopped, `/api/*` → 503 message, `/` still 200.
- Not testable locally: the real certificate, the clone on the server, swap. They run on first bootstrap.

### 7.3 Notes for the API and the web app

- `api/app.py` exists (§4). The image's `CMD` runs its module-level FastAPI `app` on port 8080 behind
  Caddy (`--proxy-headers`); compose sets `API_ROOT_PATH=/api` so `/api/docs` works. Routes are defined
  **without** an `/api` prefix. The platform image copies `qscore/examples/` (minus `broken/`) so the API
  can read the bundled manifests. It fails at startup if `QSCORE_NEON_DSN` is unset or empty.
- **Web app:** call the API with relative URLs under `/api/` (e.g. `fetch('/api/jobs/' + id)`), never a
  hard-coded host. For `npm run dev` on a laptop, proxy `/api` to a local platform in `vite.config.ts`
  (`server.proxy`), stripping the prefix the same way.
- **Empty env values are not "unset":** `QSCORE_NEON_DSN=` yields `SecretStr('')`, not `None`. Treat an empty
  DSN or token as missing and fail loudly (`ConfigError`), or a blank `.env` line looks configured.
- Extra `QSCORE_*` variables that are not `Settings` fields (e.g. `QSCORE_PLATFORM_TOKEN`) are accepted, not rejected.

## 8. Rules for agents

- Do not create, stop, reset or delete cloud resources (Neon branches or roles, Vultr servers, Hub repos) (R10.4). Ask the deployment owner.
- Never print, log or commit connection strings or passwords; never ask a person to paste one into a chat.
- Develop and test against `dev`. Run `tests/queue/neon_smoke.sql` there after any SQL change.
- Schema changes go in a new migration file and, if they change a contract, a change proposal first (R5).

## 9. Open questions

- Hugging Face org name for `qscore-runs`, `qscore-wheels` and the Space (18 §3).
- The Radeon Cloud GPU machine is a **notebook with no inbound access** (no SSH, no exposed port) but with
  outbound internet. That matches the queue design (the worker connects out to Neon; nothing connects in), but
  nothing can deploy to it or call it: update its code with `git pull` inside the notebook. **Still unverified:
  outbound TCP 5432** to Neon (some notebooks allow only HTTPS). If 5432 is blocked, the worker cannot use
  `QSCORE_NEON_DSN` and FB-03 (Neon Data API over HTTPS, or a relay through the Vultr platform) needs the user's decision.
- Team decision on two Neon-track extras: per-PR Neon branches running the smoke test in CI, and a
  scheduled Neon Function calling `requeue_stale()` (architecture change; needs a proposal).
