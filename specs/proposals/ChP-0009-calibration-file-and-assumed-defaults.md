# ChP-0009: Calibration file schema and the exact "assumed" default errors for custom targets

- **Status:** approved (spec text to apply); the assumed default errors for custom targets are **withdrawn** by ChP-0025/ChP-0028 (custom targets without a file have no calibration). The calibration file schema stands.
- **Class:** A (contract; values affect `reliability_heuristic` → score version)
- **Author:** lead (from Codex review F-23) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T01, T11 · **Blocks:** T11 (custom targets, `line-N` with calibration file)
- **Decision needed by:** before T11

## 1. Summary
`calibration: {file: path}` and "uniform default errors labelled `assumed`" are referenced but undefined: no schema, units or numbers. T11 cannot build reproducible calibration snapshots.

## 2. Proposed change
### 2.1 Spec text (exact)
`04` new §2.6 "Calibration file `qscore.calibration/v0.1`":
```json
{"schema": "qscore.calibration/v0.1",
 "gates": [{"name": "cx", "qubits": [0, 1], "error": 0.008, "duration_s": 3.0e-7}],
 "readout": [{"qubit": 0, "error": 0.015, "duration_s": 1.2e-6}],
 "qubits": [{"qubit": 0, "t1_s": 1.5e-4, "t2_s": 1.0e-4}]}
```
Errors in [0, 1); durations and T1/T2 in seconds, > 0. A gate/qubit absent from the file has no error data (counted in `ops_without_error`), never a guessed value. Invalid file → Q207-style issue (new code **Q208 Calibration file invalid**).
Assumed defaults (custom targets with no file, `05` §6.1): **1q gate error 1e-3, 2q gate error 1e-2, readout error 2e-2, no durations** (so `scheduled_duration` is `unavailable`), `calibration_assumed: true`, shown as defaults in the summary.

### 2.2 Implementation sketch
`schemas/manifest.py` (`CalibrationFile`), `targets/custom.py`, `targets/calibration.py`, catalog Q208 + broken fixture.

## 3. Justification
`04` §2 `calibration: from_backend | none | {file: path}`; `05` §6.1 custom row "uniform default errors labelled `assumed`"; `03` §3.4 `build_target(..., errors=None, durations=None)` — no format or values anywhere.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Drop calibration files and assumed defaults from the MVP | Less work | `05` §6.1 and line-N calibration path disappear | Scope change bigger than this |
| Qiskit `BackendProperties` JSON | Existing format | Deprecated in Qiskit 2.x | Avoid deprecated API |
| Defaults from FakeTorino medians | Realistic | Couples custom targets to one device | Explicit round numbers clearer |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~20 min T11 |
| Contracts / stored data | New `qscore.calibration/v0.1`; new issue code Q208 |
| Other specs | `04` §2/§2.6, `05` §6.1/§12, `03` §3.4 |
| Modules | `targets/*`, `validate/reference_checks.py`, catalog |
| Tests and golden values | Broken fixture `Q208_bad_calibration/`; no golden values |
| Score version | Part of the initial definition (same choice as ChP-0007) |
| Fallback registry | none (declared defaults, `17` §3) |
| Architecture | none |
| Sponsor tracks / demo | none (demo uses FakeTorino) |
| Cost | none |

## 6. Risks and rollback
The default numbers are arbitrary but labelled; change them only via proposal.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
