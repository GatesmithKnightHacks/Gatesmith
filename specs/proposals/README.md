# Change proposals

Every deviation from the specs is written here first (rule R5 in `../00-operating-rules.md`).

- File name: `ChP-<NNNN>-<slug>.md` (four digits, next free number), from `../templates/change-proposal.md`.
- Class A needs the user's approval before implementation; class B can be approved by the lead and is listed in `progress.md` → *Decisions made by the lead*.
- Status lifecycle: `proposed` → `approved` | `rejected` | `superseded by ChP-…`. Approved proposals are applied to the specs and logged in `../CHANGELOG.md`.

## Index

| ChP | Title | Class | Status | Date |
|---|---|---|---|---|
| [ChP-0040](ChP-0040-github-review-bot.md) | qscore review bot: Gemini-powered GitHub App reviewing quantum-circuit PRs from CI-produced qscore results (teammate-owned) | A | proposed | 2026-10-11 |
| [ChP-0037](ChP-0037-scripts-notebooks-packages.md) | Scripts, notebooks and packages as builders (line mode, package import, removed-API hints) | A | approved, applied | 2026-10-10 |
| [ChP-0036](ChP-0036-score-path-accepts-manifest.md) | `qscore score PATH` accepts a manifest or a project directory | A | approved, applied | 2026-10-10 |
| [ChP-0035](ChP-0035-repository-link-intake.md) | Repository link → discover → pick → score in one flow | A | approved, applied | 2026-10-10 |
| [ChP-0034](ChP-0034-export-compiled-circuit-qasm.md) | Export each item's final compiled circuit as OpenQASM 3 | A | approved, applied | 2026-10-10 |
| [ChP-0033](ChP-0033-t09-drafting-clarifications.md) | T09 drafting decisions and intake helper signatures | B | approved; applied | 2026-10-10 |
| [ChP-0032](ChP-0032-w7900-rocm-tuning-and-evidence.md) | W7900 ROCm tuning, measured memory planning and AMD evidence report | A | approved; application deferred behind researcher intake | 2026-10-10 |
| [ChP-0001](ChP-0001-verification-ladder-correctness.md) | Verification ladder correctness (GPU tolerance, global phase, QCEC mapping and timeout, mutation test) | A | approved | 2026-10-10 |
| [ChP-0002](ChP-0002-request-proposal-contracts.md) | Request/proposal contracts — layout transport, whole-circuit strategies, strategy id, privacy context | A | approved | 2026-10-10 |
| [ChP-0003](ChP-0003-reversible-io-declaration.md) | Declare data/ancilla qubits for `reversible_function` items | A | approved | 2026-10-10 |
| [ChP-0004](ChP-0004-attempt-records-and-missing-schemas.md) | Attempt/layer-call records, request identity, proposal budgets, and the three undefined schemas | A | approved | 2026-10-10 |
| [ChP-0005](ChP-0005-neon-functions-grants-and-capability-matching.md) | Neon queue functions as SECURITY DEFINER, complete grants, and `requires` matching | A | approved | 2026-10-10 |
| [ChP-0006](ChP-0006-job-artifact-transport.md) | How a queued job's input files reach the worker (artifact bundle) and the platform's Hub token | A | approved | 2026-10-10 |
| [ChP-0007](ChP-0007-metric-definition-fixes.md) | Metric definition fixes (expectation score range, estimator shots, simulation seeds, zero cases, objective-capable metrics) | A | approved | 2026-10-10 |
| [ChP-0008](ChP-0008-diagnostic-severity-per-rule.md) | Severity function for every diagnostic rule (D03, D05, D09, D10 expectation) | A | approved | 2026-10-10 |
| [ChP-0009](ChP-0009-calibration-file-and-assumed-defaults.md) | Calibration file schema and the exact "assumed" default errors for custom targets | A | approved | 2026-10-10 |
| [ChP-0010](ChP-0010-disabled-fallback-failure-mapping.md) | One failure outcome per trigger when a fallback is disabled | A | approved | 2026-10-10 |
| [ChP-0011](ChP-0011-importlinter-sibling-separator.md) | `.importlinter` — use `:` (not `\|`) for siblings that may import each other | A | approved | 2026-10-10 |
| [ChP-0012](ChP-0012-plan-timing-and-method-crossover.md) | When the plan is final (pre- vs post-compile) and per-method crossover | A | approved | 2026-10-10 |
| [ChP-0013](ChP-0013-region-mapping-logical-to-compiled.md) | Mapping regions between logical and compiled circuits (qubits via layout; gates via re-detection) | A | approved | 2026-10-10 |
| [ChP-0014](ChP-0014-manifest-merge-semantics.md) | Merge semantics for defaults → profile → item | A | approved | 2026-10-10 |
| [ChP-0015](ChP-0015-pin-example-generators.md) | Pin the example generators exactly (QAOA energies/encoding, S-box MMD variant) | A | approved | 2026-10-10 |
| [ChP-0016](ChP-0016-s1-vllm-tier-exception.md) | Allow vLLM setup in GPU session S1 despite R2.2 (tier order) | A | approved | 2026-10-10 |
| [ChP-0017](ChP-0017-api-surface-and-exit-code-precedence.md) | Platform API surface alignment and CLI exit-code precedence | A | approved | 2026-10-10 |
| [ChP-0018](ChP-0018-spec-consistency-fixes.md) | Spec consistency fixes (no behaviour change) | B | approved | 2026-10-10 |
| [ChP-0019](ChP-0019-workspace-tooling-fixes.md) | Workspace tooling fixes (hooks, handoff archive names, proposal index, auditor, report schema) | B | approved | 2026-10-10 |
| [ChP-0020](ChP-0020-gatesmith-repo-layout.md) | Repo = team repo `Gatesmith/` (engine in `qscore/`, specs committed); workspace root = `KnightHacks26/` | A | approved | 2026-10-10 |
| [ChP-0021](ChP-0021-config-defaults-and-missing-contracts.md) | Settings semantics, built-in manifest defaults, CI Python matrix, and two missing contracts | A | approved | 2026-10-10 |
| [ChP-0022](ChP-0022-fast-track-cpu-scoring-slice.md) | Fast-track CPU scoring slice (downscoped build order) | A | approved | 2026-10-10 |
| [ChP-0023](ChP-0023-mvp-is-the-scoring-and-diagnostics-engine.md) | The MVP is the scoring and diagnostics engine — a circuit in, diagnostics and scores out | A | approved | 2026-10-10 |
| [ChP-0028](ChP-0028-run-record-and-mvp-spec-gaps.md) | Run record `run.json` (+ per-card `x-run`), budget reason, nullable representative, and MVP spec gaps (custom calibration, all-to-all basis, Q207 extras, calibration in item hash, target one-of merge, Q208) | A | approved | 2026-10-10 |
| [ChP-0029](ChP-0029-draft-values-picking-and-notebook-listing.md) | Deterministic manifest drafting: picking, values/ranges, values file, call-site suggestions, notebook listing | A | approved | 2026-10-10 |
