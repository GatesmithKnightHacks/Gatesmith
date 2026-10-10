# ChP-0002: Request/proposal contracts — layout transport, whole-circuit strategies, strategy id, privacy context

- **Status:** approved (spec text to apply)
- **Class:** A (contracts/schemas — must land before the G1 schema freeze)
- **Author:** lead (from Codex review F-02, F-03, F-16, F-39) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T01, T16, T23, T24, T25 · **Blocks:** T01 (`schemas/improvement.py`)
- **Decision needed by:** before T01 (~hour 1), because schemas freeze at G1

## 1. Summary
The request/proposal schemas cannot carry what the verifier and loop need: compiled proposals have no layout (OpenQASM loses `TranspileLayout`), whole-circuit strategies (`layout_search`, `noise_aware_layout`, `routing_search`) contradict the example's `scope: region`, proposals carry no strategy id (acceptance rule 1 is uncheckable), and the `hf` privacy guard has no privacy data in the request.

## 2. Proposed change
### 2.1 Spec text (exact)
- `04-contracts.md` §5 Proposal — add fields:
  > `"strategy": "<strategy id from §2.3>"` (required; must be one of the request's `permitted_strategies`);
  > `"candidate.layout"`: required when `candidate.scope` is `whole` and the request's circuit is compiled: `{"num_virtual": int, "num_physical": int, "initial": [physical index per virtual qubit], "final": [physical index per virtual qubit after routing]}`. Validated: lengths = `num_virtual`, entries unique and `< num_physical`. The verifier rebuilds a `TranspileLayout` from it; a compiled whole-circuit candidate without it is a parse failure.
- `04-contracts.md` §4 Request — add:
  > `"permitted_strategies": [...]` (the strategy ids the layer may use, derived from `permitted.changes` ∩ the finding's strategies); `"privacy": {"external_inference": bool, "send_region_only": bool}` copied from the resolved item (the `hf` layer's guard reads this field).
  > `circuit.scope` rule — Before: "`circuit.scope` is `region` unless the manifest says `permitted.scope: whole`." After: "`circuit.scope` is `region` unless the manifest says `permitted.scope: whole` **or** the request's strategies are all whole-circuit strategies (`layout_search`, `noise_aware_layout`, `routing_search`), which re-place/re-route the whole compiled circuit and always get `scope: whole` with the logical circuit plus the representative layout. `permitted.scope` governs region-rewrite strategies only. Whole-circuit requests never go to the `hf` layer while `send_region_only: true`."
- `08-verification.md` §4 rule 1: "Its `strategy` field names a strategy in the request's `permitted_strategies`; `check_permitted` additionally enforces that strategy's structural contract (layout/routing strategies: logical circuit unchanged after `to_virtual` reduction modulo routing SWAPs; region strategies: nothing outside the region changed; `reversible_rewrite`: gate set ⊆ {x, cx, ccx, swap})."

### 2.2 Implementation sketch
`schemas/improvement.py`: `Proposal.strategy`, `CandidateLayout`, `ImprovementRequest.permitted_strategies`, `.privacy`. `verify/reduce.py`: `layout_from_payload()`. `improve/requests.py`: scope decision per strategy group.

## 3. Justification
- OpenQASM 3 export carries no `TranspileLayout`; `08` §2 requires the layout for `to_virtual` ("Never compare a compiled circuit by guessing the permutation").
- `04` §2 example item `packing_qaoa_p2` permits `layout, routing` with `scope: region`; `10` §4 says those handlers output "Whole (compiled)" — contradictory as written (F-03), and T24's acceptance (a D01 proposal on that item) depends on it.
- `08` §4 rule 1 needs the proposal's strategy; `04` §5 has none (F-16).
- `10` §5 guard reads `privacy.external_inference` "for the item"; the layer only receives the request (F-39).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec | — | D01 demo path cannot be built consistently | Blocks G4 |
| Transport QPY instead of QASM for compiled candidates | Keeps full layout | Model layers cannot emit QPY; two formats | Layout block is simpler |
| Change the example to `scope: whole` | One-line | Sends whole circuits to model layers for region strategies too | Loses region-only benefit |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | +~20 min in T01; small changes in T16/T24/T25 |
| Contracts / stored data | `qscore.request/v0.2`, `qscore.proposal/v0.2` gain fields (pre-freeze; no migration needed since nothing is stored yet) |
| Other specs | `04` §4–5, `08` §4, `10` §2/§4/§5, `16`/prompts mention of strategy field |
| Modules | `schemas/improvement.py`, `improve/requests.py`, `verify/reduce.py`, `verify/permitted.py`, `improve/openai_compat.py` |
| Tests and golden values | Contract examples updated; new parse-failure test (missing layout); no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | Makes the D01→`reference-qiskit` demo step consistent |
| Cost | none |

## 6. Risks and rollback
Model layers may omit `strategy`/`layout` → parse failures, which is correct behaviour and visible in parse rates. Prompts must include the fields.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
