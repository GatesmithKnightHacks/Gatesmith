# ChP-0014: Merge semantics for defaults → profile → item

- **Status:** approved (spec text to apply)
- **Class:** A (manifest contract)
- **Author:** lead (from Codex review F-38) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T01, T07 · **Blocks:** T07 (`resolve.py`), affects `item_sha256`
- **Decision needed by:** before T07

## 1. Summary
"defaults → profile → item" gives precedence but not whether nested mappings merge or replace and whether lists replace or concatenate. Example: does `sbox_oracle`'s `objective: {primary: toffoli_count, direction: minimize}` keep the default `constraints` (`two_qubit_depth`, `reliability_heuristic` vs baseline) or drop them? The answer changes acceptance decisions and item hashes.

## 2. Proposed change
### 2.1 Spec text (exact)
Add to `04` §2:
> **Resolution:** mappings merge recursively key by key (later wins per key); **lists and scalars replace** (no concatenation), with two exceptions: `diagnose.ignore` concatenates (defaults first) and `objective` is **atomic** — an item that sets `objective` replaces the whole default objective (primary, direction, constraints, report). `origin_of(field)` reports the source of each leaf. The interpretation summary lists each replaced default. **Addendum (ChP-0028):** `target.backend` and `{coupling_map, basis_gates}` are alternatives — a layer that sets one removes the other inherited from earlier layers.

So `sbox_oracle` resolves with no constraints and empty `report` (it states its own objective).

### 2.2 Implementation sketch
`manifest/resolve.py`: `deep_merge(base, over, atomic={"objective"}, concat={"diagnose.ignore"})`.

## 3. Justification
`03` §3.3 `resolve_items` "(defaults → profile → item)" only; the `04` §2 example relies on an unstated rule (F-38). A two-qubit-depth constraint on a reversible `toffoli_count` objective is very likely unintended — making `objective` atomic avoids it.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Pure recursive merge everywhere | Uniform | sbox inherits 2q-depth/reliability constraints | Surprising acceptance |
| Item replaces whole top-level blocks | Simple | Must repeat every execution setting per item | Verbose manifests |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none |
| Contracts / stored data | Resolution rule (affects `item_sha256` definition; nothing stored yet) |
| Other specs | `04` §2, `03` §3.3 |
| Modules | `manifest/resolve.py`, `interpret/summary.py` |
| Tests and golden values | Resolution tests incl. sbox objective; no golden values |
| Score version | none |
| Fallback registry | none |
| Architecture | none |
| Sponsor tracks / demo | sbox demo acceptance uses toffoli_count only |
| Cost | none |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
