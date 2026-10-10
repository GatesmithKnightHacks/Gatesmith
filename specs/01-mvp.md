# 01 · The MVP: scope, tiers, definition of done

> **Status:** binding · **Read:** at the start of every session; before starting any task, check its tier here.

## 0. The MVP (CP-0023, approved 2026-10-10) — read this first

**The MVP is the scoring and diagnostics engine: qscore takes a simple circuit — one OpenQASM file, or (preferred, not required) a repo with Qiskit builder functions — runs diagnostics on it, and returns the scores.** Concretely: validation that fails loudly, compile across seeds, every CPU metric of `06` (not the simulation metrics), diagnostics D01–D09, a scorecard JSON and a Markdown report. Gate **G-MVP**: both examples and a single QASM file score end to end on the CPU; golden and contract tests pass; reviewed.

Everything else below — simulation metrics and D10, the GPU, profiler and benchmark, improvement requests, the verifier and the loop, Neon/Hub and the worker, UI, platform, Space and assistant — is the **final product**, built after G-MVP. Where the rest of this file says "Tier 0/MVP", read "final product" unless the item is listed here. G1–G5 are final-product gates.

## 1. One paragraph

**qscore** scores quantum circuits. A researcher points it at OpenQASM files or a repo of Qiskit builder functions plus a `qscore.yaml` manifest. qscore validates everything first, shows what it understood, and then produces one **scorecard** per circuit: metrics in four groups, diagnosed problems located in the circuit, and **improvement requests** in a published format any optimizer can answer. Answers (proposals) come back, and qscore's verifier decides whether each one is correct and better. Heavy simulation and verification run on one AMD Radeon PRO W7900; everything else runs on any CPU. **The scoring engine is the MVP.** Everything else consumes its two outputs: scorecards and improvement requests.

## 2. Principles that decide every trade-off

1. **The engine decides; models only propose.** Acceptance, ranking and stopping are deterministic code.
2. **Validate before computing; explain before running.** Every input problem is reported at once with a location and a fix; nothing runs until the user confirms what the engine understood.
3. **Honest numbers.** Every metric carries a status; every verification one of four statuses; evidence is never presented as proof.
4. **Reproducible by construction.** Seeds, versions, hashes and the hardware profile are recorded on every result.
5. **Fail loudly** (rules R3/R4). A broken thing is visible, never papered over.

## 3. Tiers

| Tier | What it contains | Why |
|---|---|---|
| **Tier 0 – Engine MVP** | Manifest v0.2, validation and interpretation, compile across seeds, CPU metrics, diagnostics D01–D09, scorecards and improvement requests (local JSON), the verification ladder, GPU simulation metrics and D10 on the W7900, hardware profiler, CPU-vs-GPU benchmark, records in Neon and on the Hub, the queue worker | This is the product. Without it there is nothing to demo. |
| **Tier 1 – Demo MVP** | Improvement loop with the `reference-qiskit` layer and at least one model layer (`local` vLLM and/or `hf`), compatibility kit and leaderboard export, a Gradio UI over the full flow, the platform on Vultr, the leaderboard Space | Needed for the submission and the sponsor tracks (AMD, Hugging Face, Neon, Vultr). |
| **Tier 2 – Stretch** | Gemini ADK assistant, Space CPU demo, platform CPU worker, UI/UX polish, the 14B model in leaderboard runs, counterfactual probes | Only after the Tier 1 gate (G4) passes. |
| **Post-MVP** | Circuit map across a repo, learned "where to look" model, repo ingestion at scale, Cirq/PennyLane, real hardware, bigger GPUs | Roadmap only. Do not build. |

## 4. In and out of scope

| In the MVP | Not in the MVP |
|---|---|
| OpenQASM 2/3 files and Qiskit builder functions in curated repos (the two examples) | Arbitrary GitHub repos; Cirq, PennyLane, other SDKs |
| Targets: `FakeTorino` (from `qiskit_ibm_runtime.fake_provider`), `all-to-all`, `line-N`, `grid-RxC`, `heavy-hex-D`, custom coupling map + basis | Real IBM hardware runs |
| Metrics in four groups (`06-metrics.md`), rules D01–D10 | Learned predictors; counterfactual probes (Tier 2) |
| Verification ladder and acceptance rules (`08-verification.md`) | Approximate synthesis, reversible rewriting strategies (stretch) |
| CPU everywhere; GPU simulation on one W7900 | Multiple GPUs, Instinct hardware, compute partitioning |
| Improvement requests and proposals (`10-improvement-loop.md`) with three layers | Training models |
| Neon as queue and system of record; Hub for files; Vultr platform; read-only Space | Auth/multi-tenant accounts; payments; anything requiring user sign-up |

## 5. Gates (each is testable; tag the repo when it passes)

| Gate | When (hours from kickoff) | Passes when |
|---|---|---|
| **G1 · Contracts** | ~3 | All schemas export to JSON Schema; both example manifests load into the models; CI is green; service stubs return objects that validate. |
| **G2 · CPU scorecards** | Saturday noon (~14) | Both example repos validate, confirm and score end to end on the CPU; every broken fixture produces its exact issue codes and locations; golden and property tests pass. **The cut list is enforced here.** |
| **G3 · GPU and queue** | ~22 | Simulated task scores run on the W7900 and match the CPU within tolerance; the CPU-vs-W7900 benchmark and the precision×fusion sweep are recorded as dated runs; scorecards land in Neon and on the Hub; a job survives a killed worker. |
| **G4 · Feature freeze** | ~30 | One finding becomes a request and returns a verified proposal from `reference-qiskit` and from at least one model layer; the UI runs the full flow; the platform URL and the leaderboard Space work while the GPU machine is off. |
| **G5 · Demo** | ~36 | The demo runs live twice in a row. |

## 6. Definition of done for the MVP

- [ ] Both example repos validate, confirm and score end to end on the CPU, and every broken fixture gives its precise error.
- [ ] Simulated task scores run on the W7900 and match the CPU within tolerance.
- [ ] The CPU-vs-W7900 benchmark and the precision and fusion sweep are recorded as dated runs.
- [ ] Scorecards and attempts land in Neon and on the Hub, and a queued job survives a killed worker.
- [ ] One finding becomes a request and returns a verified proposal from `reference-qiskit` and from at least one model layer.
- [ ] The platform URL and the leaderboard Space work while the GPU machine is off.
- [ ] The demo runs live twice in a row.
- [ ] No fallback is enabled in `dev`/`ci`; the `demo` profile's enabled fallbacks are exactly those the user approved in `17-fallbacks.md`.

## 7. The demo (3 minutes) — build toward this

1. **Load** the side-chain QAOA example. Show the validation report (clean) and the interpretation summary; confirm.
2. **Scorecard:** baseline is the best of eight seeds, with the spread. The diagnosis says routing dominates (D01) and points at a commuting block (D03), with the region highlighted.
3. **Improve:** the request goes to `reference-qiskit` and to a model layer. The verifier proves the reference candidate equivalent (on the GPU for 13–15 qubits) and accepts it; a model candidate is rejected or inconclusive, and the screen says why.
4. **Re-score:** the diagnosis changes after the accepted fix.
5. **Range of the verifier:** load the reversible `sbox_oracle`; it verifies exactly by classical simulation at a size statevector checks cannot reach.
6. **AMD panel:** the same simulation workload on CPU vs W7900: time vs qubits, the crossover, the cache knee, the precision×fusion finding, candidates verified per minute.
7. **Leaderboard:** open models ranked by verified-improvement rate under identical budgets, on the Space; the attempts dataset on the Hub.

## 8. Sponsor tracks and what each needs from the MVP

| Track | Priority | Needs | Owner tasks |
|---|---|---|---|
| AMD (ROCm on Radeon) | Core | W7900 doing batched verification, noisy simulation and benchmarks; benchmark chart; fusion×precision finding; tokens/s for the local model; credits per verified improvement | T17–T23, T25 |
| Hugging Face | Core | Hub model served locally, larger models via Inference Providers, attempts dataset published, leaderboard Space | T25, T26, T29 |
| Neon | Build (structural) | Job queue and system of record; GPU-online indicator; history that outlives the GPU machine | T05, T22, T28 |
| Vultr | Build (1–2 h) | Always-on platform URL judges use while the GPU machine comes and goes | T28 |
| Gemini (MLH) | After the loop works | ADK assistant that explains scorecards from records and never accepts changes | T30 (Tier 2) |
| UI/UX | Polish, no new features | The confidence flow; statuses not by colour alone; alt text; keyboard access; clear offline and error states | T27 |

## 9. Non-goals and anti-goals (do not drift into these)

- Building a new optimizer or compiler. qscore diagnoses, specifies and verifies; existing passes and models propose.
- Claiming quantum advantage or better science. qscore prices and improves circuits.
- A general LLM agent framework. The improvement loop is plain Python.
- Pretty charts before correct numbers.
