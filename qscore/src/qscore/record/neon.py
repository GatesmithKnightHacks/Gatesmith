"""Neon (Postgres): the job queue and the system of record (specs/11 §3-5).

Tables, functions and role grants are in `scripts/neon/0001-0003`. Each host connects with its own
role (`qscore_platform`, `qscore_worker`), so a method used by the wrong role fails with
`NeonError` (permission denied) rather than doing more than it should.

Writes are idempotent (11 §4): `insert ... on conflict do nothing`, then the stored row is read back
and compared; a different row under the same key raises `RecordError`. Connecting is retried at most
three times with backoff (R3.5, Neon may be waking from suspend), then `NeonError` is raised.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from qscore.config import Settings
from qscore.errors import ConfigError, NeonError, RecordError
from qscore.schemas.common import canonical_json
from qscore.schemas.records import JobSpec
from qscore.schemas.run import Event
from qscore.schemas.scorecard import Scorecard

log = logging.getLogger(__name__)

CONNECT_ATTEMPTS = 3
_SEVERITY_ORDER = {"info": 0, "warning": 1, "high": 2}
_JOB_COLUMNS = (
    "id, kind, state, priority, attempts, max_attempts, claimed_by, claimed_at, heartbeat_at, "
    "started_at, finished_at, error, result_summary, payload, created_by, created_at"
)

Row = dict[str, Any]


class NeonStore:
    """One store per process. Each call opens a short connection and commits on success."""

    def __init__(self, dsn: str) -> None:
        if not dsn.strip():
            raise ConfigError(
                "QSCORE_NEON_DSN is empty; set it to this host's role connection string"
            )
        self._dsn = dsn

    @classmethod
    def from_settings(cls, settings: Settings) -> NeonStore:
        """Build the store from `QSCORE_NEON_DSN`; an unset or empty value is a `ConfigError`."""
        if settings.neon_dsn is None or not settings.neon_dsn.get_secret_value().strip():
            raise ConfigError("QSCORE_NEON_DSN is not set; Neon records need a connection string")
        return cls(settings.neon_dsn.get_secret_value())

    @contextmanager
    def _conn(self) -> Iterator[psycopg.Connection[Row]]:
        last: psycopg.OperationalError | None = None
        conn: psycopg.Connection[Row] | None = None
        for attempt in range(1, CONNECT_ATTEMPTS + 1):
            try:
                # prepare_threshold=None keeps the pooled (PgBouncer) endpoint working (11 §2).
                conn = psycopg.connect(
                    self._dsn, row_factory=dict_row, prepare_threshold=None, connect_timeout=10
                )
                break
            except psycopg.OperationalError as exc:
                last = exc
                log.warning("Neon connect failed (attempt %d/%d)", attempt, CONNECT_ATTEMPTS)
                if attempt < CONNECT_ATTEMPTS:
                    time.sleep(2 ** (attempt - 1))
        if conn is None:
            raise NeonError(f"could not connect to Neon after {CONNECT_ATTEMPTS} attempts: {last}")
        try:
            with conn:  # commits on success, rolls back on error, then closes
                yield conn
        except psycopg.Error as exc:
            raise NeonError(f"Neon query failed: {exc}") from exc

    def _one(self, sql: str, params: Sequence[Any] = ()) -> Row | None:
        with self._conn() as conn:
            return conn.execute(sql, params).fetchone()

    def _all(self, sql: str, params: Sequence[Any] = ()) -> list[Row]:
        with self._conn() as conn:
            return conn.execute(sql, params).fetchall()

    # ── Shared ────────────────────────────────────────────────────────────────────────────────

    def requeue_stale(self) -> int:
        """Return jobs with no heartbeat for 60 s to the queue (or fail them); number of jobs."""
        row = self._one("select requeue_stale() as n")
        return int(row["n"]) if row else 0

    def get_job(self, job_id: UUID) -> Row | None:
        return self._one(f"select {_JOB_COLUMNS} from jobs where id = %s", (job_id,))

    # ── Platform (qscore_platform) ────────────────────────────────────────────────────────────

    def gpu_last_seen(self) -> datetime | None:
        """Latest check-in of any worker with the `gpu` capability (12 §4)."""
        row = self._one(
            "select max(last_seen_at) as at from workers where (capabilities ->> 'gpu')::boolean"
        )
        return row["at"] if row else None

    def ensure_project(self, name: str) -> UUID:
        with self._conn() as conn:
            conn.execute(
                "insert into projects (name) values (%s) on conflict (name) do nothing", (name,)
            )
            row = conn.execute("select id from projects where name = %s", (name,)).fetchone()
        if row is None:
            raise RecordError(f"project {name!r} missing right after insert")
        return UUID(str(row["id"]))

    def ensure_manifest(
        self, project_id: UUID, sha256: str, schema_version: str, yaml_text: str
    ) -> UUID:
        with self._conn() as conn:
            conn.execute(
                "insert into manifests (project_id, sha256, schema_version, yaml) "
                "values (%s, %s, %s, %s) on conflict (project_id, sha256) do nothing",
                (project_id, sha256, schema_version, yaml_text),
            )
            row = conn.execute(
                "select id, yaml from manifests where project_id = %s and sha256 = %s",
                (project_id, sha256),
            ).fetchone()
        if row is None:
            raise RecordError(f"manifest {sha256[:12]} missing right after insert")
        if row["yaml"] != yaml_text:
            raise RecordError(f"manifest {sha256[:12]} is stored with different YAML (11 §4)")
        return UUID(str(row["id"]))

    def confirm_manifest(self, sha256: str, mode: str = "stored") -> bool:
        """Record the confirmation; true once confirmed (the first confirmation is kept)."""
        row = self._one("select confirm_manifest(%s, %s) as ok", (sha256, mode))
        return bool(row and row["ok"])

    def create_job(
        self,
        spec: JobSpec,
        *,
        project_id: UUID | None,
        manifest_id: UUID | None,
        created_by: str,
        priority: int = 100,
    ) -> UUID:
        payload = spec.model_dump(mode="json", by_alias=True)
        requires = spec.requires.model_dump(mode="json")
        if any(v is not True for v in requires.values()):
            # A false flag never matches any worker under `requires <@ capabilities` (CP-0005).
            raise RecordError(f"job requirements may only list needed (true) flags: {requires}")
        row = self._one(
            "insert into jobs (kind, project_id, manifest_id, payload, requires, priority, "
            "created_by) values (%s, %s, %s, %s, %s, %s, %s) returning id",
            (
                spec.kind,
                project_id,
                manifest_id,
                Jsonb(payload),
                Jsonb(requires),
                priority,
                created_by,
            ),
        )
        if row is None:
            raise RecordError("job insert returned no id")
        return UUID(str(row["id"]))

    def count_open_jobs(self, created_by: str) -> int:
        row = self._one(
            "select count(*) as n from jobs where created_by = %s "
            "and state in ('queued', 'claimed', 'running')",
            (created_by,),
        )
        return int(row["n"]) if row else 0

    def cancel_job(self, job_id: UUID) -> bool:
        """`queued → cancelled` only; false when the job is already claimed or finished."""
        row = self._one("select cancel_job(%s) as ok", (job_id,))
        return bool(row and row["ok"] is True)

    def job_events(self, job_id: UUID, after: int = 0) -> list[Row]:
        return self._all(
            "select seq, at, kind, data from job_events "
            "where job_id = %s and seq > %s order by seq",
            (job_id, after),
        )

    def job_scorecards(self, job_id: UUID) -> list[Row]:
        return self._all(
            "select item_id, item_sha256, status, worst_severity, findings_count, scorecard, "
            "hub_path, created_at from scorecards where job_id = %s order by item_id",
            (job_id,),
        )

    def scorecard_by_item(self, item_sha256: str) -> Row | None:
        return self._one(
            "select job_id, item_id, item_sha256, status, scorecard, created_at from scorecards "
            "where item_sha256 = %s order by created_at desc limit 1",
            (item_sha256,),
        )

    def job_attempts(self, job_id: UUID) -> list[Row]:
        return self._all(
            "select record from attempts where job_id = %s order by created_at", (job_id,)
        )

    def leaderboard(self) -> list[Row]:
        return self._all(
            "select * from leaderboard order by verified_improvement_rate desc nulls last"
        )

    # ── Worker (qscore_worker) ────────────────────────────────────────────────────────────────

    def upsert_worker(
        self, worker_id: str, capabilities: dict[str, bool], hardware_profile: Row | None = None
    ) -> None:
        self._one(
            "insert into workers (id, capabilities, hardware_profile) values (%s, %s, %s) "
            "on conflict (id) do update set capabilities = excluded.capabilities, "
            "hardware_profile = excluded.hardware_profile, last_seen_at = now() returning id",
            (worker_id, Jsonb(capabilities), Jsonb(hardware_profile) if hardware_profile else None),
        )

    def touch_worker(self, worker_id: str) -> None:
        """Update `last_seen_at` (the GPU-online indicator reads it, 12 §4)."""
        self._one(
            "update workers set last_seen_at = now() where id = %s returning id", (worker_id,)
        )

    def claim_job(self, worker_id: str, capabilities: dict[str, bool]) -> Row | None:
        """The next queued job whose requirements these capabilities cover, or None."""
        return self._one(
            f"select {_JOB_COLUMNS} from claim_job(%s, %s)", (worker_id, Jsonb(capabilities))
        )

    def heartbeat(self, job_id: UUID, worker_id: str) -> str | None:
        """The job's state; None means the claim is lost and work must stop at once (11 §3.1)."""
        row = self._one("select heartbeat(%s, %s) as state", (job_id, worker_id))
        return None if row is None or row["state"] is None else str(row["state"])

    def _transition(
        self,
        job_id: UUID,
        worker_id: str,
        from_state: str,
        sql_set: str,
        params: Sequence[Any] = (),
    ) -> None:
        row = self._one(
            f"update jobs set {sql_set} "
            "where id = %s and claimed_by = %s and state = %s returning id",
            (*params, job_id, worker_id, from_state),
        )
        if row is None:
            raise RecordError(
                f"job {job_id} is not {from_state!r} for worker {worker_id!r} (claim lost?)"
            )

    def start_job(self, job_id: UUID, worker_id: str) -> None:
        self._transition(job_id, worker_id, "claimed", "state = 'running', started_at = now()")

    def finish_job(self, job_id: UUID, worker_id: str, result_summary: Row) -> None:
        self._transition(
            job_id,
            worker_id,
            "running",
            "state = 'done', finished_at = now(), result_summary = %s",
            (Jsonb(result_summary),),
        )

    def fail_job(self, job_id: UUID, worker_id: str, error: Row) -> None:
        """`claimed`/`running` → `failed` with the error {type, message, at, attempt}."""
        row = self._one(
            "update jobs set state = 'failed', finished_at = now(), error = %s "
            "where id = %s and claimed_by = %s and state in ('claimed', 'running') returning id",
            (Jsonb(error), job_id, worker_id),
        )
        if row is None:
            raise RecordError(
                f"job {job_id} cannot be failed by worker {worker_id!r} (claim lost?)"
            )

    def max_event_seq(self, job_id: UUID) -> int:
        """Highest event number stored for the job (0 if none): a retry continues after it."""
        row = self._one(
            "select coalesce(max(seq), 0) as seq from job_events where job_id = %s", (job_id,)
        )
        return int(row["seq"]) if row else 0

    def insert_events(self, job_id: UUID, events: Sequence[Event]) -> None:
        """Write a batch of progress events; replays are ignored, conflicting replays raise."""
        if not events:
            return
        docs = [(e.seq, e.at, e.kind, e.model_dump(mode="json", by_alias=True)) for e in events]
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into job_events (job_id, seq, at, kind, data) "
                    "values (%s, %s, %s, %s, %s) on conflict (job_id, seq) do nothing",
                    [(job_id, seq, at, kind, Jsonb(doc)) for seq, at, kind, doc in docs],
                )
            stored = conn.execute(
                "select seq, data from job_events where job_id = %s and seq = any(%s)",
                (job_id, [seq for seq, *_ in docs]),
            ).fetchall()
        by_seq = {r["seq"]: r["data"] for r in stored}
        for seq, _at, _kind, doc in docs:
            if canonical_json(by_seq.get(seq)) != canonical_json(doc):
                raise RecordError(
                    f"job {job_id} event {seq} is stored with different content (11 §4)"
                )

    def insert_scorecard(self, job_id: UUID, card: Scorecard, hub_path: str | None = None) -> None:
        """Write one scorecard (headline columns + full JSON); a conflicting replay raises."""
        doc = card.model_dump(mode="json", by_alias=True)
        live = [f for f in card.findings if f.suppressed is None]
        worst = max(live, key=lambda f: _SEVERITY_ORDER[str(f.severity)], default=None)
        with self._conn() as conn:
            conn.execute(
                "insert into scorecards (job_id, item_id, item_sha256, score_version, status, "
                "worst_severity, findings_count, scorecard, hub_path) "
                "values (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "on conflict (job_id, item_sha256) do nothing",
                (
                    job_id,
                    card.item.id,
                    card.item.item_sha256,
                    card.item.score_version,
                    card.status,
                    str(worst.severity) if worst else None,
                    len(live),
                    Jsonb(doc),
                    hub_path,
                ),
            )
            row = conn.execute(
                "select scorecard from scorecards where job_id = %s and item_sha256 = %s",
                (job_id, card.item.item_sha256),
            ).fetchone()
        if row is None or canonical_json(row["scorecard"]) != canonical_json(doc):
            raise RecordError(
                f"job {job_id} scorecard {card.item.id} is stored with different content (11 §4)"
            )
