# Deployment preparation: SQLite, Vultr and Hugging Face

ChP-0054 replaces Neon product support with a platform-owned persistent SQLite queue. No existing cloud database or server was changed by this source migration. The deployment owner must review the environment and back up any existing data before deploying.

## Current readiness

- Platform: SQLite store and authenticated HTTPS worker endpoints. Caddy strips `/api` before forwarding requests. Compose mounts `platform_data` at `/var/lib/qscore`; the non-root platform user owns that directory.
- Worker: startup refuses with a configuration error before registering or claiming. Hub batch publication, immediate computation cancellation after a lost claim and result materialization remain to be wired. Local engine CLI scoring and the GitHub Action scoring path remain available.
- Browser: public job/event/scorecard reads are connected. Submission is visibly disabled until the deployment owner supplies server-side session/BFF authentication. Never put platform or worker bearer tokens in Vite variables.
- Scorecards: a completed job without materialized Hub results returns an explicit unavailable error. Leaderboard reads remain unavailable until the Hub reader is connected. No fixture substitutes for live results.
- Containers/server: this migration has not been built with Docker or deployed to Vultr in this pass. Earlier Neon deployment verification does not validate this SQLite configuration.

## Environment and owner handoff

Use `qscore/docker/env.example` for the platform and root `.env.example` for a worker. Keep filled files private and outside Git. Set `QSCORE_PLATFORM_TOKEN` to a random server-side write token and `QSCORE_PLATFORM_WORKER_TOKENS` to a JSON map of worker IDs to distinct random tokens. A worker receives only its own `QSCORE_WORKER_TOKEN` and HTTPS `QSCORE_PLATFORM_URL` ending in `/api`.

The SQLite file defaults to `.qscore/platform.sqlite3` locally and `/var/lib/qscore/platform.sqlite3` in Compose. Persist and back up the entire SQLite directory; do not copy the database file alone while writes are active. This source change does not import old Neon records.

Before enabling the website's live run submission, finish Hub publication/materialization and browser authentication, then validate an actual score job, worker loss/requeue, job error display and container restart persistence. Keep the queue worker disabled until those required execution pieces are implemented.

The GitHub review bot uses its own separate SQLite journal and service. Its development webhook relay is independent of this platform deployment. Permanent bot HTTPS hosting is still to be arranged with the deployment owner.

## Vultr (platform host)

- One Cloud Compute **Regular 2 GB** server, **Docker** marketplace image, region chosen by the deployment owner.
- Vultr **firewall group**: inbound TCP 22, 80, 443 only (Docker bypasses on-host `ufw`; the cloud firewall does not).
- HTTPS by **Caddy** at `https://<ip>.sslip.io` (or a domain later). Caddy serves the **web app** (`web/`,
  React + Vite, built into the Caddy image) and sends **`/api/*` to the platform on port 8080 with the `/api`
  prefix removed**: the browser calls `/api/jobs`, the platform receives `/jobs` (the paths of 12 §2).
- **Deviation (lead: record a class B proposal against D-024 / 12 §1):** the UI is a static React app on
  the `design` branch, not Gradio inside the platform process; the platform is API only.
- Live: `https://gatesmith.work` (also `www.` and `https://149.28.122.224.sslip.io`; server
  `gatesmith-platform`, Atlanta, 1 vCPU / 2 GB). Deploys run from CI on the branch named by the repo
  variable `DEPLOY_BRANCH` (§7.4); `deploy.sh` still works by hand.
- Secrets in `/opt/qscore/.env` (`chmod 600`), never in the image: `QSCORE_PLATFORM_DB_PATH` (persistent SQLite file),
  `QSCORE_PLATFORM_TOKEN`, `HF_TOKEN` (write to `qscore-runs`, CP-0006), `GEMINI_API_KEY` (Tier 2 only).
  Template: `qscore/docker/env.example` (named without a leading dot because `.gitignore` ignores `.env.*`).

### Files in `qscore/docker/`

| File | Does |
|---|---|
| `Containerfile.platform` | `python:3.12-slim` + `uv sync --frozen --no-dev --extra ui`; runs as non-root `qscore`; `CMD uvicorn qscore.api.app:app --port 8080` |
| `Containerfile.platform.dockerignore` | Sends only `pyproject.toml`, `uv.lock`, `README.md`, `LICENSE`, `src/` to the build |
| `Containerfile.web` | Builds `web/` with Node 22 (`npm ci && npm run build`, needs `design/tokens.css`), then copies `dist/` into a `caddy:2` image at `/srv`. Context: repo root |
| `Containerfile.web.dockerignore` | Sends only `web/` (minus `node_modules`, `dist`, test output, design PNGs) and `design/tokens.css` |
| `compose.yaml` | Services `caddy` (built from `Containerfile.web`; ports 80/443; cert volume) and `platform` (port 8080, internal only, `env_file` = `/opt/qscore/.env`) |
| `Caddyfile` | HTTPS for `{$SITE_ADDRESS}`; `/api/*` → `platform:8080` (prefix stripped); everything else → the web app (`try_files … /index.html`); API calls get a plain 503 message while the platform is down |
| `bootstrap_vultr.sh` | One time, as root: clone to `/opt/qscore/repo`, create the env file with `SITE_ADDRESS=<ip>.sslip.io`, add 2 GiB swap, run `deploy.sh`. Never overwrites existing files |
| `deploy.sh` | No arguments: `git pull --ff-only`. With `<branch> <commit>` (what CI sends): fetch, check the commit is on `origin/<branch>`, refuse if tracked files are modified, check it out. Then: fails if the branch has no `web/package.json` or `design/tokens.css`; then `docker compose up -d --build` (rebuilds the web app every deploy); starts **Caddy only** while `src/qscore/api/app.py` does not exist |
| `.gitattributes` | Keeps `*.sh` LF so they run on Linux when committed from Windows |

Run the scripts with `bash <script>` (the executable bit is not preserved from Windows).


### CI/CD (job `deploy` in `.github/workflows/ci.yml`)

- **When:** after both `engine` and `review-bot` jobs pass, on a push or a manual run (**Actions → ci → Run workflow**) of the
  branch named by the repo variable `DEPLOY_BRANCH`. Variable unset = no deploys. Moving deploys to `main`
  later = change the variable to `main`; nothing else. Pull requests never deploy.
- **What:** SSH to the server and run `deploy.sh <branch> <commit>`, the exact commit CI tested; then poll
  `https://gatesmith.work/api/health` (override with variable `DEPLOY_HEALTH_URL`) for `"ok":true`, up to 150 s.
  Deploys never overlap (concurrency group `deploy-vultr`). **Rollback:** re-run an older green run of the branch.
- **Key:** a dedicated ed25519 key that can run only `deploy.sh`: its line in `/root/.ssh/authorized_keys` is
  `command="set -f; exec bash /opt/qscore/repo/qscore/docker/deploy.sh $SSH_ORIGINAL_COMMAND",restrict <public key>`
  (`restrict` = no shell, PTY or forwarding; `deploy.sh` accepts only a plain branch name and a full commit id).
- **GitHub settings** (Settings → Secrets and variables → Actions):

  | Name | Kind | Value |
  |---|---|---|
  | `VULTR_SSH_KEY` | secret | the deploy key's private key |
  | `VULTR_KNOWN_HOSTS` | secret | `149.28.122.224 ssh-ed25519 AAAA…` (the server's host key; pins it) |
  | `VULTR_HOST` | variable | `149.28.122.224` |
  | `DEPLOY_BRANCH` | variable | `platform-integration` (until the project moves to `main`) |

- If an image build fails, the old containers keep running (`compose up --build` builds before replacing).
  A modified tracked file on the server stops the deploy (by design).
- The **Run workflow** button appears only once `ci.yml` with `workflow_dispatch` is on the default branch
  (`main`); until then use `gh workflow run ci --ref <branch>` or re-run the branch's latest run.
