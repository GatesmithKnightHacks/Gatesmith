---
title: Gatesmith Leaderboard
emoji: 📊
colorFrom: green
colorTo: blue
sdk: gradio
sdk_version: 6.30.0
python_version: "3.12"
app_file: app.py
license: apache-2.0
---

# Gatesmith leaderboard

This read-only Space displays `leaderboard.parquet` from the
[Gatesmith attempts dataset](https://huggingface.co/datasets/GridGxly/qscore-runs).
The table groups measured results by layer, model, pinned provider, and prompt version.
Click any column header to sort. It initially sorts by verified improvement rate.

There is no inference, circuit execution, GPU, database connection, or export in this
Space. The engine and worker produce the dataset; this app only reads the leaderboard.
An empty, valid export displays **No verified benchmark results yet**. Download and
schema failures display **Failed to load leaderboard**, never fabricated results or
cached success.

## Configuration

- `QSCORE_DATASET_REPO`: dataset repository ID; defaults to `GridGxly/qscore-runs`.
- `HF_TOKEN`: optional **read-only** token, stored as a Space secret while the dataset
  is private. No token is needed for a public dataset. The token stays on the server
  and is never included in the interface, links, or errors.

The app sets the documented `HF_HUB_DISABLE_XET=1` primary HTTP configuration before
importing the Hub SDK or Gradio. Hub telemetry and Gradio analytics are disabled so
they cannot add unrelated requests. A public Hub client factory caps each HTTP operation
at three actual requests, with separate counters for concurrent refreshes. Retries
keep the same file and data source. A failed refresh never returns an old cached file.

Upload this directory's three files to a Gradio Space. The app requires Python 3.11
or newer; dependencies and the Space SDK are pinned to the installed versions tested
for this implementation. Run locally with `python app.py` after installing
`requirements.txt`.

## Export contract

The file must contain exactly these 13 columns:

`layer`, `model`, `provider`, `prompt_version`, `requests`, `proposals`, `parse_rate`,
`verified_rate`, `verified_improvement_rate`, `median_latency_ms`, `prompt_tokens`,
`completion_tokens`, `cost_usd_estimate`.

The first four columns are strings; model, provider, and prompt version may be null
for deterministic layers. HF rows require all four identities. Requests are positive
integer counts; proposals and known token counts are nonnegative integers. Rates are
finite fractions from 0 to 1. A rate with no denominator is null; improvement rate has
a denominator because each group has requests. Median latency and known cost are finite
and nonnegative. Unknown token counts or cost are null, not zero. An empty export must
still carry the typed schema. Duplicate groups and malformed exports are rejected.

- **Parse rate:** parsed proposals ÷ (returned proposals + calls with a parse failure).
  Empty responses do not count as malformed proposals.
- **Verified rate:** verification passes ÷ parsed proposals.
- **Verified improvement rate:** distinct requests with an accepted proposal ÷ distinct
  requests attempted. Request identity is `(job_id, request_id)`.

Only compare benchmark results produced under the same conditions and budgets.
See the [Gatesmith repository](https://github.com/GatesmithKnightHacks/Gatesmith) for
the engine, verification rules, and benchmark definitions.
