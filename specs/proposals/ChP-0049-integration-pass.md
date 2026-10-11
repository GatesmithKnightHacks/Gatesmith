# ChP-0049: GitHub, Gemini and HF integration delivery pass

- **Status:** approved by the user on 2026-10-11; implementation and account setup authorized in the numbered response.
- **Class:** A (bot commands, permissions, evidence contract and check policy)
- **Author:** Codex integration coordinator · **Date:** 2026-10-11
- **Related tasks:** ChP-0040 B1–B8; ChP-0048 T25/T26/T29; verifier/loop dependencies T23/T24
- **Blocks:** implementation of the new bot contracts below; does not block existing approved HF leaf work after branch/ownership reconciliation
- **Decision needed by:** before implementing the bot amendments; live deployment additionally needs specific resource and spending authorization

## 1. Summary

The user authorizes this chat to own the GitHub bot and Hugging Face API integration, with subagents, while UI work continues separately. Gemini credits are in Google AI Studio; HF credits have been redeemed. This proposal supplements ChP-0040 and preserves the approved API-only HF direction and removal of Neon in ChP-0048/0047.

Source snapshots inspected: `github-app` at `84296a9` and `lead/post-mvp` at `6b42f72`. The latter contains the engine contracts the bot requires; it has not been integrated into `github-app` by this audit.

## 2. Proposed change

### 2.1 Spec text (exact)

The references below are to the proposed `19-review-bot.md` appendix in ChP-0040. Other text in ChP-0040 stays subject to that proposal's approval.

**A. Ownership and delivery.**

- Before: `Owner: teammate (not lead sessions)` and `No lead session builds any part of it`.
- After: `Owner: this Codex chat for review-bot/ and the explicitly assigned HF adapter files. Its coordinator may delegate isolated implementation work, review it, and integrate it after authorization. Engine/API files actively owned by friends require an explicit file handoff before editing. Delegates have no network, credentials or cloud-resource access. UI files are outside this pass.`

**B. GitHub permissions, §2.**

- Before: `actions: read`.
- After: `actions: write. The implementation uses this only to read allowed workflow artifacts and rerun the configured qscore workflow after checking collaborator write access. It does not edit workflows. Other permissions remain contents:read, pull_requests:write, checks:write, metadata:read.`

**C. Commands, §4.4.**

- Before: `@qscore-review rescore re-runs the workflow` with no improvement command.
- After: `/gatesmith rescore is the canonical rerun command; @qscore-review rescore is an explicitly supported alias. /gatesmith improve, accepted only from a collaborator with write access, requests an engine improvement run for the exact reviewed head commit. The handoff carries validated logical QASM, an approved region request, manifest/privacy configuration, immutable source provenance, the selected pinned HF model/provider and budgets. The bot never executes repository builders or decides acceptance. The platform owner and integration coordinator must specify and approve the exact job/import envelope before implementing this handoff. Until that dependency is available, the command reports unavailable with its reason; it never reports a successful optimization.`

**D. Candidate delivery, §12.**

- Before: `No models other than Gemini` and `No scoring on our hosts`.
- After: `Gemini is the review-app's only review model. A separately requested engine job may use the approved HF proposer layer and verify/re-score validated circuit data; repository Python never runs on our hosts. Accepted candidates return QASM and measured verification/score evidence. A source patch is produced only for an explicitly supported source mapping; QASM candidates are not represented as edits to arbitrary Python builders. No automatic commits or merges.`

**E. Check policy and failure precedence, §6/§8.**

- Before: `fail_on: null | error | regression`; Gemini failure maps the check to neutral without explicit precedence.
- After: `fail_on: null | error | regression | new_high. The repository-wide default remains advisory (null); the proposed Gatesmith demo setting is new_high. For new_high, compare diagnostic groups keyed by stable item id and rule id: fail when head has high severity and base did not have high severity for that group. A newly added circuit's high group is new. Existing high groups are reported and do not fail solely for remaining high. Engine/configuration failures and incomparable evaluation settings fail evaluation explicitly. Removed items are reported separately. Engine/policy failure takes precedence over Gemini unavailability and cannot be changed to neutral or success by a review failure. Fork-produced results remain advisory and are not imported unless a separately specified trusted workflow produces them; simply rerunning a fork-controlled workflow does not establish trust.`

This adds a comparison policy, not an engine threshold change. CLI `--fail-on high` keeps its current meaning.

**F. Bundle provenance, §1/§2/§7.**

- Before: the artifact is described as files, with a delivery-id cache.
- After: `Define a bot-owned, versioned bundle envelope containing repository/PR/workflow-run/run-attempt identifiers, exact base/head SHAs, qscore revision, schema ids, recorded score version, target/seeds/configuration fingerprints and payload checksums. The App matches provenance against authenticated GitHub metadata and its allowed workflow. Archive paths and sizes are bounded. Delivery and logical review identities are persisted on a mounted volume. Duplicate events do not repeat model calls or comments; older-head results cannot overwrite the latest head. The engine never consumes this envelope.`

The complete envelope schema must be reviewed before producer and consumer implementations depend on it.

**G. Versions and Gemini, §4.2/§9.**

- Before: summary text hardcodes `qscore-2026.1`; cost analysis assumes free-tier Gemini.
- After: `Display the score version recorded by the pinned engine; validate supported schema versions explicitly. Proposed review model: gemini-3.1-pro-preview, thinking high, through the user's paid Google AI Studio/Gemini Developer API project. Record model, prompt and knowledge-pack versions and token usage, including billed thinking. Use one review call per current-head comparison, with configured server budgets. Model or provider failures never cause automatic substitution.`

### 2.2 Implementation sketch

After an agreed engine baseline, shared contracts and file ownership:

1. Agent A owns `review-bot/action/`, version detection, base/head bundle production and isolated tests.
2. Agent B owns the review-app GitHub/webhook client, deterministic summary, Gemini review validation, authorized commands and its isolated tests.
3. Agent C owns assigned HF adapter files (`hf_layer.py`, `prompts.py`, `models.yaml` and corresponding tests), using the existing approved panel and budgets.
4. Coordinator owns shared contract reconciliation, integration, authenticated experiments, deployment, Hub/Space wiring, and independent review. Verifier, deterministic proposer and loop ownership must be explicit before editing those engine files.

Apply unchanged existing approvals ChP-0001/0002/0003/0004 where they remain unapplied; do not ask for approval of the same changes again. Reconcile their request privacy, strategy, reversible I/O, call accounting and verifier rules with ChP-0048 before exposing a verified result.

## 3. Justification

- User chose automatic scoring and requested improvements, then explicitly assigned GitHub/HF work to this chat and authorized subagents.
- GitHub's rerun API requires Actions write: https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-workflow . ChP-0040 currently specifies Actions read.
- ChP-0040 is still proposed; its command list lacks improve, its check default is advisory, and its score-version text predates the latest engine.
- `lead/post-mvp` has request construction and region extraction/splicing, but verification remains a stub and its loop only implements one relative-constraint helper. A successful API call alone is not a verified improvement.
- Live public HF catalog checks on this session found all four approved model/provider pairs live with structured-output support. No credentialed inference has been performed by this audit.

## 4. Alternatives considered

| Option | Benefit | Cost | Decision |
|---|---|---|---|
| Implement the unamended bot proposal | Smaller immediate scope | Misses requested improvement command and has permission/verdict ambiguities | Amend first |
| Put arbitrary repository execution in the bot | Fewer CI steps | Changes the trust boundary and requires a working sandbox | Rejected |
| Build sequentially | Simple ownership | Adds avoidable waiting between independent bot and HF work | Parallel leaf work, explicit shared dependencies |

## 5. Impact analysis

| Area | Impact |
|---|---|
| MVP scope and tiers | CPU scoring MVP unchanged; bot is an integration and HF is existing Tier 1 work |
| Gates and timeline | Bot/action and HF adapter can proceed concurrently; verified improvement still requires T23/T24; no completion estimate before ownership/access are settled |
| Contracts and stored data | New bot-owned envelope and new_high config; requested improvement handoff requires a separately reviewed exact envelope; no engine contract changes beyond existing approvals in this document |
| Other specs | ChP-0040 appendix and eventual spec19; config tests; coordinator reconciles spec11/spec12 API path differences with platform owner |
| Modules/public functions | New review-bot package and assigned HF files; engine/platform shared files are handed off explicitly |
| Tests/golden values | Bot and HF fake-transport/unit/security tests plus live fixtures; no golden changes |
| Score version | None; display engine-recorded version |
| Fallback registry | None; no substitutions added |
| Architecture/security | CI runs repository code; bot reviews data; engine handles explicit QASM improvement jobs; no direct bot DB/GPU credentials |
| Sponsor demo | Gemini evidence-backed PR review; HF candidate generation, attempts dataset and comparable leaderboard Space |
| Cost | Existing redeemed credits; proposed session limits HF $15 and Gemini $25, reserving $5 of each reported balance for demo; user confirms limits. Per-job HF defaults remain 30 calls/$1 estimated budget. Host price requires a concrete quote before provisioning |

## 6. Risks and rollback

Coordinate active friends' files before branch integration or edits. Keep implementation agents in separate worktrees, pin common contracts, and run one real circuit-changing PR plus one verified HF candidate through the complete chain twice. Invalid, inequivalent and inconclusive candidates stay recorded and never count as accepted.

Rollback removes the App/workflow/deployed integration and disables the HF layer. No engine golden values, metric thresholds or UI files are changed by this proposal.

## 7. Decision

- Decided by: user · Date: 2026-10-11 · Outcome: approved.
- Already authorized: this chat owns GitHub bot/HF implementation; subagents allowed; Gemini credits are Google AI Studio; HF API-only architecture and removal of Neon recorded approved on the inspected branch.
- Authorized: named branch integration, GitHub App/demo repository, HF dataset/Space and API credentials, Gemini credentials; HF $15/Gemini $25 development caps. Public webhook hosting is deferred to the user’s friend. No push performed.
- Applied to binding specs: spec19 with this amendment as its controlling supplement; CHANGELOG updated.
