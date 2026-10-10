"""Platform API (specs/12 §2; task T28). Served on port 8080 behind Caddy, which strips `/api`.

Jobs go into Neon; workers claim them; this API only creates jobs and reads records back.
Nothing here computes scores (12: "Nothing here computes scores").

Deviation from 12 §2, recorded in docs/deployment.md (the lead turns it into a proposal): the web
app is a static browser app, so it cannot hold a secret. Submitting a job is therefore open, but
limited to the bundled examples (no uploads, so nothing untrusted reaches a worker), to
`MAX_OPEN_JOBS` unfinished web jobs, and to `PER_CLIENT_LIMIT` submissions per client per window.
Cancelling still needs the bearer token `QSCORE_PLATFORM_TOKEN`.
"""

from __future__ import annotations

import os
import secrets
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from qscore import __version__
from qscore.config import get_settings
from qscore.errors import ConfigError, InvalidInput, NeonError, RecordError
from qscore.record.neon import NeonStore
from qscore.schemas.common import sha256_hex
from qscore.schemas.records import JobSpec
from qscore.validate.schema_checks import load_manifest

GPU_ONLINE_WINDOW_S = 30  # 12 §4
MAX_OPEN_JOBS = 10
PER_CLIENT_LIMIT = 5
PER_CLIENT_WINDOW_S = 600
WEB_SUBMITTER = "web"


def _examples_dir() -> Path:
    """Bundled examples: `QSCORE_EXAMPLES_DIR`, else `<repo>/qscore/examples` next to `src/`."""
    configured = os.environ.get("QSCORE_EXAMPLES_DIR", "").strip()
    path = Path(configured) if configured else Path(__file__).resolve().parents[3] / "examples"
    if not path.is_dir():
        raise ConfigError(f"bundled examples not found at {path}; set QSCORE_EXAMPLES_DIR")
    return path


def _bundled_examples(root: Path) -> dict[str, Path]:
    """Example name → its qscore.yaml (every folder with a manifest, except the broken fixtures)."""
    return {
        d.name: d / "qscore.yaml"
        for d in sorted(root.iterdir())
        if d.is_dir() and d.name != "broken" and (d / "qscore.yaml").is_file()
    }


class _State:
    store: NeonStore
    examples: dict[str, Path]
    recent: dict[str, deque[float]]


state = _State()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Fail at startup, loudly, rather than on the first request (R4).
    state.store = NeonStore.from_settings(get_settings())
    state.examples = _bundled_examples(_examples_dir())
    if not state.examples:
        raise ConfigError("no bundled examples with a qscore.yaml were found")
    state.recent = defaultdict(deque)
    yield


app = FastAPI(
    title="Gatesmith platform API",
    version=__version__,
    lifespan=lifespan,
    root_path=os.environ.get("API_ROOT_PATH", ""),
)


@app.exception_handler(NeonError)
async def _neon_error(_: Request, exc: NeonError) -> JSONResponse:
    return JSONResponse(
        status_code=503, content={"error": "database unavailable", "detail": str(exc)}
    )


@app.exception_handler(RecordError)
async def _record_error(_: Request, exc: RecordError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": "record conflict", "detail": str(exc)})


def _job_view(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"] or {}
    return {
        "id": row["id"],
        "kind": row["kind"],
        "state": row["state"],
        "example": payload.get("x-example"),
        "items": payload.get("items", []),
        "attempts": row["attempts"],
        "max_attempts": row["max_attempts"],
        "claimed_by": row["claimed_by"],
        "created_at": row["created_at"],
        "claimed_at": row["claimed_at"],
        "started_at": row["started_at"],
        "heartbeat_at": row["heartbeat_at"],
        "finished_at": row["finished_at"],
        "error": row["error"],
        "result_summary": row["result_summary"],
    }


def _require_job(job_id: UUID) -> dict[str, Any]:
    state.store.requeue_stale()  # status reads recover stale jobs with no worker polling (12 §2)
    row = state.store.get_job(job_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"no job {job_id}")
    return row


@app.get("/health")
def health() -> dict[str, Any]:
    seen = state.store.gpu_last_seen()
    online = seen is not None and (datetime.now(UTC) - seen).total_seconds() < GPU_ONLINE_WINDOW_S
    return {
        "ok": True,
        "version": __version__,
        "gpu_online": online,
        "gpu_last_seen": seen,
        "examples": sorted(state.examples),
    }


class JobRequest(BaseModel):
    example: str
    kind: Literal["score"] = "score"


def _allow_client(client: str) -> bool:
    now = time.monotonic()
    window = state.recent[client]
    while window and now - window[0] > PER_CLIENT_WINDOW_S:
        window.popleft()
    if len(window) >= PER_CLIENT_LIMIT:
        return False
    window.append(now)
    return True


@app.post("/jobs", status_code=201)
def submit_job(body: JobRequest, request: Request) -> dict[str, Any]:
    manifest_path = state.examples.get(body.example)
    if manifest_path is None:
        raise HTTPException(
            status_code=422,
            detail=f"unknown example {body.example!r}; choose one of {sorted(state.examples)}",
        )
    if state.store.count_open_jobs(WEB_SUBMITTER) >= MAX_OPEN_JOBS:
        raise HTTPException(status_code=429, detail="too many jobs in progress; try again shortly")
    client = request.client.host if request.client else "unknown"
    if not _allow_client(client):
        raise HTTPException(status_code=429, detail="too many submissions; wait a few minutes")

    try:
        manifest = load_manifest(manifest_path)
    except InvalidInput as exc:
        raise HTTPException(status_code=500, detail=f"bundled example is invalid: {exc}") from exc
    yaml_bytes = manifest_path.read_bytes()
    sha = sha256_hex(yaml_bytes)  # same hash as services.score_project uses for this file
    spec = JobSpec.model_validate(
        {
            "schema": "qscore.job/v0.2",
            "kind": body.kind,
            "project": manifest.project.name,
            "manifest_sha256": sha,
            "items": [c.id for c in manifest.circuits],
            "x-example": body.example,
        }
    )
    project_id = state.store.ensure_project(manifest.project.name)
    manifest_id = state.store.ensure_manifest(
        project_id, sha, manifest.schema_, yaml_bytes.decode("utf-8")
    )
    # Submitting from the web app follows the Confirm screen, so the confirmation is stored (05 §5).
    state.store.confirm_manifest(sha, "stored")
    job_id = state.store.create_job(
        spec, project_id=project_id, manifest_id=manifest_id, created_by=WEB_SUBMITTER
    )
    return {
        "id": job_id,
        "state": "queued",
        "kind": body.kind,
        "example": body.example,
        "items": spec.items,
    }


@app.get("/jobs/{job_id}")
def get_job(job_id: UUID) -> dict[str, Any]:
    return _job_view(_require_job(job_id))


@app.get("/jobs/{job_id}/events")
def get_job_events(job_id: UUID, after: int = 0) -> list[dict[str, Any]]:
    _require_job(job_id)
    return state.store.job_events(job_id, after)


@app.get("/jobs/{job_id}/scorecards")
def get_job_scorecards(job_id: UUID) -> list[dict[str, Any]]:
    _require_job(job_id)
    return state.store.job_scorecards(job_id)


@app.get("/jobs/{job_id}/attempts")
def get_job_attempts(job_id: UUID) -> list[dict[str, Any]]:
    _require_job(job_id)
    return [r["record"] for r in state.store.job_attempts(job_id)]


@app.get("/scorecards/{item_sha256}")
def get_scorecard(item_sha256: str) -> dict[str, Any]:
    row = state.store.scorecard_by_item(item_sha256)
    if row is None:
        raise HTTPException(status_code=404, detail=f"no scorecard for item {item_sha256}")
    return row


@app.get("/leaderboard")
def get_leaderboard() -> list[dict[str, Any]]:
    return state.store.leaderboard()


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: UUID, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = os.environ.get("QSCORE_PLATFORM_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=503, detail="cancelling is disabled: no platform token set")
    if authorization is None or not secrets.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="cancelling needs the platform token")
    _require_job(job_id)
    if not state.store.cancel_job(job_id):
        raise HTTPException(status_code=409, detail="only queued jobs can be cancelled")
    return {"id": job_id, "state": "cancelled"}
