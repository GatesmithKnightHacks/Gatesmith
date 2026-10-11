# ChP-0035: Repository link → discover → pick → score in one flow

- **Status:** approved (spec text to be applied with implementation)
- **Class:** A (CLI surface, network access, trust model for fetched builders, run record field)
- **Author:** lead · **Date:** 2026-10-10
- **Related tasks:** T09 (discover/draft), S5 (services/CLI), ChP-0034 (export) · **Blocks:** nothing
- **Decision needed by:** before testing with the user's sample repositories

## 1. Summary
A researcher should go from a repository link to a scored, diagnosed circuit with one command and
only the questions that need a human. Today `qscore discover` already finds every circuit
statically (no code runs), numbers them, lets the researcher pick one (`--pick` or a numbered
prompt) and drafts the manifest; `qscore score` then compiles, measures and diagnoses. Missing:
(1) fetching a link, (2) skipping the pick question when there is only one circuit, (3) going on to
scoring without retyping paths, (4) recording which commit was scored, and (5) warning early when a
builder imports a package the engine cannot load. This proposal adds exactly those.

Target flow:
```
qscore discover https://github.com/org/repo --draft --score
  → clones org/repo at its default branch into ./repo (shallow; no hooks, submodules or LFS)
  → lists candidates (static: no repo code runs)
  → one candidate: picked and announced; several: numbered prompt (or --pick / --path)
  → drafts qscore.yaml; asks for missing arguments; any <required> left → stops (Q107, exit 2)
  → shows the interpretation + trust notice, asks to confirm (or --yes)
  → scores: scorecards, findings, report, compiled/<id>.qasm (ChP-0034)
```

## 2. Proposed change
### 2.1 Spec text (exact)

**A. `05-pipeline.md` §2 (Discover), append**
> **Repository links (ChP-0035).** `PATH` may be a git URL (`https://…`, `ssh://…`,
> `git@host:owner/repo[.git]`, `file://…`); anything else is a local path. qscore runs
> `git clone --depth 1 [--branch REF] --no-recurse-submodules -c core.symlinks=false` with
> `GIT_LFS_SKIP_SMUDGE=1` and `GIT_TERMINAL_PROMPT=0` into `--into DIR` (default `./<repo-name>`).
> `--ref` accepts a branch, a tag or a full commit SHA (a SHA is fetched with depth 1 and checked
> out). An existing non-empty destination is refused (Q103 at `--into`; use
> `qscore discover <dir>` to work on it). The clone is a normal checkout the researcher keeps and
> edits; qscore never deletes it. URLs carrying credentials (`user:secret@`) are refused (Q103);
> authentication uses the researcher's own git configuration (SSH agent, credential helper). A
> failed clone raises `FetchError` (exit 3) with git's message; no retry, no other transport.
> Discovery after cloning is the same static scan; no repository code runs before scoring is
> confirmed. `--path SUBDIR` limits discovery to a subdirectory of the clone (or of a local root).
>
> **Single candidate.** When discovery finds exactly one draftable candidate and no `--pick` is
> given, it is picked and announced ("Only one circuit found: `<ref>` — drafting it"), with or
> without `--no-input`. With several, the numbered prompt (or `--pick`) is required as before;
> qscore never picks the first of several.
>
> **Engine-environment check.** For each picked builder, top-level imports are checked statically
> (`ast` + `importlib.util.find_spec` on the top-level name, after resolving modules that exist
> under `project.root`). A module the engine environment cannot find is reported as a warning
> naming the module and the file:line ("scoring will fail with Q301 unless it is installed in the
> qscore environment"). The check never imports repository code.
>
> **Discover then score.** `--score` (requires `--draft`) continues with `score_project` on the
> file just written, with `--out` (default `<project.root>/qscore-out`) and the normal confirmation
> (`--yes` allowed). If the draft still holds `<required>` placeholders, it stops with the located
> Q107 report (exit 2) before anything runs.

**B. `05-pipeline.md` §4.2, replace the last paragraph**
- Before:
  > The sandbox is not a security boundary for hostile code (R10). The MVP accepts builders only from curated example repos (and the user's own repo in laptop mode).
- After:
  > The sandbox is not a security boundary for hostile code (R10). In laptop mode, builders run
  > from the user's own repo, curated examples, or a repository the user fetched by link
  > (ChP-0035): fetching it is the user's decision to run its code, as with `git clone` followed by
  > `python`. Before any builder from a fetched repository runs, the confirmation summary states:
  > "N builder function(s) from `<url>@<commit>` will run as your user, with network access. The
  > sandbox limits time and memory and removes secrets from the environment; it is not a security
  > boundary." OpenQASM-only items run no repository code. The API and the queued worker do not
  > accept repository links (they need the container sandbox, later).

**C. `05-pipeline.md` §11, `qscore discover` row, append**
> `PATH` may be a git URL; `--ref REF`, `--into DIR`, `--path SUBDIR`, `--score` (with `--out`,
> `--yes`) (ChP-0035). Exit 3 on a failed clone.

**D. `04-contracts.md` §13 run record (same v0.3 bump as ChP-0034)**
> `"project_source": {"url": "https://github.com/org/repo", "commit": "<40 hex>", "dirty": false}`
> Read at score time from `project.root` with git: `url` = `remote.origin.url` with any userinfo
> removed (null when no remote), `commit` = `HEAD`, `dirty` = uncommitted changes present.
> `null` when `project.root` is not inside a git work tree; `{"error": "git not installed"}` when
> git is missing. Applies to every run, not only fetched repositories.

**E. `03-code-structure.md`:** `intake/fetch.py` row — `is_repo_url(text) -> bool`,
`clone(url, dest, ref=None) -> FetchedRepo(url, commit, path)`, `source_of(root) -> ProjectSource | None`;
`intake/discover.py` row — `missing_imports(candidate, root) -> list[MissingImport]`;
`errors.py` — `FetchError(QscoreError)`.

### 2.2 Implementation sketch
- `intake/fetch.py` (new): subprocess `git` with the flags above, fixed env, timeout from
  settings (`fetch_timeout_s`, default 300); parses URL forms; redacts userinfo everywhere.
- `services.discover_candidates`: if `is_repo_url(path)` → `clone` → continue with the clone as
  root; single-candidate auto-pick in `drafting.pick_candidates`; emit missing-import warnings;
  return the written path. CLI `discover` gains `--ref/--into/--path/--score/--out/--yes` and on
  `--score` calls `services.score_project` with the usual confirm callback.
- `services._score`: `project_source` into the run record (ChP-0034's v0.3 model).
- Tests: local bare repos via `file://` (no network): clone + discover, `--ref` tag/SHA,
  existing destination refused, credential URL refused, single-candidate auto-pick, several
  without pick → prompt / Q104, missing-import warning, `--score` stops on Q107, full chain to a
  complete scorecard with `project_source.commit` equal to the fixture's HEAD.

## 3. Justification (evidence, not opinion)
- User goal 2026-10-10: "pull the repo and get to work as quickly as possible", choosing the file
  path and a specific circuit when several are found.
- Existing pieces verified this session: static discovery, numbered pick/`--pick`, drafting with
  located placeholders, Q107 refusal (`qscore score --manifest` → `Q107 qscore.yaml:10:9 …`,
  exit 2, no output written), sandboxed builders, confirmation recorded with manifest hash.
- Without `--score`, a researcher with a link types: `git clone`, `cd`, `qscore discover . --draft`,
  `qscore score --manifest qscore.yaml`; this session showed one easy slip
  (`qscore score qscore.yaml` → misleading "no OPENQASM header", see Pending decisions).
- git CLI clone mirrors mainstream Python practice (pip's VCS installs shell out to `git`), so
  the researcher's existing SSH keys and credential helpers work unchanged. Local git 2.56.0.
- Spec 05 §4.2 currently limits builders to curated or own repos; fetching by link changes that
  trust statement, so it must be explicit (class A).

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Keep the spec (researcher clones manually) | No network code | Extra steps; no commit provenance | User wants the shortest path |
| Auto-pick the first of several circuits | No question | Silently scores a circuit the researcher may not want | Violates fail-loud; one question is cheap |
| Clone into a hidden cache | Tidy | Researcher can't find/edit the code | They want to "get to work" in the repo |
| GitPython / dulwich | No git binary | New dependency; loses user's credential setup | git is already on every researcher machine |
| Container sandbox now | Real isolation | podman/docker not on every laptop or the W7900 | Spec already lists it as later; trust notice instead |
| Accept links in the API/worker | Web demo | Runs strangers' code on shared hosts | Needs container sandbox first |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | Additive to the CPU MVP; laptop CLI only |
| Gates and timeline (hours) | ~5–7 h incl. tests and sample-repo runs; no gate affected |
| Contracts / schemas / stored data (Neon, Hub) | `qscore.run/v0.3` gains `project_source` (shared bump with ChP-0034). Manifest schema unchanged. Neon/Hub: none now |
| Other specs and sections that must change | 03 (fetch row, errors), 04 §13, 05 §2, §4.2, §11, 00 R10.2 wording ("user repos" includes fetched ones) |
| Modules and public functions | new `intake/fetch.py`; `intake/discover.py` (`missing_imports`); `intake/draft.py` (single-candidate pick); `services.py`; `cli.py`; `errors.py` (`FetchError`); `config.py` (`fetch_timeout_s`) |
| Tests and golden values | New tests listed in §2.2 using local `file://` repos; golden values none |
| Score version (metrics/thresholds) | none |
| Fallback registry | none (no transport/backend switch, no retries) |
| Overall architecture (hosts, data flow, security) | New outbound git fetch from the laptop CLI only; trust notice before running fetched builders; credentials never stored or logged |
| Sponsor tracks / demo | "Paste a repo link, get a diagnosis" demo; works with ChP-0034 export |
| Cost (GPU credits, HF credits, time) | none beyond dev time |

## 6. Risks and rollback
- **Missing dependencies** are the main remaining friction: the engine runs builders with its own
  Python (`runner.env: engine`). The import warning makes it visible early; if the sample repos
  show it is common, a follow-up proposal for `runner.env: uv` (already planned "later") comes next.
- **Unusual layouts** (circuits built inside classes, notebooks, CLI scripts) may not be
  discovered; the sample repos measure this before any new discovery rule.
- **Hostile repository code** runs with the researcher's permissions once confirmed; mitigated
  only by the explicit notice (and `unshare -n` when `sandbox_network=off` is implemented).
- Rollback: remove URL handling and `--score`; local-path discovery is unchanged.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved ("I approve")
- Applied to specs in: not applied · CHANGELOG line added: no
