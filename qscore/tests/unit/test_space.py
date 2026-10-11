"""The Space reads one Hub file and displays only schema-valid recorded results."""

from __future__ import annotations

import importlib.util
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from typing import Any

import httpx2
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

_SPEC = importlib.util.spec_from_file_location(
    "qscore_leaderboard_space", Path(__file__).parents[2] / "space" / "app.py"
)
assert _SPEC is not None and _SPEC.loader is not None
space = importlib.util.module_from_spec(_SPEC)
sys.modules[_SPEC.name] = space
_SPEC.loader.exec_module(space)

SCHEMA = pa.schema(
    [
        ("layer", pa.string()),
        ("model", pa.string()),
        ("provider", pa.string()),
        ("prompt_version", pa.string()),
        ("requests", pa.int64()),
        ("proposals", pa.int64()),
        ("parse_rate", pa.float64()),
        ("verified_rate", pa.float64()),
        ("verified_improvement_rate", pa.float64()),
        ("median_latency_ms", pa.float64()),
        ("prompt_tokens", pa.int64()),
        ("completion_tokens", pa.int64()),
        ("cost_usd_estimate", pa.float64()),
    ]
)


@pytest.fixture
def record() -> dict[str, Any]:
    return {
        "layer": "hf",
        "model": "openai/gpt-oss-120b",
        "provider": "cerebras",
        "prompt_version": "p-2026.1",
        "requests": 4,
        "proposals": 6,
        "parse_rate": 0.75,
        "verified_rate": 0.5,
        "verified_improvement_rate": 0.25,
        "median_latency_ms": 1500.0,
        "prompt_tokens": 1200,
        "completion_tokens": 400,
        "cost_usd_estimate": 0.00072,
    }


def parquet(tmp_path: Path, records: list[dict[str, Any]]) -> Path:
    path = tmp_path / "leaderboard.parquet"
    pq.write_table(pa.Table.from_pylist(records, schema=SCHEMA), path)
    return path


def test_reads_only_leaderboard_with_explicit_server_token(
    tmp_path: Path, record: dict[str, Any]
) -> None:
    path = parquet(tmp_path, [record])
    calls: list[dict[str, Any]] = []

    def download(**kwargs: Any) -> Path:
        calls.append(kwargs)
        return path

    rows = space.load_leaderboard(
        "GridGxly/qscore-runs", token="fake-read-token", download=download
    )
    assert rows == [[record[name] for name in space.COLUMNS]]
    assert calls == [
        {
            "repo_id": "GridGxly/qscore-runs",
            "repo_type": "dataset",
            "filename": "leaderboard.parquet",
            "token": "fake-read-token",
            "force_download": True,
            "etag_timeout": 10,
        }
    ]


def test_public_read_disables_implicit_stored_credential(tmp_path: Path) -> None:
    path = parquet(tmp_path, [])
    calls: list[dict[str, Any]] = []

    def download(**kwargs: Any) -> Path:
        calls.append(kwargs)
        return path

    space.load_leaderboard("GridGxly/qscore-runs", download=download)
    assert calls[0]["token"] is False


def test_valid_empty_is_distinct_from_error(tmp_path: Path) -> None:
    path = parquet(tmp_path, [])
    view = space.load_view("GridGxly/qscore-runs", download=lambda **_: path)
    assert view.rows == []
    assert view.table_visible is False
    assert view.status == "**No verified benchmark results yet.**"


def test_loaded_groups_sort_by_verified_improvement_without_invented_rank(
    tmp_path: Path, record: dict[str, Any]
) -> None:
    better = {**record, "model": "another/model", "verified_improvement_rate": 0.5}
    path = parquet(tmp_path, [record, better])
    view = space.load_view("GridGxly/qscore-runs", download=lambda **_: path)
    assert view.table_visible is True
    assert view.status == "**Loaded 2 benchmark groups.**"
    assert view.rows[0][1] == "another/model"
    assert len(view.rows[0]) == 13


def test_unknown_accounting_and_deterministic_identity_stay_null(record: dict[str, Any]) -> None:
    record.update(
        layer="reference-qiskit",
        model=None,
        provider=None,
        prompt_version=None,
        proposals=0,
        parse_rate=None,
        verified_rate=None,
        prompt_tokens=None,
        completion_tokens=None,
        cost_usd_estimate=None,
    )
    rows = space.validate_leaderboard(pa.Table.from_pylist([record], schema=SCHEMA))
    assert rows[0][1:4] == [None, None, None]
    assert rows[0][6:8] == [None, None]
    assert rows[0][10:] == [None, None, None]


@pytest.mark.parametrize("column", ["model", "provider", "prompt_version"])
def test_hf_requires_pinned_identity(column: str, record: dict[str, Any]) -> None:
    record[column] = None
    with pytest.raises(space.LeaderboardError, match=f"require {column}"):
        space.validate_leaderboard(pa.Table.from_pylist([record], schema=SCHEMA))


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("requests", 0),
        ("requests", -1),
        ("requests", None),
        ("proposals", -1),
        ("prompt_tokens", -1),
        ("completion_tokens", -1),
        ("parse_rate", -0.01),
        ("parse_rate", 1.01),
        ("verified_rate", float("nan")),
        ("verified_rate", float("inf")),
        ("verified_improvement_rate", None),
        ("verified_improvement_rate", 1.01),
        ("median_latency_ms", -1),
        ("median_latency_ms", None),
        ("median_latency_ms", float("nan")),
        ("cost_usd_estimate", -0.001),
        ("cost_usd_estimate", float("inf")),
        ("layer", ""),
        ("provider", " "),
    ],
)
def test_invalid_values_fail_clearly(column: str, value: Any, record: dict[str, Any]) -> None:
    record[column] = value
    with pytest.raises(space.LeaderboardError):
        space.validate_leaderboard(pa.Table.from_pylist([record], schema=SCHEMA))


def test_schema_rejects_extra_missing_and_untyped_empty_exports(record: dict[str, Any]) -> None:
    valid = pa.Table.from_pylist([record], schema=SCHEMA)
    invalid = [
        valid.drop(["provider"]),
        valid.append_column("rank", pa.array([1])),
        pa.Table.from_pylist([]),
    ]
    for table in invalid:
        with pytest.raises(space.LeaderboardError, match="13 documented columns"):
            space.validate_leaderboard(table)


def test_count_schema_rejects_fraction_and_boolean(record: dict[str, Any]) -> None:
    for value in (1.5, True):
        table = pa.Table.from_pylist([{**record, "requests": value}])
        with pytest.raises(space.LeaderboardError, match="requests has an invalid data type"):
            space.validate_leaderboard(table)


def test_duplicate_groups_rejected(record: dict[str, Any]) -> None:
    with pytest.raises(space.LeaderboardError, match="duplicate"):
        space.validate_leaderboard(pa.Table.from_pylist([record, record], schema=SCHEMA))


@pytest.mark.parametrize("repo", ["https://example.org/x", "repo", "owner/repo\n[secret](x)"])
def test_invalid_repository_never_downloads(repo: str) -> None:
    def download(**_: Any) -> Path:
        pytest.fail("Invalid repository reached the downloader")

    view = space.load_view(repo, download=download)
    assert "Failed to load" in view.status
    assert "namespace/repository" in view.status


def test_download_failure_is_error_and_does_not_show_exception_secrets() -> None:
    def download(**_: Any) -> Path:
        raise ValueError("https://example.org?token=TOP_SECRET")

    view = space.load_view("GridGxly/qscore-runs", download=download)
    assert "Failed to load leaderboard" in view.status
    assert "No verified benchmark results" not in view.status
    assert "TOP_SECRET" not in view.status
    assert "https://example.org" not in view.status
    assert not view.table_visible


def test_corrupt_parquet_is_error(tmp_path: Path) -> None:
    path = tmp_path / "leaderboard.parquet"
    path.write_bytes(b"not a parquet file")
    view = space.load_view("GridGxly/qscore-runs", download=lambda **_: path)
    assert "could not be read" in view.status
    assert "No verified benchmark results" not in view.status


def test_transport_configuration_disables_xet_and_unrelated_telemetry() -> None:
    from huggingface_hub import constants

    assert constants.HF_HUB_DISABLE_XET is True
    assert constants.HF_HUB_DISABLE_TELEMETRY is True


def test_offline_mode_never_reaches_transport(monkeypatch: pytest.MonkeyPatch) -> None:
    import huggingface_hub

    monkeypatch.setattr(huggingface_hub, "is_offline_mode", lambda: True)

    def respond(_: httpx2.Request) -> httpx2.Response:
        pytest.fail("Offline mode reached the transport")

    with space._make_hub_client(transport=httpx2.MockTransport(respond)) as client:
        with pytest.raises(space.LeaderboardError, match="offline mode is enabled"):
            client.get("https://example.org/leaderboard.parquet")


def test_ui_is_read_only_has_loading_rates_links_and_no_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HF_TOKEN", "SECRET_NOT_FOR_BROWSER")
    app = space.build_app()
    config = app.get_config_file()
    tables = [entry for entry in config["components"] if entry["type"] == "dataframe"]
    assert len(tables) == 1
    assert tables[0]["props"]["interactive"] is False
    assert tables[0]["props"]["visible"] is False
    assert "Loading leaderboard" in str(config)
    assert "Parse rate" in str(config)
    assert "Verified rate" in str(config)
    assert "Verified improvement rate" in str(config)
    assert "https://huggingface.co/datasets/GridGxly/qscore-runs" in str(config)
    assert space.SOURCE_REPO_URL in str(config)
    assert "SECRET_NOT_FOR_BROWSER" not in str(config)
    assert app.analytics_enabled is False
    assert app.is_running is False


@pytest.mark.parametrize("logging_level", [logging.INFO, logging.DEBUG])
def test_real_sdk_cannot_make_more_than_three_attempts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    logging_level: int,
) -> None:
    from huggingface_hub import hf_hub_download, set_client_factory
    from huggingface_hub.utils import _http

    caplog.set_level(logging_level)
    calls: list[tuple[str, str]] = []

    def respond(request: httpx2.Request) -> httpx2.Response:
        calls.append((request.method, request.url.path))
        if request.method == "HEAD":
            return httpx2.Response(
                200,
                headers={"etag": '"abc"', "x-repo-commit": "a" * 40, "content-length": "10"},
            )
        return httpx2.Response(429)

    set_client_factory(lambda: space._make_hub_client(transport=httpx2.MockTransport(respond)))
    monkeypatch.setattr(_http.time, "sleep", lambda _: None)

    def download(**kwargs: Any) -> str:
        return hf_hub_download(**kwargs, cache_dir=tmp_path)

    try:
        view = space.load_view("GridGxly/qscore-runs", token="fake-token", download=download)
    finally:
        space._configure_hub_http()
    operation_path = "/datasets/GridGxly/qscore-runs/resolve/main/leaderboard.parquet"
    assert all(path == operation_path for _, path in calls), calls
    assert calls.count(("HEAD", operation_path)) == 1
    assert calls.count(("GET", operation_path)) == 3
    assert "exceeded three attempts" in view.status
    assert "fake-token" not in view.status
    assert "fake-token" not in caplog.text
    assert "https://" not in caplog.text
    assert "Leaderboard HTTP retry: attempt 2" in caplog.text
    assert "Leaderboard HTTP retry: attempt 3" in caplog.text
    assert space._ATTEMPTS.get() is None


def test_concurrent_refreshes_have_independent_attempt_budgets(
    tmp_path: Path, record: dict[str, Any]
) -> None:
    path = parquet(tmp_path, [record])
    barrier = Barrier(2)

    def refresh() -> Any:
        with space._make_hub_client(
            transport=httpx2.MockTransport(lambda _: httpx2.Response(200))
        ) as client:

            def download(**_: Any) -> Path:
                barrier.wait(timeout=5)
                for attempt in range(3):
                    client.get(f"https://example.org/leaderboard.parquet?signature={attempt}")
                with pytest.raises(space.LeaderboardError, match="exceeded three attempts"):
                    client.get("https://example.org/leaderboard.parquet?signature=fourth")
                return path

            return space.load_view("GridGxly/qscore-runs", download=download)

    with ThreadPoolExecutor(max_workers=2) as pool:
        views = list(pool.map(lambda _: refresh(), range(2)))
    assert all(view.table_visible for view in views)
    assert space._ATTEMPTS.get() is None
