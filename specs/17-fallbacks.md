# 17 · Fallback registry

> **Status:** binding · **Owner:** the user. Only the user adds, approves, changes or removes entries (R3). Agents may propose entries through a class A change proposal.
> **Default:** every fallback is **off**. `dev` and `ci` profiles force all off. The `demo` profile enables exactly the entries whose status is **approved** and whose *Demo profile* column says *on*.

## 1. Policy recap

- A fallback substitutes a different method, device, data source, model, default or degraded result when the intended path fails or is unavailable. Unlisted fallbacks are forbidden (R3.4 lists the patterns).
- Enabled only by configuration: `QSCORE_FALLBACKS=FB-04,FB-05` or `QSCORE_PROFILE=demo`. `config.py` validates ids against this table and logs the enabled set at startup.
- When one activates: `WARNING` log with the id; an entry in `fallbacks_used` (`{id, reason, at, scope}`) on the scorecard/attempt/job; a visible badge in the UI; an `Event(kind="fallback_used")`.
- When a fallback is needed but not enabled: raise `FallbackRefused("FB-04 needed: …")` → exit code 3 / job failed. That is the loud path the user asked for.
- Each entry has tests: one proving it raises when disabled, one proving it records itself when enabled.

## 2. Registry

Status values: **planned** (in the architecture; code may exist behind the switch; the user can veto) · **approved** (the user said yes) · **rejected** · **needs decision** (the user must choose before any code).

| ID | Trigger | Substitute | Switch | Status | Demo profile | Origin |
|---|---|---|---|---|---|---|
| FB-01 | Aer's ROCm build fails within its 90-min timebox in GPU session 1 | A small PyTorch statevector backend on ROCm for **ideal** simulations, CPU Aer for noisy ones, behind `sim/backends.py`; every result labelled `backend: torch-sv` | `sim.gpu_backend = torch` (explicit config, never automatic) | planned — **needs the user's go when triggered** (it is extra work) | off | Architecture v2, risk table |
| ~~FB-02~~ | **Retired by ChP-0048** (no local model server; the `hf` layer calls Inference Providers) | — | — | **retired** | — | Architecture v2 |
| ~~FB-03~~ | **Retired by ChP-0047** (the database-port fallback no longer applies; workers use HTTPS only) | — | — | **retired** | — | Architecture v2 |
| FB-04 | GPU out-of-memory during a simulation batch (the planner's estimate was wrong) | Retry with half the batch; if it still fails, run that group on the CPU | `QSCORE_FALLBACKS` includes `FB-04` | planned | on (if approved) | Architecture v2, failure table |
| FB-05 | Worker loses the platform job API mid-job (ChP-0047) | Spool results to `~/.qscore/spool/<job>/` and replay on reconnect (idempotent keys) | `QSCORE_FALLBACKS` includes `FB-05` | planned | on (if approved) | Architecture v2, failure table |
| FB-07 | QPY written by a newer Qiskit (runner env ≠ engine env) cannot be read | Transport the circuit as OpenQASM 3 instead | `QSCORE_FALLBACKS` includes `FB-07` | planned (irrelevant while `runner.env: engine`, the MVP default) | off | Build guide |

(FB-06 was retired before use: the mirror-circuit score is a separate, labelled metric `mirror_score`, not a substitute for `simulated_task_score`.)

## 3. Things that are **not** fallbacks (allowed by design)

| Behaviour | Why it is allowed |
|---|---|
| `device: auto` runs small circuits on the CPU below the measured crossover | The primary design rule (`09` §3); recorded in the plan and scorecard |
| A failing layer (timeout/HTTP error) is recorded and the loop continues with the other layers | The loop's design: layers are independent proposers; the failure is visible in attempts and the leaderboard |
| Bounded retries (≤ 3, backoff) of the same network operation | Same operation, same result; final failure raised (R3.5) |
| Declared defaults (manifest defaults, uniform errors for custom targets labelled `assumed`) | Listed in specs and shown as defaults in the summary |
| `skipped` / `unavailable` metric statuses under their stated conditions | Explicit outcomes, not substitutes |
| Requeue after a lost heartbeat (≤ 3 attempts) | Queue semantics, recorded in `attempts` |

## 4. Adding or changing an entry

Class A proposal (`specs/templates/change-proposal.md`) with: trigger (measurable), substitute, how it is switched on, how it is labelled in outputs, tests, and what the user loses if it activates during the demo. The user sets the status here.
