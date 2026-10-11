import asyncio
import hashlib
import hmac
import json
from pathlib import Path

from fastapi.testclient import TestClient
from qscore.errors import LayerError
from test_bundle import BASE, HEAD, fixture_bundle, metadata
from test_gemini import settings

from qscore_review.app import Service, create_app
from qscore_review.state import State


def payload():
    return {
        "action": "completed",
        "repository": {"id": 1, "full_name": "org/demo", "private": False},
        "installation": {"id": 2},
        "workflow_run": {"id": 4},
    }


def headers(raw, secret="x" * 32, delivery="delivery-1"):
    return {
        "x-github-delivery": delivery,
        "x-github-event": "workflow_run",
        "x-hub-signature-256": "sha256="
        + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest(),
    }


class FakeGitHub:
    def __init__(self, raw=None, config=None, stale=False):
        self.raw = raw or fixture_bundle()
        self.run, self.pr = metadata()
        self.config_raw = config
        self.stale = stale
        self.posts = []
        self.calls = []

    async def token(self, installation):
        assert installation == 2
        return "test-token"

    async def close(self):
        pass

    async def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path.endswith("/actions/runs/4"):
            return self.run
        if "/artifacts?" in path:
            return {
                "total_count": 1,
                "artifacts": [{"name": "qscore-review-bundle", "id": 10, "expired": False}],
            }
        if path.endswith("/pulls/5"):
            if self.stale:
                return dict(self.pr, head={"sha": "c" * 40, "repo": {"id": 1}})
            return self.pr
        raise AssertionError((method, path))

    async def artifact(self, repository, artifact_id, token):
        return self.raw

    async def config(self, repository, base_sha, token):
        assert base_sha == BASE
        return self.config_raw

    async def sticky(self, repo, pr, token, body):
        self.posts.append(("summary", body))
        return 11

    async def check(self, repo, head, token, conclusion, summary, identity, check_id=None):
        assert head == HEAD
        self.posts.append(("check", conclusion))
        return 12

    async def pages(self, path, token):
        return []


class FailedGemini:
    async def draft(self, *args):
        raise LayerError("quota")


def test_webhook_hmac_precedes_json_allowlist_and_delivery_dedup(tmp_path):
    cfg = settings(tmp_path)
    state = State(tmp_path / "state.db")
    app = create_app(cfg, state=state, github=FakeGitHub(), start_worker=False)
    with TestClient(app) as client:
        assert client.post("/webhooks/github", content=b"not-json").status_code == 401
        raw = json.dumps(payload()).encode()
        assert client.post("/webhooks/github", content=raw, headers=headers(raw)).json() == {
            "status": "queued"
        }
        assert client.post("/webhooks/github", content=raw, headers=headers(raw)).json() == {
            "status": "duplicate"
        }
        wrong = payload()
        wrong["installation"]["id"] = 99
        raw = json.dumps(wrong).encode()
        assert client.post("/webhooks/github", content=raw, headers=headers(raw)).status_code == 400


def test_real_service_posts_deterministic_summary_and_check_once(tmp_path):
    cfg = settings(tmp_path)
    state = State(tmp_path / "state.db")
    github = FakeGitHub()
    service = Service(cfg, state, github, FailedGemini())
    asyncio.run(service.process("workflow_run", payload()))
    assert github.posts[0][0] == "summary"
    assert github.posts[1] == ("check", "neutral")
    assert "worse outside seed spread" in github.posts[0][1]
    asyncio.run(service.process("workflow_run", payload()))
    assert len(github.posts) == 2


def test_engine_policy_failure_survives_gemini_quota(tmp_path):
    cfg = settings(tmp_path)
    cfg.knowledge_path = Path(__file__).parents[1] / "knowledge/qiskit.json"
    state = State(tmp_path / "state.db")
    config = {"gemini": True, "fail_on": "new_high"}
    github = FakeGitHub(
        fixture_bundle(config=config), b"version: 1\ngemini: true\nfail_on: new_high\n"
    )
    service = Service(cfg, state, github, FailedGemini())
    asyncio.run(service.process("workflow_run", payload()))
    assert github.posts[0][0] == "summary"
    assert github.posts[-1] == ("check", "failure")
    assert "Gemini review failed" in github.posts[-2][1]


def test_stale_head_never_posts(tmp_path):
    cfg = settings(tmp_path)
    github = FakeGitHub(stale=True)
    service = Service(cfg, State(tmp_path / "state.db"), github, FailedGemini())
    asyncio.run(service.process("workflow_run", payload()))
    assert not github.posts


def test_fork_artifact_cannot_opt_itself_into_gemini(tmp_path):
    cfg = settings(tmp_path)
    github = FakeGitHub(fixture_bundle(config={"gemini": True}))
    service = Service(cfg, State(tmp_path / "state.db"), github, FailedGemini())
    import pytest
    from qscore.errors import RecordError

    with pytest.raises(RecordError, match="trusted base"):
        asyncio.run(service.process("workflow_run", payload()))
    assert github.posts[-1] == ("check", "failure")


def test_durable_worker_records_sanitized_failure_and_recovers(tmp_path):
    state = State(tmp_path / "state.db")
    service = Service(settings(tmp_path), state, FakeGitHub(), FailedGemini())
    state.enqueue("bad-job", "workflow_run", {"private-secret": "never-log-this"})

    async def exercise():
        task = asyncio.create_task(service.run())
        await asyncio.sleep(0.02)
        service.stopping = True
        service.wake.set()
        await task

    asyncio.run(exercise())
    row = state.db.execute("SELECT status,error_type FROM jobs").fetchone()
    assert tuple(row) == ("failed", "KeyError")


def test_rescore_refreshes_deterministic_results_without_another_gemini_call(tmp_path):
    from types import SimpleNamespace

    from test_gemini import FakeModels

    from qscore_review.gemini import Gemini

    cfg = settings(tmp_path)
    cfg.knowledge_path = Path(__file__).parents[1] / "knowledge/qiskit.json"
    state = State(tmp_path / "state.db")
    config = {"gemini": True, "fail_on": "new_high"}
    github = FakeGitHub(
        fixture_bundle(config=config), b"version: 1\ngemini: true\nfail_on: new_high\n"
    )
    models = FakeModels()
    gemini = Gemini(cfg, state, SimpleNamespace(aio=SimpleNamespace(models=models)))
    service = Service(cfg, state, github, gemini)
    asyncio.run(service.process("workflow_run", payload()))
    first_posts = len(github.posts)
    github.run["run_attempt"] = 2

    def rerun(envelope, payloads):
        envelope["provenance"]["run_attempt"] = 2

    github.raw = fixture_bundle(config=config, head_count=22, mutate=rerun)
    asyncio.run(service.process("workflow_run", payload()))
    assert len(github.posts) > first_posts
    assert "attempt `2`" in github.posts[first_posts][1]
    assert "| 10 | 22 |" in github.posts[first_posts][1]
    assert len(models.calls) == 1
    assert state.db.execute("SELECT COUNT(*) FROM reviews").fetchone()[0] == 2
    posts_after_rescore = len(github.posts)
    asyncio.run(service.process("workflow_run", payload()))
    assert len(github.posts) == posts_after_rescore


class AnyRunGitHub(FakeGitHub):
    def __init__(self):
        super().__init__()
        self.missing = False
        self.artifact_downloads = 0

    async def request(self, method, path, **kwargs):
        import re

        if re.fullmatch(r"/repos/org/demo/actions/runs/\d+", path):
            self.calls.append((method, path, kwargs))
            return self.run
        if "/artifacts?" in path and self.missing:
            return {"total_count": 0, "artifacts": []}
        return await super().request(method, path, **kwargs)

    async def artifact(self, *args):
        self.artifact_downloads += 1
        return await super().artifact(*args)

    def generation(self, run_id, attempt=1, *, count=20):
        self.run["id"], self.run["run_attempt"] = run_id, attempt

        def mutate(envelope, payloads):
            envelope["provenance"]["run_id"] = run_id
            envelope["provenance"]["run_attempt"] = attempt

        self.raw = fixture_bundle(head_count=count, mutate=mutate)
        event = payload()
        event["workflow_run"]["id"] = run_id
        return event


def test_late_older_run_cannot_revert_newer_summary_even_after_restart(tmp_path):
    cfg = settings(tmp_path)
    state = State(tmp_path / "state.db")
    github = AnyRunGitHub()
    service = Service(cfg, state, github, FailedGemini())
    asyncio.run(service.process("workflow_run", github.generation(7, count=22)))
    assert "| 10 | 22 |" in github.posts[0][1]
    published = list(github.posts)
    state.close()
    state = State(tmp_path / "state.db")
    service = Service(cfg, state, github, FailedGemini())
    old_event = github.generation(4, count=20)
    github.raw = b"malformed older artifact must never be parsed"
    asyncio.run(service.process("workflow_run", old_event))
    assert github.posts == published
    assert github.artifact_downloads == 1
    github.missing = True
    asyncio.run(service.process("workflow_run", old_event))
    assert github.posts == published


def test_newer_failure_blocks_older_success_and_uses_current_generation(tmp_path):
    import pytest
    from qscore.errors import RecordError

    cfg = settings(tmp_path)
    state = State(tmp_path / "state.db")
    github = AnyRunGitHub()
    service = Service(cfg, state, github, FailedGemini())
    asyncio.run(service.process("workflow_run", github.generation(4)))
    new_event = github.generation(7)
    github.missing = True
    with pytest.raises(RecordError, match="Missing"):
        asyncio.run(service.process("workflow_run", new_event))
    assert github.posts[-1] == ("check", "failure")
    failed_publication = list(github.posts)
    github.missing = False
    asyncio.run(service.process("workflow_run", github.generation(4)))
    assert github.posts == failed_publication
    assert state.generation_current(f"1:5:{BASE}:{HEAD}", 7, 1)


def test_older_attempt_of_same_run_cannot_overwrite_rescore(tmp_path):
    github = AnyRunGitHub()
    state = State(tmp_path / "state.db")
    service = Service(settings(tmp_path), state, github, FailedGemini())
    asyncio.run(service.process("workflow_run", github.generation(4, 2, count=22)))
    published = list(github.posts)
    asyncio.run(service.process("workflow_run", github.generation(4, 1, count=20)))
    assert github.posts == published
