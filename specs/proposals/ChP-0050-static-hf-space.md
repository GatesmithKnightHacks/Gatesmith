# ChP-0050: Free static HF leaderboard Space

- Status: proposed; Class A; Author: integration coordinator; Date: 2026-10-11
- Related: T26, specs/12 §5, ChP-0048. Only Space hosting blocked; HF API adapter unaffected.

## Summary and exact change

Before: spec12 §5 requires a Gradio Space which reads only leaderboard.parquet with a read-only token while the dataset is private.
After (proposed): use a static HF Space with an accessible sortable leaderboard. Its build step reads leaderboard.parquet and publishes a generated JSON snapshot containing only approved demo benchmark rows. The browser never receives an HF token. The dataset remains private during development. Updating the snapshot is an explicit publish step after a measured benchmark export; an empty table says no verified benchmark results yet. The card records source dataset revision and score version. No inference, GPU, database or write credential in the Space.

## Evidence

The signed-in HF new-Space form disables CPU Basic for this free account. Current official docs state that Gradio/Docker on CPU Basic requires PRO/Team; static Spaces remain free: https://huggingface.co/docs/hub/spaces-gpus and https://huggingface.co/docs/huggingface_hub/main/guides/manage-spaces . No subscription or paid hardware was selected.

## Alternatives and impact

Keep Gradio under a teammate's existing PRO account, or defer the Space while using Inference Providers + dataset. Buying PRO adds a recurring charge and is outside the current API-spend authorization. Static changes presentation hosting only, preserves engine acceptance/ranking/contracts, adds no runtime dependency or fallback, and keeps private data/tokens out of the browser. Initial snapshot may be empty; no invented rankings. No UI work outside the HF sponsor artifact. No effect on GitHub bot, model/provider choices, budget, engine score version or golden values.

## Risks and rollback

Snapshot requires explicit refresh after benchmark runs; display generation timestamp/revision. Rollback removes the static Space or replaces it with the approved Gradio code when an eligible account is available.

## Decision

Pending user choice. No implementation or account resource creation under this change yet.
