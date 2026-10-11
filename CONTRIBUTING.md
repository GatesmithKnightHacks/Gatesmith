# Contributing to Gatesmith

Gatesmith has two parts. The engine, qscore, lives in `qscore/` on `main`. The web app lives in `web/` on the `design` branch. The specs in `specs/` decide how the engine behaves, and they win over the code when the two disagree. Read `specs/00-operating-rules.md` and `specs/01-mvp.md` before your first change.

## Run the engine

You need [uv](https://docs.astral.sh/uv/). It installs Python 3.12 from `qscore/.python-version`.

```bash
cd qscore
uv sync --frozen
uv run qscore score examples/sidechain_qaoa/circuits/packing_qaoa_p2.qasm --yes
scripts/smoke.sh
```

`scripts/smoke.sh` scores a pasted Bell circuit and both examples, and exits non-zero on any failure. The `sidechain_qaoa` example builds its circuit from a Qiskit builder function. The builder sandbox caps memory with `RLIMIT_AS`, which macOS rejects, so that step fails on a Mac. Run the smoke script on Linux, or score the QASM file directly as in the third line above.

Run the same checks as CI before you push:

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run lint-imports
uv run pytest -m "not gpu and not neon and not hub and not llm and not slow" -q
```

`lint-imports` enforces the module layers. Imports point down only. From top to bottom, the layers are the interfaces, `services.py`, the pipeline, the engines and the foundations. `specs/03-code-structure.md` lists which folder belongs to which layer.

## Run the web app

You need Node.js and npm.

```bash
git switch design
cd web
npm install
npm run dev          # http://localhost:5173
```

Check your change with these commands:

```bash
npm run typecheck
npm run lint
npm run e2e          # the full flow, plus every route
npm run diff S-04    # one screen against its design export in tests/design
```

The app plays a scripted run from `web/src/data/demo.ts` and `web/src/data/run.ts`. Keep field names identical to the engine's scorecard schema, so the engine's API can replace the script later.

## Branches and commits

The repo uses these branch names:

| Branch | Use |
|---|---|
| `main` | Reviewed work that passes CI. Only the project lead merges into it. |
| `t00-bootstrap` | A build task, named after its id. The tasks T00 to T32 are in `specs/15-build-plan.md`. |
| `agent/<task-id>-<slug>` | A delegated task in its own worktree, for example `agent/T13-metrics` |
| `chp/<NNNN>-<slug>` | A prototype for change proposal ChP-NNNN. It never merges before the proposal is approved. |
| `design` | The web app |
| `platform-integration` | The hosted platform |
| `github-app` | The GitHub bot |

Engine commits name the task and the spec section, for example `T13: two-qubit depth metric (06-metrics §3.1)`. Web commits start with `web:`, for example `web: states QA for S-01 to S-07`. Keep commits small. Never force-push or rewrite published history. Never commit secrets, `.env` files, model weights, wheels or simulation outputs over 1 MB.

## Change the specs first

Some changes alter what the engine promises, so they need an approved change proposal before any code lands on `main`. These class A changes include schemas, the CLI and API surface, metric definitions, diagnostic thresholds, verification and acceptance rules, new runtime dependencies, fallbacks, golden values, and skipping or deleting tests.

To propose one, copy `specs/templates/change-proposal.md` to `specs/proposals/ChP-<NNNN>-<slug>.md`, take the next free number, and fill in the exact before and after spec text. You can prototype on a `chp/<NNNN>-<slug>` branch while it waits. Class B changes, such as refactors with no change in behaviour, extra tests and dev-only dependencies, need only the project lead's approval.

## Add a metric

1. Write a class in `qscore/src/qscore/metrics/<group>/`. The group is `resources`, `hardware`, `opportunities` or `research`. The class follows the `Metric` protocol in `qscore/src/qscore/metrics/base.py`, which needs `id`, `group`, `version`, `kind`, `scope`, `requires`, `cost_tier` and `compute()`.
2. Return results with the helpers `computed()` or `unavailable()`. Use `unavailable()` only when a declared requirement is absent, such as missing calibration data. Never catch an exception in `compute()` to hide it. The engine turns an exception into `status: failed` and marks the scorecard partial.
3. Register an instance in `BUILTINS` in `qscore/src/qscore/metrics/registry.py`.
4. Give the class a docstring of at least three paragraphs. The first is a plain explanation that becomes the UI tooltip, the middle is the precise definition, and the last has the form `Unit: <unit>. Reference: <reference>`. Then regenerate `qscore/docs/metrics.md` by running `uv run python -m qscore.metrics.docs > docs/metrics.md` inside `qscore/`. `qscore/tests/unit/metrics/test_docs.py` fails if the committed file is stale.
5. Add unit tests in `qscore/tests/unit/metrics/`.
6. Add the definition to `specs/06-metrics.md` §2 through a change proposal. Any later change to the definition bumps the metric's `version` and `SCORE_VERSION` in `qscore/src/qscore/schemas/versions.py`.

Do not edit `qscore/tests/golden/values.yaml`. Only the maintainers change golden values.

## Add a diagnostic rule

1. Add the rule's title to `TITLES` in `qscore/src/qscore/diagnose/rules.py` and its check to `evaluate()`. When a needed metric was not computed, append the rule and the reason to `skipped` instead of returning nothing.
2. Put each threshold in `qscore/src/qscore/diagnose/thresholds.yaml`. Changing that file changes the score version, and its sha256 goes into every scorecard's provenance.
3. If a circuit family needs a different threshold, add an override with a written `reason` to a profile in `qscore/src/qscore/diagnose/profiles/`.
4. Add a unit test to `qscore/tests/unit/diagnose/test_rules.py` with metrics at, just below and well above the threshold, including the severity boundaries.
5. Add the rule to the table in `specs/07-diagnostics.md` §1 through a change proposal.

## Issue codes

Every input problem gets a stable code of the form `Q###`. The hundreds digit says which stage found it:

| Range | Stage | Example |
|---|---|---|
| Q1xx | Manifest schema | Q101 unknown field |
| Q2xx | References to files, builders, targets and parameters | Q206 unknown target |
| Q3xx | Running builders and parsing QASM | Q304 QASM parse error |
| Q4xx | Semantic checks on intent and circuit | Q404 more qubits than the target has |
| Q5xx | Feasibility and resources | Q501 exceeds the GPU memory budget |

The full list is in `specs/05-pipeline.md` §12, and a new code goes there first. Build issues with `make_issue()` in `qscore/src/qscore/validate/issues.py`, so each one carries `file:line:column`, the manifest field path, a message and a hint. Each MVP code has a fixture in `qscore/examples/broken/Q###_<slug>/` with a `qscore.yaml` and an `expected.json` that lists the exact codes and locations. `qscore/tests/e2e/test_broken_examples.py` checks every fixture and fails if a code has no fixture.

Fail loudly. Raise the typed errors in `qscore/src/qscore/errors.py`, and never swallow one. A fallback exists only if `specs/17-fallbacks.md` lists it and configuration enables it.

## Open a pull request

1. Branch from `main`, or from `design` for web work, using the names above.
2. Run the engine checks or the web checks above, depending on what you changed.
3. Open the pull request against the branch you started from. Name the task id and the spec section, and link the change proposal if there is one.
4. CI runs lint, types, import layers and the CPU tests on Python 3.11 and 3.12. It must pass.
5. The project lead reviews and merges. Do not weaken a test to make CI pass. That rules out new `skip` or `xfail` markers, looser tolerances and deleted assertions.

By contributing, you agree that your work is licensed under the Apache License 2.0 in [LICENSE](LICENSE).
