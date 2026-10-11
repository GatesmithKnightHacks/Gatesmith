"""Platform queue API (11 §§2-5,12 §2; approved ChP-0054).

The platform alone opens its persistent SQLite store. Every write requires a server-held
platform or per-worker token. Browser authentication and Hub record materialization remain
explicitly unwired; neither anonymous submissions nor invented scores bridge those gaps.
Caddy strips ``/api`` before forwarding to these unprefixed routes.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, cast
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictBool

from qscore import __version__
from qscore.config import Settings, get_settings
from qscore.errors import ClaimLost, ConfigError, InvalidInput, PlatformError, RecordError
from qscore.record.sqlite import SQLiteStore
from qscore.schemas.common import sha256_hex
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.records import JobRequirements, JobSpec
from qscore.schemas.run import Event
from qscore.validate.schema_checks import load_manifest

GPU_ONLINE_WINDOW_S = 30


def _examples_dir() -> Path:
    configured = os.environ.get("QSCORE_EXAMPLES_DIR", "").strip()
    path = Path(configured) if configured else Path(__file__).resolve().parents[3] / "examples"
    if not path.is_dir():
        raise ConfigError(f"bundled examples not found at {path}; set QSCORE_EXAMPLES_DIR")
    return path


@dataclass(frozen=True)
class _Example:
    path: Path
    manifest: ProjectManifest
    sha: str
    project_id: UUID
    manifest_id: UUID


@dataclass
class _State:
    settings: Settings
    store: SQLiteStore
    examples: dict[str, _Example]


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExampleRequest(_Body):
    example: str
    kind: Literal["score"] = "score"
    confirmed: Literal[True]


class ManifestRequest(_Body):
    yaml: str


class WorkerRequest(_Body):
    worker_id: str = Field(min_length=1)


class RegisterRequest(WorkerRequest):
    capabilities: dict[str, StrictBool]
    hardware_profile: dict[str, Any] | None = None


class ClaimRequest(WorkerRequest):
    capabilities: dict[str, StrictBool]


class FinishRequest(WorkerRequest):
    result_summary: dict[str, Any]
    hub_paths: dict[str, str]


class WorkerFailure(_Body):
    type: str = Field(min_length=1)
    message: str
    at: AwareDatetime
    attempt: int = Field(ge=1, le=3)


class FailRequest(WorkerRequest):
    error: WorkerFailure


def _state(request: Request) -> _State:
    return cast(_State, request.app.state.platform)


def _platform_auth(state: _State, authorization: str | None) -> None:
    token = state.settings.platform_token
    if token is None:
        raise HTTPException(
            503, "platform writes disabled: QSCORE_PLATFORM_TOKEN is not configured"
        )
    if authorization is None or not secrets.compare_digest(
        authorization, f"Bearer {token.get_secret_value()}"
    ):
        raise HTTPException(401, "platform write requires its server-held bearer token")


def _worker_auth(state: _State, authorization: str | None, worker_id: str | None = None) -> str:
    tokens = state.settings.platform_worker_tokens
    if not tokens:
        raise HTTPException(503, "worker access disabled: no per-worker tokens are configured")
    matched = None
    # Constant-time token comparisons; a valid token never grants another worker's identity.
    for identity, token in tokens.items():
        if authorization is not None and secrets.compare_digest(
            authorization, f"Bearer {token.get_secret_value()}"
        ):
            matched = identity
    if matched is None:
        raise HTTPException(401, "worker request requires its per-worker bearer token")
    if worker_id is not None and worker_id != matched:
        raise HTTPException(403, "worker token does not authorize the supplied worker_id")
    return matched


def _require_job(state: _State, job_id: UUID) -> dict[str, Any]:
    state.store.requeue_stale()
    row = state.store.get_job(job_id)
    if row is None:
        raise HTTPException(404, f"no job {job_id}")
    return row


def _job_view(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    return {
        **{
            key: row[key]
            for key in (
                "id",
                "kind",
                "state",
                "attempts",
                "max_attempts",
                "claimed_by",
                "created_at",
                "claimed_at",
                "started_at",
                "heartbeat_at",
                "finished_at",
                "error",
                "result_summary",
            )
        },
        "example": payload.get("x-example"),
        "items": payload["items"],
    }


def _submission(state: _State, spec: JobSpec) -> dict[str, Any]:
    if spec.manifest_sha256 is None:
        raise HTTPException(503, "job transport without a stored bundled manifest is not wired")
    candidates = [
        example
        for example in state.examples.values()
        if example.sha == spec.manifest_sha256 and example.manifest.project.name == spec.project
    ]
    if not candidates:
        raise HTTPException(
            503, "arbitrary manifest/reference transport is not wired; select a bundled manifest"
        )
    example = candidates[0]
    allowed_items = {circuit.id for circuit in example.manifest.circuits}
    if set(spec.items) - allowed_items:
        raise HTTPException(422, "job items must belong to the confirmed bundled manifest")
    stored = state.store.manifest_for(spec.project, spec.manifest_sha256)
    if stored is None or stored["confirmed_at"] is None:
        raise HTTPException(
            409, "explicitly confirm this exact manifest hash before submitting a job"
        )
    # Current CPU scoring requires Hub publication. An explicit GPU request additionally requires
    # Aer GPU; a CPU-only worker must not claim it. The worker still validates its execution plan.
    requires = spec.requires.model_dump(mode="json")
    if spec.kind != "validate":
        requires["hub_write"] = True
    if spec.options.device == "gpu":
        requires.update(gpu=True, aer_gpu=True)
    spec = spec.model_copy(update={"requires": JobRequirements.model_validate(requires)})
    job_id = state.store.create_job(
        spec, project_id=example.project_id, manifest_id=example.manifest_id, created_by="platform"
    )
    return {
        "id": str(job_id),
        "state": "queued",
        "kind": spec.kind,
        "example": (spec.model_extra or {}).get("x-example"),
        "items": spec.items,
    }


def create_app(settings: Settings | None = None, *, store: SQLiteStore | None = None) -> FastAPI:
    """Construct a queue API without opening the store until application startup."""

    @asynccontextmanager
    async def lifespan(api: FastAPI) -> AsyncIterator[None]:
        configured = settings if settings is not None else get_settings()
        database = store if store is not None else SQLiteStore.from_settings(configured)
        examples: dict[str, _Example] = {}
        for directory in sorted(_examples_dir().iterdir()):
            path = directory / "qscore.yaml"
            if not directory.is_dir() or directory.name == "broken" or not path.is_file():
                continue
            try:
                manifest = load_manifest(path)
                yaml_text = path.read_text(encoding="utf-8")
            except InvalidInput as exc:
                raise ConfigError(
                    f"bundled example {directory.name} has an invalid manifest"
                ) from exc
            except (OSError, UnicodeError) as exc:
                raise ConfigError(f"cannot read bundled example {path}") from exc
            sha = sha256_hex(yaml_text)
            project_id = database.ensure_project(manifest.project.name)
            manifest_id = database.ensure_manifest(project_id, sha, manifest.schema_, yaml_text)
            examples[directory.name] = _Example(path, manifest, sha, project_id, manifest_id)
        if not examples:
            raise ConfigError("no bundled examples with a qscore.yaml were found")
        api.state.platform = _State(configured, database, examples)
        yield

    api = FastAPI(
        title="Gatesmith platform API",
        version=__version__,
        lifespan=lifespan,
        root_path=os.environ.get("API_ROOT_PATH", ""),
    )

    @api.exception_handler(ClaimLost)
    async def claim_lost(_: Request, exc: ClaimLost) -> JSONResponse:
        return JSONResponse(status_code=409, content={"error": "claim lost", "detail": str(exc)})

    @api.exception_handler(PlatformError)
    async def unavailable(_: Request, exc: PlatformError) -> JSONResponse:
        return JSONResponse(
            status_code=503, content={"error": "store unavailable", "detail": str(exc)}
        )

    @api.exception_handler(RecordError)
    async def conflict(_: Request, exc: RecordError) -> JSONResponse:
        return JSONResponse(
            status_code=409, content={"error": "record conflict", "detail": str(exc)}
        )

    @api.get("/health")
    def health(request: Request) -> dict[str, Any]:
        state = _state(request)
        seen = state.store.gpu_last_seen()
        return {
            "ok": True,
            "version": __version__,
            "gpu_online": seen is not None
            and (datetime.now(UTC) - seen).total_seconds() < GPU_ONLINE_WINDOW_S,
            "gpu_last_seen": seen,
            "examples": sorted(state.examples),
            "browser_submission": "unavailable: authenticated browser session is not wired",
            "hub_materialization": "unavailable: Hub record reader is not wired",
        }

    @api.post("/projects/{name}/manifests", status_code=201)
    def store_manifest(
        name: str,
        body: ManifestRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        state = _state(request)
        _platform_auth(state, authorization)
        sha = sha256_hex(body.yaml)
        if not any(
            example.sha == sha and example.manifest.project.name == name
            for example in state.examples.values()
        ):
            raise HTTPException(
                503,
                "arbitrary manifest transport/reference validation is not wired; "
                "use a bundled manifest",
            )
        return {
            "manifest_sha256": sha,
            "issues": [],
            "errors": 0,
            "warnings": 0,
            "confirmation": "required",
        }

    @api.post("/manifests/{sha}/confirm")
    def confirm(
        sha: str, request: Request, authorization: str | None = Header(default=None)
    ) -> dict[str, Any]:
        state = _state(request)
        _platform_auth(state, authorization)
        if not state.store.confirm_manifest(sha, "stored"):
            raise HTTPException(404, "no stored manifest with that hash")
        return {"ok": True, "manifest_sha256": sha, "confirmation": "stored"}

    @api.post("/jobs", status_code=201)
    def submit_job(
        body: JobSpec | ExampleRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        state = _state(request)
        _platform_auth(state, authorization)
        if isinstance(body, ExampleRequest):
            example = state.examples.get(body.example)
            if example is None:
                raise HTTPException(422, f"unknown example {body.example!r}")
            state.store.confirm_manifest(example.sha, "stored")
            spec = JobSpec.model_validate(
                {
                    "schema": "qscore.job/v0.2",
                    "kind": "score",
                    "project": example.manifest.project.name,
                    "manifest_sha256": example.sha,
                    "items": [c.id for c in example.manifest.circuits],
                    "x-example": body.example,
                }
            )
        else:
            spec = body
        return _submission(state, spec)

    @api.get("/jobs/{job_id}")
    def get_job(job_id: UUID, request: Request) -> dict[str, Any]:
        return _job_view(_require_job(_state(request), job_id))

    @api.get("/jobs/{job_id}/events")
    def job_events(
        job_id: UUID, request: Request, after: int = Query(default=0, ge=0)
    ) -> list[dict[str, Any]]:
        state = _state(request)
        _require_job(state, job_id)
        return state.store.job_events(job_id, after)

    @api.get("/jobs/{job_id}/scorecards")
    def scorecards(job_id: UUID, request: Request) -> list[dict[str, Any]]:
        state = _state(request)
        job = _require_job(state, job_id)
        cards = state.store.job_scorecards(job_id)
        if job["state"] == "done" and job["kind"] in {"score", "improve"} and not cards:
            raise HTTPException(
                503,
                "job references published Hub records, but scorecard materialization is not wired",
            )
        return cards

    @api.get("/jobs/{job_id}/attempts")
    def attempts(job_id: UUID, request: Request) -> list[dict[str, Any]]:
        state = _state(request)
        job = _require_job(state, job_id)
        records = state.store.job_attempts(job_id)
        if job["state"] == "done" and job["kind"] in {"improve", "conform"} and not records:
            raise HTTPException(
                503,
                "job references published Hub records, but attempt materialization is not wired",
            )
        return [row["record"] for row in records]

    @api.get("/scorecards/{item_sha256}")
    def scorecard(item_sha256: str, request: Request) -> dict[str, Any]:
        row = _state(request).store.scorecard_by_item(item_sha256)
        if row is None:
            raise HTTPException(
                404, f"no materialized scorecard for item {item_sha256}; Hub reader is not wired"
            )
        return row

    @api.get("/leaderboard")
    def leaderboard() -> list[dict[str, Any]]:
        raise HTTPException(
            503, "Hub leaderboard materialization is not wired; use the Hugging Face Space"
        )

    @api.post("/jobs/{job_id}/cancel")
    def cancel(
        job_id: UUID, request: Request, authorization: str | None = Header(default=None)
    ) -> dict[str, Any]:
        state = _state(request)
        _platform_auth(state, authorization)
        _require_job(state, job_id)
        if not state.store.cancel_job(job_id):
            raise HTTPException(409, "only queued jobs can be cancelled")
        return {"id": str(job_id), "state": "cancelled"}

    @api.post("/worker/register")
    def register(
        body: RegisterRequest, request: Request, authorization: str | None = Header(default=None)
    ) -> dict[str, bool]:
        state = _state(request)
        _worker_auth(state, authorization, body.worker_id)
        state.store.upsert_worker(body.worker_id, body.capabilities, body.hardware_profile)
        return {"ok": True}

    @api.post("/worker/claim")
    def claim(
        body: ClaimRequest, request: Request, authorization: str | None = Header(default=None)
    ) -> Any:
        state = _state(request)
        _worker_auth(state, authorization, body.worker_id)
        row = state.store.claim_job(body.worker_id, body.capabilities)
        return Response(status_code=204) if row is None else row

    @api.post("/jobs/{job_id}/start")
    def start(
        job_id: UUID,
        body: WorkerRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        state = _state(request)
        _worker_auth(state, authorization, body.worker_id)
        return {"state": state.store.start_job(job_id, body.worker_id)}

    @api.post("/jobs/{job_id}/heartbeat")
    def heartbeat(
        job_id: UUID,
        body: WorkerRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        state = _state(request)
        _worker_auth(state, authorization, body.worker_id)
        return {"state": state.store.heartbeat(job_id, body.worker_id)}

    @api.post("/jobs/{job_id}/events")
    def events(
        job_id: UUID,
        body: list[Event],
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        state = _state(request)
        identity = _worker_auth(state, authorization)
        return {"ok": True, "state": state.store.insert_events(job_id, identity, body)}

    @api.post("/jobs/{job_id}/finish")
    def finish(
        job_id: UUID,
        body: FinishRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        state = _state(request)
        _worker_auth(state, authorization, body.worker_id)
        return {
            "state": state.store.finish_job(
                job_id, body.worker_id, body.result_summary, body.hub_paths
            )
        }

    @api.post("/jobs/{job_id}/fail")
    def fail(
        job_id: UUID,
        body: FailRequest,
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, str]:
        state = _state(request)
        _worker_auth(state, authorization, body.worker_id)
        return {
            "state": state.store.fail_job(
                job_id, body.worker_id, body.error.model_dump(mode="json")
            )
        }

    return api


app = create_app()
