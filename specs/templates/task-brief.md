# Task brief — <T-id>: <title>

You are implementing one task of the qscore MVP. You have no access to the lead's conversation: everything you need is here and in the files referenced. Rules that bind you: `<WORKSPACE>/AGENTS.md` and `<WORKSPACE>/specs/00-operating-rules.md`.

## Where
- Worktree (work ONLY here): `<WORKSPACE>/worktrees/<T-id>-<slug>` on branch `agent/<T-id>-<slug>`
- Specs (read-only): `<WORKSPACE>/worktrees/<T-id>-<slug>/specs/` (the branch's copy; do not edit). Engine: `<WORKSPACE>/worktrees/<T-id>-<slug>/qscore/`
- Dependencies are already installed (`uv sync --frozen` done). There is no network in your sandbox.

## Goal
<One paragraph: what exists when you are done.>

## Spec sections you must implement (read them fully first)
- `specs/<file>.md` §<n> — <what it covers>
- `specs/<file>.md` §<n>
- Contracts used: `specs/04-contracts.md` §<n>

## Files
- You may create/modify: `<paths>`
- You must not touch: everything else, in particular `src/qscore/schemas/` (frozen contracts), `tests/golden/` (person-only), other tasks' files, `specs/`.

## Acceptance (run these; all must pass)
```bash
cd <WORKSPACE>/worktrees/<T-id>-<slug>/qscore
uv run pytest <paths> -q
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run lint-imports
```
Plus: <task-specific criteria from 15-build-plan.md>

## Non-negotiables
1. Implement the spec as written. If it is wrong, ambiguous or impossible, STOP that part and report it under `spec_deviations` with: spec reference, what you found (evidence), proposed change, impact. Do not improvise.
2. No fallbacks (R3): no broad `except`, no default values hiding failures, no silent device/model/method switches.
3. Fail loudly with the typed errors in `src/qscore/errors.py`.
4. Write tests first from the spec; do not change golden values; do not add `skip`/`xfail`.
5. No new dependencies. No secrets. No network.
6. Commit on your branch in small commits: `T<id>: <what> (<spec> §<n>)`. Do not merge, rebase `main` or push.

## Time box
<45 minutes>. If you run out, stop, commit what passes, and report `status: partial` with what remains.

## Report (final message)
Return JSON matching `<WORKSPACE>/specs/templates/task-report.schema.json` (Codex: enforced with `--output-schema`; Claude subagents: return the same JSON as your final message).
