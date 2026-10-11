# 08 · Verification ladder and acceptance rules

> **Status:** binding; class A to change · **Tier:** 0 (the ladder) / 1 (the loop that uses it) · **Read:** before working on `verify/`, `improve/loop.py`, `services.improve_item()`.
> Verification answers one question: does the candidate keep the item's invariants? It runs **before** anything is scored as better.

## 1. Statuses (exactly four)

| Status | Meaning |
|---|---|
| `passed` | An **exact** method proved equivalence under the item's invariants. |
| `failed` | A counterexample was found (or a permitted-change check failed). |
| `inconclusive` | The method timed out, or only probabilistic evidence exists. |
| `unsupported` | No method applies to this circuit and intent (e.g. mid-circuit measurement under `exact_unitary`, > limits with QCEC unavailable). |

Random-input statevector tests are recorded as **supporting evidence only**, never as `passed` (R3).

## 2. The ladder (`verify/ladder.py`)

`verify(original, candidate, invariants, permitted, region=None, settings) -> VerificationResult(status, method, evidence, time_s)`

Order of checks:

1. **Permitted changes** (`verify/permitted.py`) — always first. `check_permitted(original, candidate, permitted, region)`: qubit and ancilla counts within `ancillas.add`; the measurement set and classical-bit mapping unchanged; compiled outputs use only the target's native gates and respect its coupling map; no unexpected resets; with a region, nothing changed outside it. Any violation → `failed`, decision `invalid`.
2. **Reversible circuits** (intent `reversible_function`; both circuits only `x`, `cx`, `ccx`, `swap`, terminal `measure`): simulate the classical function over **every input** when the number of input bits ≤ 24 (vectorised bit operations in NumPy; ancillas initialised to 0 and required to return to 0). Exact. Above 24 input bits → QCEC (step 5).
3. **≤ 12 qubits:** reduce both circuits to their **virtual** qubits first (below), then `Operator(a).equiv(Operator(b))` (ignores global phase). With `final_permutation: forbidden`, also require identical final layouts. Exact, CPU.
4. **13–15 qubits:** on the GPU, compute the unitary of `a` followed by `b.inverse()` (both reduced to virtual qubits) with Aer's `unitary` method in **double precision**, and check `|Tr(U)| / 2ⁿ ≥ 1 − 1e-9` (identity up to phase). Memory: 4 GiB at 14 qubits, 16 GiB at 15 on the GPU, **and the same again in host RAM** when Aer returns the matrix — check host RAM in GPU session 1; if the host cannot hold it, the limit drops to 14 qubits (a spec change: class A, write the proposal with the measurement). Exact.

**Reducing compiled circuits (`verify/reduce.py`).** A compiled circuit spans the whole target (133 qubits on FakeTorino), so operators cannot be built on it directly. `to_virtual(circuit) -> QuantumCircuit` uses the circuit's `TranspileLayout` (initial layout and final layout/routing permutation) to produce an equivalent circuit on the original virtual qubits; transpiler ancillas must be idle or provably returned to |0⟩, otherwise `unsupported`. Before trusting it on large targets, test it against `Operator.from_circuit` on targets of ≤ 12 physical qubits (property test over random circuits and seeds). Never compare a compiled circuit by guessing the permutation.
5. **Larger circuits:** MQT QCEC `verify(original, candidate, timeout=…)`; mapping: `equivalent`, `equivalent_up_to_global_phase` → `passed`; `not_equivalent` → `failed`; `probably_equivalent`, `no_information`, timeout → `inconclusive`. Default timeout 60 s (budgeted by `budget.layer_timeout_s`).
6. **Task intents** (`known_output`, `distribution`, `expectation`) additionally call `verify/task.py`: `task_within_tolerance(original, candidate, invariants)` with shared seeds; returns the difference and its uncertainty. A task check never upgrades an exact-method result; it can only fail a candidate.

**Region requests:** the candidate region is spliced into the original (`improve/requests.splice`) and the **whole** spliced circuit is verified against the original. Verifying only the region is allowed when the region is ≤ 12 qubits and convex (exact locality argument); record `method: "region_operator"` then.

**Measurements:** final measurements are removed for unitary checks and the measurement maps compared separately (step 1). Mid-circuit measurement under `exact_unitary` → `unsupported`.

**Global phase:** ignored when `global_phase: ignore` (default); otherwise use `Operator.__eq__` (`==`; exact including phase — Qiskit has no `Operator.equal`, ChP-0049).

## 3. Methods (`verify/equivalence.py`)

| Function | Exact? | Device | Notes |
|---|---|---|---|
| `reversible_check(a, b, max_input_bits=24)` | Yes | CPU | Truth tables via vectorised bit-plane simulation; returns the first counterexample input on failure |
| `operator_equiv(a, b, allow_permutation)` | Yes | CPU | `Operator.from_circuit` handles layouts |
| `gpu_unitary_identity(a, b)` | Yes | GPU | Aer `method="unitary"`, `precision="double"`, `device="GPU"` |
| `qcec_check(a, b, timeout_s)` | Yes when it says so | CPU | `mqt.qcec.verify`; record the configuration and the result string |
| `random_state_evidence(a, b, k)` | **No (evidence)** | GPU/CPU | k random product states; recorded under `evidence`, never changes the status |

**Options (★ default; others need class A):**
- ★ Ladder as above.
- Clifford-only circuits: compare `Clifford(a) == Clifford(b)` (polynomial, exact) as an extra rung before step 3 — cheap and exact; good first proposal if Clifford blocks are common.
- ZX-calculus (`pyzx`) full reduction as an extra exact rung for some structures (incomplete in general).
- Aer `stabilizer`/extended-stabilizer for Clifford+few-T (later).

## 4. Acceptance rules (`improve/loop.py`)

A candidate is **accepted** only if all hold:

1. Its strategy is permitted for the item (via `permitted.changes`).
2. Verification `passed` — or, when `evidence.verification: probabilistic_ok`, probabilistic evidence passed and the attempt and scorecard are labelled `probabilistic`.
3. The primary metric is **strictly better** than the current best under the same target, seeds and settings (the candidate is re-scored with the same compile seeds).
4. Every constraint holds (`max_vs_baseline`, `min_vs_baseline`, `max`, `min`), including the `reliability` invariant (the fidelity floor): not below the baseline's reliability heuristic, nor below its simulated task score when one exists.
   For finite nonnegative baseline B, candidate C and relative factor f, evaluate `max_vs_baseline: f` as `C <= f*B`, and `min_vs_baseline: f` as `C >= f*B`. At B=0, the upper constraint requires C<=0; the lower constraint requires C>=0. Report B, C, f and the resulting bound as evidence. Do not compute C/B, insert an epsilon, or infer a passed comparison from an unavailable/failed metric: a constraint metric that is not `computed`, not scalar, or `statistical` (interval rule) raises `VerificationError` and the candidate is not accepted. The reliability invariant uses the same lower-bound rule. All other acceptance requirements, including exact verification and strict primary improvement, remain mandatory. Ratios for negative baselines are unsupported pending a metric-specific rule; do not reverse an inequality implicitly. (ChP-0045)

Comparisons:
- Deterministic metrics compare exactly; **a tie keeps the current circuit**.
- Statistical metrics need ≥ 5 trials on both sides and **non-overlapping 95 % intervals**; otherwise the decision is `inconclusive` and nothing is accepted.
- With `keep_pareto_front` (later), non-dominated candidates are kept for inspection without being accepted.

Decisions: `accepted`, `rejected` (verified but not better / a constraint fails), `inconclusive` (verification inconclusive or unsupported, or statistical overlap; with `on_inconclusive: reject` the circuit stays unchanged), `invalid` (parse failure or permitted-change violation). Every attempt is recorded (`04-contracts.md` §6), accepted or not.

## 5. Stopping the loop

Stop at the first of: budget exhausted (`max_rounds`, `wall_time_s`, `gpu_time_s`, `max_proposals`); no accepted improvement for two consecutive rounds; every remaining unsuppressed finding below its threshold; more than half of the round's attempts `inconclusive`. After each accepted change, **re-score and re-diagnose** (the diagnosis is expected to change — that is the demo's key moment).

## 6. Tests (`tests/unit/verify`, `tests/property`, `tests/differential`)

- **Mutation tests:** inject one wrong gate (swap a `cz` for `cx`, flip a rotation sign, drop a gate, permute two qubits without recording it) into a known-good candidate → `failed` every time, for each rung (CPU ≤ 12 q in CI; GPU 13–15 q in W7900 sessions).
- **Positive tests:** Qiskit's own optimization of a circuit (level 1 vs level 3 output of the same input) → `passed`.
- **Reversible:** S-box layer vs the same layer with one Toffoli control swapped → `failed` with the counterexample input.
- **QCEC mapping:** stub results for each QCEC outcome string map to the right status.
- **Timeout:** an artificially tiny QCEC timeout → `inconclusive`, never `passed`.
- **Evidence-only:** a case where random-state evidence agrees but the exact method fails → status `failed`, evidence recorded.
