# GitHub bot, scoring engine and Hugging Face integration

## Current state

- Branch `github-app`; UI PR3 retained; approved engine baseline `6b42f72` merged as `cc2e485`. User authorized committing and pushing all reviewed `github-app` source on 2026-10-11. Remote synchronization must be verified after the push. This chat owns bot/Gemini/HF and narrow engine corrections; UI/verifier/loop/platform remain friend-owned.
- The Action scores immutable base/head commits in real GitHub Actions using qscore. The App validates checksums, provenance and comparable settings before posting one summary and one check. Repository code never runs in the App.
- Private demo [PR1](https://github.com/GatesmithKnightHacks/gatesmith-bot-demo/pull/1): Linux runs `38118723185` attempts 1+2, `38119782036`, `38120273945`, and `38120522229` attempts 1+2 succeeded. Latest head `71c1c0ac6f2977f54d6ea3c6a364779e83adbb02`; base `a28b3ea0ec205c7383e6b0721bca9b4b04503a39`. Actual two-qubit count 1 → 6, depth 4 → 10, routing 0 → 0.5, one SWAP, new D01 high. The regression check correctly fails despite successful computation.
- Sticky summary `6106354610` persists across reruns/heads. Latest check `114414371289`. Gemini HIGH prompt v3 posted [review 5482293104](https://github.com/GatesmithKnightHacks/gatesmith-bot-demo/pull/1#pullrequestreview-5482293104), with a valid RIGHT-line 9 comment citing recorded D01 evidence. Unsigned webhook 401, signed 202 and duplicate 202 verified through locally signed ingestion of real artifacts. Public webhook reception is not deployed.
- HF adapter, recorded prompts, four pinned model/provider entries and models-check CLI are integrated and independently reviewed. Live catalog availability passed for all four. A default gpt-oss-120b/Cerebras fixture call and a Qwen3-Coder/Scaleway call using a real engine-generated D03 request returned schema-valid, unverified proposals.
- Private HF dataset `GridGxly/qscore-runs` contains a documented typed zero-row leaderboard. Private Gradio Space `GridGxly/qscore` is RUNNING on free CPU Basic/Python 3.12, revision `7f8c0bd`. Browser refresh shows “No verified benchmark results yet.” Its sole credential reads only the dataset.
- Rescore/explain/why/ignore commands check collaborator permissions. Explanations use committed definitions and exact current base/head/latest-workflow evidence. Improve and full-file review explicitly report unavailable. No automatic edits or merges.
- Secrets remain coordinator-only outside Git under `~/.config/qscore`, mode 0600. Delegated work is offline and receives no credentials.

## Broken / blocked

- New Linux CI failure, first seen 2026-10-11 03:39 EDT at `7409ccf`: [run 38121956569](https://github.com/GatesmithKnightHacks/Gatesmith/actions/runs/38121956569), Python 3.11, **986 passed / 2 failed**. Python 3.12 was cancelled by the matrix; bot CI passed. Failing assertions: `test_old_flag_has_migration_hint` cannot find the contiguous hint in Rich-formatted output; `test_qasm_file_unchanged` sees a long output path wrapped inside `bell.qasm`. Suspected CLI formatting/terminal-width sensitivity; root cause still to reproduce. Exact CI command in `qscore/`: `uv run --no-sync pytest -m "not gpu and not platform and not hub and not llm and not slow" -W error::DeprecationWarning:qiskit -n auto`. Fix output determinism and rerun without deleting assertions or skipping tests.
- Baseline full macOS CPU quick suite: 833 passed, 50 failed, ten deselected; predominantly builder `RLIMIT_AS`/`preexec_fn` restrictions. Reproduce inside `qscore/`: `uv run --offline --no-sync pytest -m "not gpu and not platform and not hub and not llm and not slow" -q`. Full Linux gates remain required; sandbox limits/assertions are unchanged. Real Linux scoring passed on six workflow attempts.
- Public HTTPS hosting remains with friend; App webhook inactive. Docker is absent locally, so container build is untested. No continuous deployment claim.
- Friend-owned verifier/loop and approved improvement handoff are absent. HF candidates are unverified and unaccepted; leaderboard intentionally has no ranked results. Platform imports/dashboard history and full-file review remain outstanding.
- New engine fixes are reviewed/tested locally. Released demo Action still pins engine `6b42f722730f19a5c3d9b72e1a19cf8d54a0fedd`; unpublished fixes have not run in released CI. Source publication and a coordinated reviewed pin update remain follow-ups.

## Resolved failures

- Q406 nested classical control escaped validation inside `Instruction.definition`. `3887d40` traverses definitions with cycle protection and preserves issue messages/locations. Nested/shared/cyclic tests and independent review passed.
- D03 diagonal DAG runs split when an unrelated leaf ended. `1eb199f` collects connected convex DAG blocks without changing thresholds/goldens; original cut/rejoin assertion preserved. Independent review included 300 seeded DAG probes.
- JWT integer issuer failed PyJWT signing; `35a01c6` uses a string issuer, real ephemeral-RSA tests and sanitized typed errors. Live App posts work.
- Gemini prepay was depleted despite separate Cloud credit; user personally added $5. The strict generation schema's 100-comment bound caused HTTP 400; `f5bd10b` uses a ten-comment primary generation budget, preserving the public 100-comment contract and local checks.
- SDK `response_schema` conversion rejected `additionalProperties`; primary `response_json_schema` serialization preserves the strict contract. No schema/model substitution or output repair.
- Early Gemini prose mixed metric and numbered-qubit claims; strict filters rejected those comments visibly. Prompt v3 (`8031724`) guides qualitative finding/action comments; the live line comment passed. Literal/actual newline variants remain rejected without rewriting. `5858df2` labels cached drafts with their persisted prompt version.
- Verbose Hub HTTP logging could expose signed URLs; `52f866c` preserves warnings/errors and safe attempt counts while suppressing transport INFO/DEBUG. Space deployed with the fix.
- Unsuffixed `uv run` removed extras; `5a6992c` preserves frozen HF/UI extras. `9ce59ab` adds full standalone Linux bot CI with real sibling engine types, without ignores/skips.

## Active work

- Scoped implementation and acceptance checks are complete; overall report remains partial. Ledger, report and handoff distinguish deployment/verification/full-Linux gaps. User authorized committing and pushing all reviewed `github-app` source on 2026-10-11. Remote synchronization must be verified after the push.
- Reproduction commits `f55d4e1`, `6b3ea19`, `7e28242` were independently reviewed. Exact engine/commit/recorded Qiskit/Aer pins, isolated Python/pip/environment and protected local checkout; explicitly equivalent commands with unrecorded dependency/hardware limitations.
- Latest live rescore posted the recipe and retained summary `6106354610`, review `5482293104`, check `114414371289` and 21 model records without extra inference.

## Decisions made by the lead

- ChP-0040/0048/0049 and user scope approval cover bot/HF ownership, named baseline merge, selected private accounts/resources and HF $15 / Gemini $25 development caps. No Vultr this pass.
- ChP-0050 static Space alternative withdrawn after user bought PRO; retain Gradio/free CPU.
- ChP-0051 records exact-Operator-verified authored algebra examples without claiming absent reference-proposer provenance.
- ChP-0052 records strict SDK JSON Schema serialization and bounded Hub HTTP configuration. ChP-0053 bounds primary Gemini generation to ten comments; public contract and strict local checks unchanged. No fallback.
- User confirms friend is not editing the engine and wants the bot consuming actual engine results. Narrow correctness fixes and engine → HF acceptance are in scope; sandbox redesign/verifier/GPU/UI/platform remain outside this pass.

## Credits ledger

- HF default fixture: 1,164 prompt + 365 completion tokens, estimated $0.000681150. Real engine → Qwen: one call, estimated $0.000379392. Total known estimated HF generation spend $0.001060542, within $15 cap. Both proposals are unverified. Provider billing is authoritative.
- Gemini: 21 model records; known estimated spend $0.118592; unknown reserved $3.809490; accounted/reserved $3.928082 within $25 cap. Latest real PR call: 1,727 input + 1,158 billed output including 945 thinking tokens, estimated $0.017350. Failed requests are not claimed free; reservations are preserved.
- Cloud manual-payment credit −$30 is distinct from $10 MLH promotion and Gemini prepay. User submitted $5 prepay; this chat submitted no payment and created no paid hardware.

## Validation

- Root updated engine: **209 focused tests passed**, four slow deselected, covering golden values, metrics, diagnostics, score, semantic validation, single-path scoring, determinism/partial states and compiled export. Delegate real S-box QASM scoring passed, approved logical Toffoli count 100. Ruff checked 209 files, mypy 100 source files and import layers passed.
- Root HF/Space/models CLI: 96 tests passed. Real engine → HF lab uses validation → `score_item_compiled` → `build_requests`; D03#1 has a seven-qubit logical region and original gate indices 0–5. Qwen consumed this exact request through the adapter.
- Root final full bot: **144 tests passed**, including prompt v3 and executable reproduction isolation regressions. Ruff/format checked 25 files; mypy 13 source files passed. Two dependency deprecation warnings remain visible.
- Contract/request tests: 102 passed, two deselected. Slow-builder suite: 103 passed, one existing macOS failure. Golden values, thresholds and security controls untouched. All integrated streams independently reviewed.
