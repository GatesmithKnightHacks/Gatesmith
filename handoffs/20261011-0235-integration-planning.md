# GitHub / Gemini / Hugging Face integration planning handoff

- Date: 2026-10-11, user timezone America/New_York.
- Workspace: `/Users/ralph/Documents/Projects/knight hacks`.
- Current branch `github-app` at `84296a9`; remote is GatesmithKnightHacks/Gatesmith. Design PR #3 is merged and attached to this chat.
- `origin/lead/post-mvp` at `6b42f72` contains newer engine/spec changes. It has not been merged into github-app. User's AGENTS forbids merges/pushes without superseding authorization.
- Existing untracked `.DS_Store` and `design/.DS_Store` untouched.
- User wants this chat to own GitHub bot and HF integration, allows subagents, and is still finishing UI separately. Three read-only audits completed; do not redo them unnecessarily.
- HF credits are redeemed. Gemini $30 credits are Google AI Studio/Gemini Developer API. User has Neon only, no Vultr host; newer engine spec explicitly removes Neon.
- No paid inference, secret usage, deployment or cloud resource creation in planning. Secret presence check found no relevant environment vars or `~/.config/qscore/env`; no values were printed.
- Added planning documents: ChP-0049, progress.md, docs/integration-setup-report.json. ChP-0049 remains proposed; binding specs and code unchanged.
- Inspected ChP-0040 bot proposal: CI scores base/head; separate review-app consumes artifacts, Gemini reviews evidence. Proposal is still proposed. Needs Actions write for rescore, requested improve bridge, verdict precedence, durable provenance/dedup and engine-recorded score version. Global advisory default and proposed demo new_high policy are separated in ChP-0049.
- ChP-0048 HF API architecture is approved, implementation previously deferred; current user wants it this pass. Panel: gpt-oss-120b:cerebras default; Qwen3-Coder-30B-A3B-Instruct:scaleway; DeepSeek-V4-Flash:deepinfra; gpt-oss-20b:groq. All four live public catalog pairs checked in this session and advertise structured output; no generation tested.
- HF defaults: 30 calls and $1 estimated budget per job; proposed session allowance HF $15/Gemini $25 with demo reserves, needs user confirmation.
- Engine branch has request construction, extraction/splicing and one relative-constraint helper. Full verifier, reference proposer, loop, HF layer, conformance and Hub/Space integrations remain incomplete. API and worker are stubs. Do not describe API-call success as verified improvement.
- Audits found older approved ChP-0001/0002/0003/0004 fixes remain partly unapplied: verifier correctness, privacy/strategies/layout, reversible I/O, call records and denominators. Apply existing approvals; no redundant approval questions.
- Proposed implementation streams: Action/bundle agent; review-app/Gemini agent; HF adapter agent; parent coordinates common contracts, engine handoff, Hub/Space, review, credentials and deployment. No overlapping files, network/secrets/cloud access for delegates.
- Still need exact scope/approval bundle, branch synchronization authority, active friend engine/API ownership, App owner/test repository, HF namespace and dataset/Space permissions, Vultr host/domain/spending, and secure local keys.
- A generated region QASM is not a patch to an arbitrary Python builder. Return verified QASM/evidence and produce source patches only for supported mappings.
- Next: get these setup decisions together; then create isolated worktrees from agreed baseline and implement. Root runs all authenticated smoke tests and external mutations after authorization.
