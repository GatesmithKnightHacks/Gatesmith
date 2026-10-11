# ChP-0045: Define relative constraints at a zero baseline

- **Status:** approved
- **Class:** A (verification acceptance rule)
- **Author:** Codex · **Date:** 2026-10-11
- **Related tasks:** T23 · **Blocks:** zero-baseline acceptance only
- **Decision needed by:** before integrating T23 acceptance

## 1. Summary

ChP-0041 permits reliability zero for faulty operations. Express relative constraints as
multiplicative inequalities rather than dividing by the baseline, so zero is defined without
inventing an epsilon or relaxing correctness verification.

## 2. Proposed change

### 2.1 Exact spec text

08 §4 currently says:
> Every constraint holds (`max_vs_baseline`, `min_vs_baseline`, `max`, `min`), including the
> `reliability` invariant (the fidelity floor): not below the baseline's reliability heuristic,
> nor below its simulated task score when one exists.

Append:
> For finite nonnegative baseline B, candidate C and relative factor f, evaluate
> `max_vs_baseline: f` as `C <= f*B`, and `min_vs_baseline: f` as `C >= f*B`.
> At B=0, the upper constraint requires C<=0; the lower constraint requires C>=0.
> Report B, C, f and the resulting bound as evidence. Do not compute C/B, insert an epsilon,
> or infer a passed comparison from an unavailable/failed metric. The reliability invariant
> uses the same lower-bound rule. All other acceptance requirements, including exact
> verification and strict primary improvement, remain mandatory. Ratios for negative
> baselines are unsupported pending a metric-specific rule; do not reverse an inequality
> implicitly.

04 constraint descriptions and 10 acceptance references link to this rule.

### 2.2 Implementation sketch

T23 acceptance helper validates finite values, then multiplies the baseline by the factor.
Tests cover zero reliability with zero/positive candidate, zero upper-bound constraint,
positive baseline equivalence, missing values and unchanged strict-primary rules.
No changes to metric calculation, no score-version bump, no golden values.

## 3. Justification

06 §2.2 and approved ChP-0041 define reliability exactly zero for faulty operations. The
built-in objective in `manifest/resolve.py` includes `reliability_heuristic min_vs_baseline: 1.0`.
08 §4 does not define the relative comparison at zero. Division yields undefined 0/0 or
infinity. The displayed multiplicative rule directly implements the existing fidelity-floor
wording and has no zero denominator.

## 4. Alternatives considered

| Option | Benefit | Why not selected |
|---|---|---|
| Reject every zero baseline | Simple | Prevents improving a circuit that uses faulty hardware |
| Add epsilon | Numeric quotient | Invents an unapproved tolerance and hides the zero case |
| Multiplicative bounds | Direct, finite comparison | Selected; still needs explicit acceptance-rule approval |

## 5. Impact analysis

| Area | Impact |
|---|---|
| MVP / gates | None for scoring; unblocks this T23 acceptance case |
| Timeline | Small helper and targeted tests after approval; other T23 blockers remain separate |
| Contracts / stored data | No schema change; evidence records values and bound |
| Other specs | 08 §4; 04 constraint descriptions; 10 acceptance cross-reference |
| Modules | T23 acceptance comparison helper only |
| Tests / golden values | New zero-bound cases; no golden changes or weakened assertions |
| Score version | None, metric definitions unchanged |
| Fallback registry | None |
| Architecture | None |
| Sponsor/demo | Candidate improvements from faulty calibration baselines can be evaluated explicitly |
| Cost | No GPU, HF or cloud cost |

## 6. Risks and rollback

A zero lower reliability bound admits any nonnegative reliability, but exact equivalence,
other constraints and strict primary improvement still apply. This is not a safety or quality
certificate. Until approved, keep the zero-baseline case explicitly unsupported.

## 7. Decision

Approved by user, 2026-10-11 ("Yes I approve", referring to ChP-0039 and ChP-0045). Base specs remain read-only. The pure comparison helper is implemented in `improve/loop.py`, the acceptance-decision location already required by 03 and 10 (the earlier T23 label conflated verification with acceptance). 28 targeted cases pass. It does not accept attempts or integrate the paused T23 verifier; orchestration belongs to T24. Independent review remains outstanding.
