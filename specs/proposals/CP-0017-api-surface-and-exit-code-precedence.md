# CP-0017: Platform API surface alignment and CLI exit-code precedence

- **Status:** approved (spec text to apply)
- **Class:** A (CLI/API surface)
- **Author:** lead (from Codex review F-37, F-44) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T00 (CLI skeleton), T04, T28 · **Blocks:** T04 (exit-code tests); T28 endpoint list
- **Decision needed by:** before T04

## 1. Summary
(a) `03` §3.1 lists `POST /validate` for `api/app.py`; `12` §2 has no such endpoint (validation happens on `POST /projects/{name}/manifests` and as a job). (b) Exit 3 = "any uncaught `QscoreError`", exit 4 = configuration error, but `ConfigError` and `InvalidInput` are `QscoreError` subclasses — precedence unstated.

## 2. Proposed change
### 2.1 Spec text (exact)
- `03` §3.1 `api/app.py` — Before: "`POST /validate`, `POST /jobs`, …". After: "the endpoints in `12-platform-ui-space.md` §2 (that table is canonical)". (`POST /projects/{name}/manifests` does static schema+reference validation and returns the issue report; full validation is a `validate` job.)
- `05` §11 exit codes — add: "Mapping by exception type, most specific first: `InvalidInput` → 2; `ConfigError` → 4; findings ≥ `--fail-on` → 1; any other `QscoreError` (incl. `FallbackRefused`) → 3. Non-`QscoreError` exceptions are bugs: traceback printed, exit 3."

### 2.2 Implementation sketch
`cli.py` single exception handler with ordered `isinstance` checks.

## 3. Justification
F-37: two binding lists disagree. F-44: `03` §3.1 hierarchy (`QscoreError → InvalidInput, ConfigError, …`) with `05` §11 wording.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Add `POST /validate` to `12` | Matches `03` | Platform would run full validation (builders) synchronously | Platform accepts only QASM; job model already covers it |
| Exit 3 for everything | Simple | Contradicts exit 2/4 tests in T04 | — |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none |
| Contracts / stored data | none |
| Other specs | `03` §3.1, `05` §11 |
| Modules | `cli.py`, `api/app.py` |
| Tests and golden values | Exit-code tests per type; no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | none |
| Cost | none |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
