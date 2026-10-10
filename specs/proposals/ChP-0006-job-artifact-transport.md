# ChP-0006: How a queued job's input files reach the worker (artifact bundle) and the platform's Hub token

- **Status:** approved (spec text to apply)
- **Class:** A (architecture/data flow, security)
- **Author:** lead (from Codex review F-21, F-22) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T22, T27, T28 · **Blocks:** T22 (worker loop's input resolution); not P1/P2
- **Decision needed by:** before T22 (P3)

## 1. Summary
A job references a manifest hash, and the manifest references local file paths (QASM, builder, parameters, observables), but nothing says how a worker on another host gets those bytes or checks them. The platform must upload QASM to the Hub, but its env gives it only a read token.

## 2. Proposed change
### 2.1 Spec text (exact)
- `11` new §7.1 "Project bundles": on submit, the submitter (CLI or platform) packs the manifest's referenced files into `bundles/<bundle_sha256>.tar.zst` on the Hub dataset (deterministic tar: sorted paths, zeroed mtimes) plus a `bundle.json` `{schema: qscore.bundle/v0.1, files: [{path, sha256, bytes}]}`. `jobs.payload` gains `bundle_sha256`. The worker downloads it, verifies every file hash, extracts to a temp dir, and resolves manifest paths relative to it; any mismatch → job `failed` with `RecordError`.
- Laptop-only builder repos stay laptop-only: the platform accepts only QASM uploads and bundled examples (`12` §1.2, unchanged).
- `12` §3 Env — Before: "`HF_TOKEN` (read for the dataset while private)". After: "`HF_TOKEN` fine-grained, **write** to `qscore-runs` only (uploads circuits/bundles), read elsewhere."

### 2.2 Implementation sketch
`record/hub.py`: `put_bundle`, `get_bundle`; `services.submit_job()` packs; worker resolves. `schemas/records.JobSpec.bundle_sha256`.

## 3. Justification
`04` §7 job payload has `manifest_sha256` only; `05` §4.1 loaders read local paths; `11` §1 says "nothing that matters may live only on" one host. `11` §7 says Vultr uses a write token, `12` §3 says read — contradiction.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Store file contents in Neon rows | No Hub dependency | 1 GB free-plan limit; large blobs in DB | Storage limits |
| Workers clone a git repo by commit | Familiar | Needs repo access/secrets on workers; not for uploads | Scope |
| Per-file content addressing without a bundle | Reuses `circuits/<sha>.qasm` | Many requests; path mapping still needed | Bundle simpler |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (needed for G3 "job submitted on the laptop runs on the W7900") |
| Gates and timeline | +~45 min in T22 |
| Contracts / stored data | `JobSpec.bundle_sha256`; new Hub path `bundles/`; new small schema `qscore.bundle/v0.1` |
| Other specs | `04` §7, `11` §7, `12` §2–3 |
| Modules | `record/hub.py`, `services.py`, `worker.py` |
| Tests and golden values | Bundle round-trip + tamper test; no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | Adds an explicit data path laptop/platform → Hub → worker (consistent with `11` §1) |
| Sponsor tracks / demo | Required for the queue demo |
| Cost | negligible Hub storage |

## 6. Risks and rollback
Builder bundles include user code; workers run it only in the sandbox (unchanged R10).

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
