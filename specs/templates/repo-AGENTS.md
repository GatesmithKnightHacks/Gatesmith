# AGENTS.md — Gatesmith repository (qscore engine)

<!-- Copied into the repo root at T00 from specs/templates/repo-AGENTS.md. Codex reads this file automatically. -->

You are working in the **Gatesmith** repository (KnightHacks IX). Its engine, **qscore** (a scoring engine for quantum circuits, Qiskit), lives in `qscore/`. The specs that govern this code are committed in this repo:

- In the repo (`Gatesmith/`) or a task worktree: `specs/` at the repo root (`../specs/` from the engine folder `qscore/`)

**Before changing anything, read** `specs/00-operating-rules.md`, `specs/01-mvp.md`, and the spec sections named in your task brief. If you cannot read them, stop and say so.

## Non-negotiable rules (short form; the specs win on any conflict)

1. **Specs are the source of truth.** Implement names, schemas, statuses, CLI flags, exit codes, formulas and file layouts exactly as specified. Where a spec marks a ★ default option, use it.
2. **No deviation without a change proposal.** If the spec is wrong, ambiguous or impossible, stop that part and report it (spec reference, evidence, proposed change, impact on the MVP and the architecture). Never improvise a workaround.
3. **No fallbacks** unless listed in `specs/17-fallbacks.md` *and* enabled by configuration. No broad `except`, no default values hiding failures, no silent switch of device, model, method, precision or data source.
4. **Fail loudly.** Raise the typed errors in `src/qscore/errors.py`; never swallow; never make a red check green by weakening it (no new `skip`/`xfail`/loosened tolerance/deleted assertion).
5. **MVP first.** Build only what the task asks; nothing "for later".
6. **Tests from the spec.** Golden values in `tests/golden/` are person-only: never edit them.
7. **Stay in scope.** Touch only the files your brief allows. Never edit `specs/`, `schemas/` contracts (unless your task is T01), or other tasks' files.
8. **No secrets, no network, no cloud resources** in delegated runs.
9. **Commit small** on your branch: `T<id>: <what> (<spec file> §<section>)`. Never merge, rebase `main`, force-push, or push.
10. **Report** in the format of `specs/templates/task-report.schema.json`.

## Commands (run inside `qscore/`)

```bash
uv sync --frozen                                   # deps (lead does this before delegating)
uv run pytest -m "not gpu and not platform and not hub and not llm and not slow" -q
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run lint-imports                                # layers: interfaces → services → pipeline → engines → foundations
uv run qscore --help
```

## Layout (see `specs/03-code-structure.md`)

`src/qscore/` with layers: interfaces (`cli.py`, `worker.py`, `api/`, `ui/`) → `services.py` → pipeline (`manifest/`, `intake/`, `validate/`, `interpret/`, `score/`, `record/`, `bench/`) → engines (`targets/`, `compile/`, `metrics/`, `sim/`, `diagnose/`, `verify/`, `improve/`) → foundations (`schemas/`, `hardware/`, `config.py`, `errors.py`, `logging.py`). Imports point down only.
