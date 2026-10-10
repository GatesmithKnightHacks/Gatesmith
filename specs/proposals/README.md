# Change proposals

Every deviation from the specs is written here first (rule R5 in `../00-operating-rules.md`).

- File name: `CP-<NNNN>-<slug>.md` (four digits, next free number), from `../templates/change-proposal.md`.
- Class A needs the user's approval before implementation; class B can be approved by the lead and is listed in `progress.md` → *Decisions made by the lead*.
- Status lifecycle: `proposed` → `approved` | `rejected` | `superseded by CP-…`. Approved proposals are applied to the specs and logged in `../CHANGELOG.md`.

## Index

| CP | Title | Class | Status | Date |
|---|---|---|---|---|
| [CP-0001](CP-0001-verification-ladder-correctness.md) | Verification ladder correctness (GPU tolerance, global phase, QCEC mapping and timeout, mutation test) | A | approved | 2026-10-10 |
| [CP-0002](CP-0002-request-proposal-contracts.md) | Request/proposal contracts — layout transport, whole-circuit strategies, strategy id, privacy context | A | approved | 2026-10-10 |
| [CP-0003](CP-0003-reversible-io-declaration.md) | Declare data/ancilla qubits for `reversible_function` items | A | approved | 2026-10-10 |
| [CP-0004](CP-0004-attempt-records-and-missing-schemas.md) | Attempt/layer-call records, request identity, proposal budgets, and the three undefined schemas | A | approved | 2026-10-10 |
| [CP-0005](CP-0005-neon-functions-grants-and-capability-matching.md) | Neon queue functions as SECURITY DEFINER, complete grants, and `requires` matching | A | approved | 2026-10-10 |
| [CP-0006](CP-0006-job-artifact-transport.md) | How a queued job's input files reach the worker (artifact bundle) and the platform's Hub token | A | approved | 2026-10-10 |
| [CP-0007](CP-0007-metric-definition-fixes.md) | Metric definition fixes (expectation score range, estimator shots, simulation seeds, zero cases, objective-capable metrics) | A | approved | 2026-10-10 |
| [CP-0008](CP-0008-diagnostic-severity-per-rule.md) | Severity function for every diagnostic rule (D03, D05, D09, D10 expectation) | A | approved | 2026-10-10 |
| [CP-0009](CP-0009-calibration-file-and-assumed-defaults.md) | Calibration file schema and the exact "assumed" default errors for custom targets | A | approved | 2026-10-10 |
| [CP-0010](CP-0010-disabled-fallback-failure-mapping.md) | One failure outcome per trigger when a fallback is disabled | A | approved | 2026-10-10 |
| [CP-0011](CP-0011-importlinter-sibling-separator.md) | `.importlinter` — use `:` (not `\|`) for siblings that may import each other | A | approved | 2026-10-10 |
| [CP-0012](CP-0012-plan-timing-and-method-crossover.md) | When the plan is final (pre- vs post-compile) and per-method crossover | A | approved | 2026-10-10 |
| [CP-0013](CP-0013-region-mapping-logical-to-compiled.md) | Mapping regions between logical and compiled circuits (qubits via layout; gates via re-detection) | A | approved | 2026-10-10 |
| [CP-0014](CP-0014-manifest-merge-semantics.md) | Merge semantics for defaults → profile → item | A | approved | 2026-10-10 |
| [CP-0015](CP-0015-pin-example-generators.md) | Pin the example generators exactly (QAOA energies/encoding, S-box MMD variant) | A | approved | 2026-10-10 |
| [CP-0016](CP-0016-s1-vllm-tier-exception.md) | Allow vLLM setup in GPU session S1 despite R2.2 (tier order) | A | approved | 2026-10-10 |
| [CP-0017](CP-0017-api-surface-and-exit-code-precedence.md) | Platform API surface alignment and CLI exit-code precedence | A | approved | 2026-10-10 |
| [CP-0018](CP-0018-spec-consistency-fixes.md) | Spec consistency fixes (no behaviour change) | B | approved | 2026-10-10 |
| [CP-0019](CP-0019-workspace-tooling-fixes.md) | Workspace tooling fixes (hooks, handoff archive names, proposal index, auditor, report schema) | B | approved | 2026-10-10 |
| [CP-0020](CP-0020-gatesmith-repo-layout.md) | Repo = team repo `Gatesmith/` (engine in `qscore/`, specs committed); workspace root = `KnightHacks26/` | A | approved | 2026-10-10 |
| [CP-0021](CP-0021-config-defaults-and-missing-contracts.md) | Settings semantics, built-in manifest defaults, CI Python matrix, and two missing contracts | A | approved | 2026-10-10 |
| [CP-0022](CP-0022-fast-track-cpu-scoring-slice.md) | Fast-track CPU scoring slice (downscoped build order) | A | approved | 2026-10-10 |
| [CP-0023](CP-0023-mvp-is-the-scoring-and-diagnostics-engine.md) | The MVP is the scoring and diagnostics engine — a circuit in, diagnostics and scores out | A | approved | 2026-10-10 |
