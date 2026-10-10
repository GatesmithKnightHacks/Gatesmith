# CP-0022: Fast-track CPU scoring slice (downscoped build order)

- **Status:** approved
- **Class:** A (MVP scope/order, review cadence)
- **Author:** lead · **Date:** 2026-10-10 06:10 UTC
- **Related tasks:** T02–T15 (partial) · **Blocks:** nothing (reorders work; nothing is cut permanently)
- **Decision needed by:** — (decided)

## 1. Summary
Build a thin, end-to-end **CPU scoring engine** first: `qscore score --manifest qscore.yaml` produces one `qscore.scorecard/v0.2` per item plus a Markdown report, for both examples, on the QASM path. Everything else in Tier 0/1 keeps its spec and its task, and follows after the slice.

## 2. Proposed change
### 2.1 The slice (task ids S1–S6, recorded in `15-build-plan.md` §3a)
| Id | Content | Spec sections used | Subset of |
|---|---|---|---|
| S1 | Targets: `FakeTorino`, `line-N`, `grid-RxC`, `heavy-hex-D`, all-to-all shadow; calibration id | 05 §6.1 | T11 |
| S2 | Compile: level 3 over the manifest seeds (process pool, sorted by seed), all-to-all reference, `route_only`, raw translation, representative selection | 05 §6, 06 §2.2 | T12 (no cache) |
| S3 | Metrics: resources (7), `routing_overhead`, `swaps_inserted`, `compile_ratio`, `reliability_heuristic`, `seed_spread`, `entanglement_variance`, `structure` (commuting runs only), `resynthesis_potential`; base helpers and registry | 06 §1–2 | T13 |
| S4 | Diagnose D01–D06, D08 with `thresholds.yaml`, profile `qaoa`, severity per 07 §2 (non-scalar rules → `warning`, per CP-0008's proposal), regions as qubit lists | 07 §1–2, §5 | T14 |
| S5 | Manifest load (YAML → `ProjectManifest`, defaults → item merge with `objective` atomic), QASM loading, `services.score_project`, `qscore score`, scorecard + Markdown report, provenance | 04 §2–3, 05 §4.1/§9/§11 | T07/T10/T15 |
| S6 | Examples as QASM: `sbox_oracle` (MMD generator from lab), `sidechain_qaoa` exported to QASM at the default size by a generator; golden tests (06 §4, spec-approved rows only); e2e test | 14 §3, 06 §4 | T03 |

### 2.2 Deferred (unchanged specs; built after the slice)
Builder functions and the sandbox (T09), most of the issue catalog and broken fixtures (T02/T08), interpretation/confirm flow (T10 — the slice scores with `--yes` semantics and records it), `scheduled_duration`, `supermarq_profile`, `scalability`, Clifford/linear block detection, D07/D09/D10, all simulation and GPU work (T17–T21), Neon/Hub/worker (T05/T22), verifier and loop (T23–T24), UI/platform/Space (T25–T30), compile cache.

### 2.3 Review cadence during the slice
One `spec-auditor` pass over the whole slice at its end (instead of per task); the lead runs tests, ruff, mypy after every module. Findings are fixed before the slice is called done.

## 3. Justification
User instruction (2026-10-10): "Go ahead with the slice and downscaling." Goal: a working scoring engine within hours rather than after the full 30+ h plan.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Follow 15 §3 order | Complete per phase | No working engine for many hours | User priority |
| Builder path instead of QASM | Uses the QAOA builder directly | Needs the sandbox (R10) | Time |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none removed; order changed; G1 still needs T02/T04/T06 |
| Gates and timeline | G2 partially satisfied by the slice (CPU scorecards on both examples; broken fixtures still missing) |
| Contracts / stored data | none (T01 schemas used as is) |
| Other specs | `15` §3a added |
| Modules | targets/, compile/, metrics/, diagnose/, score/, record/, manifest/, intake/loaders, services.py, cli.py |
| Tests and golden values | spec-approved golden rows only; record+approve rows wait for the user |
| Score version | none (`qscore-2026.1`); severity of non-scalar rules follows CP-0008's proposal and is marked provisional |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | demo steps 1–2 runnable early |
| Cost | none |

## 6. Risks and rollback
Pending proposals (CP-0007/0008/0013/0014/0021) may change slice details; the slice follows the current spec text and marks provisional choices in code comments.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "Go ahead with the slice and downscaling and update necessary documentation".
- Applied to specs in: 2026-10-10 (15 §3a) · CHANGELOG line added: yes
