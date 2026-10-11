# Gatesmith

**Gatesmith** scores quantum circuits written with Qiskit (KnightHacks IX). Its engine, **qscore**, does the following:
- validates a manifest of circuits and explains what it understood;
- compiles each circuit across several seeds on a target device;
- measures the result and diagnoses where the cost comes from;
- places the numbers against public benchmark circuits;
- verifies every proposed rewrite before it counts as better.

- Engine: [`qscore/`](qscore/README.md) (Python ≥ 3.11, Qiskit 2.x, [uv](https://docs.astral.sh/uv/))
- Specs (source of truth): [`specs/`](specs/README.md)
- Improvement-loop results: [`docs/improvement-loop-findings.md`](docs/improvement-loop-findings.md)

## Quick start

```bash
cd qscore
uv sync
uv run qscore score path/to/circuit.qasm --yes                      # one OpenQASM 2/3 file, FakeTorino target
uv run qscore score --manifest examples/sbox_oracle/qscore.yaml --yes
uv run qscore discover https://github.com/<owner>/<repo> --draft --score   # repo link → find circuits → manifest → score
scripts/smoke.sh                                                     # end-to-end smoke test
```

Output goes to `qscore-out/`: one JSON scorecard per circuit, `report.md`, and the compiled circuits.

## What you get

- **Scorecard:** compiled width, size, depth, two-qubit count and depth, swaps inserted, routing overhead,
  a reliability heuristic, scheduled duration, and the spread across seeds.
- **Diagnostics:** located findings such as routing-dominated regions or resynthesis opportunities. Each finding names its
  qubits and gates and the change strategies that apply to it.
- **Reference placement:** each metric is placed as a percentile among public QASMBench and MQT Bench circuits of
  similar width on the same target. The corpus has 119 circuits on FakeTorino; failures are recorded, not repaired. Different algorithms are not
  directly comparable, so the percentiles describe a circuit, not rate it.
- **`qscore improve` (experimental):** runs one improvement round. Each proposed region rewrite is checked by exact operator
  comparison, spliced into the circuit, and re-scored. A circuit is written only if it is strictly better and every constraint holds.
  - The deterministic `reference-qiskit` layer cut QASMBench `fredkin_n3` from 12 to 10 two-qubit gates. The circuit is verified equivalent and the gain reproduces on fresh seeds.
  - The `hf` layer sends regions to 4 pinned open-weight models through Hugging Face Inference Providers. It has found no improvement so far, and every wrong rewrite was caught (102 of 104 candidates were non-equivalent).
- **`qscore bench` (experimental):** a CPU vs AMD Radeon PRO W7900 (ROCm Aer) statevector benchmark. It measured 6.7× at
  28 qubits in FP64.

## Commands

| Command | Purpose |
|---|---|
| `qscore score` | Validate, compile across seeds, measure, diagnose, report |
| `qscore discover` | Find circuits in a folder or repository link without executing code; draft a manifest |
| `qscore deps` | Prepare an isolated builder environment pinned to the engine's Qiskit version |
| `qscore improve` | One verified improvement round (`--layers reference-qiskit` or `hf`) |
| `qscore reference build` | Rebuild the pinned public reference corpus |
| `qscore bench` | CPU vs ROCm GPU benchmark with an evidence report |

## Development

```bash
cd qscore
uv run pytest -m "not gpu and not platform and not hub and not llm and not slow" -q
uv run ruff check . && uv run ruff format --check . && uv run mypy src && uv run lint-imports
```

The web UI, platform and review bot are developed on separate branches (`platform-integration`, `github-app`).

Licence: see [LICENSE](LICENSE).
