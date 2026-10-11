# Experiment — 20261011-real-score-hf-request

- **Question:** Can a real CPU qscore finding produce a schema-valid region request that the HF adapter consumes?
- **Why it matters:** The PR scoring path uses the engine, while the initial live HF smoke call used a hand-authored request. This checks the actual engine-to-proposer boundary in `10-improvement-loop.md` §§2–6.
- **Hypothesis:** A six-CZ chain yields D03 and an extracted seven-qubit request for `commutation_aware_routing`.
- **Where it ran:** macOS laptop, offline, environment cleared; Python 3.12.14, qscore 0.1.0, Qiskit 2.5.2, OpenAI SDK 3.28.0, httpx2 2.13.1. Engine source commit `26f08c8`.
- **Circuit provenance:** `circuit.qasm` is a small authored experiment, not a project fixture, benchmark, golden value, or reference-layer output.

## Method

From the worktree root:

```sh
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin qscore/.venv/bin/python lab/20261011-real-score-hf-request/build_request.py
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin qscore/.venv/bin/python lab/20261011-real-score-hf-request/consume_offline.py
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin qscore/.venv/bin/python lab/20261011-real-score-hf-request/propose_hf.py
```

`build_request.py` uses real engine APIs: manifest loading → `run_validation` → `score_item_compiled` → `build_requests`. It keeps the exact representative compiled circuit and layout returned by scoring. It writes the engine scorecard, compiled OpenQASM, generated request, and an experiment summary. The persisted request is reloaded against `ImprovementRequest` to check the consumer contract.

The manifest selects one CPU seed (11), the real `line-7` target, exact-unitary intent, region scope, no added ancillas, and only `commuting_reorder`. The compile remains the engine's specified optimization level 3; no compile override, fabricated finding, changed threshold, verifier, or improvement loop is used.

`consume_offline.py` passes the persisted engine-generated request to `HfLayer` using an injected SDK client and `httpx2.MockTransport`. It checks the exact pinned model, generated finding, QASM, and qubit map in the outgoing prompt. The mock response repeats the original region unchanged, so this demonstrates parsing and request/proposal identity only. Its synthetic token counts are not billing evidence. Unexpected transport operations fail immediately.

`propose_hf.py` defaults to offline preview. Only the root session may invoke `--live`, with its existing `HF_TOKEN` environment. The helper contains no credential, does not print the token, and bounds one logical request to three generation attempts and $0.10 of estimated reservation. Catalog requests are separate bounded operations. It saves proposals and call records without verification or acceptance.

## Results

- Engine scorecard: `scorecards/commuting_chain.json`, status **complete**.
- Representative seed: **11**; compiled two-qubit count: **6**.
- Actual findings: **D03#1** and **D05#1**.
- Generated request: `request.json`, id **commuting_chain/r1/D03#1**.
- Region: **logical**, qubits **0–6**, layers **0–5**, gate indices **0–5**.
- Served/permitted strategy: **commutation_aware_routing**.
- D05 builds no request because `block_resynthesis` is neither permitted nor enabled in this experiment; the reason is saved in `summary.json`.
- Offline adapter smoke: **one parsed schema-valid proposal** linked to that generated request; exactly one fake catalog GET and one fake generation POST. Details: `offline-smoke.json`.
- Default live-helper preview: passed, without credential access or network.
- Script Ruff and formatting checks: passed.
- Separate **root-session live check**, reported by the parent session: the generated `commuting_chain/r1/D03#1` request was submitted through the HF adapter to explicitly pinned **Qwen/Qwen3-Coder-30B-A3B-Instruct:scaleway**. It returned **one schema-valid, unverified proposal** in **one call**, with recorded estimated cost **$0.000379392**. Credentials and the live result remain outside git; this delegated run did not access them.

## Conclusion

The real scoring engine's output connects to the request builder and HF adapter contract. The request and region were generated from actual qscore computation rather than hand-authored request JSON.

The offline experiment establishes the engine-to-adapter contract, and the separate root-session live check establishes that the generated request also receives a real provider response. Neither establishes a verified rewrite, a measured improvement, an accepted candidate, a populated benchmark leaderboard, or an automatically invoked improvement workflow. No live inference was performed by this delegated run.

## Consequence

- [x] No spec change needed — the boundary contract holds.
- Code that should move to the product through a normal task with tests: a focused offline engine-to-adapter bridge regression, after independent review. The experiment scripts remain in `lab/`.
