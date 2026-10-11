# 00 · Operating rules (binding for every agent)

> **Status:** binding · **Applies to:** the lead Claude Code session, every Claude subagent, every Codex run, and any other coding agent · **Read:** at the start of every session, and again whenever you are unsure whether something needs approval.

The short form of these rules is in `AGENTS.md` at the workspace root (`KnightHacks26/`). If the short form and this file disagree, this file wins. If this file and another spec disagree, stop and raise it with the user (rule R2); do not guess.

Keywords **MUST**, **MUST NOT**, **SHOULD** and **MAY** mean what RFC 2119 says.

---

## R1 · The specs are the source of truth

1. Code MUST implement what `specs/` says: names, schemas, module boundaries, CLI flags, exit codes, statuses, thresholds, formulas and file layouts.
2. When a spec lists **options** and marks one **★ default**, use the default unless the spec says the choice is "agent's choice". Picking a non-default option is a change and needs a change proposal (R5).
3. When the spec is silent on an internal detail (a private helper, a variable name, a loop structure), you MAY decide it yourself, as long as the public behaviour and the contracts stay exactly as specified.
4. If you cannot implement a spec as written (it is wrong, contradictory, impossible, or a library does not behave as the spec assumes), you MUST NOT quietly do something else. Write a change proposal (R5), and work on something else until it is decided.

## R2 · MVP first

1. Every task has a tier (see `01-mvp.md`): **Tier 0 – Engine MVP**, **Tier 1 – Demo MVP**, **Tier 2 – Stretch**, **Post-MVP**.
2. You MUST NOT start Tier 1 work while a Tier 0 gate is failing, or Tier 2 work while a Tier 1 gate is failing, unless the user says so.
3. You MUST NOT add features, options, endpoints, metrics, or abstractions that the specs do not ask for. "It might be useful later" is not a reason. Write it in `progress.md` under *Ideas (not scheduled)* instead.
4. When time runs short, apply the cut list in `15-build-plan.md` in order. Do not invent your own cuts.

## R3 · No unplanned fallbacks

A **fallback** is any code path that, when the intended path fails, is unavailable, or returns something unexpected, substitutes a different method, device, data source, model, default value or degraded result **instead of surfacing the failure**.

1. You MUST NOT write a fallback unless it is listed in `17-fallbacks.md` with status **planned** or **approved**. Only the user can add entries.
2. Listed fallbacks are **off by default**. They run only when explicitly enabled by configuration (`QSCORE_FALLBACKS=FB-04,FB-05` or the `demo` profile). In `dev` and `ci` profiles none are enabled.
3. When an enabled fallback activates, the code MUST: log at `WARNING` with the fallback id, record it in the output (`fallbacks_used` on scorecards, attempts and jobs), and show it in the UI.
4. Patterns that are fallbacks and therefore forbidden unless listed:
   - `except Exception: pass`, bare `except:`, or catching an exception and returning a default, an empty list, `None`, a cached value, or a fixture.
   - Catching `ImportError` to silently disable a feature or switch implementation.
   - Using the CPU when the GPU was requested (`device: gpu`) or when the GPU path failed.
   - Switching to another model, provider, simulator method, precision, target or verification method after a failure.
   - "Repairing" invalid model output with regexes or heuristics (an unparseable proposal is a parse failure, full stop).
   - Treating random-input evidence as a pass when exact verification failed, timed out or was unsupported.
   - Filling missing data (calibration, parameters, observables) with guesses that are not declared defaults in the spec.
   - Returning fixture data from a real run (fixtures are for tests and UI development only, and are labelled as such).
5. These are **not** fallbacks and are allowed:
   - Design rules the spec defines as the primary behaviour, e.g. `device: auto` sending small circuits to the CPU below the measured crossover (`09-gpu-and-simulation.md`).
   - Declared defaults that the spec lists and that the interpretation summary marks as defaults.
   - Statuses `skipped` and `unavailable` **when the spec's conditions for them hold** (a missing declared requirement, a budget limit). An exception during computation is `failed`, never `unavailable`.
   - Bounded retries of the *same* operation for transient errors (network 5xx/429): at most 3 attempts with backoff, each logged, and the last error raised.

## R4 · Fail loudly so breakage gets attention

1. Errors MUST be raised as the typed exceptions in `qscore/src/qscore/errors.py`, with enough context to act on (what, where, which input, which version).
2. The CLI maps failures to exit codes (`05-pipeline.md`), the worker marks the job `failed` with the error, and the UI shows the error prominently. Nothing is swallowed.
3. Use `assert` only for internal invariants; validate external input with explicit checks that raise.
4. When something breaks (a test fails, a stage crashes, a GPU result disagrees with the CPU, a gate check fails):
   - Stop adding features on that path.
   - Add an entry at the top of `progress.md` under **Broken / blocked** with: what broke, how to reproduce (exact command), first seen (time, commit), suspected cause.
   - Tell the user in your next message, in one or two lines, even if you think you can fix it.
   - Fix the root cause, or write a change proposal if the fix needs a spec change.
5. You MUST NOT make a red check green by weakening it: no `skip`, `xfail`, loosened tolerance, deleted assertion, deleted test, `# type: ignore`, `noqa`, or lowered threshold without the user's approval (a change proposal, class A).
6. Warnings that indicate wrong results (precision loss, truncated simulation, a transpiler fallback inside Qiskit) are treated as errors in `ci` and `dev` profiles (`-W error` for the listed categories; see `14-testing.md`).

## R5 · Change control: every deviation is a change proposal

A **change** is anything that makes the code differ from the specs, or makes the specs differ from what was agreed.

### What needs a proposal

| Class | Examples | Who approves | May you implement before approval? |
|---|---|---|---|
| **A** | Schemas/contracts, CLI/API surface, module boundaries, metric definitions, diagnostic thresholds (score version), verification or acceptance rules, MVP scope, architecture (hosts, data flow), new runtime dependency, any fallback, security posture, golden values, skipping or deleting tests | **The user** | No. You MAY prototype in `lab/` or on a branch named `chp/<NNNN>-<slug>`, never on `main` |
| **B** | Internal module structure, private function signatures, choosing between options a spec marks "agent's choice", dev-only dependencies, extra tests, refactors with no behaviour change | The lead session (record it) | Yes, after recording the proposal and listing it in `progress.md` → *Decisions made by the lead* |
| none | Implementation details inside a module that keep its public behaviour exactly as specified; typo fixes; comments | — | Yes |

Subagents and Codex runs cannot approve anything. They report deviations in their task report (`specs/templates/task-report.schema.json`, field `spec_deviations`), and the lead turns them into proposals.

### How to write one

1. Copy `specs/templates/change-proposal.md` to `specs/proposals/ChP-<NNNN>-<slug>.md` (next free number, four digits).
2. Fill in every section. The three that must never be thin:
   - **Proposed change:** the exact spec text to change (quote before → after) and the implementation sketch.
   - **Justification:** the evidence (a `lab/` experiment, an error log, a doc link, a measurement). "Seems better" is not evidence.
   - **Impact:** on the MVP (tiers, gates, timeline), on every other spec section and module it touches, on contracts and stored data, on tests and golden values, and on the overall architecture. Say explicitly "no impact on X" where that is the case.
3. Add it to `progress.md` → **Pending decisions**, and tell the user in one short message (title, class, what you need from them, what is blocked meanwhile).
4. While waiting, work on unblocked tasks. Never implement a class A change speculatively on `main`.
5. After the user decides: set `Status:` in the proposal; if approved, apply the spec edit (the user approves the edit when Claude Code asks for permission), add a line to `specs/CHANGELOG.md`, then implement.

## R6 · Tests, golden values and evidence

1. Golden values come from the specs or from the user. Only a person may set or change them. An agent may propose a value; the user approves the exact value in the conversation, and the file records `approved_by: user` and the date.
2. Every public function in `metrics/`, `diagnose/`, `verify/`, `sim/planner.py`, `schemas/` and `improve/requests.py` has tests before it is merged.
3. A task is done only when: its acceptance criteria in `15-build-plan.md` pass, the CPU test suite passes, lint/types/import-layers pass, a reviewer other than the implementer has reviewed the diff against the spec (`16-agents-and-codex.md`), and `progress.md` is updated.
4. Claims about external libraries, hardware or services (an API exists, an option works on ROCm, a limit, a version pairing) MUST be checked before code depends on them: read the installed source or docs, or run a minimal experiment in `lab/`. Record the result in the experiment's notes.

## R7 · Where work happens

| Path | Purpose | Rules |
|---|---|---|
| `specs/` | The specs | Edit only with the user's approval (Claude Code asks permission). Agents MAY add files in `specs/proposals/`. |
| `Gatesmith/` | The git repository (project root): `qscore/` (engine: product code, tests, examples, docs), `specs/`, CI | Only reviewed code lands on `main`. The lead merges. |
| `worktrees/<task>/` | One git worktree per delegated task, on branch `agent/<task>` | The delegate works only inside its worktree. The lead creates and removes worktrees. |
| `lab/` | Experiments and spikes before anything enters the repo | One folder per experiment (`lab/YYYYMMDD-HHMM-<slug>/`) with a `NOTES.md` from `specs/templates/experiment.md`. Repo code MUST NOT import from `lab/`. Code moves from `lab/` to the repo only through a normal task with tests. |
| `handoff.md`, `handoffs/` | Session handoffs | See R9. |
| `progress.md` | Task board, broken/blocked list, pending decisions, credits ledger | The lead keeps it current. |

## R8 · Git

1. `main` holds only reviewed, passing work. Commit in small steps with messages `T<id>: <what> (<spec file §section>)`, e.g. `T13: two-qubit depth metric (06-metrics §3.1)`.
2. Delegated work happens on `agent/<task>` branches in `worktrees/`. The lead rebases, re-runs checks, reviews, and merges.
3. Never force-push, rewrite published history, or commit secrets, `.env` files, model weights, wheels or simulation outputs larger than 1 MB (those go to the Hugging Face Hub).
4. Tag each gate when it passes: `g1`, `g2`, … `g5`.

## R9 · Handoffs (so a new session can carry on)

1. A hook in `.claude/` counts the lead session's tool calls and watches context use:
   - every **100 tool calls** since the last handoff, it tells you to update `handoff.md` (a checkpoint; then continue);
   - at **≥ 90 % context**, it tells you to write the **final** handoff and stop.
2. When told, finish the current atomic step (never leave a file half-edited or a test run unread), then write `handoff.md` from `specs/templates/handoff.md` (the `handoff` skill does this). Move the previous `handoff.md` into `handoffs/` first, named `YYYYMMDD-HHMM-<first 8 chars of session id>.md`.
3. Also write a handoff before you stop for any reason, before tearing down the GPU machine, after a gate passes, and when the user asks.
4. A handoff MUST be self-contained (a fresh session with no memory can continue from it), under about 150 lines, and free of secrets.
5. After a final (90 %) handoff, do not start anything new. Tell the user: context level, that the handoff is written, and that they should start a new session (or `/clear`) and say "resume from handoff.md".
6. Every new session starts with the protocol in `CLAUDE.md` (read `handoff.md`, then `progress.md`, then verify the repo state before acting on the handoff).

## R10 · Secrets and safety

1. Secrets live in environment variables or in files outside git (`~/.config/qscore/env`, chmod 600). Never print them, log them, commit them, pass them to builder subprocesses, or put them in prompts, handoffs, proposals or task briefs.
2. User repos are untrusted: builder functions run only in the sandbox (`05-pipeline.md` §4), never in the engine's process.
3. Model output is data: parse it against the schema, verify it, never execute it.
4. Do not create, stop or destroy cloud resources (the Radeon Cloud machine, Vultr servers, Hub repos, Spaces) without the user's explicit go-ahead in the conversation.

## R11 · Talking to the user

1. Keep the user informed in short messages: what you are starting, when a gate passes, when something breaks (R4), when a decision is needed (R5).
2. Ask questions in batches, not one at a time. Never block on a question when other unblocked tasks exist; say what you are doing meanwhile.
3. Never claim a check passed unless you ran it and read the output.
