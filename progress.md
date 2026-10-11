# Integration pass progress

## Current state

- Working branch: `github-app` at `84296a9`, includes merged Design PR #3.
- Inspected engine/spec baseline: `origin/lead/post-mvp` at `6b42f72`; not merged into this branch.
- User assigns GitHub bot and Hugging Face integration to this chat, with subagents. UI continues separately.
- HF credits redeemed; Gemini credits in Google AI Studio. Neon account exists, but newer architecture removes Neon.
- Three read-only subagent audits completed. No implementation/runtime tests run this pass; no cloud resources created and no paid calls made.

## Pending decisions

- ChP-0040 is proposed on the engine branch. Local ChP-0049 is a concrete integration addendum, also proposed.
- User or expressly authorized coordinator must integrate the newer engine branch. AGENTS currently forbids merge/push.
- Explicitly assign verifier/loop/platform shared files before implementation agents edit them.
- Confirm GitHub App owner/test repository, HF namespace/resources, Vultr host/HTTPS address, and total spending limits.
- Exact requested-improvement handoff envelope and platform API path alignment need joint review before wiring that command.

## Known implementation dependencies

- HF request construction/extract/splice exists on the engine branch. Full verifier, deterministic proposer, loop, HF adapter and Hub/Space implementations remain incomplete.
- Apply unchanged existing approved ChP-0001/0002/0003/0004 contract/verifier corrections rather than implementing stale base text.
- A model API response is not an accepted verified improvement.

## Decisions made by the coordinator

- Audits are read-only. All credentials, external calls, cloud operations and live tests remain coordinator-only.
- Proposed three isolated agent streams: Action/bundle; review-app/Gemini; HF adapter. Coordinator handles common contracts and integration.
- No UI edits, merges, pushes or new runtime dependencies made by the planning audit.

## Broken / blocked (integration checks)

- 2026-10-11 cce9a70: `uv run --project qscore pytest qscore/tests/contract qscore/tests/unit/improve/test_requests.py -q`: 103 passed, one slow builder test failed in preexec_fn on macOS (existing RLIMIT_AS restriction). Reproduce test_sidechain_qaoa_requests_validate_and_include_d01_and_d03; run it unchanged on Linux CI. No test weakened.

## Integration implementation — 2026-10-11

- User approved ChP-0040/0049 and lifted HF deferral. Merged origin/lead/post-mvp into github-app.
- Active delegations: B2 action_build → managed bot-action / agent/B2-action; B3–B6 review_build → bot-service / agent/B3-B6-review; T25 hf_build → hf-adapter / agent/T25-hf. Isolated paths, no network/secrets/cloud.
- Parent: common contracts, integration tests, authenticated Chrome setup, Hub/Space, model checks CLI.
- GitHub registration awaiting user passkey confirmation in Chrome. Hosting deferred to friend.
- Caps: HF $15 / Gemini $25 development; no credit use yet.
- Improvement command explicitly unavailable pending friend-owned verifier/loop/platform handoff.
- Dependency preparation initially found missing CPython3.12 NumPy wheel offline; parent downloaded required wheel and prepared both review environments. No runtimefallback.

- Pending ChP-0050: free static HF Space versus Gradio requiring existing paid plan; no paid hosting selected. HF dataset GridGxly/qscore-runs created private; inference token tested identity only (no inference spend). GitHubApp gatesmith-review installed only on demo repo; webhookinactive awaitinghosting.
