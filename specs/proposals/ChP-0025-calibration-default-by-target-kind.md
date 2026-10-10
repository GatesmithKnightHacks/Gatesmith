# ChP-0025: Calibration default depends on the target kind

- **Status:** approved (user, 2026-10-10) — applied (code + 04 §2.2 text, 2026-10-10)
- **Class:** A (manifest defaults / resolution, 04 §2, ChP-0014, ChP-0021)
- **Author:** lead (from the slice audit 2026-10-10) · **Date:** 2026-10-10 15:10 UTC
- **Related tasks:** S5/M1 (manifest resolve) · **Blocks:** nothing (the case fails loudly today)

## 1. Summary
The built-in default `target: {backend: FakeTorino, calibration: from_backend}` (ChP-0021 item 5) is merged key by key (ChP-0014). A manifest that names a synthetic target (`line-N`, `grid-RxC`, `heavy-hex-D`) without `calibration` therefore inherits `from_backend`, which those targets cannot provide (05 §6.1: "none, unless the manifest supplies a calibration file").

## 2. Proposed change
### 2.1 Spec text (exact)
- `04` §2 comment on `calibration`, add: "Default: `from_backend` for named backends (e.g. `FakeTorino`), `none` for synthetic targets (`line-N`, `grid-RxC`, `heavy-hex-D`, custom); shown as '(default)' in the summary."
- ChP-0014 merge rules, add: "`target.calibration` is not inherited from the built-in defaults when the item or the manifest sets `target.backend`; it then takes the kind-based default above."

### 2.2 Implementation sketch
`manifest/resolve.py`: after merging, if `target.calibration` came from the built-in defaults and `target.backend` was set by the manifest or item, set calibration by kind. Keep the explicit `InvalidInput` [Q103] in `targets/registry.py` for an explicit `from_backend` on a synthetic target. `services.score_circuit` then drops its local rule and relies on resolve. Tests: a manifest with `defaults.target: {backend: line-5}` scores `complete` with reliability `unavailable` ("no calibration").

## 3. Justification
Reproduced in the slice audit (2026-10-10): `defaults.target: {backend: line-5}` → every metric failed (before the fix), now a Q103 error asking the user to add `calibration: none`.

## 4. Alternatives considered
| Option | Why not chosen |
|---|---|
| Make `target` atomic like `objective` | Also drops a manifest-level calibration file when an item overrides only the backend; bigger behaviour change |
| Keep the Q103 error | Correct but unfriendly for the commonest synthetic-target use |

## 5. Impact analysis
Contracts: none (values only). Score version: none (metric definitions unchanged). Fallbacks: none (deterministic default, shown as a default, not a switch after failure).

## 6. Risks and rollback
Revert the resolve rule; the registry's Q103 still guards the case.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I accept the changes"
