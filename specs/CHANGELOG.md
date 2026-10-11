# Spec changelog

Every approved change to `specs/` gets one line here: date, files, proposal id, summary. Newest first.

| Date | Files | Proposal | Summary |
|---|---|---|---|
| 2026-10-11 | 05 §1 | ChP-0044 | Folder discovery lists candidates past unreadable files and warns per file (located); single file or no candidates still exit 2. Approved by the user. |
| 2026-10-11 | 06 §2.3 | ChP-0043 | `resynthesis_potential` takes the KAK minimum from the synthesized block (Qiskit 2.5.2 `num_basis_gates` undercounts SWAP-class blocks); folded into score version `qscore-2026.2`. Approved by the user. |
| 2026-10-11 | 05 §1 | lead (class B) | Builder signal: returned names bound to circuit-returning methods (`qc.decompose()` etc.); found on QED-C. |
| 2026-10-11 | 05 §4.1 | lead (class B) | Packages: src-layout namespace directories join the dotted name (the section's own MQT Bench example); found in the F1 demo run. |
| 2026-10-11 | 06 §2.2 (reliability_heuristic), 07 §1 D06, 02/03/04/06/07 score version, decisions D-009 | ChP-0041 | Faulty calibrated ops (error ≥ 1) → reliability 0, `faulty_ops` evidence, D06 high; `e > 1` fails; score version `qscore-2026.2`. Decided by the lead under the user's delegation. |
| 2026-10-11 | 05 §2, §11 | ChP-0042 | `discover --score` output and exit codes as `qscore score` (+ `--allow-partial`, `--fail-on`); trust-notice scope; failed SHA fetch names the leftover checkout. Decided by the lead under the user's delegation. |
| 2026-10-10 | 03 (fetch/discover/errors rows), 04 §13, 05 §1/§2/§4.1/§4.2/§11, proposals/ | ChP-0035 (+ audit fixes) | Repository links: clone → discover → draft → `--score`; single-candidate auto-pick; missing-import warnings; trust notice confirmed before fetched builders run; `FetchError`; `project_source` errors for any git read failure; package walk stops below `project.root`; notebooks §1 bullet aligned with ChP-0037; score row prints compiled paths. |
| 2026-10-10 | 05 §11 | ChP-0036 | `qscore score PATH` accepts a manifest or a project directory; the CLI names the input mode before running. |
| 2026-10-10 | 03 (intake rows), 04 §2, 05 §2/§4.1/§4.2, proposals/ | ChP-0037 | Scripts, notebooks, packages: `source.line` line mode, `.ipynb` builders, package-aware import (walk bounded at `project.root`), removed-Qiskit-API hints (discover + Q301/Q302), drafting of module variables and notebooks; line-mode execution errors are Q301. |
| 2026-10-10 | 04 §1/§13, 05 §9, proposals/ | ChP-0034, ChP-0035 (D) | Compiled circuit export `compiled/<item_id>.qasm` (OpenQASM 3 + `// key: JSON` header); run record `qscore.run/v0.3` with `compiled`, `compiled_skipped`, `project_source`. |
| 2026-10-10 | 03 (intake rows), 05 §2, proposals/ | ChP-0033 | T09 drafting: explicit values override defaults; nonliteral defaults left in the builder; drafting issue codes; actual intake helper signatures. |
| 2026-10-10 | 03 (intake rows), 04 §1/§14, 05 §1/§2/§11, proposals/ | ChP-0029 | Deterministic drafting: `--pick`, `--values` (`qscore.values/v0.1`), `--no-input`, interactive values and ranges (range → `size_sweep`), call-site suggestions, notebooks listed only (convert with nbconvert). |
| 2026-10-10 | 02, 04 §1/§2.2/§2.5/§3/§13, 05 §4/§5/§6.1/§12, 06 §1, proposals/ | ChP-0028 | Run record `qscore.run/v0.2` (`run.json`) and per-card `x-run`/`x-interpretation`; scorecard v0.3 (nullable `representative_seed`); budget reason records elapsed/limit; custom targets default to no calibration (ChP-0009 assumed errors withdrawn); all-to-all basis; custom basis rules; Q207 extra names; calibration file in item hash; target one-of merge; Q208 in catalog. Also all proposal ids renamed CP-NNNN → ChP-NNNN (user request). |
| 2026-10-10 | 03 §2 | ChP-0011 | import-linter siblings use `:` (may import each other); interfaces stay independent (`|`). |
| 2026-10-10 | 01 §0, 15 §3a, proposals/ | ChP-0023 | MVP = scoring and diagnostics engine (circuit in, diagnostics and scores out); everything else is the final product; gate G-MVP. |
| 2026-10-10 | proposals/ | ChP-0001…0021 | Approved by the user; spec text applied progressively (tracked in progress.md). |
| 2026-10-10 | templates/handoff.md (+ workspace CLAUDE.md, handoff skill) | user request | Handoffs carry MVP progress % and ETA in agent sessions; each new session relays them to the user. |
| 2026-10-10 | 15 §3a, proposals/ | ChP-0022 | Fast-track CPU scoring slice S1–S6 built before the rest of P1/P2; one review pass at the slice's end. |
| 2026-10-10 | 00, 03, 14, 15, 16, templates/task-brief, templates/repo-AGENTS, proposals/ | ChP-0020 | Repo = team repo `Gatesmith/` (engine in `qscore/`, specs committed); workspace root `KnightHacks26/` with `specs` symlink; worktree engine at `<worktree>/qscore`. |
| 2026-10-09 | all | — | Spec set v2.0 created from "Quantum Optimization Engine: Architecture v2" and the MVP Spec docs (build guide, file reference), adapted for the Radeon PRO W7900, Neon, Hugging Face, Vultr and the agent workflow. |
