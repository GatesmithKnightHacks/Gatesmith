# Spec changelog

Every approved change to `specs/` gets one line here: date, files, proposal id, summary. Newest first.

| Date | Files | Proposal | Summary |
|---|---|---|---|
| 2026-10-10 | 03 §2 | CP-0011 | import-linter siblings use `:` (may import each other); interfaces stay independent (`|`). |
| 2026-10-10 | 01 §0, 15 §3a, proposals/ | CP-0023 | MVP = scoring and diagnostics engine (circuit in, diagnostics and scores out); everything else is the final product; gate G-MVP. |
| 2026-10-10 | proposals/ | CP-0001…0021 | Approved by the user; spec text applied progressively (tracked in progress.md). |
| 2026-10-10 | templates/handoff.md (+ workspace CLAUDE.md, handoff skill) | user request | Handoffs carry MVP progress % and ETA in agent sessions; each new session relays them to the user. |
| 2026-10-10 | 15 §3a, proposals/ | CP-0022 | Fast-track CPU scoring slice S1–S6 built before the rest of P1/P2; one review pass at the slice's end. |
| 2026-10-10 | 00, 03, 14, 15, 16, templates/task-brief, templates/repo-AGENTS, proposals/ | CP-0020 | Repo = team repo `Gatesmith/` (engine in `qscore/`, specs committed); workspace root `KnightHacks26/` with `specs` symlink; worktree engine at `<worktree>/qscore`. |
| 2026-10-09 | all | — | Spec set v2.0 created from "Quantum Optimization Engine: Architecture v2" and the MVP Spec docs (build guide, file reference), adapted for the Radeon PRO W7900, Neon, Hugging Face, Vultr and the agent workflow. |
