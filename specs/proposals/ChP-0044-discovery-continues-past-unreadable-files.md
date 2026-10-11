# ChP-0044: Folder discovery continues past unreadable files (located warnings)

- **Status:** approved, applied
- **Class:** A  (CLI behaviour and exit code of `discover` — 00-operating-rules.md R5)
- **Author:** lead · **Date:** 2026-10-11 02:20 UTC
- **Related tasks:** F1 · **Blocks:** nothing

## 1. Summary
Today one file that can't be parsed (Q301), a malformed notebook (Q103) or an unreadable path (Q200) stops discovery of the whole repository with exit 2. On QED-C App-Oriented Benchmarks (184★), one notebook with a genuine syntax error hid every other circuit. Proposed: a folder scan that still finds candidates lists them, and reports each unreadable file as a located warning naming the file, line, column and code.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/05-pipeline.md` §1 (discover/draft "Does" paragraph)
- Before:
  > Python syntax errors are located Q301; malformed notebooks are Q103; missing paths are Q200.
- After:
  > Python syntax errors are located Q301; malformed notebooks are Q103; missing paths are Q200. When a folder scan still finds candidates, unreadable files are reported as located warnings ("not scanned; its circuits are not listed") and discovery continues (exit 0). A single-file PATH, or a scan with no candidates, still fails with the located issues (exit 2). (ChP-0044)

### 2.2 Implementation sketch
`intake/discover.py::discover(..., unreadable=list)` collects the issues instead of raising, and only for a folder scan with candidates. `services.discover_candidates` emits one `warning` event per issue. Tests: `test_discover.py::test_unreadable_file_is_a_warning_when_others_have_candidates`, `test_discover_cli.py::test_discover_lists_the_rest_and_warns_about_a_broken_file`. The aggregated-missing-files test now expects exit 0 with three Q200 warnings.

## 3. Justification
Demo run 2026-10-10 ~21:58 EDT: `qscore discover https://github.com/SRI-International/QC-App-Oriented-Benchmarks` → exit 2, `Q301 qedcbench/quantum-volume-qiskit.ipynb:108:48` (two statements on one line in their notebook). Nothing was listed, and `--path` was needed for every benchmark folder.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep as is | Strict | One broken file hides a whole repo | Unusable on large repos |
| Silently skip unreadable files | Simple | Hides failures (R3/R4) | Forbidden |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline (hours) | ~20 min (done) |
| Contracts / schemas / stored data | none (events only) |
| Other specs and sections that must change | 05 §1 |
| Modules and public functions | `intake/discover.discover` (new keyword-only `unreadable`), `services.discover_candidates` |
| Tests and golden values | 2 new tests, 1 updated expectation; golden values unchanged |
| Score version | none |
| Fallback registry | none (every skipped file is reported with its issue; not a fallback) |
| Overall architecture | none |
| Sponsor tracks / demo | Large public repos list their circuits on the first try |
| Cost | none |

## 6. Risks and rollback
A researcher could miss a warning. Warnings print after the list with file:line:column. Rollback: drop the collector argument.

## 7. Decision
- Decided by: user · Date: 2026-10-10 ~22:15 EDT · Outcome: approved ("Yes I approve those changes", after the lead described this change) · Notes: —
- Applied to specs in: uncommitted on `lead/post-mvp`, 2026-10-11 · CHANGELOG line added: yes
