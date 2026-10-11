# ChP-0034: Export each item's final compiled circuit as OpenQASM 3

- **Status:** approved (spec text to be applied with implementation)
- **Class:** A (output contract: run record schema version, new output files)
- **Author:** lead · **Date:** 2026-10-10
- **Related tasks:** T09 follow-on, S5 record stage · **Blocks:** nothing
- **Decision needed by:** before the repository-link demo (ChP-0035), so a researcher can take the scored circuit away

## 1. Summary
Each confirmed scoring run writes the **representative compiled circuit** for every item (the
circuit the scorecard's compiled metrics describe: chosen seed, item's target) as OpenQASM 3 at
`<out>/compiled/<item_id>.qasm`, with a comment header that records what the bare QASM cannot.
The run record lists every exported file with its hash. This replaces ChP-0029's "no QASM export
from builders" note.

## 2. Proposed change
### 2.1 Spec text (exact)

**A. `05-pipeline.md` §9, append after "Never:" line**
- Before: (no export rule)
- After:
  > **Compiled circuit export (ChP-0034).** For every item with a representative compile, write
  > `compiled/<item_id>.qasm` under the output directory: `qiskit.qasm3.dumps` of the
  > representative compiled circuit, preceded by `//` comment lines giving the qscore version,
  > score version, item id, item_sha256, target name and `num_qubits`, transpiler seed,
  > optimization level, the initial layout (virtual → physical) and the final positions of the
  > virtual qubits (`final_index_layout`), each as JSON on one line. OpenQASM 3 does not carry a
  > layout or the device width: a reloaded file has only as many physical qubits as its highest
  > index uses. The file is the exact circuit scored; it is not re-optimized, re-routed or
  > rewritten. Items without a representative (`representative_seed: null`) get no file; the
  > run record says why. An exporter error raises `RecordError` naming the item (exit 3) after
  > that item's scorecard is written; it is never replaced by QASM 2, QPY or a partial file. The
  > write is atomic.

**B. `04-contracts.md` §13 run record → `qscore.run/v0.3`**
- Before: `"scorecards": [{"item_id": …, "path": "scorecards/sbox_oracle.json", "sha256": "…"}],`
- After: same, plus
  > `"compiled": [{"item_id": "sbox_oracle", "path": "compiled/sbox_oracle.qasm", "sha256": "…", "seed": 37}]`
  > and `"compiled_skipped": [{"item_id": "…", "reason": "no representative compile (objective metric failed)"}]`.
  > Rules row: `compiled[]` — `path` relative to the output directory; `sha256` hashes the file
  > bytes; `seed` equals the scorecard's `compile.representative_seed`. v0.2 → v0.3 migration adds
  > empty lists.

**C. `05-pipeline.md` §11, `qscore score` row, append**
  > Writes `<out>/compiled/<item_id>.qasm` per item (§9, ChP-0034). In single-file and stdin mode
  > the export is written too and its path is printed with the report.

**D. `04-contracts.md` §1 schema table:** `qscore.run/v0.2` → `qscore.run/v0.3`.

### 2.2 Implementation sketch
- `record/export.py` (new, pipeline layer): `export_compiled(ctx, out_dir) -> CompiledExport`
  builds the header from the `CompiledResult` (seed, layout via `circuit.layout.initial_index_layout()`
  and `final_index_layout()`), calls `qasm3.dumps`, writes atomically, returns path + sha256.
- `services._score`: call after each scorecard write; collect `compiled`/`compiled_skipped` into
  the run record. `schemas/run.py`: v0.3 model + migration; `schemas/versions.py` bump.
- No new dependency (`qiskit.qasm3` exporter is part of Qiskit; the loader `qiskit-qasm3-import`
  is already a dependency).

## 3. Justification (evidence, not opinion)
- User request 2026-10-10: "allow for qasm export of the final circuit"; lead recommendation
  (compiled, per target, the circuit the scorecard describes) accepted by the user.
- Check run 2026-10-10 (qiskit 2.5.2, FakeTorino, GHZ-4, seed 11, opt 2): `qasm3.dumps` succeeded
  (`OPENQASM 3.0; include "stdgates.inc"; rz(pi/2) $80; …`, physical `$n` qubits); `qasm3.loads`
  reproduced identical op counts but **100 qubits instead of 133 and no layout** — hence the
  header. `qasm2.dumps` is not used: OpenQASM 3 is the format Qiskit's own exporter targets and
  that IBM tooling reads; the improvement requests (05 §9) already ship OpenQASM 3.
- `ScoringContext.representative` (`score/context.py:71`) already holds the compiled circuit at
  record time; no recompilation is needed.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec (no export) | Nothing to build | Researcher cannot take the scored circuit away | User asked for it |
| Export the logical (pre-compile) circuit | Device-independent | Not what the scores describe; builder output is already reproducible from the manifest | User accepted the compiled recommendation |
| Export every seed | Full record | 8× files, most never used | Representative is the one the card reports |
| QPY instead of QASM | Lossless incl. layout | Binary, Qiskit-version-bound (Q306) | Researcher asked for QASM; QPY could be added later |
| Layout as a sidecar JSON | Machine-friendly | Two files to keep together | Header keeps the file self-describing; run record carries hashes |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | Additive to the signed-off CPU MVP; no metric or diagnostic change |
| Gates and timeline (hours) | ~2–3 h incl. tests; no gate affected |
| Contracts / schemas / stored data (Neon, Hub) | `qscore.run/v0.3` (identity migration + empty lists). Scorecard unchanged. Neon/Hub: none now; Hub export of the file is a later decision |
| Other specs and sections that must change | 04 §1, §13; 05 §9, §11; ChP-0029 note superseded; progress Ideas line |
| Modules and public functions | new `record/export.py`; `services._score`; `schemas/run.py`, `schemas/versions.py` |
| Tests and golden values | New tests: header fields, round-trip op counts, skipped item, exporter error → RecordError, run record hashes, v0.2→v0.3 migration. Golden values: none changed |
| Score version (metrics/thresholds) | none |
| Fallback registry | none (no QASM2/QPY substitution; FB-07 untouched) |
| Overall architecture (hosts, data flow, security) | One more local file per item; no new service or network |
| Sponsor tracks / demo | Repo link → score → take away the compiled circuit |
| Cost (GPU credits, HF credits, time) | none beyond dev time |

## 6. Risks and rollback
- Exporter limits (custom gates, `delay`, dynamic circuits) raise `RecordError` visibly; Q406
  already rejects dynamic circuits in the MVP.
- Very wide targets produce long files (one line per op): acceptable, size bounded by the circuit.
- Rollback: stop writing `compiled/`, keep v0.3 records readable (lists simply empty).

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved ("I approve")
- Applied to specs in: not applied · CHANGELOG line added: no
