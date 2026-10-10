# 14 · Testing, fixtures and quality gates

> **Status:** binding · **Tier:** 0 · **Read:** before writing any test or fixture, and before declaring any task done (R6).
> A scoring engine is only as credible as its known answers: most tests compare against values fixed **before** the code existed.

## 1. Test layout and markers

```text
qscore/tests/
  conftest.py        example repos, FakeTorino bundle, line-N targets, temp cache, settings profile "ci"
  contract/          schema drift, examples load into models, JSON Schema validity, migrations
  golden/            hand-checked values (06-metrics.md §4), values.yaml with approved_by
  unit/              per-module tests (metrics, diagnose, verify, planner, requests, cli exit codes …)
  validation/        one broken manifest per issue code → exact codes and locations; discovery decoys
  property/          Hypothesis on random circuits
  differential/      CPU vs GPU, single vs double, Aer vs exact Operator          (marker gpu)
  snapshots/         example scorecards compared field by field with tolerances
  conformance/       layers vs the compatibility kit (recorded responses in CI)
  queue/             worker kill/requeue, idempotent replay                         (marker neon)
  e2e/               CLI end to end on the examples (CPU)                          (marker slow)
```

| Marker | Needs | Runs in |
|---|---|---|
| (none) | CPU only | CI on every push, laptop |
| `slow` | CPU, > 30 s | CI nightly or before merge to `main` |
| `gpu` | W7900 with the ROCm Aer build | Start and end of each GPU session (`pytest -m gpu`) |
| `neon` | `QSCORE_TEST_NEON_DSN` (dev branch) | Laptop before merging queue changes |
| `hub` | `HF_TOKEN` with write to a test repo | Before merging Hub changes |
| `llm` | A running model endpoint | GPU session (local) / manual (hf) |

A test whose marker's requirement is missing is **skipped by marker selection**, not by `try/except` inside the test. A test that needs a resource but runs without it must fail with a clear message (R4).

## 2. Test types

| Type | Examples | Guards against |
|---|---|---|
| Golden values | Bell, GHZ chains, helper functions, line-N compiles (06 §4); a recorded compiled GHZ on FakeTorino (approved by the user) | Wrong counts; Qiskit API drift |
| Validation fixtures | One broken manifest per catalog code (`examples/broken/Q202_bad_function/qscore.yaml` …) | Missing or unhelpful errors |
| Property (Hypothesis) | Random circuits ≤ 8 qubits, depth ≤ 20: metrics never negative; a barrier changes no count; relabelling logical qubits leaves logical counts unchanged; reliability in (0, 1]; `to_virtual` agrees with `Operator.from_circuit` on small targets; `splice(extract(c, r)) == c` | Edge cases |
| Differential (gpu) | CPU vs GPU task scores within tolerance; single vs double within tolerance; Aer statevector vs exact `Operator` on small circuits | GPU and precision bugs |
| Verifier mutations | One wrong gate → `failed` every time (08 §6) | A verifier that passes broken circuits |
| Snapshot regression | Example scorecards compared field by field; statistical metrics within their CI; structural exactly | Unintended changes |
| Determinism | Same inputs twice → identical structural scorecards (excluding timestamps/durations) | Hidden randomness |
| Compatibility kit | `reference-qiskit` and a recorded-response model layer pass; a broken layer fails | A standard that cannot catch bad layers |
| Queue faults (neon) | Kill a worker mid-job → requeued, attempts+1, third loss → failed; replay a write twice → no duplicates; content mismatch on replay → `RecordError` | Lost or doubled results |
| CLI | Exit codes 0/1/2/3/4 on fixtures; `--json` outputs validate against schemas | Interface regressions |
| Fallback discipline | With `profile=ci`, every FB code path raises `FallbackRefused`; with the FB enabled, the use is recorded in `fallbacks_used` | Silent fallbacks |

**Tolerances:** structural metrics exact; simulated scores: |CPU − GPU| ≤ max(3 × combined stderr, 1e-3); single vs double: ≤ 1e-4 absolute on probabilities/expectations of the fixtures (tune only via a class A proposal with measurements).

## 3. Examples (fixtures and demo material)

### 3.1 `examples/sidechain_qaoa/` — a small repo with a builder

- `src/packing/qaoa.py::build_qaoa(n_residues: int, rotamers: int, p: int) -> QuantumCircuit`: one-hot encoding, `n_residues × rotamers` qubits (4 × 3 = 12 for the default item; 10 × 3 = 30 for GPU benchmarks). Energies: self energies `E_i(r)` and pair energies `E_ij(r, s)` generated **deterministically** from a fixed seed (`numpy.random.default_rng(20261009)`), plus a one-hot penalty `λ Σ_i (1 − Σ_r x_ir)²` with `λ = 2 × max|E|`. Map the QUBO to Ising (Z and ZZ terms); QAOA layers: cost `RZZ`/`RZ` layer + mixer `RX` layer, `p` repetitions, angles as `Parameter`s `gamma[k]`, `beta[k]`.
- `params/qaoa_p2.json`: fixed angles for p = 2 (`{"gamma[0]": 0.4, "gamma[1]": 0.8, "beta[0]": 0.7, "beta[1]": 0.35}` — illustrative fixed values; they define the fixture).
- `hamiltonians/packing_4.json`: the Ising Hamiltonian in the observable format (`04-contracts.md` §2.4), generated by `tools/make_hamiltonian.py` from the same seed.
- `qscore.yaml`: the `packing_qaoa_p2` item from `04-contracts.md` §2 (intent `expectation`, size sweep `n_residues: [2, 3, 4, 5, 6]`, profile `qaoa`).
- Expected diagnosis on FakeTorino: D01 and D03 fire (dense ZZ cost layers on heavy-hex). If they do not, that is a finding to report, not a reason to tune thresholds.

### 3.2 `examples/sbox_oracle/` — a reversible circuit in QASM

- `circuits/sbox_layer_4x.qasm`: four PRESENT S-boxes (`S = [0xC,0x5,0x6,0xB,0x9,0x0,0xA,0xD,0x3,0xE,0xF,0x8,0x4,0x7,0x1,0x2]`) applied in place to 16 data qubits, with one clean ancilla per S-box (20 qubits), gates only `x`, `cx`, `ccx`.
- Generated by `tools/make_sbox.py`: transformation-based (MMD) synthesis of the 4-bit permutation into multi-controlled Toffolis with positive controls; each 3-control Toffoli decomposed exactly as `ccx(a,b,anc); ccx(anc,c,t); ccx(a,b,anc)` (ancilla returns to 0). The generator verifies its own output classically over all 16 inputs per S-box before writing.
- `qscore.yaml`: the `sbox_oracle` item (intent `reversible_function`, objective `toffoli_count`, permitted `reversible_rewrite`). Demo point: exact classical verification over all 2¹⁶ inputs at 20 qubits, where a unitary check (4²⁰ entries) is impossible.
- `toffoli_count` of the generated file is recorded and approved by the user as a golden value.

### 3.3 `examples/broken/`

One subfolder per issue code (`Q101_unknown_field/`, `Q202_bad_function/`, `Q305_unbound/`, `Q402_midcircuit/`, …) with a minimal `qscore.yaml` (+ files), and `expected.json` listing the exact codes and locations. A test iterates the folders.

## 4. CI (`.github/workflows/ci.yml`)

On every push and PR, on `ubuntu-latest`, with `defaults.run.working-directory: qscore` (the engine folder of the `Gatesmith` repo), Python 3.12 (match the engine's minimum and the W7900 image if different, via a matrix):
1. `uv sync --frozen` (CPU Aer).
2. `uv run ruff check . && uv run ruff format --check .`
3. `uv run mypy src`
4. `uv run lint-imports`
5. `uv run pytest -m "not gpu and not neon and not hub and not llm and not slow" -W error::DeprecationWarning:qiskit -n auto`
6. `uv run pytest tests/contract` (schema drift) — part of step 5, listed for clarity.

Free CI runners have no AMD GPU; `gpu` tests run in GPU sessions and their outputs are attached to `progress.md`.

**Warnings treated as errors** in `ci`/`dev`: Qiskit deprecation warnings, NumPy `ComplexWarning`, Aer warnings about truncation or precision, `RuntimeWarning` from NumPy in metrics. Add others by class B proposal.

## 5. Definition of done for a task (R6.3)

- [ ] Acceptance criteria in `15-build-plan.md` pass (commands run, output read).
- [ ] CPU suite, lint, types and import layers pass.
- [ ] New public functions have tests; golden values untouched (or approved changes recorded).
- [ ] No new fallback; no swallowed exception; no `skip`/`xfail` added.
- [ ] Reviewed by someone other than the implementer against the spec (spec-auditor subagent or Codex review), findings resolved or turned into proposals.
- [ ] `progress.md` updated; commit message `T<id>: … (<spec> §…)`.

## 6. Reviewer checklist (used by `spec-auditor` and Codex reviews)

1. Does the code do what the cited spec sections say — names, fields, statuses, units, exit codes?
2. Any fallback (R3 list)? Any broad `except`? Any default that hides a missing input?
3. Are errors typed, informative and propagated to the right status?
4. Determinism: seeds derived as specified? Sorted pool results? No set-order dependence?
5. Layering: imports point down; services don't print; engines don't read the manifest file.
6. Tests: do they test the spec (not the implementation)? Are golden values from the spec?
7. Contracts: do outputs validate against the exported JSON Schemas?
8. Security: no secrets in logs/prompts/subprocess env; builders only via the sandbox.
9. Scope: nothing beyond the task's spec; no new dependency without a proposal.
