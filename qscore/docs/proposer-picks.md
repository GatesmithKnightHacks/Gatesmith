# Proposer picks for the improvement loop

> **For:** teammates and agents building the improvement loop (specs/10, tasks T24–T26).
> **Status:** research and recommendations, not spec. Anything that adds a dependency, changes a default,
> or enables a fallback still needs a change proposal (R5). Researched 2026-10-10.

Qiskit's own optimizer (`reference-qiskit`) always runs, so everything here is an addition, not a
dependency. Every proposer answers the same requests, is checked by the same exact verifier, and lands
on the same leaderboard.

## Constraints these picks respect

- One Radeon PRO W7900 (48 GB). The local model gets about 40% of its memory, shared with the simulator and verifier.
- The GPU machine is a notebook: outbound internet only, no inbound access.
- Proposals must pass exact equivalence verification and parse as JSON; anything else counts as a failure, never repaired.
- Hosted inference is off per circuit by default (`privacy.external_inference: false`) and sends only the targeted region when on.
- Costs come out of the event's Hugging Face credits; outputs go into a public dataset, so licenses must allow that.

## AI models

| # | Model | Layer | Status |
|---|---|---|---|
| 1 | `openai/gpt-oss-120b` | `hf` (Hugging Face Inference Providers) | Usable now, no spec change |
| 2 | `Qiskit/granite-3.3-8b-qiskit` | `local` (vLLM on the W7900) | Usable now, spec default (D-016) |
| 3 | `openai/gpt-oss-20b` | `local` (llama.cpp on the W7900) | Needs FB-02 and a change proposal against D-016 |

### 1. `openai/gpt-oss-120b`: main AI proposer

- **Verified OpenQASM: 81.2%** on QEncodeBench L3, the best open model (best closed model: 83.1%).
- Reasoning model, which is what verified circuit work needs. Supports structured JSON output, so proposals
  parse against `qscore.proposal/v0.2`. Apache 2.0.
- Cost from about $0.04 in / $0.17 out per million tokens, roughly a tenth of a cent per proposal.
  Fast providers (Groq, Cerebras) help with the 60 s layer timeout.
- Needs `HF_TOKEN` with Inference Providers permission on the AMD worker, and `external_inference: true`
  on the demo circuits. The specs leave the `hf` model choice open (10 §5), so no proposal is needed;
  pin the id in `improve/models.yaml`.

### 2. `Qiskit/granite-3.3-8b-qiskit`: local proposer (the specs' choice)

- IBM's Qiskit-tuned model. Fits vLLM's 40% GPU memory share with no fallbacks.
- Covers the AMD track ("open model running on AMD hardware") and works for every circuit, since nothing
  leaves the machine.
- No reasoning mode: expect few proposals to pass exact verification. That is a valid leaderboard result.
- Needs vLLM started and warmed up on the W7900 each GPU session (T17). The model is public, so no token.

### 3. `openai/gpt-oss-20b`: upgrade for the local layer

- **Verified OpenQASM: 68.8%** on QEncodeBench L3, second-best open model. Small enough for the 48 GB card.
- vLLM's MXFP4 path is broken on the W7900 (gfx1100, vLLM issue #33906), so it must run on llama.cpp,
  which is fallback FB-02. Test it in `lab/` first (R6.4).

### Worth a leaderboard row: `Qiskit/mistral-small-3.2-24b-qiskit`

The strongest quantum-specialized model: IBM's newest, trained on Qiskit 2.1, 32% on Qiskit
HumanEval-Hard versus Granite's 15%. No reasoning mode, and at 24B it needs the GGUF build on llama.cpp
(FB-02). Racing it against gpt-oss answers a good question for the Hugging Face track: do small domain
models beat a big general reasoner at verified fixes?

### Settings to change for reasoning models

1. Raise `max_tokens` from the spec default of 2048 to about 8,000–16,000, or reasoning eats the answer
   and it counts as a parse failure.
2. Use a fast provider or "medium" reasoning effort to stay inside `layer_timeout_s` (60 s).
3. Pin exact model ids in `improve/models.yaml` and record them on every attempt; router catalogs and
   prices change.

## The tools researchers already use (non-AI layers)

Deterministic optimizers that working researchers run today. Wrapping existing tools, rather than writing
our own optimizer, is how the specs intend the loop to work (01 §9).

| | Tool | Role | Status |
|---|---|---|---|
| A | `qiskit-ibm-transpiler` | IBM's AI transpiler passes, run locally; extends `reference-qiskit` | Already named in the specs (10 §4) |
| B | `pytket` | Quantinuum's TKET compiler; an independent second compiler | New dependency: change proposal |
| C | `mqt.qmap` | Munich Quantum Toolkit mapper; exact routing and Clifford synthesis | New dependency: change proposal |

### A. `qiskit-ibm-transpiler`

- Reinforcement-learning passes for routing (`AIRouting`) and for re-synthesizing Clifford, linear-function,
  permutation and Pauli-network blocks. Since early 2026 they run fully locally on CPU, with the models
  downloaded from Hugging Face.
- Fits `block_resynthesis`, routing, and rule D05 (Clifford/linear blocks of 3–9 qubits). Lowest effort:
  same ecosystem as the engine, output is a Qiskit circuit.

### B. `pytket` (TKET)

- `FullPeepholeOptimise` (Clifford simplification, squashing 1–3 qubit subcircuits) plus its own routing.
  In the Benchpress study, TKET beat Qiskit on two-qubit depth overall, most on well-connected layouts.
- A genuine second opinion rather than Qiskit with different settings.
- Known bug: it can drop implicit qubit permutations when converting back to Qiskit/OpenQASM 3. Our
  verifier would reject those candidates rather than accept them; prefer region-scope use without routing at first.

### C. `mqt.qmap`

- Gate-optimal mapping via SAT/SMT solving for small circuits, A*-search mapping for larger ones, and
  depth- or gate-optimal Clifford synthesis. Actively released (3.10.0, September 2026).
- Our region requests are small convex blocks, which is exactly where exact mapping is feasible: it can
  prove no better routing exists for that region. The engine already depends on MQT QCEC.
- Exact mode grows quickly with qubit count; cap it to small regions with a timeout inside
  `layer_timeout_s` and use the heuristic mode beyond that.

### Already inside Qiskit (no new dependency)

- **Rustiq Pauli-network synthesis** (`PauliEvolution.rustiq` plugin, in Qiskit since 1.3): the synthesis
  QAOA and Hamiltonian-simulation researchers use for commuting cost layers. Fits rule D03 and
  `commutation_aware_routing`, if the QAOA cost layer is expressed as a `PauliEvolutionGate`.
- **`TemplateOptimization`** with Toffoli/CNOT templates: classic template matching for reversible circuits,
  staying inside the x/cx/ccx gate set. A natural upgrade for the S-box example's `reversible_rewrite`.

### Considered and left out for now

- **BQSKit:** strong numerical resynthesis, but results match only to a tolerance, which conflicts with
  `approximation: none`. Last release 1.2.1 (August 2025).
- **2QAN, Paulihedral:** the QAOA research baselines, but research code rather than maintained packages.
- **PyZX:** strong on T-count, weaker on two-qubit count, and it leaves the x/cx/ccx gate set the S-box requires.
- **QUESO, Quartz:** strong superoptimizers, but research code.

## Suggested order

1. Rustiq + `TemplateOptimization` in `reference-qiskit`: no new dependencies.
2. IBM's AI transpiler passes: already anticipated in the specs.
3. `gpt-oss-120b` (hosted): the AI proposer.
4. TKET and MQT QMAP: extra comparison rows, each needing a change proposal for the new dependency.

## Sources

The benchmarks measure building verified circuits, which is close to our task (rewriting a region) but
not identical; the loop's compatibility kit gives the real answer.

- [QEncodeBench (arXiv 2609.20319)](https://arxiv.org/html/2609.20319v1)
- [Hugging Face router catalog](https://router.huggingface.co/v1/models)
- [Qiskit LLMs collection](https://huggingface.co/collections/Qiskit/qiskit-llms)
- [Qiskit/mistral-small-3.2-24b-qiskit](https://huggingface.co/Qiskit/mistral-small-3.2-24b-qiskit)
- [vLLM MXFP4 on W7900 bug (#33906)](https://github.com/vllm-project/vllm/issues/33906)
- [gpt-oss on llama.cpp](https://github.com/ggml-org/llama.cpp/discussions/15396)
- [QASM-Eval (arXiv 2605.30358)](https://arxiv.org/html/2605.30358)
- [Benchpress (Nature Computational Science)](https://www.nature.com/articles/s43588-025-00792-y)
- [AI transpiler passes](https://quantum.cloud.ibm.com/docs/en/guides/ai-transpiler-passes)
- [qiskit-ibm-transpiler release notes](https://quantum.cloud.ibm.com/docs/en/api/qiskit-ibm-transpiler/release-notes)
- [TKET compilation](https://docs.quantinuum.com/tket/user-guide/manual/manual_compiler.html)
- [TKET permutation bug](https://github.com/oqtopus-team/tranqu/issues/77)
- [MQT QMAP](https://mqt.readthedocs.io/projects/qmap/en/latest/)
- [mqt-qmap 3.10.0](https://pypi.org/project/mqt-qmap/3.10.0/)
- [Rustiq synthesis plugin](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.transpiler.passes.synthesis.hls_plugins.PauliEvolutionSynthesisRustiq)
- [TemplateOptimization](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.transpiler.passes.TemplateOptimization)
- [BQSKit on PyPI](https://pypi.org/project/bqskit/)
- [2QAN](https://dl.acm.org/doi/10.1145/3470496.3527394)
- [PyZX FAQ](https://pyzx.readthedocs.io/en/latest/faq.html)
