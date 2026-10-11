"""Authenticated platform boundary and real worker/client round trip, entirely offline."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from qscore.api.app import create_app
from qscore.config import Settings
from qscore.errors import ClaimLost
from qscore.record.jobs_client import JobsClient
from qscore.record.sqlite import SQLiteStore
from qscore.schemas.run import Event

pytestmark = pytest.mark.platform
PLATFORM = {"Authorization": "Bearer platform-test"}
WORKER = {"Authorization": "Bearer worker-test"}
CAPS = {"gpu": False, "aer_gpu": False, "hub_write": True}


@pytest.fixture
def api(tmp_path: Path) -> Iterator[TestClient]:
    settings = Settings(
        platform_db_path=tmp_path / "platform.sqlite3",
        platform_token=SecretStr("platform-test"),
        platform_worker_tokens={"cpu": SecretStr("worker-test"), "other": SecretStr("other-test")},
    )
    with TestClient(
        create_app(settings), base_url="https://platform.test/api", root_path="/api"
    ) as client:
        yield client


def submit(api: TestClient) -> UUID:
    example = api.get("/health").json()["examples"][0]
    response = api.post("/jobs", json={"example": example, "confirmed": True}, headers=PLATFORM)
    assert response.status_code == 201, response.text
    return UUID(response.json()["id"])


def test_all_platform_writes_require_server_token(api: TestClient) -> None:
    job_id = uuid4()
    for path, body in (
        ("/jobs", {"example": "sbox_oracle", "confirmed": True}),
        (f"/jobs/{job_id}/cancel", {}),
        ("/projects/test/manifests", {"yaml": "example"}),
        ("/manifests/hash/confirm", {}),
    ):
        assert api.post(path, json=body).status_code == 401
        assert api.post(path, json=body, headers=WORKER).status_code == 401


def test_missing_tokens_disable_writes_explicitly(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(platform_db_path=tmp_path / "q.db"))) as client:
        assert (
            client.post("/jobs", json={"example": "sbox_oracle", "confirmed": True}).status_code
            == 503
        )
        assert (
            client.post(
                "/worker/register", json={"worker_id": "cpu", "capabilities": CAPS}
            ).status_code
            == 503
        )
        assert client.get("/health").json()["browser_submission"].startswith("unavailable")


def test_explicit_confirmation_required_for_convenience(api: TestClient) -> None:
    for body in ({"example": "sbox_oracle"}, {"example": "sbox_oracle", "confirmed": False}):
        assert api.post("/jobs", json=body, headers=PLATFORM).status_code == 422
    job_id = submit(api)
    view = api.get(f"/jobs/{job_id}").json()
    assert view["state"] == "queued" and view["items"]
    assert api.post(f"/jobs/{job_id}/cancel", headers=PLATFORM).json()["state"] == "cancelled"
    assert api.post(f"/jobs/{job_id}/cancel", headers=PLATFORM).status_code == 409


def test_generic_job_uses_exact_stored_confirmation(api: TestClient) -> None:
    example = next(iter(api.app.state.platform.examples.values()))
    spec = {
        "schema": "qscore.job/v0.2",
        "kind": "score",
        "project": example.manifest.project.name,
        "manifest_sha256": example.sha,
        "items": [example.manifest.circuits[0].id],
    }
    assert api.post("/jobs", json=spec, headers=PLATFORM).status_code == 409
    assert api.post(f"/manifests/{example.sha}/confirm", headers=PLATFORM).status_code == 200
    response = api.post("/jobs", json=spec, headers=PLATFORM)
    assert response.status_code == 201
    stored = api.app.state.platform.store.get_job(UUID(response.json()["id"]))
    assert stored["payload"]["requires"]["hub_write"] is True
    assert (
        api.post("/jobs", json={**spec, "items": ["unlisted"]}, headers=PLATFORM).status_code == 422
    )
    assert (
        api.post("/jobs", json={**spec, "manifest_sha256": "f" * 64}, headers=PLATFORM).status_code
        == 503
    )
    assert (
        api.post(
            f"/projects/{spec['project']}/manifests",
            json={"yaml": example.path.read_text()},
            headers=PLATFORM,
        ).status_code
        == 201
    )
    assert (
        api.post(
            "/projects/unknown/manifests", json={"yaml": "arbitrary"}, headers=PLATFORM
        ).status_code
        == 503
    )


def test_explicit_gpu_plan_cannot_land_on_cpu(api: TestClient) -> None:
    example = next(iter(api.app.state.platform.examples.values()))
    api.post(f"/manifests/{example.sha}/confirm", headers=PLATFORM)
    response = api.post(
        "/jobs",
        headers=PLATFORM,
        json={
            "schema": "qscore.job/v0.2",
            "kind": "score",
            "project": example.manifest.project.name,
            "manifest_sha256": example.sha,
            "options": {"device": "gpu"},
        },
    )
    assert response.status_code == 201
    api.post("/worker/register", headers=WORKER, json={"worker_id": "cpu", "capabilities": CAPS})
    assert (
        api.post(
            "/worker/claim", headers=WORKER, json={"worker_id": "cpu", "capabilities": CAPS}
        ).status_code
        == 204
    )


def test_worker_auth_identity_and_boolean_capabilities(api: TestClient) -> None:
    body = {"worker_id": "cpu", "capabilities": CAPS}
    assert api.post("/worker/register", json=body).status_code == 401
    assert api.post("/worker/register", json=body, headers=PLATFORM).status_code == 401
    assert (
        api.post(
            "/worker/register", json={**body, "worker_id": "other"}, headers=WORKER
        ).status_code
        == 403
    )
    assert (
        api.post(
            "/worker/register", json={**body, "capabilities": {"gpu": "true"}}, headers=WORKER
        ).status_code
        == 422
    )
    assert (
        api.post(
            "/worker/register", json={**body, "capabilities": {"unknown": True}}, headers=WORKER
        ).status_code
        == 409
    )
    assert api.post("/worker/register", json=body, headers=WORKER).status_code == 200
    assert (
        api.post(
            "/worker/claim", json={**body, "capabilities": {"gpu": True}}, headers=WORKER
        ).status_code
        == 409
    )


def test_client_api_job_lifecycle_and_read_shapes(api: TestClient) -> None:
    job_id = submit(api)
    client = JobsClient("https://platform.test/api", "worker-test", "cpu", client=api)
    client.register(CAPS, None)
    claimed = client.claim(CAPS)
    assert claimed["id"] == str(job_id) and claimed["last_event_seq"] == 0
    assert claimed["payload"]["schema"] == "qscore.job/v0.2"
    assert client.start(job_id) == "running"
    assert client.heartbeat(job_id) == "running"
    progress = Event.model_validate(
        {
            "schema": "qscore.event/v0.2",
            "run_id": "run",
            "job_id": str(job_id),
            "seq": 1,
            "at": "2026-10-11T00:00:00Z",
            "kind": "stage_started",
            "message": "compile",
        }
    )
    client.events(job_id, [progress])
    client.events(job_id, [progress])
    events = api.get(f"/jobs/{job_id}/events").json()
    assert len(events) == 1 and events[0]["data"]["message"] == "compile"
    assert api.get(f"/jobs/{job_id}/events?after=1").json() == []
    assert api.get(f"/jobs/{job_id}/scorecards").json() == []
    assert api.get(f"/jobs/{job_id}/attempts").json() == []
    paths = {"run": "runs/test/run.json"}
    assert client.finish(job_id, {"status": "complete"}, paths) == "done"
    assert client.finish(job_id, {"status": "complete"}, paths) == "done"
    assert api.get(f"/jobs/{job_id}").json()["result_summary"]["status"] == "complete"
    missing = api.get(f"/jobs/{job_id}/scorecards")
    assert missing.status_code == 503 and "materialization" in missing.json()["detail"]
    assert api.get("/leaderboard").status_code == 503
    with pytest.raises(ClaimLost):
        client.finish(job_id, {"status": "different"}, paths)
    assert client.claim(CAPS) is None


def test_worker_cannot_write_other_workers_job(api: TestClient) -> None:
    job_id = submit(api)
    client = JobsClient("https://platform.test/api", "worker-test", "cpu", client=api)
    client.register(CAPS, None)
    client.claim(CAPS)
    other = JobsClient("https://platform.test/api", "other-test", "other", client=api)
    other.register(CAPS, None)
    with pytest.raises(ClaimLost):
        other.heartbeat(job_id)
    assert (
        api.post(
            f"/jobs/{job_id}/events", json=[], headers={"Authorization": "Bearer other-test"}
        ).status_code
        == 409
    )
    assert api.get(f"/jobs/{job_id}").json()["claimed_by"] == "cpu"


def test_fail_lifecycle_exposes_typed_error(api: TestClient) -> None:
    job_id = submit(api)
    client = JobsClient("https://platform.test/api", "worker-test", "cpu", client=api)
    client.register(CAPS, None)
    client.claim(CAPS)
    error = {
        "type": "WorkerStopped",
        "message": "operator stopped worker",
        "at": "2026-10-11T00:00:00Z",
        "attempt": 1,
    }
    assert client.fail(job_id, error) == "failed"
    assert client.fail(job_id, error) == "failed"
    assert api.get(f"/jobs/{job_id}").json()["error"] == error
    assert (
        api.post(
            f"/jobs/{job_id}/fail",
            headers=WORKER,
            json={"worker_id": "cpu", "error": {"type": "error"}},
        ).status_code
        == 422
    )


def test_reopened_api_reads_persistent_job(api: TestClient) -> None:
    job_id = submit(api)
    state = api.app.state.platform
    reopened = create_app(state.settings, store=SQLiteStore(state.store.path))
    with TestClient(reopened) as reader:
        assert reader.get(f"/jobs/{job_id}").json()["state"] == "queued"
