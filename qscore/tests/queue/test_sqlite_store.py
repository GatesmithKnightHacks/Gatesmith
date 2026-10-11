"""Offline queue fault tests from 11 §§2-4 and ChP-0054; no cloud credentials."""

from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from tests.contract.test_examples import EXAMPLES, fill_placeholders

from qscore.errors import ClaimLost, ConfigError, RecordError
from qscore.record.sqlite import SQLiteStore
from qscore.schemas.common import sha256_hex
from qscore.schemas.records import AttemptRecord, JobSpec
from qscore.schemas.run import Event
from qscore.schemas.scorecard import Scorecard

pytestmark = pytest.mark.platform


@dataclass
class Clock:
    now: datetime = datetime(2026, 10, 11, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: int) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def queue(tmp_path: Path) -> tuple[SQLiteStore, Clock]:
    clock = Clock()
    return SQLiteStore(tmp_path / "queue.sqlite3", clock=clock), clock


def job(
    store: SQLiteStore, *, priority: int = 100, requires: dict[str, bool] | None = None
) -> UUID:
    spec = JobSpec.model_validate(
        {
            "schema": "qscore.job/v0.2",
            "project": "test",
            "kind": "score",
            "requires": requires or {},
        }
    )
    return store.create_job(spec, created_by="test", priority=priority)


def event(job_id: UUID, seq: int = 1, message: str = "started") -> Event:
    return Event.model_validate(
        {
            "schema": "qscore.event/v0.2",
            "run_id": "run",
            "job_id": str(job_id),
            "seq": seq,
            "at": "2026-10-11T00:00:00Z",
            "kind": "stage_started",
            "message": message,
        }
    )


def running(store: SQLiteStore, worker: str = "cpu") -> UUID:
    store.upsert_worker(worker, {"gpu": False, "hub_write": True})
    job_id = job(store)
    assert store.claim_job(worker, {"gpu": False, "hub_write": True})["id"] == str(job_id)
    assert store.start_job(job_id, worker) == "running"
    return job_id


def test_durable_jobs_workers_and_events_survive_reopen(queue: tuple[SQLiteStore, Clock]) -> None:
    store, clock = queue
    job_id = running(store)
    store.insert_events(job_id, "cpu", [event(job_id)])
    reopened = SQLiteStore(store.path, clock=clock)
    assert reopened.get_job(job_id)["state"] == "running"
    assert reopened.job_events(job_id)[0]["data"]["message"] == "started"
    assert reopened.heartbeat(job_id, "cpu") == "running"


def test_persistent_store_required() -> None:
    with pytest.raises(ConfigError, match="persistent"):
        SQLiteStore(Path(":memory:"))


def test_manifest_hash_confirmation_and_identity(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    project_id = store.ensure_project("test")
    sha = sha256_hex("schema: test\n")
    manifest_id = store.ensure_manifest(project_id, sha, "qscore.project/v0.2", "schema: test\n")
    assert store.ensure_project("test") == project_id
    assert (
        store.ensure_manifest(project_id, sha, "qscore.project/v0.2", "schema: test\n")
        == manifest_id
    )
    with pytest.raises(RecordError, match="SHA-256"):
        store.ensure_manifest(project_id, sha, "qscore.project/v0.2", "different")
    spec = JobSpec.model_validate(
        {"schema": "qscore.job/v0.2", "project": "test", "kind": "score", "manifest_sha256": sha}
    )
    with pytest.raises(RecordError, match="confirmed"):
        store.create_job(spec, created_by="test")
    assert store.confirm_manifest(sha)
    assert store.create_job(spec, created_by="test")
    assert not store.confirm_manifest("f" * 64)
    with pytest.raises(RecordError, match="project_id"):
        store.create_job(spec, created_by="test", project_id=uuid4())


def test_competing_workers_claim_once(queue: tuple[SQLiteStore, Clock]) -> None:
    store, clock = queue
    job_id = job(store)
    workers = [f"cpu-{i}" for i in range(8)]
    for worker in workers:
        store.upsert_worker(worker, {"gpu": False})
    with ThreadPoolExecutor(max_workers=8) as pool:
        claimed = list(
            pool.map(
                lambda worker: SQLiteStore(store.path, clock=clock).claim_job(
                    worker, {"gpu": False}
                ),
                workers,
            )
        )
    assert sum(row is not None for row in claimed) == 1
    assert [row["id"] for row in claimed if row is not None] == [str(job_id)]


def test_priority_oldest_capabilities_and_claim_retry(queue: tuple[SQLiteStore, Clock]) -> None:
    store, clock = queue
    gpu_job = job(store, priority=200, requires={"gpu": True})
    clock.advance(1)
    older = job(store, priority=100, requires={"gpu": False})
    clock.advance(1)
    job(store, priority=100)
    store.upsert_worker("cpu", {"gpu": False})
    first = store.claim_job("cpu", {"gpu": False})
    assert first["id"] == str(older)
    assert store.claim_job("cpu", {"gpu": False})["id"] == str(older)
    store.upsert_worker("gpu", {"gpu": True})
    assert store.claim_job("gpu", {"gpu": True})["id"] == str(gpu_job)
    with pytest.raises(RecordError, match="registration"):
        store.claim_job("cpu", {"gpu": True})


def test_stale_claim_requeues_twice_then_fails(queue: tuple[SQLiteStore, Clock]) -> None:
    store, clock = queue
    job_id = running(store)
    for attempt in range(1, 4):
        clock.advance(61)
        assert store.requeue_stale() == 1
        row = store.get_job(job_id)
        assert row["attempts"] == attempt
        assert row["state"] == ("failed" if attempt == 3 else "queued")
        assert row["claimed_by"] is None
        with pytest.raises(ClaimLost):
            store.heartbeat(job_id, "cpu")
        if attempt < 3:
            store.claim_job("cpu", {"gpu": False, "hub_write": True})
            store.start_job(job_id, "cpu")
    assert store.get_job(job_id)["error"]["type"] == "LostWorker"
    assert store.claim_job("cpu", {"gpu": False, "hub_write": True}) is None


def test_heartbeat_detects_and_persists_expired_claim(queue: tuple[SQLiteStore, Clock]) -> None:
    store, clock = queue
    job_id = running(store)
    clock.advance(61)
    with pytest.raises(ClaimLost):
        store.heartbeat(job_id, "cpu")
    assert store.get_job(job_id)["state"] == "queued"
    assert store.get_job(job_id)["attempts"] == 1


def test_wrong_worker_cannot_write_or_heartbeat(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    job_id = running(store)
    store.upsert_worker("intruder", {"gpu": False})
    for operation in (
        lambda: store.heartbeat(job_id, "intruder"),
        lambda: store.start_job(job_id, "intruder"),
        lambda: store.insert_events(job_id, "intruder", [event(job_id)]),
        lambda: store.finish_job(job_id, "intruder", {}, {"run": "runs/result.json"}),
        lambda: store.fail_job(job_id, "intruder", {"type": "bad"}),
    ):
        with pytest.raises(ClaimLost):
            operation()
    assert store.get_job(job_id)["state"] == "running"


def test_same_worker_cannot_change_capabilities_mid_job(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    running(store)
    with pytest.raises(RecordError, match="change capabilities"):
        store.upsert_worker("cpu", {"gpu": True})


def test_event_idempotency_conflict_and_batch_rollback(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    job_id = running(store)
    original = event(job_id)
    store.insert_events(job_id, "cpu", [original, original])
    with pytest.raises(RecordError, match="different stored content"):
        store.insert_events(job_id, "cpu", [event(job_id, 2), event(job_id, 1, "changed")])
    assert [row["seq"] for row in store.job_events(job_id)] == [1]
    with pytest.raises(RecordError, match="at most 50"):
        store.insert_events(job_id, "cpu", [event(job_id, i) for i in range(51)])
    with pytest.raises(RecordError, match="job_id"):
        store.insert_events(job_id, "cpu", [event(uuid4())])
    assert store.claim_job("cpu", {"gpu": False, "hub_write": True})["last_event_seq"] == 1


def test_finish_and_fail_are_idempotent(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    job_id = running(store)
    assert store.start_job(job_id, "cpu") == "running"
    with pytest.raises(RecordError, match="Hub paths"):
        store.finish_job(job_id, "cpu", {}, {})
    paths = {"run": "runs/run.json"}
    assert store.finish_job(job_id, "cpu", {"count": 1}, paths) == "done"
    assert store.finish_job(job_id, "cpu", {"count": 1}, paths) == "done"
    with pytest.raises(RecordError, match="different content"):
        store.finish_job(job_id, "cpu", {"count": True}, paths)
    with pytest.raises(RecordError, match="different content"):
        store.finish_job(job_id, "cpu", {"count": 1}, {"run": "other"})
    job2 = running(store)
    error = {
        "type": "WorkerStopped",
        "message": "stopped",
        "at": "2026-10-11T00:00:00Z",
        "attempt": 1,
    }
    assert store.fail_job(job2, "cpu", error) == "failed"
    assert store.fail_job(job2, "cpu", error) == "failed"
    with pytest.raises(RecordError):
        store.fail_job(job2, "cpu", {**error, "message": "different"})


def test_only_queued_can_cancel(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    queued_id = job(store)
    assert store.cancel_job(queued_id)
    assert not store.cancel_job(queued_id)
    assert not store.cancel_job(running(store))


def test_gpu_seen_refreshes_on_idle_poll_and_heartbeat(queue: tuple[SQLiteStore, Clock]) -> None:
    store, clock = queue
    assert store.gpu_last_seen() is None
    store.upsert_worker("gpu", {"gpu": True})
    clock.advance(10)
    assert store.claim_job("gpu", {"gpu": True}) is None
    assert store.gpu_last_seen() == clock.now
    job_id = job(store)
    store.claim_job("gpu", {"gpu": True})
    clock.advance(10)
    store.heartbeat(job_id, "gpu")
    assert store.gpu_last_seen() == clock.now


def test_records_replay_and_conflict(queue: tuple[SQLiteStore, Clock]) -> None:
    store, _ = queue
    job_id = running(store)
    card = Scorecard.model_validate(
        fill_placeholders(copy.deepcopy(EXAMPLES["qscore.scorecard/v0.3"]))
    )
    store.insert_scorecard(job_id, card, "scorecards/card.json")
    store.insert_scorecard(job_id, card, "scorecards/card.json")
    assert len(store.job_scorecards(job_id)) == 1
    assert (
        store.scorecard_by_item(card.item.item_sha256)["scorecard"]["schema"]
        == "qscore.scorecard/v0.3"
    )
    changed = card.model_copy(update={"requests": ["different"]})
    with pytest.raises(RecordError, match="different stored content"):
        store.insert_scorecard(job_id, changed, "scorecards/card.json")
    attempt_doc = fill_placeholders(copy.deepcopy(EXAMPLES["qscore.attempt/v0.2"]))
    attempt_doc["job_id"] = str(job_id)
    attempt = AttemptRecord.model_validate(attempt_doc)
    store.insert_attempt(job_id, attempt)
    store.insert_attempt(job_id, attempt)
    assert len(store.job_attempts(job_id)) == 1
    with pytest.raises(RecordError, match="different content"):
        store.insert_attempt(job_id, attempt.model_copy(update={"decision_reason": "different"}))
