# ChP-0029: Deterministic manifest drafting: picking, values and ranges, a values file, call-site suggestions, notebook listing

- **Status:** approved
- **Class:** A (CLI surface, new input document `qscore.values/v0.1`)
- **Author:** lead · **Date:** 2026-10-10 20:10 UTC
- **Related tasks:** T09 · **Blocks:** T09 (discover/draft extensions)
- **Decision needed by:** before T09 is delegated (now)

## 1. Summary
A user gives qscore a path (a file or a folder) and gets a draft manifest with **no LLM involved**. Static analysis (`ast` only) lists the candidate circuits; the user picks which ones to include. Unknown argument values are typed in at a prompt or supplied in a values file. The prompt and the file accept a single value or a range, and a range becomes the item's `size_sweep`. Values found at literal call sites are offered as suggestions. Notebooks are listed, but only as "convert first", not as scorable sources.

## 2. Proposed change
### 2.1 Spec text (exact)
- **File/section: `specs/05-pipeline.md` §1, append after "Done when":**
  > - **Notebooks (ChP-0029):** `.ipynb` files are read as JSON. Code cells are joined; lines starting with `%` or `!` are dropped. The same `ast` scan runs on the result, and candidates are listed with `source_kind: notebook`. They cannot be drafted or scored: discovery prints the next step, `jupyter nbconvert --to script <file>.ipynb`, after which the `.py` is discovered normally. `--draft` on a notebook candidate is an error (Q103).
  > - **Call-site suggestions (ChP-0029):** for each builder, literal keyword or positional arguments at call sites in the same file are recorded as suggestions, with the source line. Literal means an int, float, str, bool or None constant, or a unary minus applied to one. Call sites are searched in the `if __name__ == "__main__":` block, at module level, and in `tests/**/test_*.py` under the root. Suggestions are never applied silently: the prompt shows them, and `--no-input` writes them as the value with a `# suggested from <file>:<line>` comment.
- **File/section: `specs/05-pipeline.md` §2, replace "Does" with:**
  > - **Does:** writes `qscore.yaml` entries for the candidates the user picks (`--pick 1,3` by list number or `--pick build_qaoa` by function name; without `--pick`, an interactive numbered prompt). It fills arguments in this order: signature default → values file (`--values FILE`, `qscore.values/v0.1`, 04 §14) → interactive prompt (unless `--no-input`) → literal call-site suggestion (only with `--no-input`) → `<required>` placeholder (later Q107). It also writes `exact_unitary` invariants and the suggested sweeps, each with a comment saying where the value came from (`default`, `values file`, `entered`, `suggested from <file>:<line>`, `required`).
  > - **Values and ranges:** a value is a YAML scalar. A range is `a..b` (inclusive, step 1), `a..b..s`, or a list `[a, b, c]`. Ranges are for int arguments only, and a range becomes `size_sweep: {arg, values}` with `args.<arg>` set to the first value. At most one argument per item may have a range; a second one is Q103. A typed value is checked against the annotation when there is one (`int`, `float`, `bool`, `str`); a mismatch is Q102 and is never coerced.
- **File/section: `specs/05-pipeline.md` §11, `discover` row → Notes:**
  > Prints candidates; `--draft` writes `qscore.yaml.draft` (or `qscore.yaml` when none exists). Draft flags: `--pick`, `--values FILE`, `--no-input` (ChP-0029). Exit 2 on invalid values or picks.
- **File/section: `specs/04-contracts.md`, new §14 + one row in §1:**
  > ## 14. Draft values `qscore.values/v0.1` (ChP-0029)
  > ```yaml
  > schema: qscore.values/v0.1
  > builders:
  >   src/packing/qaoa.py::build_qaoa:       # same reference format as source.builder
  >     args: {rotamers: 3, p: 2}             # scalars only
  >     sweep: {n_residues: "2..6"}           # at most one key; range string or int list
  > ```
  > Unknown top-level or per-builder keys → Q101; a parse error → Q100; a non-scalar arg → Q102; a bad range string → Q103; a key that matches no discovered builder → Q202; an argument not in the signature → Q203; a sweep argument not in the signature → Q204. Every issue is located in the values file (line:column). The file is only read by `discover --draft`; it never takes part in scoring and is not part of the item hash.
- **File/section: `specs/03-code-structure.md`, `intake/discover.py` and `intake/draft.py` rows:** add `scan_notebook(path)` and `call_site_suggestions(tree, func_name)` to discover; to draft add `load_values(path) -> DraftValues`, `parse_range(text) -> list[int]` and `resolve_args(candidate, values, prompt) -> ResolvedArgs`. The prompt is passed in as a callable, so the services layer stays print-free and the CLI owns the I/O.
- **File/section: `specs/01-mvp.md` §4:** no change. This is still "curated repos" plus a user-supplied path; it is not arbitrary-repo ingestion.

### 2.2 Implementation sketch
- `schemas/values.py`: `DraftValues`, `BuilderValues` (Pydantic, `extra=forbid`); register `qscore.values/v0.1` in `versions.py` and export the JSON Schema.
- `intake/discover.py`: `Candidate` gains `source_kind: Literal["qasm","python","notebook"]`, `suggestions: dict[str, list[Suggestion]]` and `annotations: dict[str, str|None]`.
- `intake/draft.py`: pure functions, plus `prompt: Callable[[PromptSpec], str] | None`.
- `services.discover_candidates(path, draft: bool, pick, values_file, prompt)`; `cli.py discover` wires `typer.prompt`.
- No LLM, no network, and no user code is imported or run.

## 3. Justification (evidence, not opinion)
- The user asked for this (2026-10-10): drafting must be deterministic ("I wouldn't want … done by an LLM assistant"); unknown values are entered or given as ranges; a file avoids retyping; notebooks only if cheap.
- 05 §2 currently writes only `<required>` placeholders, so the user has to hand-edit YAML for every unknown, and for every sweep.
- The manifest already has `source.args` and `size_sweep {arg, values: list[int]}` (`schemas/manifest.py:204`), so ranges map onto an existing field. No change to the manifest contract.
- Scoring a notebook would need a cell-execution runner (globals from other cells), about half a day of work. Listing a notebook is about 30 minutes.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec as is (placeholders only) | No change | The user edits YAML by hand; sweeps are typed manually | The user rejected it |
| LLM infers the values | Fewer prompts | Non-deterministic; can't be verified; the user doesn't want it | The user rejected it |
| Values as a partial `qscore.yaml` merged in (ChP-0014) | No new schema | Keyed by item id, which doesn't exist before drafting | Builders have no ids yet |
| Free-text `.txt` values file | Simple to write | Needs its own parser and locations | The YAML tooling (positions, Q1xx) already exists |
| Full notebook scoring | Notebook users served | ~0.5 day; a cell-execution sandbox | Not enough time (< 24 h left); listed under Ideas |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | T09 (tier 0) is extended; nothing moves between tiers. Notebook scoring goes to Ideas |
| Gates and timeline (hours) | About +1.5 h of delegate time on T09; runs in parallel with T16/T23; no gate moves |
| Contracts / schemas / stored data (Neon, Hub) | New `qscore.values/v0.1` (input only; never stored); `versions.py` gets one id. Manifest, scorecard: none. Neon/Hub: none |
| Other specs and sections that must change | 03 (two rows), 04 §1 + new §14, 05 §1, §2, §11 |
| Modules and public functions | `intake/discover.py`, `intake/draft.py` (new), `schemas/values.py` (new), `schemas/versions.py`, `schemas/export.py`, `services.discover_candidates`, `cli.py discover` |
| Tests and golden values | New unit tests (ranges, resolution order, values-file issues with locations, annotation checks, notebook listing, call sites); decoy repo `tests/validation/decoys/`; e2e `discover --draft --values --no-input` on both examples. Golden values: none |
| Score version (metrics/thresholds) | none |
| Fallback registry | none (suggestions are shown and commented; nothing is silent) |
| Overall architecture (hosts, data flow, security) | none; discovery still never imports or runs user code |
| Sponsor tracks / demo | Demo can start from "point qscore at a repo", which makes a better story |
| Cost (GPU credits, HF credits, time) | Time only (above) |

## 6. Risks and rollback
- Risk: call-site detection is mistaken for "inference". Mitigation: suggestions are always labelled with their file and line.
- Risk: the prompt makes tests interactive. Mitigation: the prompt is an injected callable; tests pass a stub, and `--no-input` exists.
- Rollback: drop the flags and keep placeholders only. The values file is input-only, so no stored data is affected.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved ("Go ahead with that") · Notes: no QASM export from builders (user didn't take the option); notebooks listing-only.
- Applied to specs in: 2026-10-10 (uncommitted) · CHANGELOG line added: yes
