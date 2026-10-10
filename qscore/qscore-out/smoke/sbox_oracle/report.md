# qscore report

## sbox_oracle — complete

Target **FakeTorino** (133 qubits, basis cz, rz, sx, x); representative seed 23 of [11, 23, 37, 41, 53, 67, 79, 97] (min primary; tie: two_qubit_depth, seed order).

### Resources

| Metric | Value | Unit | Status |
|---|---|---|---|
| `width` | 20 | qubits | ✔ computed |
| `size` | 4544 | ops | ✔ computed |
| `depth` | 793 | layers | ✔ computed |
| `two_qubit_count` | 1041 | gates | ✔ computed |
| `two_qubit_depth` | 239 | layers | ✔ computed |
| `measurement_count` | 0 | ops | ✔ computed |
| `toffoli_count` | 100 | gates | ✔ computed |

### Hardware

| Metric | Value | Unit | Status |
|---|---|---|---|
| `routing_overhead` | 0.419789 | ratio | ✔ computed |
| `swaps_inserted` | 199 | gates | ✔ computed |
| `compile_ratio` | 1.67903 | ratio | ✔ computed |
| `reliability_heuristic` | 0.0121148 | probability-like | ✔ computed |
| `scheduled_duration` | 2.8068e-05 | s | ✔ computed |
| `seed_spread` | 0.0201729 | ratio | ✔ computed |

### Opportunities

| Metric | Value | Unit | Status |
|---|---|---|---|
| `supermarq_profile` | {"program_communication": 0.08421052631578947, "critical_depth": 0.25, "entan… | features in [0, 1] | ✔ computed |
| `entanglement_variance` | 2 | gates^2 | ✔ computed |
| `structure` | {"commuting_runs": [], "clifford_blocks": [{"qubits": [0, 1, 3], "layers": [2… | dict | ✔ computed |
| `resynthesis_potential` | 3 | gates | ✔ computed |

### Research

| Metric | Value | Unit | Status |
|---|---|---|---|
| `scalability` | — |  | ∅ unavailable (no size_sweep) |
| `simulated_task_score` | — |  | ∅ unavailable (intent has no task) |
| `mirror_score` | — |  | ∅ unavailable (simulation is not in the MVP build (CP-0023)) |

### Findings

- **D01 Routing-dominated** · ▲ high — compiled qubits [28, 29, 32, 33, 36, 67, 68, 92, 99]; strategies: layout_search, routing_search
- **D04 Resynthesizable blocks** · ▲ high — compiled qubits [12, 18]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [0, 2, 3]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [4, 6, 7]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [8, 10, 11]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [12, 14, 15]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [0, 1, 3]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [4, 5, 7]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [8, 9, 11]; strategies: block_resynthesis
- **D05 Clifford or linear block** · ■ warning — logical qubits [12, 13, 15]; strategies: block_resynthesis
- **D08 Uneven entanglement** · ● info — logical qubits [3, 7, 11, 15]; strategies: layout_search

Rules not evaluated: D09 (metric scalability not computed (unavailable)); D10 (simulation metrics are final product (CP-0023))

_Bitstrings use Qiskit's order: qubit 0 is the rightmost bit. Reliability is a calibration-based heuristic, not a success probability._
