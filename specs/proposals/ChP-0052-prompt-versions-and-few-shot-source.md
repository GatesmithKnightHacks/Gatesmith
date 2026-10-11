# ChP-0052: Record prompt versions p-2026.2/p-2026.3; define the few-shot source

- **Status:** approved (user, 2026-10-11 "I approve everything, go in logical order"), applied to 10 §6 + CHANGELOG
- **Class:** B (prompt text; 10 §6 says prompt changes are class B)
- **Author:** lead · **Date:** 2026-10-11
- **Related tasks:** T25 (ChP-0049 slice)

## 1. Summary
10 §6 hard-codes `PROMPT_VERSION = "p-2026.1"`, so every prompt bump is a spec deviation. Two bumps went unrecorded until now. This proposal records them and states where the current value lives. It also names the source of the few-shot examples so it can be tested.

## 2. Change
- 10 §6: "`PROMPT_VERSION` (current value in `prompts.py`; each bump gets a CHANGELOG line); any change bumps it (class B; recorded on every attempt)."
- Versions:
  - **p-2026.2** (ChP-0049/0050 session): adds the region's gate counts (`region_counts`) and `estimate_means`, plus the "return an empty list only if…" rule.
  - **p-2026.3** (this session): two few-shot rewrites. Adds a self-check rule: every added basis change must be undone, and commutation through CX is allowed only on the matching side. If unsure, return an empty list.
- 10 §6 few-shot source: "minimal synthetic blocks whose rewrite the `reference-qiskit` layer reproduces (`synth_cnot_count_full_pmh` for linear blocks; fixed-seed level 3 for commutation cancellation). A test checks Operator equality, a strictly lower 2q count, and that the reference method reproduces the rewrite." The few-shot user payload is abbreviated: region, counts, objective and `max_candidates` only.

## 3. Justification
- Spec-auditor review (2026-10-11) flagged both bumps as unrecorded.
- Evidence for p-2026.3 is in `lab/20261011-improve-eval/NOTES.md` (p-2026.2 vs p-2026.3 runs). The documented p-2026.2 failure (DeepSeek, seed_cx_parity) added H gates to turn CX into CZ and never undid them; the self-check rule targets that error.

## 4. Impact
| Area | Impact |
|---|---|
| MVP / contracts | none (`hf-<PROMPT_VERSION>` already recorded per attempt) |
| Specs | 10 §6 (two sentences), CHANGELOG |
| Modules / tests | prompts.py; tests/unit/improve/test_prompts.py |

Also accepted here (review minor, deps): `intake/deps.declares_dependencies` treats an unreadable `pyproject.toml` as "declares dependencies". This is only a discovery hint; `qscore deps` reports the read error itself (fail loud there), so no failure is hidden.
