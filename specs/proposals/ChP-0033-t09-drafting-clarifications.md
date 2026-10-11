# ChP-0033: Record T09 drafting decisions and internal helper signatures

- **Status:** approved (applied to 03 §3 and 05 §2)
- **Class:** B (internal signatures and clarification of previously recorded T09 decisions)
- **Author:** Codex, resumed workspace session · **Date:** 2026-10-10
- **Related tasks:** T09 · **Blocks:** final spec alignment/sign-off for T09
- **Decision needed by:** before T09 is declared fully complete

## 1. Summary
The handoff calls for aligning the T09 B decisions with 03/05. This proposal records exact edits
without changing the read-only specs or claiming new approval. The lead checkout already contains
these decisions from the prior implementation and now has tested CLI/service integration.

## 2. Proposed change
### 2.1 Spec text (exact)
In `05-pipeline.md` §2, replace:
> It fills arguments in this order: signature default → values file (`--values FILE`, `qscore.values/v0.1`, 04 §14) → interactive prompt (unless `--no-input`) → literal call-site suggestion (only with `--no-input`) → `<required>` placeholder (later Q107).

With:
> Explicit values-file arguments or sweeps override signature defaults. Otherwise, use a literal signature default; leave a nonliteral default in the builder without evaluating or copying it. Required arguments use the interactive prompt (unless `--no-input`), then literal call-site suggestions only with `--no-input`, then a `<required>` placeholder (later Q107). An empty interactive answer leaves a placeholder. Size-like arguments without an explicit range are suggested in comments; they do not cause an invented sweep.

In `05-pipeline.md` §2, append:
> Builtin annotation checks accept an integer for `float` without changing its value; booleans are not integers. Explicit quoted builtin annotations have the same checks as bare annotations. Giving the same argument in `args` and `sweep` is Q103, including arguments accepted through `**kwargs`. Missing `--pick` with `--no-input` is Q104. Unknown picked names are Q202; ambiguous names and invalid indices are Q103. Module-level circuit variables are listed as weak candidates and cannot be drafted (Q103). Python syntax errors are located Q301; malformed notebooks are Q103; missing paths are Q200. Discovery does not validate incomplete circuit entries for scoring: it reads the existing document and `project.root`, preserving placeholders and researcher edits for later validation.

In `03-code-structure.md` §3, replace the `intake/draft.py` row's signatures:
> `draft_items(candidates) -> CommentedMap`; `merge_into(manifest, items)` (never overwrites user edits); writes `qscore.yaml.draft` or shows a diff. ChP-0029: `load_values(path) -> DraftValues`, `parse_range(text) -> list[int]`, `resolve_args(candidate, values, prompt) -> ResolvedArgs` (the prompt is an injected callable; services stay print-free).

With:
> `draft_items(candidates, values, prompt, *, no_input=False, taken=()) -> list[CommentedMap]`; `merge_into(manifest, items) -> tuple[list[str], list[Skipped]]` appends new sources and reports skipped existing sources without overwriting edits; `load_values(path, candidates, root) -> DraftValues`; `parse_range(spec) -> list[int]`; `resolve_args(candidate, values, prompt, *, no_input=False) -> ResolvedArgs`; `pick_candidates(candidates, pick, prompt, *, no_input=False) -> list[Candidate]`. Helpers construct the document and entries, render the diff, and choose the destination. Services own writing; prompts are injected and services stay print-free.

In the `intake/discover.py` row, replace:
> `call_site_suggestions(tree, func_name)`

With:
> `call_site_suggestions(tree, func_name, params, file, *, builder_path=None, whole_file=False)`

Append to that row:
> Also skips `.ipynb_checkpoints`. Tests provide call-site suggestions only, never candidates.

### 2.2 Implementation sketch
Keep existing deterministic resolution in `intake/draft.py` and static extraction in
`intake/discover.py`. `services.discover_candidates` returns a typed internal dataclass containing
candidates, destination, diff, added ids and skipped entries, and emits existing Event objects.
The CLI prints events and supplies prompts. No schema id, configuration switch or migration changes.

## 3. Justification (evidence, not opinion)
- `worktrees/.reports/T09.json` records the original deviations (its completion claim is stale).
- `handoffs/20261010-2250-amdreview.md` §2.4 calls for applying these B decisions.
- `test_resolution_order_default_values_prompt` covers an explicit value replacing a default;
  placing defaults first would silently ignore researcher input.
- `test_no_input_uses_first_suggestion_then_required` covers leaving a nonliteral default alone.
- Quoted-annotation and kwargs-overlap regressions first failed, then passed after fixes.
- `test_unfinished_manifest_can_be_listed_and_extended` reproduces why full scoring validation
  cannot run before discovery of an unfinished manifest.
- Current intake suite: 132 passed. Independent follow-up review: seven focused tests passed,
  no remaining material blockers in the reviewed changes.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep ambiguous prose | No spec edit | Conflicts with explicit overrides and real helper signatures | Leaves the handoff's alignment debt unresolved |
| Evaluate nonliteral defaults | Could fill more arguments | Executes researcher code during discovery | Violates static-discovery requirement |
| Write guessed sweeps | More prefilled YAML | Invents experimental values | Not authorized |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | None; G-MVP already signed off, T09 intake only |
| Gates and timeline (hours) | Removes T09 documentation debt; no new gate or runtime work |
| Contracts / schemas / stored data (Neon, Hub) | None |
| Other specs and sections | 03 helper rows; 05 §2; changelog after approved application |
| Modules and public functions | Documents existing intake helpers and discover service integration |
| Tests and golden values | Regression tests only; no golden changes |
| Score version (metrics/thresholds) | None |
| Fallback registry | None; no fallbacks introduced |
| Overall architecture (hosts, data flow, security) | None; static discovery, sandboxed scoring remain |
| Sponsor tracks / demo | Repository-to-manifest workflow becomes usable |
| Cost (GPU credits, HF credits, time) | No cloud credits; documentation review only |

## 6. Risks and rollback
The prior report classified these as B; precedence or issue-code decisions may merit A review if
they are considered public behavior changes. Do not infer approval from this proposal. Rolling
back explicit overrides would silently discard supplied values; any such change needs review and
must preserve tests until an approved replacement behavior exists.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved ("I approve")
- Applied to specs in: 03 §3 (intake rows), 05 §2 · CHANGELOG line added: yes
