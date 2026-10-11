# ChP-0036: `qscore score PATH` accepts a manifest or a project directory

- **Status:** approved (spec text to be applied with implementation)
- **Class:** A (CLI surface)
- **Author:** lead · **Date:** 2026-10-10
- **Related tasks:** S5 (CLI), ChP-0035 · **Blocks:** nothing
- **Decision needed by:** with ChP-0035 (its `--score` step and the docs print the score command)

## 1. Summary
`qscore score qscore.yaml` is the natural thing to type after drafting, but today `PATH` means
"an OpenQASM file", so the manifest is parsed as QASM and the researcher is told
`Q304 … no 'OPENQASM <version>;' header`, which points them the wrong way. Make `PATH` dispatch
on what it names, with no guessing from file contents.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/05-pipeline.md` §11, `qscore score` row
- Before:
  > Full run; asks to confirm unless `--yes`. `PATH` may be a single OpenQASM file, or `-` to read pasted OpenQASM from stdin (…)
- After:
  > Full run; asks to confirm unless `--yes`. `PATH` is one of: a manifest (`*.yaml` / `*.yml`;
  > same as `--manifest PATH`), a directory (its `qscore.yaml`; missing → Q200 naming that
  > file), a single OpenQASM file (any other file), or `-` to read pasted OpenQASM from stdin
  > (…unchanged…). `PATH` and `--manifest` together → exit 2. `--target` with a manifest → exit 2
  > (as today). The interpretation summary names the mode used ("manifest qscore.yaml" or
  > "single file x.qasm"). (ChP-0036)

### 2.2 Implementation sketch
`cli.score`: resolve `PATH` → (`manifest` | `qasm` | `stdin`) with the rule above before calling
the existing services (`score_project` / `score_circuit` / `score_qasm_text`). No service change.
Tests: `score qscore.yaml`, `score <dir>`, `score <dir-without-manifest>` → Q200, `score x.qasm`
unchanged, `score a.yaml --manifest b.yaml` → exit 2, `score m.yaml --target X` → exit 2.

## 3. Justification (evidence, not opinion)
Reproduced 2026-10-10 on a freshly drafted repo: `qscore score <dir>/qscore.yaml --yes` →
`Q304 qscore.yaml:None:None — qscore.yaml: no 'OPENQASM <version>;' header`; and
`qscore score <dir>` → `Q200 … QASM file not found`. Both mislead a researcher who just ran
`qscore discover --draft`. Extension-based dispatch is explicit and documented; a `.yaml` that is
not a project manifest still fails schema validation with its own located issues.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec | None to build | Misleading error on the most natural command | — |
| Keep PATH = QASM, add a hint ("use --manifest") | Smaller | Still an extra round trip for the researcher | Accepting is as explicit and saves a step |
| Sniff file contents | Works for odd extensions | Implicit; harder to explain | Extension rule is predictable |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (CLI convenience) |
| Gates and timeline (hours) | ~0.5 h incl. tests |
| Contracts / schemas / stored data (Neon, Hub) | none |
| Other specs and sections that must change | 05 §11 row; README usage |
| Modules and public functions | `cli.py` only |
| Tests and golden values | new CLI tests; golden values none |
| Score version (metrics/thresholds) | none |
| Fallback registry | none |
| Overall architecture (hosts, data flow, security) | none |
| Sponsor tracks / demo | smoother repo-link demo |
| Cost (GPU credits, HF credits, time) | none |

## 6. Risks and rollback
A QASM file saved with a `.yaml` extension would be read as a manifest and fail schema
validation loudly; rename or use the QASM extension. Rollback: restore QASM-only PATH.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved ("I approve proposal 36")
- Applied to specs in: not applied · CHANGELOG line added: no
