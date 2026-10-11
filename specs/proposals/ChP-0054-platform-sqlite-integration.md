# ChP-0054: Reconcile platform integration with SQLite and the current engine

- Status: approved by user on 2026-10-11, including SQLite choice and preparation while the deployment owner is unavailable.
- Class: A. Related: ChP-0047/0049, specs 03/11/12/14/19, PR4.

## Exact change and ownership

Preserve the platform-integration branch's Vultr deployment scripts, Compose/Caddy setup and real UI job connection. Combine its CI deployment job with the current engine and bot gates. Keep current engine/schema versions and Paper components. Remove Neon product support, extras, SQL migrations and database credentials; retain defensive secret-redaction patterns.

The platform API owns a persistent local SQLite store. Workers use the existing HTTPS job API, per-worker bearer authorization, atomic claims, heartbeats, stale-claim recovery and idempotent writes. The GitHub bot retains its separate journal. Local files and HF Hub remain the records/history design. No Hub-as-queue, in-memory substitute, or fabricated success.

This chat may reconcile the previously friend-owned API, worker, deployment and UI files for this pass. The user explicitly accepts that production/server verification and remaining wiring require the friend to wake up. No live Vultr operations, PR merge into the target, paid calls, credentials or new cloud resources are authorized by this preparation. Existing authorization to publish reviewed github-app source remains.

Preserve authenticated write endpoints from the binding spec. Browser credentials must never contain static platform or worker tokens. Production browser submission/authentication wiring may remain explicitly pending for the deployment owner. Preparation must not claim a working authenticated account system or verified improvement loop.

## Evidence

PR4 compares github-app7409ccf with platform-integrationcb9aa6e. Both descend from98a5ab8. Actual local Git merge conflicts occur in CI, run.ts and S04Workspace.tsx; semantic reconciliation additionally affects API/worker imports, storage and engine contracts. The friend API/worker directly instantiate NeonStore, whereas approved ChP-0047 removed its settings and dependency. User approved the reconciliation plan and selected SQLite in this session.

## Impact

No scoring formulas, thresholds, golden values, verification or acceptance rules change. No public engine schema downgrade. SQLite is in Python's standard library; the planned HTTP job client uses the httpx dependency already specified in03 §3.1. Platform storage configuration is added explicitly. The public /api route prefix remains handled by Caddy. Any absent Hub publisher, browser auth or server readiness remains a visible limitation, never a successful degraded job.

## Validation and handoff

Test durable reopen, competing claims, stale recovery/max attempts, heartbeat ownership, idempotent/conflicting writes, HTTP authentication/retries and real scorecard UI mapping. Fix the two Linux CLI assertions without weakening checks. Run lint/types/import layers, bot tests and available web checks. Record untested container/server/live delivery steps and exact environment setup for the friend. Independent review is required before publishing.
