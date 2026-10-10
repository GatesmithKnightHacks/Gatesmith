# ChP-0024: `qscore score -` scores pasted OpenQASM from stdin

- **Status:** approved (user, 2026-10-10) — applied (code + 05 §11 text, 2026-10-10)
- **Class:** A (new CLI form; reclassified after the slice audit)
- **Author:** lead · **Date:** 2026-10-10 14:50 UTC
- **Related tasks:** M1 (single-file mode) · **Blocks:** nothing
- **Decision needed by:** — (user may veto)

## 1. Summary
The user's MVP bar: paste a rudimentary circuit (seconds for an LLM, ~2 minutes for a person) and get diagnostics. Single-file mode needs a file on disk; this adds `-` as the PATH, reading OpenQASM 2/3 from stdin.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/05-pipeline.md` §11, row `qscore score`
- After (Notes column): "Full run; asks to confirm unless `--yes`. `PATH` may be a single OpenQASM file, or `-` to read pasted OpenQASM from stdin (requires `--yes`; the text is saved as `<out>/input/pasted.qasm`, item id `pasted`, and the report is printed to stdout)."

### 2.2 Implementation sketch
`services.score_qasm_text(text, out_dir, target)` writes the input file, then calls `score_circuit`. Empty input → `InvalidInput` (exit 2). The CLI refuses `-` without `--yes` (exit 2) because stdin cannot both carry the circuit and answer the confirmation prompt (05 §5: nothing runs before confirmation).

Also fixed in the same change: `score_circuit --target <synthetic>` set only `backend`, so the built-in default `calibration: from_backend` reached `line-N`/`grid`/`heavy-hex` targets and every metric failed (exit 3). The override now sets `calibration` explicitly (`from_backend` for FakeTorino, `none` otherwise, per 05 §6.1).

## 3. Justification
User request 2026-10-10. Tested: `tests/e2e/test_score.py` (paste prints report, needs `--yes`, empty/bad QASM → exit 2, line-5 target → exit 0).

## 4. Alternatives considered
| Option | Why not chosen |
|---|---|
| Interactive prompt after reading stdin (re-open `/dev/tty`) | Not portable (CI, pipes); fragile |
| Accept pasted Qiskit Python | Runs user code → needs the builder sandbox (M3, R10) |

## 5. Impact analysis
Contracts, metrics, thresholds, score version, fallbacks: none. CLI parity: the UI's Project tab already accepts QASM uploads (12 §1.2).

## 6. Risks and rollback
Remove the `-` branch in `cli.py` and `score_qasm_text`.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I accept the changes"
