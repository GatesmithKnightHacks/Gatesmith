# CLAUDE.md — Gatesmith repository (qscore engine)

<!-- Copied into the repo root at T00 from specs/templates/repo-CLAUDE.md. -->

@AGENTS.md

## Notes for Claude Code
- The lead session runs from the workspace root (the repo's parent), whose `CLAUDE.md` holds the session protocol, handoff rules and delegation rules. If you are a subagent working in a worktree, those rules apply to you too.
- Run engine commands from the `qscore/` folder of the repo or worktree, e.g. `cd <worktree>/qscore && uv run pytest -q`.
- When editing a module, read its spec section first (path-scoped rules in the workspace's `.claude/rules/` load the relevant spec automatically when the lead works on these files).
