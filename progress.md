# G-MVP progress

## Scope and authorization

- User authorized completing MVP/G-MVP on 2026-10-10, with no commits and a text-only final handoff.
- Scope: CP-0023 and specs/15 §3a (M1–M4). GPU, simulation, improvement, queue and UI remain later work.
- Specs, exported contracts and person-owned golden values remain unchanged.

## Broken / blocked

- Review defects in observable validation and commuting-run layer bounds have code fixes; dedicated regression coverage is still incomplete.
- G-MVP is NOT complete: slow flagship examples, custom-calibration tests, documentation and final review remain.
- User requested an early logical stop; no further implementation until resumed.

## Active work

- Complete sandbox builder loading, binding and size-sweep integration.
- Complete custom target support using approved CP-0009 and CP-0025 calibration behavior.
- Fix validation, diagnostic regions and shared-dependency failure handling.
- Add interpretation before CLI confirmation, metrics documentation and integration coverage.
- Run CPU tests including slow examples, golden/contract tests, lint, types, import layers and smoke commands; obtain independent review.

## Decisions made by the lead

- Implement existing approved contracts; no new fallback, score formula or threshold.
- Preserve the current branch and leave all edits uncommitted, as requested.

## Validation

- Locked dependencies installed with `uv sync --frozen` using Python 3.11.9.
- Environment: `/tmp/gatesmith-venv`; uv: `/tmp/gatesmith-tooling/bin/uv`; cache: `/tmp/gatesmith-uv-cache`.
- Earlier fast CPU run: 305 passed, 4 deselected (102.52 s). This preceded the final new tests and small cleanup edits; rerun the complete suite on resume.
- Latest targeted tests: `pytest tests/unit/score/test_engine.py tests/e2e/test_builders.py -q -x`: 20 passed (23.68 s).
- Ruff check/format passed; mypy: no issues in 73 files; import-linter: 1 contract kept, 0 broken.
- No golden values, exported contracts, specs, commits or handoff files changed.

## Remaining before G-MVP

- Run both examples including the newly enabled QAOA builder and five-size sweep; verify D01/D03, computed scalability, JSON and Markdown.
- Add and run custom-target/calibration, malformed-observable, commuting-layer and interactive-confirmation regression tests.
- Test CLI partial/fail-on behavior, deterministic scoring and calibration identity; inspect budget behavior (currently checked between metrics, not hard cancellation).
- Finish `docs/metrics.md` and README; update stale implementation docstrings.
- Complete independent diff review and resolve findings, then rerun CPU (including slow), golden/contracts, lint/format/types/imports and CLI smoke.
- Report completion accurately in a text-only handoff; do not commit or create a handoff file.

