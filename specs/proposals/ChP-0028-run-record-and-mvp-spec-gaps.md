# ChP-0028: Run record `run.json`, and the MVP spec gaps found in the M4 audit

- **Status:** approved (user, 2026-10-10) — applied (spec text + code)
- **Class:** A  (new contract `qscore.run/v0.1`, scorecard `x-` fields, issue catalog, manifest resolution; 00-operating-rules.md R5)
- **Author:** lead · **Date:** 2026-10-10 19:10 UTC
- **Related tasks:** M3, M4 · **Blocks:** G-MVP sign-off (items 1 and 2 change outputs; items 3–9 only align specs with built behaviour)
- **Decision needed by:** G-MVP. Each item can be approved or rejected on its own.

## 1. Summary
The M4 spec-auditor pass (progress-log 2026-10-10 18:45) found places where the built engine does something the specs do not define, or where two approved specs disagree. Item 1 implements the user's audit decision #10 (a run record), which needs a contract. Items 2–9 resolve each gap by writing the built behaviour (or a fix) into the spec.

## 2. Proposed change

### Item 1 — Run record `<out>/run.json` (`qscore.run/v0.1`), user decision #10
- **Spec (04 §1 table, new §13):** add `qscore.run/v0.1` · `RunRecord` · Internal.
  > A run record is written once per scoring run at `<out>/run.json`:
  > `{schema, run_id, qscore_version, score_version, manifest_sha256, confirmation: {mode, at, manifest_sha256}, interpretation: <full summary text>, scorecards: [{item_id, path (relative to out), sha256}], status: complete|partial|failed}`.
  > `confirmation.mode` uses the Neon values (11 §1): `interactive | yes_flag | stored`.
- **Spec (05 §5):** "stored in the run record" → "stored in the run record (`run.json`, 04 §13)". Add: "`services` takes `confirm` as a **required** keyword: a callback (interactive) or the literal `yes` (`--yes`); there is no silent default."
- **Spec (04 §3, scorecard `x-` keys):** each scorecard keeps only its own item's interpretation (`x-interpretation`, that item's lines), plus `x-run: {run_id, manifest_sha256, confirmation_mode}`. `x-confirmation` with the full summary in every card is removed. So a card shared on its own still describes itself, and the run-wide record is not repeated in every card.
- **Implementation:** new `schemas/run.py::RunRecord` plus an exported JSON schema (contract drift test); `services._score` writes `run.json` last. `render_text` returns per-item blocks. `confirm: Confirm | Literal["yes"]` becomes keyword-only and required, and the CLI passes `"yes"` for `--yes`. The current code records `mode: "yes"`, which is not a Neon value; that is fixed here.

### Item 2 — Budget skip reason records what tripped it, user decision #4
- **Spec (04 §3 `metrics[]`, 06 §1 `selection.py`):** reason `budget` → "`budget: <elapsed> s >= wall_time_s <limit>` (wall time is not reproducible, so the reason records it)". The other reason values stay as they are.
- **Implementation:** already in the working tree (`score/engine.py`; test `test_budget_records_skipped_metrics`). If rejected, revert to the literal `budget`.

### Item 3 — `compile` when there is no representative (audit #3)
- Today: if choosing the representative fails (for example a user-chosen objective metric raises), the scorecard has `compile: null`, so the per-seed compile results, which were computed, are lost.
- **Spec (04 §3):** `compile.representative_seed` becomes nullable: "`null` when no representative could be chosen (the objective metric failed); `per_seed` is still recorded". This is a new optional meaning, so it is a minor bump: `qscore.scorecard/v0.3`, with a `migrate()` that is the identity.
- **Alternative:** keep as is (`compile: null`). Per-seed data stays lost, but there is no contract change.

### Item 4 — Calibration for custom targets: ChP-0009 vs ChP-0025 conflict
- 05 §6.1 (custom row) and ChP-0009 say: no file → "uniform default errors labelled `assumed`" (1e-3 / 1e-2 / 2e-2). ChP-0025 (applied later) says the default is `none` for synthetic **and custom** targets. The code follows ChP-0025: `calibration_assumed` is always `false`, and reliability metrics are `unavailable` ("no calibration").
- **★ Proposed:** follow ChP-0025. 05 §6.1 custom row: "optional `{file}`; otherwise `none` (reliability metrics `unavailable`)". The ChP-0009 assumed-error numbers are withdrawn. `calibration_assumed` stays in the schema (always `false` in the MVP) for the final product.
- **Alternative:** implement the assumed defaults. Reliability values then exist, but they rest on numbers we made up, much like a fallback (R3).

### Item 5 — Basis of the user-named `all-to-all` target
- 05 §6.1 lists `all-to-all` but no basis. The code uses `cx, rz, sx, x` (the same as `line-N` and `grid-RxC`; `heavy-hex-D` uses `cz`).
- **Spec (05 §6.1):** add "basis `cx, rz, sx, x`" to the all-to-all row. This is separate from the routing *reference* (06 §6), which always copies the item target's basis.

### Item 6 — Extra parameter names → Q207
- 05 §4 says only that missing names are Q305. The code rejects names in the parameters file that the circuit does not have as **Q207** "unknown parameters: …", because a typo there would otherwise leave a parameter silently at the wrong value.
- **Spec (05 §4, §12 Q207 row):** "Parameters file invalid (unreadable, non-numeric values, or names the circuit does not have)".

### Item 7 — Item hash includes the calibration file
- 04 §2.5 hashes the source, parameters and observable files. The code also hashes `target.calibration.file`, because editing that file changes the scores, so the old scorecard must count as stale.
- **Spec (04 §2.5):** "… + sha256(parameters/observable/calibration file bytes)".

### Item 8 — Target fields are one-of when merging (ChP-0014 addendum)
- With key-by-key merging, an item that sets `coupling_map + basis_gates` over the default `backend: FakeTorino` would end up with both, which is invalid (Q103). The code treats them as alternatives: setting either custom field drops the inherited `backend`, and setting `backend` drops inherited custom fields. `calibration` keeps merging per ChP-0025.
- **Spec (ChP-0014 resolution, 04 §2 merge note):** add "`target.backend` and `{coupling_map, basis_gates}` are alternatives: a layer that sets one removes the other inherited from earlier layers."

### Item 9 — Q208 missing from the issue catalog
- The code raises **Q208** "Calibration file invalid" (unreadable, wrong schema id, out-of-range or unknown qubits). 05 §12 has no Q208 row, yet the code and the broken fixture `examples/broken/Q208_bad_calibration/` use it. (The generated `validate/catalog.py` named by 05 §12 does not exist yet; codes are string literals at their raise sites.)
- **Spec (05 §12):** add `| Q208 | error | Calibration file invalid (schema qscore.calibration/v0.1, ChP-0009) |`.

## 3. Justification (evidence)
- spec-auditor report over `6eeb440..working tree` (progress-log 2026-10-10 18:45): items #3, #10, #14 and the "spec gaps" list.
- User decisions recorded on 2026-10-10 (handoff §2.2): #4 keep the wall-time budget skip but record the elapsed time and the limit; #10 "choose what's best for researchers" → run record plus per-card `x-run`.
- Code: `manifest/resolve.py::merge` (item 8), `::item_hash` (item 7), `targets/registry.py` CX_BASIS (item 5), `intake/loaders.py::bind_parameters` (item 6), `targets/calibration.py::apply_file` (item 9), `services._score` (item 1).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is | no spec edits | specs and code disagree in 8 places; the confirmation is copied into every card; Neon mode mismatch | violates R1 |
| Split into nine ChPs | finer tracking | nine prompts for small, related edits | one ChP, per-item approval |
| Item 1: keep `x-confirmation` in every card, no run record | no new contract | repeated, non-standard mode value; 05 §5 names a run record that doesn't exist | user chose the run record |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none (all within the MVP engine) |
| Gates and timeline (hours) | items 1+3 ≈ 1–1.5 h code + tests; items 2, 4–9 ≈ spec text only (code is already built) |
| Contracts / schemas / stored data (Neon, Hub) | new `qscore.run/v0.1`; scorecard `x-` keys change (allowed by 04 §1); item 3 → `qscore.scorecard/v0.3` (nullable field). Neon: `confirmed_mode` values now match. Nothing stored yet, so no migration of data |
| Other specs and sections that must change | 04 §1, §2 merge note, §2.5, §3, new §13; 05 §4, §5, §6.1, §12; 06 §1; ChP-0014 addendum; ChP-0009 status note |
| Modules and public functions | `schemas/run.py` (+RunRecord), `services.py` (`confirm` required, writes run.json), `interpret/summary.py` (per-item blocks), `cli.py` (`"yes"`), `score/engine.py` (item 3), `schemas/scorecard.py` (item 3) |
| Tests and golden values | new contract schema export + drift test; e2e asserts run.json; unit test for item 3. Golden values untouched |
| Score version (metrics/thresholds) | none |
| Fallback registry | none (item 4 explicitly avoids invented calibration) |
| Overall architecture (hosts, data flow, security) | none |
| Sponsor tracks / demo | the demo gains a run record to show; no change to the flow |
| Cost (GPU credits, HF credits, time) | none / none / ≈ 1.5 h |

## 6. Risks and rollback
Item 1 changes the output layout (a new file, slimmer cards). Rollback: drop `run.json` and restore `x-confirmation`. Item 3 bumps the scorecard minor version; rollback is the reverse bump (the identity migration). Items 2 and 4–9 are documentation of built behaviour; rejecting any of them means a code change back to the old spec text.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved (all items) · Notes: item 1 merged with the already-approved ChP-0004 `RunRecord`: the schema id is `qscore.run/v0.2` (not v0.1) with ChP-0004's fields (`job_id`, `command`, `items`, `settings_profile`, `fallbacks_*`, `started_at`/`finished_at`, `exit_code`, `provenance`) plus this proposal's `interpretation` and `scorecards[].sha256`; `exit_code` is `null` from the CLI (flags applied afterwards); `provenance` is run-wide (qscore, score version, git, lock, python, qiskit). Audit follow-up: custom `basis_gates` rules (distinct standard gates, no measure/reset/delay → Q103) written into 04 §2.2 / 05 §6.1; 02 failure-modes table also updated for the budget reason.
- Applied to specs in: working tree 2026-10-10 (uncommitted, user rule) · CHANGELOG line added: yes
