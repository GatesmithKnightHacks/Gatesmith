# qscore report

## packing_qaoa_p2 — complete

Target **FakeTorino** (133 qubits, basis cz, rz, sx, x); representative seed 37 of [11, 23, 37, 41, 53, 67, 79, 97] (min primary; tie: two_qubit_depth, seed order).

### Resources

| Metric | Value | Unit | Status |
|---|---|---|---|
| `width` | 12 | qubits | ✔ computed |
| `size` | 1290 | ops | ✔ computed |
| `depth` | 584 | layers | ✔ computed |
| `two_qubit_count` | 321 | gates | ✔ computed |
| `two_qubit_depth` | 202 | layers | ✔ computed |
| `measurement_count` | 0 | ops | ✔ computed |
| `toffoli_count` | 0 | gates | ✔ computed |

### Hardware

| Metric | Value | Unit | Status |
|---|---|---|---|
| `routing_overhead` | 0.514019 | ratio | ✔ computed |
| `swaps_inserted` | 65 | gates | ✔ computed |
| `compile_ratio` | 2.05769 | ratio | ✔ computed |
| `reliability_heuristic` | 0.262503 | probability-like | ✔ computed |
| `scheduled_duration` | 2.4236e-05 | s | ✔ computed |
| `seed_spread` | 0.0865672 | ratio | ✔ computed |

### Opportunities

| Metric | Value | Unit | Status |
|---|---|---|---|
| `supermarq_profile` | {"program_communication": 0.5909090909090909, "critical_depth": 0.38461538461… | features in [0, 1] | ✔ computed |
| `entanglement_variance` | 9 | gates^2 | ✔ computed |
| `structure` | {"commuting_runs": [{"qubits": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "layer… | dict | ✔ computed |
| `resynthesis_potential` | 9 | gates | ✔ computed |

### Research

| Metric | Value | Unit | Status |
|---|---|---|---|
| `scalability` | — |  | ∅ unavailable (no size_sweep) |
| `simulated_task_score` | — |  | ∅ unavailable (simulation is not in the MVP build (CP-0023)) |
| `mirror_score` | — |  | ⏭ skipped (not selected) |

### Findings

- **D01 Routing-dominated** · ▲ high — compiled qubits [29, 30, 36, 47, 48, 49]; strategies: layout_search, routing_search, commutation_aware_routing
- **D03 Commuting block** · ▲ high — logical qubits [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; strategies: commutation_aware_routing
- **D03 Commuting block** · ▲ high — logical qubits [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; strategies: commutation_aware_routing
- **D04 Resynthesizable blocks** · ▲ high — compiled qubits [25, 26]; strategies: block_resynthesis

Rules not evaluated: D09 (metric scalability not computed (unavailable)); D10 (simulation metrics are final product (CP-0023))

_Bitstrings use Qiskit's order: qubit 0 is the rightmost bit. Reliability is a calibration-based heuristic, not a success probability._
