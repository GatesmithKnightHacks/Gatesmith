# CP-0027: Declare `openqasm3` so OpenQASM 3 syntax errors become Q304

- **Status:** accepted
- **Class:** A  (dependency change, 00-operating-rules.md R5)
- **Author:** lead · **Date:** 2026-10-10 16:20 UTC
- **Related tasks:** M1 · **Blocks:** nothing (M1 fixtures pass; this closes a gap)
- **Decision needed by:** G-MVP (a pasted QASM3 file with a typo is a likely demo input)

## 1. Summary
A *syntax* error in an OpenQASM 3 file currently exits 3 ("unexpected error (a bug)") instead of 2 with Q304, because `qiskit.qasm3.loads` lets `openqasm3.parser.QASM3ParsingError` escape. Catching it needs `from openqasm3.parser import QASM3ParsingError`. The package is already installed and locked (`uv.lock`: openqasm3 1.0.1, pulled in by `qiskit-qasm3-import`), but it is not declared in `pyproject.toml`.

## 2. Proposed change
### 2.1 Spec text (exact)
- File/section: `specs/03-code-structure.md` dependency list (wherever `qiskit-qasm3-import` is listed)
- After: add `openqasm3>=1.0` next to `qiskit-qasm3-import` ("imported directly for its parse error, 05 §4.1").

### 2.2 Implementation sketch
- `pyproject.toml`: add `"openqasm3>=1.0"`; `uv lock` (the lock does not change version).
- `intake/loaders.py::parse_qasm`: add `QASM3ParsingError` to the caught tuple, giving `QasmProblem("Q304", …)` with no line (the exception carries no position or message; ANTLR prints `line L:C …` to stderr).
- `examples/broken/`: no new folder (the Q304 fixture stays QASM2); add a unit test for a QASM3 syntax error → Q304.

## 3. Justification (evidence)
`qiskit.qasm3.loads` wraps only `qiskit_qasm3_import.ConversionError` (installed source: `qiskit/qasm3/__init__.py`, `loads`). Probe: `qasm3.loads('OPENQASM 3.0;\nqubit[2] q;\nh q[0]\n')` raises `openqasm3.parser.QASM3ParsingError` with empty `args`; MRO has no Qiskit class, so no Qiskit exception can catch it. A broad `except` is forbidden (R3).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is | no change | QASM3 typo → exit 3 "bug", violates 05 §4.1 (Q304) | spec violation |
| Use the transitive import undeclared | no pyproject change | hidden dependency; breaks if qiskit-qasm3-import drops it | dishonest dependency list |
| Pre-parse with our own grammar | none | large effort | out of scope |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (fixes M1 behaviour) |
| Gates and timeline (hours) | ~0.2 h |
| Contracts / schemas / stored data | none |
| Other specs and sections that must change | 03 dependency list |
| Modules and public functions | `intake/loaders.py` only |
| Tests and golden values | +1 unit test; golden none |
| Score version | none |
| Fallback registry | none |
| Overall architecture | none |
| Sponsor tracks / demo | better error on pasted QASM3 |
| Cost | none (already in the lock) |

## 6. Risks and rollback
Low. Roll back by removing the line from `pyproject.toml` and the caught class.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: accepted · Notes: applied to `pyproject.toml`, `intake/loaders.py`, `tests/unit/intake/test_loaders.py`; spec text added to 05 §4.1 (03 has no dependency list).
