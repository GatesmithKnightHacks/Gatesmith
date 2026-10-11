# PR4 merge conflict resolution

Merged `platform-integration` at `cb9aa6e` into `github-app` in merge commit `8758105`, without rewriting history. The following reconciliation commits complete that resolution.

## Conflict decisions

- `.github/workflows/ci.yml`: combined the engine and review-bot checks with the existing Vultr deployment job. Deployment still uses the configured branch, exact tested commit, restricted SSH command and health check. Both test jobs must pass before deployment. Removed obsolete Neon extras.
- `web/src/data/run.ts`: kept the current Paper demo/account flow and integrated the platform's actual job/event polling. Live runs use current engine records instead of old scorecard fields.
- `web/src/screens/S04Workspace.tsx`: retained the current Paper layout and ported live job progress, metric statuses and findings into it. Demo actions cannot modify a live run. Missing artifact/improvement services remain visibly unavailable.

GitHub initially listed additional conflicting engine/schema files because the branches had diverged. The local merge had three text conflicts above; semantic reconciliation also required the API, storage, worker and deployment changes below.

## Backend reconciliation

Kept the current engine contracts, formulas, thresholds and golden values. Replaced Neon product imports, SQL and credentials with a durable platform-owned SQLite queue and authenticated HTTPS worker client. The bot journal remains separate. Added a persistent Compose volume and removed the obsolete image extra and setup instructions.

Browser submission is disabled until server-side authentication is connected. Queue worker startup fails before claiming jobs until Hub batch publication, record materialization and immediate claim-loss cancellation are wired. This is preparation accepted by the user while the deployment owner is unavailable; it is not a claim of a complete production backend. Local CLI and GitHub Action scoring remain available.

Also fixed two Linux CLI output regressions: migration hints and generated paths stay contiguous under color/narrow terminals. Existing assertions were preserved and narrow/color cases added.

## Validation

- Integrated focused queue/API/client, worker readiness and CLI/path checks: 66 passed before the additional blank-token regression cases; platform follow-up: 61 passed including those cases.
- Engine Ruff/format: passed (218 files); mypy: passed (103 source files); import layers: passed.
- Web typecheck/build: passed; 8 focused offline mapping/transport tests passed before timestamp follow-up. Existing lint warnings are recorded in the task report.
- Independent review found and corrected blank-token authorization and equivalent-timestamp handling.
- Shell syntax and whitespace checks passed. Docker and live Vultr deployment were not run. An expanded local test run reproduced the known macOS builder preexec limitation; full Linux CI remains required.
