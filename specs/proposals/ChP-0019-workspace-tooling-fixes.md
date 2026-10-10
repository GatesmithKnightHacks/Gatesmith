# ChP-0019: Workspace tooling fixes (hooks, handoff archive names, proposal index, auditor, report schema)

- **Status:** approved (spec text to apply)
- **Class:** B (tooling; no product behaviour) — edits to `.claude/` and `specs/templates/` need the user's permission prompt
- **Author:** lead (from Codex review F-28, F-29, F-30, F-31, F-43, F-45, F-46, F-47) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T00 (verify hooks) · **Blocks:** nothing
- **Decision needed by:** soon (hooks are live since ChP-0020)

## 1. Summary
The session guard can miscount and re-trigger final handoffs; archive names can collide; the proposal-index edit is not covered by the `specs/proposals/` exception; the report schema does not enforce `fallbacks_introduced = []`.

## 2. Proposed change
| # | Finding | File | Change |
|---|---|---|---|
| 1 | F-28 parallel PostToolUse hooks race on the state file and share one tmp name | `.claude/hooks/session_guard.py` | `fcntl.flock` on `state/<session>.lock` around load→save; tmp name `…json.<pid>.tmp` |
| 2 | F-29 stale ≥ 90 % context reused after compaction | `session_guard.py`, `statusline.py` | On `session-start` with `source=compact` delete `<session>.ctx.json`; status line deletes it when `used_percentage` is null |
| 3 | F-30 transcript estimate adds `output_tokens` | `session_guard.py` `_transcript_usage` | Sum `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` only |
| 4 | F-31 after a final handoff, STOP reminders depend on context still ≥ 90 % | `session_guard.py` `post_tool_use` | If `final_handoff_done`, emit STOP every 3 calls regardless of current context until a `session-start` (compact/clear) resets it |
| 5 | F-43 archive name `YYYYMMDD-HHMM-<session8>` can collide | `00` R9.2, `CLAUDE.md`, handoff skill | `YYYYMMDD-HHMMSS-<session8>.md`; refuse to overwrite (append `-2`, `-3`) |
| 6 | F-45 skill edits `specs/proposals/README.md` but the exception covers only new files | `00` R5/R7, `CLAUDE.md` | Exception covers "new files in `specs/proposals/` and appending index rows to `specs/proposals/README.md`" |
| 7 | F-46 spec-auditor "never modifies files" but runs pytest/ruff/mypy (caches) | `.claude/agents/spec-auditor.md` | Allow tool caches; run with `PYTHONDONTWRITEBYTECODE=1 uv run pytest -p no:cacheprovider …`; never edits tracked files |
| 8 | F-47 `fallbacks_introduced` "must be empty" not enforced | `specs/templates/task-report.schema.json` | `"maxItems": 0` |

## 3. Justification
Codex reproduced F-31 with an in-memory invocation; F-28/F-29 by code reading (`_save_state` uses a fixed `.json.tmp`; `session_start` resets flags but not `ctx.json`). F-45: this session already had to add an index row to `specs/proposals/README.md`.

## 4. Alternatives considered
Leave as is — handoff enforcement may misfire mid-hackathon.

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | ~20 min |
| Contracts / stored data | none |
| Other specs | `00` R5/R7/R9, `CLAUDE.md`, `.claude/*`, template schema |
| Modules | none (workspace tooling only) |
| Tests and golden values | none |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | none |
| Cost | none |

## 6. Risks and rollback
`flock` is POSIX-only (fine on Linux/macOS; Windows users would need `msvcrt`).

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
