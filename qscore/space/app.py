"""Read-only leaderboard Space; no engine, inference, or launch side effects."""

from __future__ import annotations

import logging
import math
import os
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

import httpx2
import pyarrow as pa
import pyarrow.parquet as pq

if TYPE_CHECKING:
    import gradio as gr

DEFAULT_DATASET_REPO = "GridGxly/qscore-runs"
SOURCE_REPO_URL = "https://github.com/GatesmithKnightHacks/Gatesmith"
COLUMNS = (
    "layer",
    "model",
    "provider",
    "prompt_version",
    "requests",
    "proposals",
    "parse_rate",
    "verified_rate",
    "verified_improvement_rate",
    "median_latency_ms",
    "prompt_tokens",
    "completion_tokens",
    "cost_usd_estimate",
)
HEADERS = (
    "Layer",
    "Model",
    "Provider",
    "Prompt version",
    "Requests",
    "Proposals",
    "Parse rate",
    "Verified rate",
    "Verified improvement rate",
    "Median latency (ms)",
    "Prompt tokens",
    "Completion tokens",
    "Estimated cost (USD)",
)
RATE_DEFINITIONS = """
**Parse rate** = parsed proposals ÷ (returned proposals + calls with a parse failure).
An empty response is not a malformed proposal.

**Verified rate** = proposals that passed verification ÷ parsed proposals.
Evidence without a verification pass does not count as verified.

**Verified improvement rate** = distinct requests with an accepted proposal ÷ distinct
requests attempted. A request is identified by its job ID and request ID.

Rates are fractions from 0 to 1. Blank rates have no denominator; blank token or cost
values mean accounting is unknown. They do not mean zero. Results are grouped by layer,
model, pinned provider, and prompt version. Compare results only under the same benchmark
conditions and budgets. Click a column header to sort.
"""

Cell = str | int | float | None
Downloader = Callable[..., str | Path]
_ATTEMPTS: ContextVar[dict[tuple[str, str], int] | None] = ContextVar("hub_attempts", default=None)
_LOGGER = logging.getLogger(__name__)


class LeaderboardError(RuntimeError):
    """Safe, actionable leaderboard error without remote exception text or tokens."""


def _guard_request(request: httpx2.Request) -> None:
    from huggingface_hub import is_offline_mode

    if is_offline_mode():
        raise LeaderboardError("Hub offline mode is enabled; leaderboard could not be downloaded.")
    attempts = _ATTEMPTS.get()
    if attempts is None:
        return
    key = (request.method, str(request.url.copy_with(query=b"")))
    count = attempts.get(key, 0)
    if count >= 3:
        raise LeaderboardError(
            "Leaderboard download exceeded three attempts for one HTTP operation."
        )
    attempts[key] = count + 1
    if count:
        _LOGGER.warning(
            "Leaderboard HTTP retry: attempt %d for %s operation", count + 1, request.method
        )


def _make_hub_client(*, transport: httpx2.BaseTransport | None = None) -> httpx2.Client:
    return httpx2.Client(
        transport=transport,
        event_hooks={"request": [_guard_request]},
        follow_redirects=True,
        timeout=10,
    )


def _configure_hub_http() -> None:
    # Primary transport configuration: Xet bypasses the public HTTP request hooks.
    # Set this before importing the SDK or Gradio (which also imports the SDK).
    os.environ["HF_HUB_DISABLE_XET"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["GRADIO_ANALYTICS_ENABLED"] = "False"
    from huggingface_hub import set_client_factory
    from huggingface_hub.utils import logging as hub_logging

    # SDK retry warnings include signed download URLs; our guard logs safe counts.
    hub_logging.set_verbosity_error()
    # HTTP request INFO logs and transport DEBUG traces can expose signed URLs or
    # headers when a caller raises the root log level. Keep warnings/errors visible.
    logging.getLogger("httpx2").setLevel(logging.WARNING)
    logging.getLogger("httpcore2").setLevel(logging.WARNING)
    set_client_factory(_make_hub_client)


@dataclass(frozen=True)
class LeaderboardView:
    status: str
    rows: list[list[Cell]]
    table_visible: bool


def dataset_url(repo_id: str) -> str:
    """Validate the configuration before constructing a Markdown link or Hub request."""
    from huggingface_hub.utils import HFValidationError, validate_repo_id

    try:
        validate_repo_id(repo_id)
    except HFValidationError:
        raise LeaderboardError(
            "Dataset repository must be a valid namespace/repository ID."
        ) from None
    if repo_id.count("/") != 1:
        raise LeaderboardError("Dataset repository must be a valid namespace/repository ID.")
    return f"https://huggingface.co/datasets/{repo_id}"


def _validate_schema(table: pa.Table) -> None:
    if len(table.column_names) != len(COLUMNS) or set(table.column_names) != set(COLUMNS):
        raise LeaderboardError("Leaderboard schema must contain the 13 documented columns exactly.")
    for name in COLUMNS:
        dtype = table.schema.field(name).type
        if name in COLUMNS[:4]:
            valid = pa.types.is_string(dtype) or pa.types.is_large_string(dtype)
        elif name in ("requests", "proposals", "prompt_tokens", "completion_tokens"):
            valid = pa.types.is_integer(dtype)
        else:
            valid = pa.types.is_integer(dtype) or pa.types.is_floating(dtype)
        if not valid:
            raise LeaderboardError(f"Leaderboard column {name} has an invalid data type.")


def _number(row: dict[str, Any], name: str, *, nullable: bool = False) -> int | float | None:
    value = row[name]
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise LeaderboardError(f"Leaderboard column {name} must contain finite numbers.")
    if value < 0:
        raise LeaderboardError(f"Leaderboard column {name} must not be negative.")
    return value


def validate_leaderboard(table: pa.Table) -> list[list[Cell]]:
    """Validate the export rather than repairing, coercing, or recomputing its metrics."""
    _validate_schema(table)
    records = table.to_pylist()
    seen: set[tuple[Cell, ...]] = set()
    for row in records:
        if not isinstance(row["layer"], str) or not row["layer"].strip():
            raise LeaderboardError("Leaderboard layer must be a nonempty string.")
        for name in COLUMNS[1:4]:
            value = row[name]
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise LeaderboardError(f"Leaderboard column {name} must be nonempty when present.")
            if row["layer"] == "hf" and value is None:
                raise LeaderboardError(f"HF leaderboard rows require {name}.")
        requests = _number(row, "requests")
        if requests == 0:
            raise LeaderboardError("Each leaderboard row must represent at least one request.")
        _number(row, "proposals")
        for name in ("prompt_tokens", "completion_tokens"):
            _number(row, name, nullable=True)
        for name in ("parse_rate", "verified_rate", "verified_improvement_rate"):
            rate = _number(row, name, nullable=name != "verified_improvement_rate")
            if rate is not None and rate > 1:
                raise LeaderboardError(f"Leaderboard column {name} must be between 0 and 1.")
        _number(row, "median_latency_ms")
        _number(row, "cost_usd_estimate", nullable=True)
        key = tuple(row[name] for name in COLUMNS[:4])
        if key in seen:
            raise LeaderboardError(
                "Leaderboard contains duplicate layer/model/provider/prompt groups."
            )
        seen.add(key)
    records.sort(key=lambda row: row["verified_improvement_rate"], reverse=True)
    return [[row[name] for name in COLUMNS] for row in records]


def load_leaderboard(
    repo_id: str,
    *,
    token: str | None = None,
    download: Downloader | None = None,
) -> list[list[Cell]]:
    """Read just the leaderboard file, using an explicit read credential or no credential."""
    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import HfHubHTTPError, OfflineModeIsEnabled

    dataset_url(repo_id)
    fetch = hf_hub_download if download is None else download
    attempt_scope = _ATTEMPTS.set({})
    try:
        path = fetch(
            repo_id=repo_id,
            repo_type="dataset",
            filename="leaderboard.parquet",
            token=token if token else False,
            force_download=True,
            etag_timeout=10,
        )
    except (HfHubHTTPError, OfflineModeIsEnabled, httpx2.HTTPError, OSError, ValueError):
        raise LeaderboardError(
            "Could not download leaderboard.parquet from the configured dataset."
        ) from None
    finally:
        _ATTEMPTS.reset(attempt_scope)
    if not isinstance(path, str | Path):
        raise LeaderboardError("Hub download did not return a leaderboard file.")
    try:
        table = pq.read_table(path)
    except (pa.ArrowException, OSError):
        raise LeaderboardError("Downloaded leaderboard.parquet could not be read.") from None
    return validate_leaderboard(table)


def load_view(
    repo_id: str, *, token: str | None = None, download: Downloader | None = None
) -> LeaderboardView:
    """Keep a failed refresh distinct from a successfully loaded empty leaderboard."""
    try:
        rows = load_leaderboard(repo_id, token=token, download=download)
    except LeaderboardError as error:
        return LeaderboardView(f"**Failed to load leaderboard.** {error}", [], False)
    if not rows:
        return LeaderboardView("**No verified benchmark results yet.**", [], False)
    return LeaderboardView(f"**Loaded {len(rows)} benchmark groups.**", rows, True)


def build_app(repo_id: str | None = None) -> gr.Blocks:
    """Construct the UI without downloading data, launching a server, or exposing a token."""
    import gradio as gr

    repo_id = (
        os.environ.get("QSCORE_DATASET_REPO", DEFAULT_DATASET_REPO) if repo_id is None else repo_id
    )
    try:
        links = (
            f"[Attempts dataset]({dataset_url(repo_id)}) · [Gatesmith source]({SOURCE_REPO_URL})"
        )
    except LeaderboardError:
        links = (
            "Dataset repository is not configured correctly. · "
            f"[Gatesmith source]({SOURCE_REPO_URL})"
        )

    def refresh() -> tuple[str, Any]:
        view = load_view(repo_id, token=os.environ.get("HF_TOKEN"))
        return view.status, gr.update(value=view.rows, visible=view.table_visible)

    with gr.Blocks(
        title="Gatesmith · verified improvement leaderboard", analytics_enabled=False
    ) as app:
        gr.Markdown("# Gatesmith · verified improvement leaderboard")
        gr.Markdown(
            "Recorded benchmark results from open models and deterministic optimizer layers."
        )
        gr.Markdown(links)
        status = gr.Markdown("**Loading leaderboard…**")
        datatypes: list[Literal["str", "number"]] = [
            "str",
            "str",
            "str",
            "str",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
        ]
        table = gr.Dataframe(
            headers=list(HEADERS),
            datatype=datatypes,
            type="array",
            interactive=False,
            visible=False,
            label="Benchmark groups · sortable by column",
            show_row_numbers=False,
        )
        refresh_button = gr.Button("Refresh results")
        gr.Markdown(RATE_DEFINITIONS)
        app.load(refresh, outputs=[status, table], api_visibility="private", show_progress="full")
        refresh_button.click(
            refresh, outputs=[status, table], api_visibility="private", show_progress="full"
        )
    return app


_configure_hub_http()


if __name__ == "__main__":
    build_app().launch(show_error=False)
