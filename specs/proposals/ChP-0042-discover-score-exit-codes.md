# ChP-0042: `discover --score` exit codes and flags as for `qscore score`; trust notice scope; failed SHA fetch

- **Status:** approved, applied
- **Class:** A  (CLI surface and exit codes — 00-operating-rules.md R5)
- **Author:** lead (from spec-auditor findings on ChP-0035/0036 code) · **Date:** 2026-10-11 01:15 UTC
- **Related tasks:** F1 (ChP-0035) · **Blocks:** nothing
- **Decision needed by:** before the F1 demo is recorded; CI wrappers will rely on the exit code of `discover --score`.

## 1. Summary
ChP-0035 added `discover --score` but did not say how it ends. Today it exits 0 even when cards are `partial` (`score` exits 3 unless `--allow-partial`). It has no `--allow-partial` / `--fail-on`, and a declined confirmation prints nothing (`score` prints "not confirmed; nothing scored"). This proposal makes the scoring half of `discover --score` behave exactly like `qscore score`. It also settles two gaps the auditor found: when the trust notice appears, and what a failed SHA fetch leaves behind.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/05-pipeline.md` §11, row `qscore discover [PATH]`
- Before:
  > … `--score` (with `--out`, `--yes`) (ChP-0035). Exit 3 on a failed clone. |
- After:
  > … `--score` (with `--out`, `--yes`, `--allow-partial`, `--fail-on`) (ChP-0035, ChP-0042). **With `--score`, the output, exit codes (0/1/2/3/4), `--allow-partial`, `--fail-on` and the "not confirmed; nothing scored" message are exactly those of `qscore score` on the drafted manifest.** Exit 3 on a failed clone. |
- File/section: `specs/05-pipeline.md` §2, *Repository links (ChP-0035)*, append
  > **The trust notice is shown when one command both fetches and scores (`discover URL --score`). A later `qscore score <clone>` treats the clone like any local project (its builders are the researcher's checkout; the ordinary confirmation applies).** **A failed SHA fetch leaves the partially initialised destination in place (qscore never deletes it); the `FetchError` message names it.**

### 2.2 Implementation sketch
- `cli.py::discover`: add `--allow-partial`, `--fail-on` (only with `--score`, else Q103 like `--out`/`--yes`). Factor the post-run reporting of `score` (status lines, `--fail-on`, partial → exit 3, "not confirmed") into a private helper used by both commands. No service change.
- `intake/fetch.py`: the `FetchError` message already names the leftover checkout (lead fix 2026-10-11, inside the current spec's "fail loudly"); the spec text records it.
- Tests: `discover --score` on a builder with a failing metric → exit 3, with `--allow-partial` → 0; `--fail-on high` with a high finding → 1; declined confirmation → message printed, exit 0.

## 3. Justification (evidence, not opinion)
spec-auditor review of ChP-0035/0036 (2026-10-11 ~01:12Z), findings 2 and "spec issues". `cli.py:124-137` returns 0 for partial cards and prints nothing on a declined confirmation, while `score` (`cli.py` after the catch-all) exits 3 / prints the message. Same run, different exit code depending on the entry command. 05 §11 says nothing about it.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is | No change | Exit code lies for partial runs from a repo link | Fail-loud rule (R4) |
| `discover --score` always exits 0 when the draft was written, and tells the user to run `qscore score` for gating | Simple | Two commands for CI; inconsistent | Users will gate on the one command they ran |
| Show the trust notice for any clone with an `origin` remote | Safer for fetched code | Every researcher's own repo has a remote → notice on every run, which is noise | The researcher already confirmed at fetch time; the ordinary confirmation still shows what runs |

## 5. Impact analysis
| Area | Impact (write "none" explicitly where none) |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline (hours) | ~45 min |
| Contracts / schemas / stored data (Neon, Hub) | none (CLI only) |
| Other specs and sections that must change | 05 §11 discover row, 05 §2 repository-links paragraph |
| Modules and public functions | `cli.py` only |
| Tests and golden values | New e2e tests in `tests/e2e/test_repo_link.py`; no golden values |
| Score version (metrics/thresholds) | none |
| Fallback registry | none |
| Overall architecture (hosts, data flow, security) | Trust notice scope stated explicitly (no behaviour change) |
| Sponsor tracks / demo | Repo-link demo gets correct exit codes |
| Cost (GPU credits, HF credits, time) | none |

## 6. Risks and rollback
Risk: a script that relied on exit 0 after a partial `discover --score` now sees 3. That's intended, and the feature is one day old. Rollback: drop the two flags and the shared helper.

## 7. Decision
- Decided by: lead, under the user's explicit delegation ("For 41 42 I'll leave it to your discretion") · Date: 2026-10-11 · Outcome: approved · Notes: —
- Applied to specs in: uncommitted on `lead/post-mvp`, 2026-10-11 · CHANGELOG line added: yes
