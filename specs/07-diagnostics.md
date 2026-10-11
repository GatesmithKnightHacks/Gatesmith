# 07 · Diagnostics: rules D01–D10, thresholds, regions, policy

> **Status:** binding; thresholds and profiles are part of the score version (class A to change) · **Tier:** 0 (D10 needs the GPU metric; D07 is on the cut list) · **Read:** before working on `diagnose/` or `improve/requests.py`.

## 1. Rules

Each rule: `Rule(id, title, group, metrics_needed, evaluate(metrics, ctx, thresholds) -> list[Finding])`. A rule whose needed metric is not `computed` produces no finding and records `diagnose.skipped_rules[{rule, reason}]` in the scorecard evidence (never a silent skip).

| Rule | Title | Fires when (starting threshold, in `thresholds.yaml`) | Evidence shown | Region | Suggested strategies |
|---|---|---|---|---|---|
| D01 | Routing-dominated | `routing_overhead ≥ 0.30` | `R`, `A`, SWAPs inserted, the qubit pairs that needed them | Compiled: layers/qubits where SWAPs were inserted (from `route_only`, mapped to the representative compile via layout) | `layout_search`, `routing_search`; plus `commutation_aware_routing` when D03 also fires |
| D02 | Seed-sensitive | `seed_spread ≥ 0.15` | Per-seed table | None (whole circuit) | More seeds; always report best of N (no request is built) |
| D03 | Commuting block | A commuting run with `≥ 6` two-qubit ops on `≥ 4` qubits | Run location and size | Logical: the run's qubits/layers | `commutation_aware_routing` |
| D04 | Resynthesizable blocks | `resynthesis_potential ≥ 1` | Each block's current vs minimum two-qubit gates | Compiled: the top block | `block_resynthesis` |
| D05 | Clifford or linear block | A Clifford or linear-function block of `3–9` qubits (AI synthesis handles Clifford and linear blocks up to 9 qubits) | Block location, type, size | Logical: the block | `block_resynthesis` (with AI synthesis when available) |
| D06 | Reliability hot spot | One qubit or edge carries `≥ 25 %` of total `−log reliability`, or the compiled circuit uses a faulty operation (`faulty_ops` non-empty; severity high, or info under `info_rules`; threshold `faulty_ops` 0 with margin = number of distinct faulty ops; evidence lists every faulty op with its count; region: the faulty qubits/edges) (ChP-0041) | Top contributors with error rates | Compiled: that qubit/edge's gates | `noise_aware_layout` |
| D07 | Decoherence risk | `scheduled_duration` evidence `ratio_to_median_t2 ≥ 0.5` | Duration and T2 values | None | Strategies that cut two-qubit depth (`routing_search`, `commutation_aware_routing`) |
| D08 | Uneven entanglement | `entanglement_variance` evidence `cv ≥ 0.5` | Per-qubit two-qubit counts | Logical: the busiest qubits | `layout_search` (place busy qubits on well-connected sites) |
| D09 | Poor scaling | Routing overhead rises monotonically across ≥3 sweep sizes, or `b_compiled − b_logical ≥ 0.3` | Per-size table and fit | None | Routing strategies; flag for the researcher |
| D10 | Low task score | Intent criterion fails: `known_output` p < `task.min_probability`; `distribution` fidelity < `1 − task.tolerance`; `expectation` abs_error > `task.tolerance` | CI and per-size scores | None | "Work the other findings first"; report plainly (no request) |

Rules that build **no request**: D02, D07 (MVP), D09, D10. All others build requests when a registered layer serves one of their strategies and the strategy maps to a permitted change (`04-contracts.md` §2.3).

## 2. `diagnose/thresholds.yaml`

```yaml
score_version: qscore-2026.2
rules:
  D01: {routing_overhead_min: 0.30}
  D02: {seed_spread_min: 0.15}
  D03: {min_ops: 6, min_qubits: 4}
  D04: {resynthesis_potential_min: 1}
  D05: {min_qubits: 3, max_qubits: 9}
  D06: {share_min: 0.25}
  D07: {ratio_to_t2_min: 0.5}
  D08: {cv_min: 0.5}
  D09: {min_sizes: 3, exponent_gap_min: 0.3}
  D10: {}                      # uses the item's own task tolerance
severity:                      # margin = (value - threshold) / threshold, for "≥" rules
  warning_margin: 0.0          # fires at all → at least warning
  high_margin: 0.25            # ≥ 25 % past the threshold → high
  info_rules: [D02, D08]       # these never exceed "info" in the MVP
```

- Changing any value bumps `SCORE_VERSION` (class A). The file's sha256 is recorded in provenance (`thresholds_sha256`).
- **Severity** comes from the margin over the threshold: below `high_margin` → `warning`, at or above → `high`; rules in `info_rules` are always `info`. For D10, severity is `high` when the CI upper bound is still below the criterion, else `warning`.
- **Confidence** is `rule_fired` for a threshold crossing. It becomes `measured` once a counterfactual probe (Tier 2, `diagnose/probes.py`) shows a cheap intervention moves the metric.

## 3. Regions (`diagnose/regions.py`)

- `region_for(finding, ctx) -> Region`: qubits, a layer range `[start, end]` (inclusive, from the DAG's layers of the circuit named by `scope`), and gate indices (positions in `circuit.data`).
- `merge(regions)`: union of qubits, hull of layers.
- `convex_blocks(circuit, region, max_qubits) -> list[Block]`: blocks a request can cut out and splice back safely. Use `CollectMultiQBlocks`-style collection restricted to the region's qubits and layers; a block is **convex** if no path in the DAG leaves the block and re-enters it. Reject non-convex windows (shrink until convex). `max_qubits` default 8 for model layers, 16 for `reference-qiskit` (the GPU unitary limit for verification is 15 qubits, see `08-verification.md`).
- Logical-scope regions are mapped to compiled positions only through the recorded `TranspileLayout`; never by guesswork.

**Options for region extraction (★ default):** ★ DAG-based convex block collection · whole-circuit requests (simplest, more verification cost, bigger prompts) · fixed-size sliding windows (easy, may cut through structure).

## 4. Policy (`diagnose/policy.py`)

- `effective_policy(score_version, item.diagnose, cli_overrides) -> Policy`: profile first, then the manifest's `diagnose` block, then CLI flags.
- `apply(policy, findings)`: keeps suppressed findings with `suppressed: {by, reason}`; ad hoc CLI suppressions are flagged as such in the scorecard.
- `rank(findings)`: by severity, then (Tier 2) measured impact, then rule id, then region start.

## 5. Profiles (`diagnose/profiles/*.yaml`)

Presets for circuit families. Each override has a written `reason`. Profiles are versioned with the score version.

| Profile | Changes |
|---|---|
| `qaoa` | D03 `min_ops: 4`; D05 off (reason: QAOA cost layers are diagonal, not Clifford blocks worth resynthesizing) |
| `arithmetic` | D08 off (reason: carry chains concentrate entanglement by design) |
| `state_prep` | D03 off (reason: state-preparation circuits rarely contain commuting cost layers) |
| `dense_benchmark` | D01 `routing_overhead_min: 0.5` (reason: dense random circuits always route heavily) |
| `fault_tolerant` | D06, D07 off (reason: logical-level circuits; physical calibration not meaningful) |

## 6. Tests

- One unit test per rule with a hand-built metrics dict at, just below, and well above the threshold (severity boundaries included).
- Region tests: convexity check on a constructed DAG where a naive window is non-convex.
- Snapshot: the example scorecards' findings (rule ids, severities, regions) are stable across runs.
