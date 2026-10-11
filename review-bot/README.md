# Gatesmith GitHub review

The GitHub App reads a checksummed scoring artifact from an allowed PR workflow. It posts an evidence-only comparison, one updating PR comment, and a `qscore` check. Repository code runs in GitHub Actions. The service reads JSON and QASM as data and never loads QPY or imports repository Python.

Gemini reviews changed lines only when the configuration on the PR's **base commit** explicitly enables it. It uses `gemini-3.1-pro-preview` with high thinking and never switches models. Its comments must cite evidence, match declared versions and pass changed-line, numerical and general-comment caps. Engine and policy failures take precedence over model failures.

## Server setup

Install the package, then run `gatesmith-review`. Set these environment variables on the server, outside Git:

- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`
- `QSCORE_BOT_REPOSITORIES`: a JSON array of explicit allowlist entries containing `repository`, `repository_id`, `installation_id`, `workflow_id`, `workflow_path`, `engine_revision`
- `QSCORE_BOT_STATE_PATH`: SQLite file on a persistent mounted volume
- `QSCORE_BOT_KNOWLEDGE_PATH`: versioned knowledge-pack JSON (the Docker image configures this)
- `GEMINI_API_KEY`: required only for opted-in reviews

Configure the App webhook as `https://<your-host>/webhooks/github`, with HMAC SHA-256 enabled. The public hostname is provided by the deployment owner. Permissions: Contents read, Metadata read, Pull requests write, Checks write, Actions write. Subscribe to `workflow_run`, `pull_request`, `issue_comment`. Install only on selected repositories. No OAuth setup is required.

The health endpoint is `/health`. A verified webhook is journaled before returning HTTP 202. A single durable worker handles queued deliveries; jobs interrupted by process restart are recovered. Keep **one service process** per SQLite database. Back up the persistent volume. Failures record only an exception type, avoiding private source or credentials in logs. Internal worker failures remain failed jobs until deliberately redelivered with a new delivery ID.

Build the container from the repository root using `docker build -f review-bot/Dockerfile .`. Mount `/state` persistently and mount the App private key read-only. Do not bake secrets into the image. API budgets are independent: the service enforces at most $25 in estimated Gemini development spend, reserving possible retry costs before sending. Thinking output is included in token accounting. Reservations are conservative estimates, not a provider billing guarantee.

## Repository configuration

Create `.github/qscore-review.yml` on the trusted base branch. Unknown keys fail evaluation.

```yaml
version: 1
gemini: false
manifest: qscore.yaml
target: null
fail_on: null # advisory; error | regression | new_high also supported
general_comments: 3
max_files: 30
exclude: ["data/**", "**/*.ipynb_checkpoints/**"]
language: en
```

`new_high` fails only when a stable circuit id/rule group becomes high on head and was not high on base. Existing high findings remain visible. Targets, calibration, seeds, compile policy, engine settings and thresholds must be comparable. Per-item manifest declarations and referenced evaluation-file hashes are compared conservatively under the same pinned engine; semantically equivalent declaration edits may explicitly be incomparable. Invalid input or discovery-only results never establish a passing gate. `regression` applies only to measured changes outside an available per-seed range; unavailable ranges are explicitly unassessed. Fork results remain advisory even after a collaborator reruns the workflow.

## Commands

Repository collaborators with write, maintain or admin permission can use `/gatesmith rescore` (also `@qscore-review rescore`), `/gatesmith explain D03`, `/gatesmith why two_qubit_count`, and `/gatesmith ignore D05 <reason>`. Explain and why use committed engine definitions plus saved deterministic evidence for the exact current base/head and latest authenticated workflow generation. They make no model calls, display at most five item records, and explicitly report absent or failed evaluation evidence. Definitions are bound to the immutable engine revision and score version. The definition pack, `engine-definitions.json`, must be installed alongside the file configured by `QSCORE_BOT_KNOWLEDGE_PATH`; the Docker image includes both. Ignore posts a suggested manifest change without writing code. Rescore reruns only the allowed completed workflow for the current head.

`/gatesmith improve` explicitly reports unavailable until the engine verifier and approved platform handoff are connected. HF proposer integration is separate from Gemini review; generating a candidate is not proof of correctness or improvement. Full-file model review is also explicitly unavailable in this pass. No command makes commits, merges or applies suggestions.

## Local verification

Use `uv run --offline --project review-bot pytest review-bot/tests` and `uv run --offline --project review-bot ruff check review-bot`. Tests use fake transports and fixed fixtures; they do not call GitHub or Gemini. Real App installation, a public webhook host and a live fixture PR must be tested by the integration coordinator before claiming a deployed bot.
