"""Same-operation bounded retries and explicit transport failures (11 §3, R3.5)."""

from __future__ import annotations

import json
from collections.abc import Callable
from uuid import uuid4

import httpx
import pytest

from qscore.errors import ClaimLost, ConfigError, PlatformError
from qscore.record.jobs_client import JobsClient
from qscore.schemas.run import Event

pytestmark = pytest.mark.platform


def client(handler: Callable[[httpx.Request], httpx.Response]) -> JobsClient:
    return JobsClient(
        "https://platform.test/api",
        "test-only-worker-token",
        "cpu",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://platform.test/api",
        "https://user:password@platform.test/api",
        "https://platform.test/api?token=secret",
        "https://platform.test/#fragment",
        "relative",
    ],
)
def test_https_url_has_no_embedded_credentials(url: str) -> None:
    with pytest.raises(ConfigError):
        JobsClient(url, "test", "cpu")


@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_transient_status_retries_exact_operation(
    status: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    requests: list[httpx.Request] = []
    delays: list[float] = []
    monkeypatch.setattr("qscore.record.jobs_client.time.sleep", delays.append)

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(status if len(requests) < 3 else 200, json={"state": "running"})

    job_id = uuid4()
    assert client(handler).start(job_id) == "running"
    assert len(requests) == 3 and delays == [0.25, 0.5]
    assert len({request.content for request in requests}) == 1
    assert all(
        str(request.url) == f"https://platform.test/api/jobs/{job_id}/start" for request in requests
    )
    assert all(
        request.headers["Authorization"] == "Bearer test-only-worker-token" for request in requests
    )


def test_network_timeout_retries_then_raises_without_secret(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    attempts = 0
    monkeypatch.setattr("qscore.record.jobs_client.time.sleep", lambda _: None)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ReadTimeout("socket timeout", request=request)

    with pytest.raises(PlatformError, match="3 attempts") as failure:
        client(handler).heartbeat(uuid4())
    assert attempts == 3
    assert "test-only-worker-token" not in str(failure.value)
    assert "test-only-worker-token" not in caplog.text


def test_persistent_5xx_is_not_success(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = 0
    monkeypatch.setattr("qscore.record.jobs_client.time.sleep", lambda _: None)

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503, json={"detail": "offline"})

    with pytest.raises(PlatformError, match="503 after 3 attempts"):
        client(handler).register({"gpu": False}, None)
    assert attempts == 3


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 422])
def test_nontransient_rejection_is_never_retried(status: int) -> None:
    attempts = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(status)

    expected = ClaimLost if status == 409 else PlatformError
    with pytest.raises(expected):
        client(handler).heartbeat(uuid4())
    assert attempts == 1


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="not JSON"),
        httpx.Response(200, json=[]),
        httpx.Response(200, json={"state": "done"}),
        httpx.Response(204),
    ],
)
def test_invalid_success_response_is_rejected(response: httpx.Response) -> None:
    with pytest.raises(PlatformError):
        client(lambda _: response).start(uuid4())


def test_only_204_means_no_job() -> None:
    assert client(lambda _: httpx.Response(204)).claim({"gpu": False}) is None
    with pytest.raises(PlatformError):
        client(lambda _: httpx.Response(200, json={})).claim({"gpu": False})


@pytest.mark.parametrize(
    "field,value",
    [
        ("claimed_by", "other"),
        ("state", "queued"),
        ("id", "invalid"),
        ("last_event_seq", -1),
        ("last_event_seq", True),
        ("payload", {}),
    ],
)
def test_malformed_claim_never_runs(field: str, value: object) -> None:
    response = {
        "id": str(uuid4()),
        "state": "claimed",
        "claimed_by": "cpu",
        "last_event_seq": 0,
        "payload": {"schema": "qscore.job/v0.2", "project": "test", "kind": "score"},
    }
    response[field] = value
    with pytest.raises(PlatformError):
        client(lambda _: httpx.Response(200, json=response)).claim({"gpu": False})


def test_event_limit_checked_before_any_http_call() -> None:
    called = False

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={"ok": True, "state": "running"})

    progress = Event.model_validate(
        {
            "schema": "qscore.event/v0.2",
            "run_id": "run",
            "seq": 1,
            "at": "2026-10-11T00:00:00Z",
            "kind": "stage_started",
            "message": "compile",
        }
    )
    with pytest.raises(PlatformError, match="at most 50"):
        client(handler).events(uuid4(), [progress] * 51)
    assert not called


def test_register_and_event_acknowledgements_required() -> None:
    with pytest.raises(PlatformError, match="registration"):
        client(lambda _: httpx.Response(200, json={"ok": False})).register({}, None)
    with pytest.raises(PlatformError, match="events"):
        client(lambda _: httpx.Response(200, json={"ok": True, "state": "failed"})).events(
            uuid4(), []
        )


def test_finish_body_contains_publication_paths() -> None:
    received: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(json.loads(request.content))
        return httpx.Response(200, json={"state": "done"})

    assert (
        client(handler).finish(uuid4(), {"status": "complete"}, {"run": "runs/run.json"}) == "done"
    )
    assert received == [
        {
            "worker_id": "cpu",
            "result_summary": {"status": "complete"},
            "hub_paths": {"run": "runs/run.json"},
        }
    ]
