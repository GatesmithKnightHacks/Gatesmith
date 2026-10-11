# ChP-0039: CLI negation and isolated project dependencies

- **Status:** approved
- **Class:** A (CLI surface, builder environment and dependency installation)
- **Author:** Codex · **Date:** 2026-10-11
- **Related tasks:** F1 follow-up, C39a–C39c below · **Blocks:** dependency-install workflow only
- **Decision needed by:** before implementation; F1 core and F3 remain independent

## 1. Summary

Use `--not input,confirm` for disabling CLI behaviors, `--pick not:2,5` for excluding
candidates, and `qscore deps [PATH]` to prepare a repository's own builder environment.
The engine environment and its installed Qiskit remain unchanged. This is the concrete
proposal requested in the handoff; it is not permission to install third-party packages now.

The user approved both the negation spelling and the environment behavior below under 00 R5.

## 2. Proposed change

### 2.1 Exact spec text

**05 §11 and references in §1–§2:** replace `--no-input` with `--not input`.

Add:
> Each command accepts repeatable `--not NAME[,NAME...]` for its supported disabling
> behaviors. Repeated occurrences merge. Unknown or empty names are invalid input, exit 2,
> listing valid names. Completion suggests the command's valid names. `discover` supports
> `input` and, with `--score`, `confirm`; `score` supports `confirm`; `deps` supports `confirm`.
> `--not input` suppresses discovery prompts and otherwise has the exact previous
> `--no-input` behavior. `--not confirm` is the explicit confirmation equivalent of `--yes`:
> it records `yes_flag`, shows the trust notice, and does not bypass validation. `--yes`
> remains accepted; the old `--no-input` spelling is removed with a migration hint. Names
> which do not apply to the selected mode fail with exit 2. No other behavior is negatable.

**05 §2**, after positive `--pick` selection, add:
> `--pick not:SELECTORS` selects every draftable candidate except the listed candidate
> numbers or names. SELECTORS uses the same resolver and validation as positive picks.
> Unknown, ambiguous, empty selectors and an empty resulting selection fail with exit 2.
> The resulting selection retains discovery order. No shell quoting or history-expansion
> characters are required. This syntax applies only to `--pick` until another list option
> is explicitly specified; it does not imply new `--metrics` or `--rules` flags.

**05 §11**, add:
> `qscore deps [PATH] [--not confirm]` → `prepare_dependencies`: PATH defaults to `.` and
> accepts a project directory or its qscore manifest. Resolve `project.root` exactly as for
> scoring. Show the selected dependency declarations, proposed install command, environment
> path, exact engine Qiskit version constraint, and any manifest diff before confirmation.
> Refusal performs no install or manifest change. Missing `uv` or unsupported interpreter
> is ConfigError (exit 4); invalid project input is exit 2; resolution/install failure is
> exit 3 with uv's actionable message; success is exit 0. Services return structured results
> and emit events, never print.

**05 §4**, replace:
> `env: uv` (the repo's own environment) is later

with:
> `env: uv` runs builders using `<project.root>/.qscore/venv/bin/python` (Windows:
> `Scripts/python.exe`). Its absence is ConfigError with `qscore deps PATH` as the remedy.
> There is no substitution of the engine environment. The runner verifies that its Python
> major/minor matches the engine and its Qiskit version equals the engine's installed
> version before invoking builders. A mismatch fails before QPY transport; Q306 still
> reports actual incompatible QPY. The normal process/container sandbox, limits, allowed
> environment, module resolution and secret removal continue to apply.

Add **05 §4.3 Project dependency preparation**:
> `deps` prepares a uv virtual environment with the engine's Python and exact installed
> `qiskit==VERSION` as an explicit constraint. Select inputs without executing repository
> code: an installable `pyproject.toml` project, otherwise `setup.py`/`setup.cfg` if present,
> plus `requirements.txt` when present. Install the project and requirements together under
> that constraint. Show every selected file; do not guess import-to-package names, install
> optional extras, search PyPI for missing imports, or rewrite conflicting requirements.
> If no supported declaration exists, report invalid input with the inspected filenames.
> Requirements includes and build metadata execute only after confirmation as part of the
> explicitly approved package installation; the trust notice states that build hooks can
> execute repository code and access the network. Do not expose secrets in logs or events.
> A resolver conflict (for example `qiskit<1.0`) fails with the conflicting requirement;
> changing the engine pin, deleting a dependency or exporting another circuit format is
> forbidden. Installed project metadata, rather than a hand-written version stub, supplies
> generated package-version modules when the project build supports that behavior.
> Prepare a new environment under `.qscore/` and verify its Python, Qiskit and installed
> dependency consistency before replacing a previously working environment. A failed
> preparation leaves the previous environment and manifest intact and names the failed
> preparation directory. Do not automatically delete project files.
> On success, change only `project.runner.env` to `uv` in an existing manifest, preserving
> YAML comments and other fields; the exact diff was shown before confirmation. Without a
> manifest, retain the prepared environment and explain that a subsequent draft must set
> `project.runner.env: uv`. Do not invent circuits or auto-run scoring.
> Record preparation inputs and hashes, engine Qiskit/Python versions and the resolved
> package list in `<project.root>/.qscore/deps.json`; this is local provenance, not a new
> public scorecard schema. Builder runs include its hash via an `x-` provenance extension.

**05 §2**, missing-import warning, append:
> If declarations exist, suggest `qscore deps PATH`. Discovery remains static and never
> installs packages or executes setup metadata. It does not promise that dependency
> preparation will resolve Qiskit API incompatibilities.

**03 module layout**, add `intake/deps.py`; **15**, add tasks below.

### 2.2 Implementation sketch

- C39a: `cli.py` option parsing/completion and `intake/draft.py` exclusion resolver;
  retain services' explicit booleans and confirmation API. Test invalid names and picks,
  repeated options, exclusions, empty selection, mode guards and trust/confirmation parity.
- C39b: `intake/deps.py` static inspection, uv invocation and verified environment promotion;
  `services.prepare_dependencies` and CLI `deps`. Test offline synthetic local projects,
  solver conflict, declined confirmation, no package declarations, missing uv, failed upgrade
  preserving the existing env, exact manifest diff and sanitised failure output.
- C39c: runner selection and QPY version checks in intake; one builder imported only from a
  prepared project environment must score end to end. Validate the real MQT Bench package
  workflow and the notebook dependency example after explicit install confirmation.
- No runtime dependency is added to qscore. uv is an external required tool for this opt-in
  command; the default `engine` path retains existing behavior.

## 3. Justification

The 2026-10-10 F1 runs in `progress-log.md` and
`handoffs/20261011-0051-6de263eb.md` show MQT Bench requiring generated `_version.py`, notebook
imports requiring matplotlib, and graph builders requiring networkx. Current 05 §4 explicitly
defers `env: uv`; current runner rejects it. Copying stubs or installing all packages into the
engine is not a reproducible researcher workflow. A project-built isolated environment gives
package metadata its normal build path while keeping QPY compatibility explicit.

The handoff records the user's chosen CLI design: `--not a,b,c` and the `not:` prefix. These
avoid zsh's `!` history expansion and the quoting required by a multi-word `not 2,5` token.

## 4. Alternatives considered

| Option | Benefit | Cost / reason not selected |
|---|---|---|
| Keep current behavior | No new surface | Researchers must manually prepare compatible environments |
| Install into engine env | Short implementation | Changes qscore's tested dependency set and couples unrelated projects |
| Guess packages from ImportError | Easy-looking automation | Module names are not reliable package names; forbidden undeclared substitution |
| Relax Qiskit pin | More projects resolve | Can break builder APIs/QPY; conflict must remain visible |
| Retain every `--no-*` flag | Familiar aliases | Contradicts the selected consolidated CLI design; document the migration instead |

## 5. Impact analysis

| Area | Impact |
|---|---|
| MVP scope and tiers | None; G-MVP remains complete, this is an F1 follow-up |
| Gates and timeline | Approximately 3–5 hours implementation and review after approval; no F2/F3 dependency |
| Contracts / stored data | Manifest's existing `runner.env: uv` activated; additive local provenance extension; no Neon/Hub migration |
| Specs | 03 module list, 05 §§1–4/11, 15 tasks; CLI documentation and examples |
| Modules / APIs | CLI, draft selection, new intake/deps, runner, services.prepare_dependencies |
| Tests / golden values | New command, resolver and isolated-builder tests; no golden-value changes or weakened checks |
| Score version | None; metrics and diagnostic thresholds unchanged |
| Fallback registry | None; no fallback introduced |
| Architecture / security | Explicit network/package-build action after confirmation; builders keep existing sandbox limits; engine env untouched |
| Sponsor/demo | More public repos can reach scoring without manual package work |
| Cost | No GPU/HF credits; local disk/network/time for opt-in package installation |

## 6. Risks and rollback

Build hooks execute third-party code and dependency solving may fail. The command shows that
operation before confirmation and preserves a working environment on failure. qscore does not
promise to modernize a repository written for older Qiskit APIs. Roll back by removing the new
command/negation syntax and retaining `engine` mode; do not delete users' project environments.

## 7. Decision

- Decided by: user · Date: 2026-10-11 · Outcome: approved ("Yes I approve", referring to ChP-0039 and ChP-0045).
- Applied to specs: yes, 2026-10-11 (03, 05 §§1–2/4/4.5/11, 15; §4.3 of the text placed as 05 §4.5 because §4.3 exists; `bench --not fusion` of ChP-0046 named as the one extra negatable). CHANGELOG: yes. Implementation: CLI, preparation, sandbox selection and provenance implemented; synthetic offline integration passed (lab/20261011-deps-isolation). Full checks/review pending.
