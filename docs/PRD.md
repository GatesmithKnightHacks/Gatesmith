# Gatesmith PRD

Knight Hacks IX · draft · October 10, 2026

## Pitch

Gatesmith is the quality check between writing quantum code and paying to run it.

Gatesmith scores a quantum circuit and ranks what is wrong with it. Local models propose fixes one at a time, and the engine proves each fix still does the same job. The engine, qscore, also says when to stop.

## Problem and why now

IBM's pay-as-you-go plan starts at $96 per minute of QPU time, and the free tier gives 10 minutes a month. A circuit that fails on hardware wastes that time.

Qiskit's transpiler rewrites a circuit without explaining anything. It does not say what was wrong, which problem matters most, or whether the rewrite kept the circuit's meaning. Gatesmith names each finding with a rule id and evidence, ranks the findings, checks every fix with an exact method, and records every attempt.

## Users and the decisions they make

| User | Decides |
|---|---|
| Researcher with a circuit | Which finding to fix first, and whether the circuit is ready to run |
| Person reviewing a fix | Accept it or keep the current circuit |
| Teammate reviewing a pull request | Merge, or send back a circuit that got worse |
| Model builder | Whether their model is qscore-compatible and where it ranks |

## What we are building

We build the scoring engine and the improvement loop first. Everything else is extra. CI runs the same engine, so we build it once for both uses.

Tier 0 is the engine, including diagnostics D01 to D10 and the verification ladder. Tier 1 adds the loop with `reference-qiskit` and one model layer, a minimal UI, the always-on platform and the leaderboard.

The demo supports Qiskit only, through OpenQASM 2 and 3 files and Qiskit builder functions.

## How a run works

1. **Get the circuit.** The user uploads `.qasm` files with an optional `qscore.yaml` manifest, or picks a bundled example. In laptop mode, discovery parses a local repo for circuits without running any code and asks the user to confirm each path. If the repo has no manifest, Gatesmith drafts one and labels each default.
2. **Validate and confirm.** The validator reports every input problem in one pass, each with a code, a location and a fix. The engine rejects a circuit that cannot run and says why. Nothing runs until the user confirms a plain summary of what the engine understood.
3. **Benchmark the original.** The engine compiles the circuit with Qiskit optimization level 3 for `FakeTorino`, once for each of 8 fixed seeds. The best seed by the primary objective becomes the baseline, and the scorecard reports the spread.
4. **Score and rank.** Each circuit gets one scorecard with metrics in four groups, named resources, hardware, opportunities and research. Rules D01 to D10 raise findings with a severity of `info`, `warning` or `high`, plus evidence and a region in the circuit. `reliability_heuristic` always appears with its label, "calibration-based reliability heuristic, not a success probability". Gatesmith shows no composite score.
5. **Fix the top finding.** The top finding becomes an improvement request. `reference-qiskit` answers with deterministic Qiskit passes, and `local` answers with `Qiskit/granite-3.3-8b-qiskit` on vLLM.
6. **Check the fix.** The verification ladder returns `passed`, `failed`, `inconclusive` or `unsupported`. The engine re-scores the candidate with the same seeds and records `accepted`, `rejected`, `inconclusive` or `invalid`. It accepts a candidate only when the primary metric beats the current best and every constraint holds. A tie keeps the current circuit. After an accepted fix, the engine re-diagnoses the circuit. If the user keeps the current circuit, the engine sends the next-ranked finding. Whenever a change makes the circuit worse, Gatesmith shows this message: "If results are stagnating, the changes improve the circuit in one way, but worsen it in another, or you suspect the pipeline has serious flaws, please consider making a GitHub Issue and documenting your problems".
7. **Know when to stop.** The engine recommends stopping when the budget runs out, when two rounds pass with no accepted gain, when every remaining finding falls below its threshold, or when more than half of a round's attempts end `inconclusive`. The user can continue anyway. Auto mode runs the loop without asking and never keeps a worse circuit.
8. **Report and export.** The report puts the final scorecard next to the baseline and lists every attempt with its decision. The user downloads the final `.qasm` and its manifest, can convert it to Qiskit code, and can add the GitHub Action to the repo.

## CI and the GitHub Action

The Action runs the same engine on every pull request that touches a circuit. `qscore score --fail-on high` exits with code 1 when any finding reaches `high`, and `qscore diff A B` compares two scorecards. Its comment shows the primary metric change and the findings added or resolved, so the team catches a worse circuit before merging it.

## Stretch goals

**Score predictor.** A graph transformer such as QuEst predicts the engine's result from a circuit's structure. The loop would generate several fixes per round and verify only the most promising ones.

**In-house model.** A custom model takes one block of gates and optimizes it for one quality, such as two-qubit count.

## Demo, 3 minutes

1. Load `sidechain_qaoa`, a 12-qubit circuit with the `expectation` intent, and confirm the clean summary.
2. Open the scorecard. D01 reports that routing dominates, and D03 highlights a commuting block.
3. Run one round. The engine accepts the `reference-qiskit` fix, and the findings change. The `local` fix ends rejected or inconclusive, and the screen says why.
4. Load the 20-qubit `sbox_oracle`. The verifier checks it by exact classical simulation over all 2¹⁶ inputs.
5. Open the leaderboard, which ranks models by verified-improvement rate.

## Success criteria

- Both examples score end to end on the CPU, and every broken fixture returns its exact issue code.
- One finding returns a verified proposal from `reference-qiskit` and from one model layer.
- The platform and the leaderboard work while the GPU machine is off.
- The demo runs live twice in a row.

## Non-goals

- Gatesmith builds no new optimizer or compiler. Existing Qiskit passes and models write the fixes.
- Gatesmith reports no success probability and claims no quantum advantage.
- The MVP runs nothing on real hardware and supports no SDK besides Qiskit.
- The platform never runs uploaded Python.

## Open decisions

| Decision | Notes say | Spec says | Options | Recommendation |
|---|---|---|---|---|
| Benchmark method | BenchPress on the whole circuit | Qiskit level 3 across 8 fixed seeds; Benchpress settings rejected. `decisions.md` D-008, `05-pipeline.md` §6 | BenchPress; spec method; both | Spec method, labelled "benchmark" in the UI. BenchPress after the demo as a comparison |
| Qubit limit | 34 simulated qubits | Statevector up to 31 qubits double, 32 single; one fewer with the 8B model loaded. `09-gpu-and-simulation.md` §2 | Fixed 34; spec limits | Spec limits, computed by the feasibility pass and shown with the reason |
| Model size | Local models up to 32B | 8B by default, 14B in exclusive mode only, 24B does not fit in 48 GB. `10-improvement-loop.md` §5 | 32B; 8B and 14B; `hf` layer | 8B by default, 14B for leaderboard runs, larger models through the `hf` layer |
| Stop rule | Stop at diminishing returns; the user can continue | Four deterministic stop rules. `08-verification.md` §5 | Score threshold; spec rules | Spec rules decide. The UI names the rule that fired, and Continue anyway adds one round |
| Composite score | "Scores it" implies one number | Better primary metric plus constraints; score sums rejected. `decisions.md` D-012, `08-verification.md` §4 | One number; per-metric scorecard | No composite. The headline is the primary metric change, for example `two_qubit_count` from 44 to 36 gates |
| Success and cost estimate | Success rate per machine, QPU time and cost | Reliability is "not a success probability". `06-metrics.md` §2.2 | Success rate; labelled heuristic; new cost metric | Labelled heuristic. Cost only as a new labelled metric through a change proposal |
| Per-fix approval | The user approves each fix | The engine decides acceptance. `01-mvp.md` §2 | User approves; engine decides | Engine decides. Keeping the current circuit sends the next finding |
| UI framework | A bare-minimum UI | Gradio Blocks. `decisions.md` D-024, class B | Custom static frontend on FastAPI; Gradio at about 70% of the design; React | Custom static frontend on the existing FastAPI app. Gradio stays for the leaderboard Space |
| GitHub Action | Part of the pitch | In no tier; `--fail-on` exists. `15-build-plan.md` T06, `05-pipeline.md` §11 | Core; stretch | Stretch, after the Tier 1 gate, demoed on one real pull request |
| Repo scraper and manifest | Paste a GitHub URL; build a circuit if none exists | Uploads and bundled examples on the platform; local repos in laptop mode only. `12-platform-ui-space.md` §1.2, D-023 | Scraper; spec intake | Spec intake for the demo. Public repo URLs for `.qasm` files later. No generated circuits |
| Regression message | Show it whenever a change makes the circuit worse | Not specified; the engine rejects worse candidates. `08-verification.md` §4 | Omit; every rejection; worse or stalled | Keep the text verbatim. Show it when the engine rejects a worse candidate or the stall rule fires |
