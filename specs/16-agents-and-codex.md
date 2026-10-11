# 16 · Agents and Codex: who does what, and how to delegate well

> **Status:** binding · **Read:** before delegating anything, and when T00 records which Codex integration is available.
> Delegation is a tool, not a goal. Delegate when it saves wall-clock time or adds an independent second opinion **and** the task is fully specified. Everything delegated is reviewed before it reaches `main`.

## 1. Roles

| Role | Who | Owns | Never |
|---|---|---|---|
| **Lead** | The main Claude Code session started in the workspace root | The plan and `progress.md`; contracts (`schemas/`); integration and merges to `main`; change proposals and talking to the user; handoffs; GPU sessions; secrets handling; final review of every diff | Delegates its own judgement calls (spec deviations, approvals) |
| **Claude subagents** | Built-in (`Explore`, `Plan`, `general-purpose`) and the workspace's custom ones in `.claude/agents/` | Focused tasks with a brief: search, review, experiments, implementing one task in one worktree | Approve changes, edit specs, touch `main`, touch secrets or cloud resources |
| **Codex** | OpenAI Codex via the CLI (`codex exec`), its MCP server, or the `codex-plugin-cc` plugin | Independent implementation of well-specified leaf tasks in a worktree; cross-model review; test generation | The same as subagents, plus: any GPU-machine access, any network-dependent setup |

Custom subagents (`.claude/agents/`):
- `spec-auditor` — read-only reviewer of a diff or module against the specs and `14-testing.md` §6. Use after every task, and as the second key for delegated work.
- `module-builder` — implements exactly one task from `15-build-plan.md` inside a given worktree, test-first, and returns the task report.
- `lab-runner` — answers one technical question with a minimal experiment in `lab/` (API behaviour, option support, performance) and writes `NOTES.md`; never touches the repo.

Built-ins: use `Explore` for broad searches across specs/code (keeps the lead's context small); `Plan` when a task needs a written approach before code.

## 2. Should I delegate this? (all must be true)

1. The task has an ID in `15-build-plan.md` (or is a review/experiment), and its spec sections are complete enough that a fresh agent needs **nothing from this conversation** except the brief.
2. Its acceptance criteria are executable (tests or commands).
3. It touches files no other in-flight task touches (check `progress.md` → *Active delegations*).
4. It is bigger than ~20 minutes of work, or it benefits from an independent second implementation/review.
5. It needs no secrets, no cloud resources, no GPU machine, and no network inside the sandbox (prepare dependencies first).

If any is false, do it in the lead session (or split it). Good Codex candidates are marked `codex` in the task tables: leaf metrics, catalogs, generators, CLI wiring against stubs, the Space app, tests from specs.

**Never delegate:** contracts/schema changes, change proposals or approvals, `services.py` integration, the worker loop's GPU lease, GPU sessions, deployment, anything touching tokens, merging, editing `specs/`.

## 3. The worktree workflow (manual — the workspace root is not a git repo)

Claude Code's `isolation: worktree` only works when the session's directory is a git repo; here the repo is `Gatesmith/` (engine in its `qscore/` subfolder), so the lead creates worktrees explicitly:

```bash
# create (from the workspace root)
git -C Gatesmith fetch --all --prune 2>/dev/null || true
git -C Gatesmith worktree add ../worktrees/T13-metrics -b agent/T13-metrics main
(cd worktrees/T13-metrics/qscore && uv sync --frozen)          # deps installed BEFORE delegating (no network in Codex's sandbox)

# after the delegate finishes: review and merge
(cd worktrees/T13-metrics/qscore && uv run pytest -q && uv run ruff check . && uv run mypy src && uv run lint-imports)
git -C Gatesmith diff main...agent/T13-metrics             # read it
git -C Gatesmith merge --no-ff agent/T13-metrics -m "T13: metrics (06-metrics §2) [delegated: codex; reviewed: spec-auditor]"
git -C Gatesmith worktree remove ../worktrees/T13-metrics && git -C Gatesmith branch -d agent/T13-metrics
```

- One worktree per task; branch `agent/<task-id>-<slug>`; record it in `progress.md` → *Active delegations* (task, agent, worktree, started, status).
- The delegate commits on its branch (small commits, `T<id>: …`). It never merges, rebases `main`, or pushes.
- Rebase onto `main` before review if `main` moved (`git -C worktrees/<t> rebase main`); conflicts are resolved by the lead.

## 4. Codex: integration modes (T00 detects which exist; record in `progress.md`)

| Mode | Detect | Use for | Notes |
|---|---|---|---|
| ★ **CLI `codex exec`** | `codex --version` works in Bash | Implementation tasks in a worktree; reviews | Explicit cwd, sandbox, output file and output schema; can run in the background |
| MCP server | Tools named like `mcp__codex__codex` / `codex-reply` are available (registered by the user with `claude mcp add codex -- codex mcp-server`; check `codex mcp-server --help` for the current command) | Short synchronous tasks | Blocks the lead's turn while it runs |
| `codex-plugin-cc` | `/codex:review`, `/codex:rescue` exist; subagent `codex:codex-rescue` appears in the agent list | Reviews of uncommitted changes (`/codex:review`, `/codex:adversarial-review`) | Commands are scoped to the current git repo, and this session's directory is not one — prefer the CLI from the workspace root; the review gate (`/codex:setup --enable-review-gate`) can loop and drain usage, so leave it off unless the user enables it |

### 4.1 Running an implementation task with the CLI

```bash
mkdir -p worktrees/.briefs worktrees/.reports
# 1) write the brief from specs/templates/task-brief.md → worktrees/.briefs/T13.md (absolute paths inside)
# 2) run, time-boxed. Start it as a background command (Claude Code's Bash tool can run commands in the
#    background; outside it use `nohup … &`), then poll for the report file.
timeout 45m codex exec \
  --cd "$PWD/worktrees/T13-metrics" \
  --sandbox workspace-write \
  --output-schema "$PWD/specs/templates/task-report.schema.json" \
  --output-last-message "$PWD/worktrees/.reports/T13.json" \
  "$(cat worktrees/.briefs/T13.md)" > worktrees/.reports/T13.log 2>&1
```

- `--sandbox workspace-write` lets Codex write only inside its worktree (plus temp); **no network** by default, so install dependencies first. Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Codex reads `AGENTS.md` from the repo root of its worktree (the repo's `AGENTS.md`, copied from `specs/templates/repo-AGENTS.md`), which points it to the specs (`specs/` inside the worktree, i.e. the branch's copy; `../../specs/` is the live main checkout via the workspace symlink). T00 verifies once that Codex can read `specs/` from a worktree (`codex exec --cd worktrees/<t> "Print the first heading of ../../specs/README.md"`); if it cannot, put the needed spec excerpts in the brief.
- Model and effort: leave Codex defaults unless the user specifies (`-m` overrides).
- Resume a session for follow-ups: `codex exec resume --last "…"` from the same worktree, or by session id from the log.
- The report (`.reports/T13.json`) must validate against `task-report.schema.json`; if it does not, treat the run as failed and read the log.

### 4.2 Cross-model review with the CLI (read-only)

```bash
codex exec --cd "$PWD/worktrees/T13-metrics" --sandbox read-only \
  --output-last-message "$PWD/worktrees/.reports/T13-review.md" \
  "Review the diff of branch agent/T13-metrics against main for spec compliance. Specs: ../../specs/06-metrics.md §2-4, ../../specs/00-operating-rules.md R3-R4, checklist ../../specs/14-testing.md §6. Run: git diff main...HEAD. Report numbered findings with file:line, severity (blocker/major/minor), and the spec clause violated. Do not modify files."
```

Use for: `verify/`, `metrics/`, `diagnose/`, `sim/planner.py`, `improve/requests.py`, `record/jobs_client.py` — anywhere a wrong answer would look plausible.

## 5. Claude subagents: how to brief

- Pass the brief (template `specs/templates/task-brief.md`) as the prompt: task ID, goal, exact spec sections, files allowed/forbidden, acceptance commands, the worktree's absolute path, the report format.
- Subagents start in the workspace root; tell `module-builder` to `cd` into its worktree in every Bash command (`cd /abs/worktrees/T13-metrics && …`) and to edit files only under that path.
- Subagents load `CLAUDE.md`/`AGENTS.md` like the lead, so the rules apply to them too; the brief still restates the non-negotiables (no fallbacks, no spec edits, report deviations).
- Run independent subagents in parallel (one message, several Agent calls); never two on overlapping files.

## 6. Review and merge protocol (two keys)

1. The implementer's report says `status: done` and lists tests run with results.
2. The lead runs the acceptance commands itself in the worktree and reads the output.
3. A **different** reviewer reviews against the spec: `spec-auditor` (Claude) for everything; **plus** a Codex review (§4.2) for the core modules listed there. If Codex implemented it, `spec-auditor` reviews; if a Claude subagent implemented it, a Codex review is preferred.
4. Findings: blockers fixed (by the implementer via a follow-up, or by the lead); spec deviations become proposals (R5); minor items go to `progress.md` → *Follow-ups*.
5. Merge (`--no-ff`, message records implementer and reviewer), remove the worktree, update `progress.md`.

## 7. Limits and hygiene

- At most **three** delegated implementers at once (plus reviewers). Integration capacity, not agent capacity, is the bottleneck.
- Time-box every delegation (default 45 minutes for Codex, `maxTurns` for subagents); a time-out is reported as `partial` and the lead decides.
- Don't paste large outputs into the lead's context; ask delegates for summaries and paths.
- A delegate that hits a spec problem stops that line of work and reports it under `spec_deviations` — it does not improvise (R1.4).
- Delegated runs never get secrets. If a task needs the platform job API or the Hub, the lead runs that part.
- Keep an eye on usage: Codex and subagents consume the user's quotas; prefer fewer, well-specified delegations over many small ones.
