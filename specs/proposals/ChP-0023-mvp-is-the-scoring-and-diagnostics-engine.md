# ChP-0023: The MVP is the scoring and diagnostics engine — a circuit in, diagnostics and scores out

- **Status:** approved
- **Class:** A (MVP scope)
- **Author:** lead · **Date:** 2026-10-10 06:35 UTC
- **Related tasks:** all · **Blocks:** nothing
- **Decision needed by:** — (decided)

## 1. Summary
The user redefines the MVP: **qscore takes a simple circuit (a repo with builder functions is preferred but not required), runs diagnostics on it, and returns the scores.** Everything else in the specs is part of the final product, built after the MVP. This supersedes the tier split of `01-mvp.md` §3–§6 and makes ChP-0022's slice the MVP's core.

## 2. Change
### 2.1 MVP (new definition)
| Part | In the MVP | Spec |
|---|---|---|
| Input | One OpenQASM 2/3 file with no manifest (`qscore score PATH.qasm [--target NAME]`, the manual-upload defaults of `04` §2.2), or a `qscore.yaml` manifest of QASM items | 04 §2, 05 §4.1 |
| Input (preferred) | A repo with Qiskit builder functions via the sandbox (process mode) | 05 §1–4 |
| Validation | Schema/reference checks with issue codes for what the MVP inputs can get wrong; fail loudly | 05 §3–4 |
| Compile | Targets (FakeTorino, line/grid/heavy-hex, custom), seeded level-3 compiles, all-to-all reference, route-only | 05 §6 |
| Scores | Every CPU metric of `06` §2.1–2.4 except `simulated_task_score` and `mirror_score` | 06 |
| Diagnostics | D01–D09 with thresholds, severity, profiles, regions, suppression | 07 |
| Output | Scorecard JSON (`qscore.scorecard/v0.2`) + Markdown report; exit codes | 04 §3, 05 §11 |
| Quality | Golden values, contract tests, e2e on both examples and on a single QASM file | 14 |

### 2.2 Final product (after the MVP; specs unchanged)
Simulation metrics and D10, GPU/W7900 work, profiler and bench, improvement requests and the verifier, the improvement loop and layers, Neon/Hub records and the worker, UI, platform, Space, assistant.

### 2.3 Spec text
- `01-mvp.md`: new §0 "The MVP (ChP-0023)" stating the definition above; §3 tiers renamed: "MVP" = §2.1, "Final product" = previous Tier 0 remainder + Tiers 1–2; gates: **G-MVP** (both examples and a single QASM file score end to end on the CPU; golden and contract tests pass; reviewed) precedes G1–G5, which become final-product gates.
- `15-build-plan.md` §3a: the slice is the MVP's core; MVP tasks M1–M4 follow it.
- Handoff % and ETA count the MVP (G-MVP) first and the final product second.

## 3. Justification
User instruction (2026-10-10): "the diagnostic and scoring engine are the MVP … The MVP should take a simple circuit (not necessary to have a repo, but preferred) and do diagnostics on that circuit, and then return the scores … everything else is extra and a part of the final product."

## 4. Alternatives considered
Keep the 36 h tiering — rejected by the user.

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | MVP narrowed to the engine; nothing deleted from the specs |
| Gates and timeline | New G-MVP first; G1–G5 later |
| Contracts | unchanged; new CLI form `qscore score PATH.qasm` |
| Other specs | 01, 15 (and the handoff template's % method) |
| Modules | none new; order changes |
| Tests | e2e on a single QASM file added |
| Score version | none |
| Fallback registry | none |
| Architecture | unchanged for the final product |
| Sponsor tracks / demo | sponsor-track work moves after the MVP |
| Cost | GPU credits not needed for the MVP |

## 6. Risks and rollback
Sponsor-track deadlines (AMD, HF, Neon, Vultr) still need final-product work within the hackathon; schedule it right after G-MVP.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved
- Applied to specs in: 2026-10-10 (01 §0, 15 §3a) · CHANGELOG line added: yes
