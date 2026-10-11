"""Worker HTTPS transport for the platform job API (11 §§3,5).

Transient failures retry the identical operation at most three times. There is no local queue,
model switch or success substitute. A 409 on an owned-job write means the worker must stop.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from pydantic import ValidationError

from qscore.config import Settings
from qscore.errors import ClaimLost, ConfigError, PlatformError
from qscore.schemas.records import JobSpec
from qscore.schemas.run import Event

log = logging.getLogger(__name__)


class JobsClient:
    """One authenticated worker client; request timeout and retry delays are in seconds."""

    def __init__(
        self, base_url: str, token: str, worker_id: str, *, client: httpx.Client | None = None
    ) -> None:
        parsed = urlsplit(base_url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ConfigError(
                "QSCORE_PLATFORM_URL must be an HTTPS URL without credentials or query"
            )
        if not token.strip() or not worker_id.strip():
            raise ConfigError("the platform job client needs a nonempty worker token and worker id")
        self.base_url = base_url.rstrip("/")
        self.worker_id = worker_id
        self._token = token
        self._client = client if client is not None else httpx.Client(timeout=30)
        self._owns_client = client is None

    @classmethod
    def from_settings(cls, settings: Settings) -> JobsClient:
        """Require the configured HTTPS platform URL, worker token and worker identity."""
        if (
            settings.platform_url is None
            or settings.worker_token is None
            or settings.worker_id is None
        ):
            raise ConfigError(
                "worker requires QSCORE_PLATFORM_URL, QSCORE_WORKER_TOKEN and QSCORE_WORKER_ID"
            )
        return cls(
            settings.platform_url, settings.worker_token.get_secret_value(), settings.worker_id
        )

    def close(self) -> None:
        """Close the owned HTTP connection pool; injected clients remain caller-owned."""
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> JobsClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _request(self, path: str, body: object, *, claim: bool = False) -> httpx.Response:
        for attempt in range(1, 4):
            try:
                response = self._client.post(
                    f"{self.base_url}{path}",
                    json=body,
                    headers={"Authorization": f"Bearer {self._token}"},
                )
            except httpx.TransportError as exc:
                if attempt == 3:
                    raise PlatformError(f"platform {path} unreachable after 3 attempts") from exc
                log.warning("platform %s transport failed (attempt %d/3)", path, attempt)
                time.sleep(0.25 * 2 ** (attempt - 1))
                continue
            if response.status_code == 429 or 500 <= response.status_code <= 599:
                if attempt == 3:
                    raise PlatformError(
                        f"platform {path} returned HTTP {response.status_code} after 3 attempts"
                    )
                log.warning(
                    "platform %s returned HTTP %d (attempt %d/3)",
                    path,
                    response.status_code,
                    attempt,
                )
                time.sleep(0.25 * 2 ** (attempt - 1))
                continue
            if response.status_code == 409 and claim:
                raise ClaimLost(f"platform rejected the current claim for {path} (HTTP 409)")
            if not 200 <= response.status_code <= 299:
                raise PlatformError(
                    f"platform {path} rejected the operation (HTTP {response.status_code})"
                )
            return response
        raise AssertionError("bounded request loop must return or raise")

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError as exc:
            raise PlatformError("platform returned a response that is not JSON") from exc
        if not isinstance(body, dict):
            raise PlatformError("platform response must be a JSON object")
        return body

    def _state(self, path: str, body: dict[str, Any], expected: set[str]) -> str:
        response = self._json(self._request(path, body, claim=True))
        state = response.get("state")
        if not isinstance(state, str) or state not in expected:
            raise PlatformError(f"platform {path} returned an invalid state {state!r}")
        return str(state)

    def register(
        self, capabilities: dict[str, bool], hardware_profile: dict[str, Any] | None
    ) -> None:
        """Register this worker and its measured capabilities; no job is started."""
        body = self._json(
            self._request(
                "/worker/register",
                {
                    "worker_id": self.worker_id,
                    "capabilities": capabilities,
                    "hardware_profile": hardware_profile,
                },
            )
        )
        if body.get("ok") is not True:
            raise PlatformError("platform did not acknowledge worker registration")

    def claim(self, capabilities: dict[str, bool]) -> dict[str, Any] | None:
        """Claim one matching job; exactly HTTP 204 means the queue has no match."""
        response = self._request(
            "/worker/claim",
            {
                "worker_id": self.worker_id,
                "capabilities": capabilities,
            },
        )
        if response.status_code == 204:
            return None
        body = self._json(response)
        if (
            body.get("state") not in {"claimed", "running"}
            or body.get("claimed_by") != self.worker_id
        ):
            raise PlatformError("platform claim response lacks this worker's live claim")
        try:
            UUID(body["id"])
            JobSpec.model_validate(body["payload"])
        except (KeyError, ValueError, TypeError, ValidationError) as exc:
            raise PlatformError("platform claim response contains an invalid job document") from exc
        if type(body.get("last_event_seq")) is not int or body["last_event_seq"] < 0:
            raise PlatformError("platform claim response needs a nonnegative last_event_seq")
        return body

    def start(self, job_id: UUID) -> str:
        """Mark an owned job running; repeated identical calls are safe."""
        return self._state(f"/jobs/{job_id}/start", {"worker_id": self.worker_id}, {"running"})

    def heartbeat(self, job_id: UUID) -> str:
        """Refresh the owned claim; ``ClaimLost`` means stop work immediately."""
        return self._state(
            f"/jobs/{job_id}/heartbeat", {"worker_id": self.worker_id}, {"claimed", "running"}
        )

    def events(self, job_id: UUID, events: Sequence[Event]) -> None:
        """Send one ≤50-event batch; the worker controls the ≤2-second flush interval."""
        if len(events) > 50:
            raise PlatformError("an event batch may contain at most 50 events")
        body = self._json(
            self._request(
                f"/jobs/{job_id}/events",
                [event.model_dump(mode="json") for event in events],
                claim=True,
            )
        )
        if body.get("ok") is not True or body.get("state") not in {"claimed", "running"}:
            raise PlatformError("platform did not acknowledge events for a live claim")

    def finish(
        self, job_id: UUID, result_summary: dict[str, Any], hub_paths: dict[str, str]
    ) -> str:
        """Publish the result summary after local and Hub writes have both succeeded."""
        return self._state(
            f"/jobs/{job_id}/finish",
            {
                "worker_id": self.worker_id,
                "result_summary": result_summary,
                "hub_paths": hub_paths,
            },
            {"done"},
        )

    def fail(self, job_id: UUID, error: dict[str, Any]) -> str:
        """Record the typed terminal job error; a failed job is never retried locally."""
        return self._state(
            f"/jobs/{job_id}/fail",
            {
                "worker_id": self.worker_id,
                "error": error,
            },
            {"failed"},
        )
