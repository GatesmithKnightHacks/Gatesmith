# qscore report

## pasted — complete

Target **FakeTorino** (133 qubits, basis cz, rz, sx, x); representative seed 11 of [11, 23, 37, 41, 53, 67, 79, 97] (min primary; tie: two_qubit_depth, seed order).

### Resources

| Metric | Value | Unit | Status |
|---|---|---|---|
| `width` | 3 | qubits | ✔ computed |
| `size` | 15 | ops | ✔ computed |
| `depth` | 9 | layers | ✔ computed |
| `two_qubit_count` | 2 | gates | ✔ computed |
| `two_qubit_depth` | 2 | layers | ✔ computed |
| `measurement_count` | 0 | ops | ✔ computed |
| `toffoli_count` | 0 | gates | ✔ computed |

### Hardware

| Metric | Value | Unit | Status |
|---|---|---|---|
| `routing_overhead` | 0 | ratio | ✔ computed |
| `swaps_inserted` | 0 | gates | ✔ computed |
| `compile_ratio` | 1 | ratio | ✔ computed |
| `reliability_heuristic` | 0.994268 | probability-like | ✔ computed |
| `scheduled_duration` | 2.44e-07 | s | ✔ computed |
| `seed_spread` | 0 | ratio | ✔ computed |

### Opportunities

| Metric | Value | Unit | Status |
|---|---|---|---|
| `supermarq_profile` | {"program_communication": 0.6666666666666666, "critical_depth": 1.0, "entangl… | features in [0, 1] | ✔ computed |
| `entanglement_variance` | 0.222222 | gates^2 | ✔ computed |
| `structure` | {"commuting_runs": [], "clifford_blocks": [{"qubits": [0, 1, 2], "layers": [0… | dict | ✔ computed |
| `resynthesis_potential` | 0 | gates | ✔ computed |

### Research

| Metric | Value | Unit | Status |
|---|---|---|---|
| `scalability` | — |  | ∅ unavailable (no size_sweep) |
| `simulated_task_score` | — |  | ∅ unavailable (intent has no task) |
| `mirror_score` | — |  | ∅ unavailable (simulation is not in the MVP build (CP-0023)) |

### Findings

- **D06 Reliability hot spot** · ▲ high — compiled qubits [116, 117]; strategies: noise_aware_layout
- **D05 Clifford or linear block** · ■ warning — logical qubits [0, 1, 2]; strategies: block_resynthesis

Rules not evaluated: D09 (metric scalability not computed (unavailable)); D10 (simulation metrics are final product (CP-0023))

_Bitstrings use Qiskit's order: qubit 0 is the rightmost bit. Reliability is a calibration-based heuristic, not a success probability._
