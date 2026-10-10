# CP-0021: Settings semantics, built-in manifest defaults, CI Python matrix, and two missing contracts

- **Status:** approved (spec text to apply)
- **Class:** A (configuration surface, fallback switching, contracts)
- **Author:** lead (from the spec-auditor's T00 review + T01 modelling) · **Date:** 2026-10-10 05:45 UTC
- **Related tasks:** T00, T01, T07, T10, T22 · **Blocks:** nothing now (T00/T01 implement the current text as noted); T07 needs item 5, T10 needs item 6
- **Decision needed by:** before T07

## 1. Summary
Twelve spec gaps found while building T00/T01 (items 7–12 from the spec-auditor's T01 review); each has a current implementation choice that follows the strictest reading, which this proposal asks you to confirm or change.

## 2. Proposed change (spec text)
| # | Where | Problem | Proposed text | Current implementation |
|---|---|---|---|---|
| 1 | `03` §3.1 `config.py`, `00` R3.2, `17` §1 | "`dev`/`ci` force empty" could mean silently dropping `QSCORE_FALLBACKS`; default profile is `dev`, so `QSCORE_FALLBACKS` alone never works | "In `dev`/`ci`, a non-empty `QSCORE_FALLBACKS` is a `ConfigError`. Explicit fallbacks need `QSCORE_PROFILE=demo`; `demo` may add **planned** entries explicitly and enables **approved+on** entries automatically." | as proposed |
| 2 | `17` §2 FB-01/02/03 | Dedicated switches (`sim.gpu_backend`, `llm.local.server`, `records.neon_transport`) vs `QSCORE_FALLBACKS` — which one enables? | "A dedicated switch takes effect only if its FB id is also enabled; FB-01/FB-02 cannot be enabled until the user approves them (status `approved`)." | `neon_transport` accepts only `postgres`; FB-01/02 switches not built |
| 3 | `14` §4 vs `03` §5 | CI pins 3.12, engine minimum is 3.11 | "CI matrix `[\"3.11\", \"3.12\"]`" | as proposed |
| 4 | `03` §3.1 `cache_dir` | No default; cwd-relative breaks "cached per machine" (`09` §5) | "`cache_dir` default `~/.qscore` (override `QSCORE_CACHE_DIR`); run outputs stay project-relative (`11` §6)" | cwd-relative `.qscore` (change if approved) |
| 5 | `04` §2 | Built-in defaults for an omitted `defaults:` block (and the manual-upload case) are never stated; "values in examples are illustrative" | "Built-in defaults = the §2 example's `defaults` block exactly (FakeTorino/from_backend, two_qubit_count with the two constraints, exact+reject, auto, single/double, the 8 seeds, 1234, 4000, the budget, all four groups, privacy off/region-only); shown as '(default)'." | models leave omitted blocks `None`; resolution (T07) applies built-ins |
| 6 | `03` §3.2 `ItemSummary` | Required model with no contract (also not in CP-0004) | Define from `05` §5: `{item_id, source, qubits, gate_counts, parameters, measurements, intent_sentence, permitted, target, planned_compute, not_checked[], defaults_used[]}` | not defined (T10) |
| 7 | `04` §2.1, `08` §2 | The non-`ignore` value of `global_phase` is never named | "`global_phase: ignore \| exact`" | `ignore`/`exact` |
| 8 | `04` §9 Plan | Container field names not given | "`Plan {schema, items: [ItemPlan {item_id, metrics: [MetricPlan], totals {est_bytes, est_seconds}}], memory_mode, hardware_profile_id}`" | as proposed |
| 9 | `04` §11 profile/bench | No types/nullability/units (`crossover_qubits` int?, `options_supported` bools?, `crossover` shape, bench `provenance`) | "qubit counts int; option flags bool or null (= not probed); bench `provenance` is the `Provenance` model; `crossover` = `{single, double}` qubits" | numbers as float/null; `provenance: Provenance`; `crossover` free dict |
| 10 | `04` §2.2 | Unknown `permitted.changes` value: Q103 (invalid value) or Q409 (no serving strategy)? | "Unknown value → Q103; known value with no serving strategy → Q409" | pydantic `literal_error` → mapped to Q103 by T08 |
| 11 | `04` §1/§12 | `check_compatible` accepts older minors, but models accept only the current id | "Readers call `check_compatible`, then `migrate`, then validate; any other id → Q106" | as proposed (`QDocument` raises Q106) |
| 12 | `04` (several) | Constraints derived, not stated: rule ids `^D\d{2}$` (07 §1), counts/times ≥ 0, `shots` > 0, `ancillas.add` ≥ 0, `max_proposals` ≥ 1, `qubit_map` str→int, QASM format `openqasm2` also allowed (10 §9) | "confirm these derived constraints" (any you reject are removed) | kept; unstated ones removed (`circuits` non-empty, `Suppression.reason` non-empty, optional `claims`/`rationale`) |

## 3. Justification
spec-auditor T00 review (spec issues 1–4); T01 modelling (`04` §2 "Values in examples are illustrative"; `03` §3.2 lists `ItemSummary` in `schemas/run.py`).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep spec text | — | Two readings each; delegates would diverge | R1 |
| Silently drop `QSCORE_FALLBACKS` in dev/ci | Matches "force" literally | Silent (R3/R4) | Loud is safer |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none |
| Contracts / stored data | `ItemSummary` added (pre-freeze); built-in defaults affect `item_sha256` of manifests that omit `defaults` |
| Other specs | `03` §3.1/§3.2, `04` §2, `14` §4, `17` §1–2 |
| Modules | `config.py`, `manifest/resolve.py`, `schemas/run.py`, CI |
| Tests and golden values | settings tests; no golden values |
| Score version | none |
| Fallback registry | wording of switch semantics only |
| Architecture | none |
| Sponsor tracks / demo | none |
| Cost | CI runtime ×2 (matrix) |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
