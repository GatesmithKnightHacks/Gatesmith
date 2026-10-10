# CP-0016: Allow vLLM setup in GPU session S1 despite R2.2 (tier order)

- **Status:** approved (spec text to apply)
- **Class:** A (MVP scope/tier rule)
- **Author:** lead (from Codex review F-32) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T17 · **Blocks:** T17's vLLM step (tonight)
- **Decision needed by:** before GPU session S1 (tonight)

## 1. Summary
R2.2: no Tier 1 work while a Tier 0 gate is failing. vLLM serving is Tier 1 (`01` §3), but T17 (Tier 0, P1, before G1) requires "vLLM serving the 8B model" in S1. As written, S1 cannot do what T17 asks.

## 2. Proposed change
### 2.1 Spec text (exact)
`00` R2.2 add: "Exception: GPU session S1 may install and smoke-test vLLM (`13` §3.3, ≤ 60 min timebox) because the machine is only available in scheduled sessions; no Tier 1 **code** is written in the repo before G3."
(Alternative the user may pick instead: move the vLLM step from T17/S1 to S2 and drop "vLLM answers" from T17's acceptance.)

### 2.2 Implementation sketch
None (process rule).

## 3. Justification
`01` §3 Tier 1 includes "at least one model layer (`local` vLLM …)"; `15` §3 T17 acceptance "vLLM answers"; `13` §2 S1 "vLLM serving the 8B model"; `00` R2.2.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Exception for S1 (recommended) | Uses scarce GPU time; de-risks FB-02 early | Spends ≤ 60 min of S1 on Tier 1 | — |
| Move vLLM to S2 | Strict tier order | S2 is busy with G3; FB-02 discovered late | Risk |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | Rule exception only |
| Gates and timeline | none (as planned in `13`) |
| Contracts / stored data | none |
| Other specs | `00` R2.2 (or `15` T17 + `13` §2 if moved) |
| Modules | none |
| Tests and golden values | none |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | AMD track tokens/s measured early |
| Cost | ≤ 1 h of credits in S1 |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
