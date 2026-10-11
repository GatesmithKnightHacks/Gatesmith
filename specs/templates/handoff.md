# Handoff — <YYYY-MM-DD HH:MM UTC> — session <first 8 chars of session id>

> Written because: <100-call checkpoint | context ≥ 90 % (FINAL) | end of session | before GPU teardown | gate passed | user asked>
> Previous handoff archived as: `handoffs/<file>` (or "none")

## 1. TL;DR (3 lines max)
<Where the project stands, what was just finished, what comes next.>

## 1b. MVP progress and ETA (relay this to the user at the start of the next session)
- **MVP done: <N> %** (MVP = ChP-0023: circuit in → diagnostics and scores out; gate G-MVP) — weighted by the MVP task list in `15-build-plan.md` §3a (S1–S6, M1–M4, equal weight unless noted); a task counts fully only when its acceptance passes (half if built but unreviewed).
- **Final product done: <N> %** — weighted by the planned phase hours of `15-build-plan.md` §1 (36 h).
- **Current milestone:** <e.g. ChP-0022 slice S1–S6> — <done/total>.
- **ETA (agent work sessions; 1 session ≈ 100 tool calls ≈ 90–150 min):** next milestone <n> sessions · G1 <n> · G2 <n> · full MVP (G5) <n> serial / <n> with parallel delegates.
- **What moves the ETA:** <pending user decisions, credentials, GPU sessions, commits for worktrees>.
- **Change since last handoff:** <+x % / ETA shifted by … because …>.

## 2. Next steps (ordered, concrete — a fresh session does these first)
1. <Task id> — <exact next action, with file paths and the command to run>
2. …
3. …

## 3. State of the repo
- Branch: `<branch>` · last commit: `<sha> <message>` · uncommitted changes: <none | list with why>
- Worktrees / active delegations: <task · agent · worktree path · status · report file> (or none)
- Background jobs (Codex runs, GPU jobs, servers): <what · where · how to check · how to stop> (or none)
- Tests: <command> → <result, date>; lint/types/layers: <result>

## 4. Done since the last handoff
- <T-id: what changed (commit sha)>

## 5. In progress (exact point reached)
- <T-id: what is half-done, which files, what remains, any trap>

## 6. Broken / blocked (copy of progress.md top section, current)
- <what · repro command · since · suspected cause> (or none)

## 7. Decisions
- Pending for the user: <ChP-NNNN title · class · what is blocked> (or none)
- Made by the lead since last handoff (class B): <…> (or none)

## 8. Environment
- GPU machine: <up since … / destroyed at … · credits used/left · access method · tmux sessions>
- Platform job API: <URL · state> · Hub: <repos touched> · Vultr: <URL/state> · Space: <state>
- Codex integration mode: <cli | mcp | plugin | none>

## 9. Learned the hard way (gotchas worth keeping)
- <fact · evidence (lab/… or log) · where it should go (spec watchlist? proposal?)>

## 10. Read first in the next session
- `progress.md`, then: <spec files/sections relevant to the next steps>
