"""Durable platform-owned SQLite queue (11 §§2-4; approved ChP-0054).

Only the platform opens this database. Workers use ``JobsClient`` over HTTPS. Each write uses
an immediate transaction, so competing API processes cannot claim the same job. Public record
reads never manufacture results when Hub materialization has not been connected.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable, Iterator, Sequence
from contextlib import closing, contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from qscore.config import Settings
from qscore.errors import ClaimLost, ConfigError, PlatformError, RecordError
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.records import AttemptRecord, JobSpec
from qscore.schemas.run import Event
from qscore.schemas.scorecard import Scorecard

Row = dict[str, Any]
_CAPABILITIES = frozenset({"gpu", "aer_gpu", "hub_write"})
_JSON_COLUMNS = frozenset({"payload", "error", "result_summary", "hub_paths"})
_SEVERITY_ORDER = {"info": 0, "warning": 1, "high": 2}
_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS manifests (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
    sha256 TEXT NOT NULL, schema_version TEXT NOT NULL, yaml TEXT NOT NULL,
    confirmed_at TEXT, confirmation_mode TEXT,
    UNIQUE(project_id, sha256)
);
CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY, capabilities TEXT NOT NULL, hardware_profile TEXT,
    last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
    priority INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3, claimed_by TEXT REFERENCES workers(id),
    claimed_at TEXT, heartbeat_at TEXT, started_at TEXT, finished_at TEXT,
    error TEXT, result_summary TEXT, hub_paths TEXT, payload TEXT NOT NULL,
    project_id TEXT REFERENCES projects(id), manifest_id TEXT REFERENCES manifests(id),
    created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    CHECK (state IN ('queued','claimed','running','done','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state, priority DESC, created_at, id);
CREATE TABLE IF NOT EXISTS job_events (
    job_id TEXT NOT NULL REFERENCES jobs(id), seq INTEGER NOT NULL, at TEXT NOT NULL,
    kind TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(job_id, seq)
);
CREATE TABLE IF NOT EXISTS scorecards (
    job_id TEXT NOT NULL REFERENCES jobs(id), item_id TEXT NOT NULL, item_sha256 TEXT NOT NULL,
    status TEXT NOT NULL, worst_severity TEXT, findings_count INTEGER NOT NULL,
    scorecard TEXT NOT NULL, hub_path TEXT, created_at TEXT NOT NULL,
    PRIMARY KEY(job_id, item_sha256)
);
CREATE TABLE IF NOT EXISTS attempts (
    job_id TEXT NOT NULL REFERENCES jobs(id), request_id TEXT NOT NULL,
    proposal_sha256 TEXT NOT NULL, record TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(job_id, request_id, proposal_sha256)
);
"""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _timestamp(at: datetime) -> str:
    if at.tzinfo is None:
        raise ConfigError("platform clock must return a timezone-aware datetime")
    return at.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _job(row: sqlite3.Row) -> Row:
    result = dict(row)
    for key in _JSON_COLUMNS:
        if result[key] is not None:
            result[key] = json.loads(result[key])
    return result


def _capabilities(capabilities: dict[str, bool]) -> None:
    if set(capabilities) - _CAPABILITIES or any(type(v) is not bool for v in capabilities.values()):
        raise RecordError("capabilities must contain only boolean gpu, aer_gpu and hub_write flags")


class SQLiteStore:
    """A persistent queue; connections are short-lived and timestamps are UTC seconds."""

    def __init__(self, path: Path, *, clock: Callable[[], datetime] = _utc_now) -> None:
        self.path = Path(path)
        self._clock = clock
        if str(path) == ":memory:":
            raise ConfigError("the platform queue needs a persistent SQLite file, not :memory:")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ConfigError(
                f"cannot create platform database directory {self.path.parent}"
            ) from exc
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    @classmethod
    def from_settings(cls, settings: Settings) -> SQLiteStore:
        """Open the explicit ``QSCORE_PLATFORM_DB_PATH`` persistent database."""
        return cls(settings.platform_db_path)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        try:
            with closing(sqlite3.connect(self.path, timeout=10)) as conn:
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA foreign_keys = ON")
                with conn:
                    conn.execute("BEGIN IMMEDIATE")
                    yield conn
        except sqlite3.Error as exc:
            raise PlatformError(f"platform SQLite operation failed at {self.path}: {exc}") from exc

    def ensure_project(self, name: str) -> UUID:
        """Return the stable project UUID, creating it once."""
        with self._conn() as conn:
            conn.execute("INSERT OR IGNORE INTO projects VALUES (?, ?)", (str(uuid4()), name))
            row = conn.execute("SELECT id FROM projects WHERE name = ?", (name,)).fetchone()
            assert row is not None
            return UUID(row["id"])

    def ensure_manifest(
        self, project_id: UUID, sha256: str, schema_version: str, yaml_text: str
    ) -> UUID:
        """Store hash-checked YAML idempotently; a conflicting natural key fails."""
        if sha256_hex(yaml_text) != sha256:
            raise RecordError("manifest SHA-256 does not match the supplied UTF-8 YAML")
        with self._conn() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO manifests (id,project_id,sha256,schema_version,yaml) "
                "VALUES (?,?,?,?,?)",
                (str(uuid4()), str(project_id), sha256, schema_version, yaml_text),
            )
            row = conn.execute(
                "SELECT id,schema_version,yaml FROM manifests WHERE project_id=? AND sha256=?",
                (str(project_id), sha256),
            ).fetchone()
            assert row is not None
            if row["yaml"] != yaml_text or row["schema_version"] != schema_version:
                raise RecordError(f"manifest {sha256} is stored with different content")
            return UUID(row["id"])

    def manifest_for(self, project: str, sha256: str) -> Row | None:
        """Find a manifest and its confirmation for a named project."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT m.* FROM manifests m JOIN projects p ON p.id=m.project_id "
                "WHERE p.name=? AND m.sha256=?",
                (project, sha256),
            ).fetchone()
            return dict(row) if row is not None else None

    def confirm_manifest(self, sha256: str, mode: str = "stored") -> bool:
        """Record explicit confirmation once, returning false for an unknown hash."""
        if mode not in {"stored", "interactive", "yes_flag"}:
            raise RecordError(f"invalid confirmation mode {mode!r}")
        with self._conn() as conn:
            cursor = conn.execute(
                "UPDATE manifests SET confirmed_at=coalesce(confirmed_at,?), "
                "confirmation_mode=coalesce(confirmation_mode,?) WHERE sha256=?",
                (_timestamp(self._clock()), mode, sha256),
            )
            return cursor.rowcount > 0

    def create_job(
        self,
        spec: JobSpec,
        *,
        project_id: UUID | None = None,
        manifest_id: UUID | None = None,
        created_by: str,
        priority: int = 100,
    ) -> UUID:
        """Enqueue one validated job, requiring confirmation for a referenced manifest."""
        _capabilities(spec.requires.model_dump(mode="json"))
        job_id = uuid4()
        with self._conn() as conn:
            if spec.manifest_sha256 is not None:
                manifest = conn.execute(
                    "SELECT m.*,p.name FROM manifests m JOIN projects p ON p.id=m.project_id "
                    "WHERE m.sha256=? AND p.name=?",
                    (spec.manifest_sha256, spec.project),
                ).fetchone()
                if manifest is None or manifest["confirmed_at"] is None:
                    raise RecordError("the job's manifest must be stored and explicitly confirmed")
                if manifest_id is not None and str(manifest_id) != manifest["id"]:
                    raise RecordError("job manifest_id does not match its manifest hash")
                if project_id is not None and str(project_id) != manifest["project_id"]:
                    raise RecordError("job project_id does not match its manifest project")
                project_id, manifest_id = UUID(manifest["project_id"]), UUID(manifest["id"])
            conn.execute(
                "INSERT INTO jobs (id,kind,state,priority,payload,project_id,manifest_id,"
                "created_by,created_at) VALUES (?,?,'queued',?,?,?,?,?,?)",
                (
                    str(job_id),
                    spec.kind,
                    priority,
                    canonical_json(spec.model_dump(mode="json")),
                    str(project_id) if project_id else None,
                    str(manifest_id) if manifest_id else None,
                    created_by,
                    _timestamp(self._clock()),
                ),
            )
        return job_id

    def get_job(self, job_id: UUID) -> Row | None:
        """Read the current job without substituting a missing row."""
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id=?", (str(job_id),)).fetchone()
            return _job(row) if row is not None else None

    def count_open_jobs(self, created_by: str) -> int:
        """Number of queued, claimed or running jobs from a submitter."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT count(*) FROM jobs WHERE created_by=? "
                "AND state IN ('queued','claimed','running')",
                (created_by,),
            ).fetchone()
            assert row is not None
            return int(row[0])

    def cancel_job(self, job_id: UUID) -> bool:
        """Only a queued job may become cancelled."""
        with self._conn() as conn:
            return (
                conn.execute(
                    "UPDATE jobs SET state='cancelled',finished_at=? WHERE id=? AND state='queued'",
                    (_timestamp(self._clock()), str(job_id)),
                ).rowcount
                == 1
            )

    def upsert_worker(
        self, worker_id: str, capabilities: dict[str, bool], hardware_profile: Row | None = None
    ) -> None:
        """Register a worker's declared capabilities and refresh its last-seen timestamp."""
        _capabilities(capabilities)
        with self._conn() as conn:
            active = conn.execute(
                "SELECT 1 FROM jobs WHERE claimed_by=? AND state IN ('claimed','running')",
                (worker_id,),
            ).fetchone()
            existing = conn.execute(
                "SELECT capabilities FROM workers WHERE id=?", (worker_id,)
            ).fetchone()
            if active and existing and existing["capabilities"] != canonical_json(capabilities):
                raise RecordError("a worker cannot change capabilities while holding an active job")
            conn.execute(
                "INSERT INTO workers VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
                "capabilities=excluded.capabilities,hardware_profile=excluded.hardware_profile,"
                "last_seen_at=excluded.last_seen_at",
                (
                    worker_id,
                    canonical_json(capabilities),
                    canonical_json(hardware_profile) if hardware_profile is not None else None,
                    _timestamp(self._clock()),
                ),
            )

    def _worker(self, conn: sqlite3.Connection, worker_id: str) -> Row:
        row = conn.execute("SELECT * FROM workers WHERE id=?", (worker_id,)).fetchone()
        if row is None:
            raise RecordError(f"worker {worker_id!r} must register before polling")
        conn.execute(
            "UPDATE workers SET last_seen_at=? WHERE id=?", (_timestamp(self._clock()), worker_id)
        )
        return dict(row)

    def gpu_last_seen(self) -> datetime | None:
        """Latest registration/poll/heartbeat from a GPU-capable worker (12 §4)."""
        with self._conn() as conn:
            rows = conn.execute("SELECT capabilities,last_seen_at FROM workers").fetchall()
            timestamps = [
                r["last_seen_at"] for r in rows if json.loads(r["capabilities"]).get("gpu")
            ]
            return datetime.fromisoformat(max(timestamps)) if timestamps else None

    def _requeue_stale(self, conn: sqlite3.Connection) -> int:
        now = self._clock()
        rows = conn.execute(
            "SELECT id,attempts,max_attempts FROM jobs WHERE state IN ('claimed','running') "
            "AND heartbeat_at < ?",
            (_timestamp(now - timedelta(seconds=60)),),
        ).fetchall()
        for row in rows:
            attempts = row["attempts"] + 1
            failed = attempts >= row["max_attempts"]
            error = {
                "type": "LostWorker",
                "message": "worker heartbeat missing for 60 seconds",
                "at": _timestamp(now),
                "attempt": attempts,
            }
            conn.execute(
                "UPDATE jobs SET state=?,attempts=?,claimed_by=NULL,claimed_at=NULL,"
                "heartbeat_at=NULL,started_at=NULL,finished_at=?,error=? WHERE id=?",
                (
                    "failed" if failed else "queued",
                    attempts,
                    _timestamp(now) if failed else None,
                    canonical_json(error) if failed else None,
                    row["id"],
                ),
            )
        return len(rows)

    def requeue_stale(self) -> int:
        """Recover claims older than 60 seconds; the third lost attempt fails permanently."""
        with self._conn() as conn:
            return self._requeue_stale(conn)

    def claim_job(self, worker_id: str, capabilities: dict[str, bool]) -> Row | None:
        """Atomically claim the oldest highest-priority matching job, or return no job."""
        _capabilities(capabilities)
        with self._conn() as conn:
            self._requeue_stale(conn)
            worker = self._worker(conn, worker_id)
            if worker["capabilities"] != canonical_json(capabilities):
                raise RecordError("claim capabilities differ from this worker's registration")
            active = conn.execute(
                "SELECT * FROM jobs WHERE claimed_by=? AND state IN ('claimed','running')",
                (worker_id,),
            ).fetchone()
            # A retry after a lost claim response returns the same claim, never a second job.
            if active is not None:
                return self._with_event_seq(conn, active)
            rows = conn.execute(
                "SELECT * FROM jobs WHERE state='queued' ORDER BY priority DESC,created_at,id"
            ).fetchall()
            for row in rows:
                requires = json.loads(row["payload"])["requires"]
                if any(
                    required is True and capabilities.get(key) is not True
                    for key, required in requires.items()
                ):
                    continue
                now = _timestamp(self._clock())
                conn.execute(
                    "UPDATE jobs SET state='claimed',claimed_by=?,claimed_at=?,heartbeat_at=? "
                    "WHERE id=?",
                    (worker_id, now, now, row["id"]),
                )
                claimed = conn.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone()
                assert claimed is not None
                return self._with_event_seq(conn, claimed)
            return None

    def _with_event_seq(self, conn: sqlite3.Connection, row: sqlite3.Row) -> Row:
        result = _job(row)
        latest = conn.execute(
            "SELECT max(seq) FROM job_events WHERE job_id=?", (row["id"],)
        ).fetchone()
        assert latest is not None
        result["last_event_seq"] = latest[0] if latest[0] is not None else 0
        return result

    def _owned(self, conn: sqlite3.Connection, job_id: UUID, worker_id: str) -> Row:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (str(job_id),)).fetchone()
        if row is None or row["claimed_by"] != worker_id:
            raise ClaimLost(f"worker {worker_id!r} no longer holds job {job_id}")
        self._worker(conn, worker_id)
        return _job(row)

    def heartbeat(self, job_id: UUID, worker_id: str) -> str:
        """Refresh a live owned claim; lost claims raise ``ClaimLost`` immediately."""
        self.requeue_stale()
        with self._conn() as conn:
            row = self._owned(conn, job_id, worker_id)
            if row["state"] not in {"claimed", "running"}:
                raise ClaimLost(f"job {job_id} is {row['state']}, so no live claim remains")
            conn.execute(
                "UPDATE jobs SET heartbeat_at=? WHERE id=?",
                (_timestamp(self._clock()), str(job_id)),
            )
            return str(row["state"])

    def start_job(self, job_id: UUID, worker_id: str) -> str:
        """Transition an owned claim to running, accepting an identical start replay."""
        self.requeue_stale()
        with self._conn() as conn:
            row = self._owned(conn, job_id, worker_id)
            if row["state"] == "running":
                return "running"
            if row["state"] != "claimed":
                raise ClaimLost(f"job {job_id} cannot start from {row['state']}")
            conn.execute(
                "UPDATE jobs SET state='running',started_at=? WHERE id=?",
                (_timestamp(self._clock()), str(job_id)),
            )
            return "running"

    def finish_job(
        self, job_id: UUID, worker_id: str, result_summary: Row, hub_paths: dict[str, str]
    ) -> str:
        """Finish idempotently with real Hub paths; different replay content is a conflict."""
        self.requeue_stale()
        with self._conn() as conn:
            row = self._owned(conn, job_id, worker_id)
            if row["state"] == "done":
                if canonical_json(row["result_summary"]) == canonical_json(
                    result_summary
                ) and canonical_json(row["hub_paths"]) == canonical_json(hub_paths):
                    return "done"
                raise RecordError(f"job {job_id} finish was replayed with different content")
            if row["state"] != "running":
                raise ClaimLost(f"job {job_id} cannot finish from {row['state']}")
            if row["kind"] in {"score", "improve", "bench", "conform", "profile"} and not hub_paths:
                raise RecordError(
                    "a computed job cannot finish without published Hub paths (11 §6)"
                )
            if any(not key or not value for key, value in hub_paths.items()):
                raise RecordError("Hub paths must have nonempty record names and paths")
            conn.execute(
                "UPDATE jobs SET state='done',finished_at=?,result_summary=?,hub_paths=? "
                "WHERE id=?",
                (
                    _timestamp(self._clock()),
                    canonical_json(result_summary),
                    canonical_json(hub_paths),
                    str(job_id),
                ),
            )
            return "done"

    def fail_job(self, job_id: UUID, worker_id: str, error: Row) -> str:
        """Fail an owned active job; an identical failed-operation replay is accepted."""
        self.requeue_stale()
        with self._conn() as conn:
            row = self._owned(conn, job_id, worker_id)
            if row["state"] == "failed" and canonical_json(row["error"]) == canonical_json(error):
                return "failed"
            if row["state"] not in {"claimed", "running"}:
                raise RecordError(f"job {job_id} cannot fail from {row['state']}")
            conn.execute(
                "UPDATE jobs SET state='failed',finished_at=?,error=? WHERE id=?",
                (_timestamp(self._clock()), canonical_json(error), str(job_id)),
            )
            return "failed"

    def insert_events(self, job_id: UUID, worker_id: str, events: Sequence[Event]) -> str:
        """Persist ≤50 events atomically; conflicting replay rolls the whole batch back."""
        if len(events) > 50:
            raise RecordError("an event batch may contain at most 50 events (11 §3)")
        self.requeue_stale()
        with self._conn() as conn:
            row = self._owned(conn, job_id, worker_id)
            if row["state"] not in {"claimed", "running"}:
                raise ClaimLost(f"job {job_id} no longer has an active claim")
            for event in events:
                if event.job_id is not None and event.job_id != job_id:
                    raise RecordError("event job_id differs from the destination job")
                doc = canonical_json(event.model_dump(mode="json"))
                existing = conn.execute(
                    "SELECT data FROM job_events WHERE job_id=? AND seq=?", (str(job_id), event.seq)
                ).fetchone()
                if existing is not None and existing["data"] != doc:
                    raise RecordError(
                        f"job {job_id} event {event.seq} has different stored content"
                    )
                conn.execute(
                    "INSERT OR IGNORE INTO job_events VALUES (?,?,?,?,?)",
                    (str(job_id), event.seq, _timestamp(event.at), event.kind, doc),
                )
            return str(row["state"])

    def job_events(self, job_id: UUID, after: int = 0) -> list[Row]:
        """Events strictly after the requested sequence number, in sequence order."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT seq,at,kind,data FROM job_events WHERE job_id=? AND seq>? ORDER BY seq",
                (str(job_id), after),
            ).fetchall()
            return [{**dict(row), "data": json.loads(row["data"])} for row in rows]

    def insert_scorecard(self, job_id: UUID, card: Scorecard, hub_path: str | None = None) -> None:
        """Materialize a validated scorecard once; conflicting content/path is a record error."""
        live = [finding for finding in card.findings if finding.suppressed is None]
        worst = max(live, key=lambda finding: _SEVERITY_ORDER[str(finding.severity)], default=None)
        doc = canonical_json(card.model_dump(mode="json"))
        with self._conn() as conn:
            previous = conn.execute(
                "SELECT scorecard,hub_path FROM scorecards WHERE job_id=? AND item_sha256=?",
                (str(job_id), card.item.item_sha256),
            ).fetchone()
            if previous is not None and (
                previous["scorecard"] != doc or previous["hub_path"] != hub_path
            ):
                raise RecordError(
                    f"job {job_id} scorecard {card.item.id} has different stored content"
                )
            conn.execute(
                "INSERT OR IGNORE INTO scorecards VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    str(job_id),
                    card.item.id,
                    card.item.item_sha256,
                    card.status,
                    str(worst.severity) if worst else None,
                    len(live),
                    doc,
                    hub_path,
                    _timestamp(card.created_at),
                ),
            )

    def job_scorecards(self, job_id: UUID) -> list[Row]:
        """Locally materialized validated scorecards, preserving the UI envelope."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM scorecards WHERE job_id=? ORDER BY item_id", (str(job_id),)
            ).fetchall()
            return [{**dict(row), "scorecard": json.loads(row["scorecard"])} for row in rows]

    def scorecard_by_item(self, item_sha256: str) -> Row | None:
        """Most recent materialized card for an exact item hash."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM scorecards WHERE item_sha256=? ORDER BY created_at DESC LIMIT 1",
                (item_sha256,),
            ).fetchone()
            return {**dict(row), "scorecard": json.loads(row["scorecard"])} if row else None

    def insert_attempt(self, job_id: UUID, attempt: AttemptRecord) -> None:
        """Materialize an attempt under its required three-part natural key (11 §4)."""
        if attempt.job_id != job_id:
            raise RecordError("attempt job_id differs from the destination job")
        doc = canonical_json(attempt.model_dump(mode="json"))
        key = (str(job_id), attempt.request_id, attempt.proposal_sha256)
        with self._conn() as conn:
            previous = conn.execute(
                "SELECT record FROM attempts WHERE job_id=? AND request_id=? AND proposal_sha256=?",
                key,
            ).fetchone()
            if previous is not None and previous["record"] != doc:
                raise RecordError(
                    f"job {job_id} attempt {attempt.request_id} has different content"
                )
            conn.execute(
                "INSERT OR IGNORE INTO attempts VALUES (?,?,?,?,?)",
                (*key, doc, _timestamp(attempt.created_at)),
            )

    def job_attempts(self, job_id: UUID) -> list[Row]:
        """Validated materialized attempt records in creation order."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT record FROM attempts WHERE job_id=? ORDER BY created_at,request_id",
                (str(job_id),),
            ).fetchall()
            return [{"record": json.loads(row["record"])} for row in rows]
