# ChP-0051: Honest provenance for initial HF prompt examples

- Status: approved by integration coordinator; Class B; Date:2026-10-11
- Related: spec10 §6, T25. No change to engine acceptance or verification.

## Exact change

Before: two verified few-shot rewrites come from reference-qiskit outputs.
After: initial two prompt examples are authored algebra identities (H H cancellation and CX CX cancellation), independently verified with exact Qiskit Operator equivalence in test_prompts.py. Label their origin explicitly. Replace with reference-qiskit provenance only when that proposer exists and measured artifacts support it.

## Evidence and justification

The reference-qiskit module is absent on approved baseline6b42f72. Both identities have offline exact-Operator tests. Claiming reference provenance would be false. The fixed examples teach the same schema and regional preservation rules.

## Impact

Prompt fixture provenance only. No new dependencies, contracts, score version, thresholds, acceptance rules, golden values, MVP scope or architecture changes. Prompt version remains initial p-2026.1. No fallback. Test failures propagate.

## Decision

Coordinator approves this internal fixture/provenance correction. No external verified candidate or accepted improvement is inferred from these tests.
