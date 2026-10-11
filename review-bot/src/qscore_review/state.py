"""Mounted SQLite journal for delivery, durable work, publication and model budgets."""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from qscore.errors import LayerError, RecordError


class State:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        # Startup and ASGI lifespan may run on different threads; operations themselves
        # run synchronously on the single service event loop (one process per database).
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
          delivery TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL, error_type TEXT, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS reviews (
          identity TEXT PRIMARY KEY, status TEXT NOT NULL, summary_id INTEGER,
          review_id INTEGER, check_id INTEGER, result TEXT);
        CREATE TABLE IF NOT EXISTS latest_generations (
          comparison TEXT PRIMARY KEY, run_id INTEGER NOT NULL, run_attempt INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS evidence (
          comparison TEXT PRIMARY KEY, run_id INTEGER NOT NULL, run_attempt INTEGER NOT NULL,
          data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS commands (identity TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS model_calls (
          identity TEXT PRIMARY KEY, comparison TEXT NOT NULL, cost REAL NOT NULL,
          status TEXT NOT NULL, usage TEXT, draft TEXT);
        """)
        path.chmod(0o600)

    def close(self) -> None:
        self.db.close()

    def recover(self) -> None:
        self.db.execute("UPDATE jobs SET status='queued' WHERE status='running'")

    def enqueue(self, delivery: str, kind: str, payload: dict[str, Any]) -> bool:
        row = self.db.execute(
            "INSERT OR IGNORE INTO jobs VALUES (?, ?, ?, 'queued', NULL, ?)",
            (delivery, kind, json.dumps(payload), time.time()),
        )
        return row.rowcount == 1

    def claim(self) -> dict[str, Any] | None:
        self.db.execute("BEGIN IMMEDIATE")
        try:
            row = self.db.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1"
            ).fetchone()
            if row is not None:
                self.db.execute(
                    "UPDATE jobs SET status='running' WHERE delivery=?", (row["delivery"],)
                )
            self.db.execute("COMMIT")
        except sqlite3.Error as exc:
            self.db.execute("ROLLBACK")
            raise RecordError("Could not claim a bot job") from exc
        if row is None:
            return None
        return {
            "delivery": row["delivery"],
            "kind": row["kind"],
            "payload": json.loads(row["payload"]),
        }

    def finish(self, delivery: str, error_type: str | None = None) -> None:
        self.db.execute(
            "UPDATE jobs SET status=?, error_type=? WHERE delivery=?",
            ("failed" if error_type else "complete", error_type, delivery),
        )

    def review(self, identity: str) -> dict[str, Any] | None:
        row = self.db.execute("SELECT * FROM reviews WHERE identity=?", (identity,)).fetchone()
        return dict(row) if row is not None else None

    def save_review(self, identity: str, **fields: Any) -> None:
        permitted = {"status", "summary_id", "review_id", "check_id", "result"}
        if not fields.keys() <= permitted:
            raise RecordError("Unknown review journal field")
        self.db.execute(
            "INSERT OR IGNORE INTO reviews(identity,status) VALUES(?,'started')", (identity,)
        )
        assignments = ",".join(f"{key}=?" for key in fields)
        self.db.execute(
            f"UPDATE reviews SET {assignments} WHERE identity=?", (*fields.values(), identity)
        )

    def accept_generation(self, comparison: str, run_id: int, run_attempt: int) -> bool:
        """Persist monotonically ordered authenticated workflow generations atomically."""
        if (
            type(run_id) is not int
            or type(run_attempt) is not int
            or not 0 < run_id < 2**63
            or not 0 < run_attempt < 2**63
        ):
            raise RecordError("Invalid authenticated workflow generation")
        row = self.db.execute(
            """
            INSERT INTO latest_generations VALUES(?,?,?)
            ON CONFLICT(comparison) DO UPDATE SET
                run_id=excluded.run_id, run_attempt=excluded.run_attempt
            WHERE excluded.run_id > latest_generations.run_id
               OR (excluded.run_id = latest_generations.run_id
                   AND excluded.run_attempt >= latest_generations.run_attempt)
        """,
            (comparison, run_id, run_attempt),
        )
        return row.rowcount == 1

    def generation_current(self, comparison: str, run_id: int, run_attempt: int) -> bool:
        row = self.db.execute(
            "SELECT run_id,run_attempt FROM latest_generations WHERE comparison=?",
            (comparison,),
        ).fetchone()
        return row is not None and tuple(row) == (run_id, run_attempt)

    def save_evidence(
        self, comparison: str, run_id: int, run_attempt: int, data: dict[str, Any]
    ) -> None:
        """Record deterministic evidence only for the latest authenticated generation."""
        self.db.execute(
            """
            INSERT INTO evidence SELECT ?,?,?,?
            WHERE EXISTS (SELECT 1 FROM latest_generations
                          WHERE comparison=? AND run_id=? AND run_attempt=?)
            ON CONFLICT(comparison) DO UPDATE SET
              run_id=excluded.run_id,run_attempt=excluded.run_attempt,data=excluded.data
        """,
            (comparison, run_id, run_attempt, json.dumps(data), comparison, run_id, run_attempt),
        )

    def current_evidence(self, comparison: str) -> dict[str, Any] | None:
        row = self.db.execute(
            """
            SELECT evidence.data FROM evidence JOIN latest_generations USING(comparison)
            WHERE comparison=? AND evidence.run_id=latest_generations.run_id
              AND evidence.run_attempt=latest_generations.run_attempt
        """,
            (comparison,),
        ).fetchone()
        return json.loads(row["data"]) if row else None

    def claim_command(self, identity: str) -> bool:
        return (
            self.db.execute("INSERT OR IGNORE INTO commands VALUES(?)", (identity,)).rowcount == 1
        )

    def reserve_model(self, identity: str, comparison: str, cost: float, cap: float) -> bool:
        """Reserve worst-case cost before sending; failures retain their reservation."""
        if cost < 0 or cap <= 0:
            raise LayerError("Invalid Gemini budget")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            exists = self.db.execute(
                "SELECT 1 FROM model_calls WHERE identity=?", (identity,)
            ).fetchone()
            total = self.db.execute("SELECT COALESCE(SUM(cost),0) FROM model_calls").fetchone()[0]
            if exists:
                self.db.execute("COMMIT")
                return False
            if total + cost > cap:
                raise LayerError("Gemini session budget exhausted")
            self.db.execute(
                "INSERT INTO model_calls VALUES(?,?,?,'reserved',NULL,NULL)",
                (identity, comparison, cost),
            )
            self.db.execute("COMMIT")
        except (sqlite3.Error, LayerError):
            self.db.execute("ROLLBACK")
            raise
        return True

    def record_model(
        self, identity: str, cost: float, usage: dict[str, Any], draft: str | None
    ) -> None:
        self.db.execute(
            "UPDATE model_calls SET cost=?,status=?,usage=?,draft=? WHERE identity=?",
            (cost, "complete" if draft else "failed", json.dumps(usage), draft, identity),
        )

    def model(self, identity: str) -> dict[str, Any] | None:
        row = self.db.execute("SELECT * FROM model_calls WHERE identity=?", (identity,)).fetchone()
        return dict(row) if row else None
