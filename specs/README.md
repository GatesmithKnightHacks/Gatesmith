# qscore specs — index

> Spec set **v2.0** · 2026-10-09 · KnightHacks IX · Derived from the Claude Docs "Quantum Optimization Engine: Architecture v2" (both tabs) and "Quantum Optimization Engine: MVP Spec" (build guide, file reference). These files are the agent-facing source of truth; where they differ from those docs, these files win.

## Precedence (highest first)

1. The user's explicit instructions in the conversation.
2. `00-operating-rules.md` (how every agent works).
3. `01-mvp.md` (what is in scope, in which tier).
4. The topic specs below.
5. `decisions.md` (why the defaults are what they are).
6. Code and comments.

If two specs disagree, stop and raise it with the user (R1.4); do not pick one silently.

## Files

| File | What it covers | Read when |
|---|---|---|
| `00-operating-rules.md` | Binding rules: spec adherence, MVP first, no unplanned fallbacks, fail loudly, change proposals, tests, git, handoffs, secrets | Every session start |
| `01-mvp.md` | Scope, tiers, gates G1–G5, definition of done, the demo, sponsor tracks | Every session start; before picking a task |
| `02-architecture.md` | Hosts, components, job flow, failure handling, deployment, security (MVP-tagged) | Anything crossing a module or host boundary |
| `03-code-structure.md` | Repo tree, five layers, file-by-file public functions, tooling, conventions | Before creating files or refactoring |
| `04-contracts.md` | Manifest, scorecard, request, proposal, attempt, job, event, plan, issues, profile schemas; versioning; hashing | Before touching schemas, JSON/YAML, Neon rows, Hub files, the API |
| `05-pipeline.md` | The ten stages, sandbox, CLI commands, exit codes, the issue catalog | intake/validate/interpret/compile/score/CLI work |
| `06-metrics.md` | Metric catalog, definitions, options, golden values | metrics/ work |
| `07-diagnostics.md` | Rules D01–D10, thresholds, severity, regions, policy, profiles | diagnose/ work, requests |
| `08-verification.md` | The verification ladder, statuses, acceptance and stopping rules | verify/ and loop work |
| `09-gpu-and-simulation.md` | W7900 facts, memory planning, planner, Aer methods, profiler, telemetry, benchmark | sim/, profiler, bench, GPU paths |
| `10-improvement-loop.md` | Layer protocol, `reference-qiskit`, the OpenAI-compatible client, prompts, compatibility kit, leaderboard | improve/ work, Space |
| `11-records-and-queue.md` | Neon schema/functions/roles, the worker, idempotency, Hub layout, exports | record/, worker, platform API |
| `12-platform-ui-space.md` | UI screens and backends, platform API, Vultr, Space, assistant | ui/, api/, docker/, space/ |
| `13-gpu-runbook.md` | Radeon Cloud sessions, Aer ROCm build, vLLM, bootstrap script, driving the machine | Before any GPU session |
| `14-testing.md` | Test layout, markers, types, tolerances, examples/fixtures, CI, definition of done, review checklist | Before writing tests or closing a task |
| `15-build-plan.md` | Phases, workstreams, tasks T00–T32 with acceptance criteria, cut list | Session start; picking work |
| `16-agents-and-codex.md` | Roles, when to delegate, worktrees, Codex modes and commands, review and merge | Before delegating |
| `17-fallbacks.md` | The fallback registry (user-owned) | Before writing any error path |
| `18-risks-and-watchlist.md` | Risks, pitfalls by area, open questions | Session start (skim); before working in an area |
| `decisions.md` | Decisions D-001… with alternatives and change class | When tempted to change a default |
| `CHANGELOG.md` | Approved spec changes | After applying an approved proposal |
| `proposals/` | Change proposals CP-NNNN | When anything must deviate |
| `templates/` | handoff, change proposal, task brief, task report schema, experiment notes, repo AGENTS/CLAUDE | When producing those documents |

## Identifier conventions

| Prefix | Meaning | Defined in |
|---|---|---|
| R1–R11 | Operating rules | `00` |
| G1–G5 | Gates | `01` §5 |
| T00–T32 | Build tasks | `15` §3 |
| D01–D10 | Diagnostic rules | `07` §1 |
| Q100–Q503 | Issue codes | `05` §12 |
| FB-01… | Fallbacks | `17` §2 |
| D-001… | Decisions | `decisions.md` |
| CP-0001… | Change proposals | `proposals/` |
| S1–S3 | GPU sessions | `13` §2 |

## Glossary

- **Manifest** — `qscore.yaml`: the experiment contract listing circuits (items), their invariants, permitted changes, objective, budget.
- **Item** — one circuit entry in the manifest; one scorecard per item.
- **Intent / invariants** — what must stay the same (exact unitary, reversible function, known output, distribution, expectation, structure only).
- **Target** — the hardware a circuit is compiled for (e.g. `FakeTorino`), with a calibration snapshot.
- **Representative compile** — the best of the seeded level-3 compiles by the primary objective.
- **Finding** — a diagnostic rule firing, with evidence, severity, region and suggested strategies.
- **Region** — qubits + layer range + gate indices locating a finding; requests cut convex blocks from it.
- **Improvement request / proposal** — the published format sent to layers / the only thing a layer returns.
- **Layer** — an improvement proposer (`reference-qiskit`, `local`, `hf`, plugins).
- **Attempt** — one proposal's full record: parse, verification, measurement, decision.
- **Verification ladder** — the exact-method sequence deciding equivalence (`08`).
- **Crossover** — the circuit size where the GPU starts beating the CPU (measured by the profiler).
- **Fusion width** — Aer's maximum fused-gate width (`fusion_max_qubit`); swept 2–5 per precision.
- **Lead** — the main Claude Code session; **delegate** — a subagent or Codex run working in a worktree.
