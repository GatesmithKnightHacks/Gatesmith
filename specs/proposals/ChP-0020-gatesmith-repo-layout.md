# ChP-0020: Repo = team repo `Gatesmith/` (engine in `qscore/`, specs committed); workspace root = `KnightHacks26/`

- **Status:** approved
- **Class:** A (architecture / file layout)
- **Author:** lead · **Date:** 2026-10-10 05:15 UTC
- **Related tasks:** T00, T06, all delegations · **Blocks:** nothing (applied)
- **Decision needed by:** — (decided)

## 1. Summary
The user's instruction: work in the team's existing repo `Gatesmith` (github.com/GridGxly/Gatesmith), treat `Gatesmith/` as the hackathon project root with the qscore engine inside it, put the specs in the repo, and run the Claude Code workspace (hooks, rules, skills) from `KnightHacks26/`.

## 2. Proposed change
### 2.1 Layout (applied)
```text
KnightHacks26/            workspace root, launch `claude` here (not git)
├── CLAUDE.md AGENTS.md README.md .claude/ progress.md lab/ worktrees/ handoffs/
├── specs -> Gatesmith/specs   (symlink: every `specs/…` and `@../../specs/…` reference keeps working)
└── Gatesmith/            git repo (team), project root
    ├── README.md AGENTS.md CLAUDE.md .github/workflows/ci.yml
    ├── specs/            committed
    └── qscore/           the engine; every `qscore/…` path in the specs is relative to Gatesmith/
```
### 2.2 Spec/config text changed
- `git -C qscore` → `git -C Gatesmith`; `cd qscore &&` → `cd Gatesmith/qscore &&` (CLAUDE.md, `.claude/settings.json`, handoff and delegate-to-codex skills, `16`).
- Worktree engine path `worktrees/<t>/qscore` (`16` §3, delegate skill, task-brief template, module-builder agent); specs inside a worktree are the branch copy at `worktrees/<t>/specs/`.
- `00` R7 table, `03` §1 tree (git-root items: README, AGENTS/CLAUDE, `.github/`, `specs/`), `14` §4 CI `working-directory: qscore`, `15` T00 row, `repo-AGENTS.md` spec location, CLAUDE.md/AGENTS.md/README.md layout, lab-runner/lab-experiment `--project Gatesmith/qscore`, hook `REPO = PROJECT / "Gatesmith"`, settings `ask` rules also cover `Gatesmith/specs/`.

## 3. Justification
User instruction in the conversation (precedence 1, `specs/README.md`). Specs in the repo: teammates and Codex worktrees see the same contracts; spec and code changes travel together.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Separate `qscore/` clone inside the old workspace | No spec edits | Two clones of the team repo; user asked otherwise | User decision |
| Specs outside git | No spec churn in team history | Teammates/Codex lack the contracts | User chose specs in repo |
| Symlink the repo into the workspace | — | `git -C <symlink> worktree add ../…` resolves outside the workspace | Breaks worktrees |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none |
| Contracts / stored data | none |
| Other specs | as listed in §2.2; `qscore/…` code paths unchanged (relative to the repo root) |
| Modules | none (no code yet) |
| Tests and golden values | none |
| Score version | none |
| Fallback registry | none |
| Architecture | Repo name/location only; CI runs in the `qscore/` subfolder |
| Sponsor tracks / demo | Specs visible in the public repo at submission (no secrets in specs) |
| Cost | none |

## 6. Risks and rollback
The `specs` symlink is local to this machine (not in git); recreate with `ln -s Gatesmith/specs specs` on another machine. Original layout preserved in `KnightHacks26/qscore-workspace.zip`.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "Work in the git repo provided … treat Gatesmith/ as root for the overall hackathon project"; specs in Gatesmith per the lead's recommendation ("Go ahead").
- Applied to specs in: 2026-10-10 (T00 commit) · CHANGELOG line added: yes
