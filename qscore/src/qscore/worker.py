"""Queue worker loop (specs/11 §5; task T22).

Each machine that should run jobs (the GPU notebook, a laptop) runs one worker. It registers
itself in Neon with its capabilities, claims the next queued job those capabilities cover, runs it
through the engine's service functions, writes the results back, and repeats. It only *calls* the
engine (`services.score_project`); it never changes how circuits are scored.

Run it with `python -m qscore.worker` (the `qscore worker` CLI command arrives with the CLI owner).
Settings come from the environment:

- `QSCORE_NEON_DSN`: the `qscore_worker` role's **direct** (non-pooled) connection string.
- `QSCORE_CAPABILITIES`: JSON flags this machine offers, e.g. `{"gpu": true, "neon_write": true}`.
  Required until the hardware profiler exists (11 §5 derives them from the profile).
- `QSCORE_WORKER_ID` (optional): defaults to `worker-<hostname>`.
- `QSCORE_EXAMPLES_DIR` (optional): bundled examples; defaults to this checkout's `qscore/examples`.

The engine compiles in a spawn-based process pool, so this module keeps all work behind
`if __name__ == "__main__"`: a spawned child re-imports it and must not start a second worker.
"""

from __future__ import annotations

import logging
import os
import shutil
import signal
import socket
import sys
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from types import FrameType
from typing import Any
from uuid import UUID

from qscore import services
from qscore.config import Settings, get_settings, log_startup
from qscore.errors import ConfigError, NeonError, QscoreError, RecordError
from qscore.logging import setup_logging
from qscore.record.neon import NeonStore
from qscore.schemas.common import sha256_hex
from qscore.schemas.run import Event
from qscore.schemas.scorecard import Scorecard

log = logging.getLogger("qscore.worker")

POLL_S = 5.0  # 11 §5: poll every 5 s ...
IDLE_POLL_S = 30.0  # ... and every 30 s once idle for 10 minutes
IDLE_AFTER_S = 600.0
HEARTBEAT_S = 10.0  # 11 §5
EVENT_FLUSH_S = 2.0  # 05 §13: events reach Neon every 2 s or 50 events
EVENT_FLUSH_MAX = 50


class WorkerStopped(QscoreError):
    """SIGTERM/SIGINT arrived; the current job is failed with this type and not requeued (11 §5)."""


class ClaimLost(QscoreError):
    """A heartbeat found the job no longer ours; its results must not be written (11 §3.1)."""


# The job this process is running, if any; the stop-signal handler reads it (see `_stop`).
_ACTIVE: _JobSide | None = None


def _examples_dir() -> Path:
    configured = os.environ.get("QSCORE_EXAMPLES_DIR", "").strip()
    path = Path(configured) if configured else Path(__file__).resolve().parents[2] / "examples"
    if not path.is_dir():
        raise ConfigError(f"bundled examples not found at {path}; set QSCORE_EXAMPLES_DIR")
    return path


def _capabilities(settings: Settings) -> dict[str, bool]:
    if settings.capabilities_override is None:
        raise ConfigError(
            "QSCORE_CAPABILITIES is not set. Until the hardware profiler exists, state what this "
            'machine offers, e.g. QSCORE_CAPABILITIES=\'{"gpu": true, "neon_write": true}\''
        )
    return dict(settings.capabilities_override)


class _JobSide:
    """Heartbeat and event batching for one running job, on a background thread."""

    def __init__(self, store: NeonStore, worker_id: str, job_id: UUID, attempt: int) -> None:
        self.store, self.worker_id, self.job_id, self.attempt = store, worker_id, job_id, attempt
        # Each engine run numbers its events from 1; a retried job already holds the earlier
        # attempt's events, so this attempt's events continue after them (keys stay unique, 11 §4).
        self.base_seq = store.max_event_seq(job_id)
        self.lost = threading.Event()
        self._stop = threading.Event()
        # Re-entrant: the stop-signal handler runs on the main thread and may interrupt `add`.
        self._lock = threading.RLock()
        self._pending: list[Event] = []
        self._thread = threading.Thread(target=self._run, name=f"job-{job_id}", daemon=True)

    def __enter__(self) -> _JobSide:
        global _ACTIVE
        _ACTIVE = self
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        global _ACTIVE
        _ACTIVE = None
        self._stop.set()
        self._thread.join(timeout=HEARTBEAT_S * 2)

    def add(self, event: Event) -> None:
        """`on_event` for the service call; batched to Neon by the background thread."""
        numbered = event.model_copy(
            update={"seq": self.base_seq + event.seq, "job_id": self.job_id}
        )
        with self._lock:
            self._pending.append(numbered)

    def flush(self) -> None:
        with self._lock:
            batch, self._pending = self._pending[:EVENT_FLUSH_MAX], self._pending[EVENT_FLUSH_MAX:]
        if batch and not self.lost.is_set():
            self.store.insert_events(self.job_id, batch)

    def _run(self) -> None:
        last_beat = time.monotonic()
        while not self._stop.wait(EVENT_FLUSH_S):
            try:
                self.flush()
                if time.monotonic() - last_beat >= HEARTBEAT_S:
                    last_beat = time.monotonic()
                    state = self.store.heartbeat(self.job_id, self.worker_id)
                    self.store.touch_worker(self.worker_id)
                    if state is None:
                        log.error("claim on job %s lost; another worker may run it", self.job_id)
                        self.lost.set()
                        return
            except QscoreError:
                # Neon trouble on the side thread: the main thread's next write raises it loudly,
                # and without heartbeats the queue requeues the job (11 §5).
                log.exception("heartbeat/event write failed for job %s", self.job_id)


def _result_summary(cards: list[Scorecard]) -> dict[str, Any]:
    """`jobs.result_summary` in the CP-0004 `JobResultSummary` shape."""
    statuses = {c.status for c in cards}
    if statuses == {"complete"}:
        status = "complete"
    elif statuses == {"failed"}:
        status = "failed"
    else:
        status = "partial"
    return {
        "status": status,
        "partial": status == "partial",
        "scorecards": [c.item.item_sha256 for c in cards],
        "attempts": 0,
        "fallbacks_used": sorted({f.id for c in cards for f in c.fallbacks_used}),
        "telemetry": {"status": "off", "peak_vram_mib": None},
    }


def _run_score_job(
    job: dict[str, Any], settings: Settings, examples: Path, on_event: Callable[[Event], None]
) -> list[Scorecard]:
    payload = job["payload"] or {}
    example = payload.get("x-example")
    if not isinstance(example, str) or not example or "/" in example or "\\" in example:
        raise RecordError(f"job {job['id']}: payload names no bundled example ({example!r})")
    manifest = examples / example / "qscore.yaml"
    if not manifest.is_file():
        raise ConfigError(f"bundled example {example!r} not found at {manifest}")
    expected = payload.get("manifest_sha256")
    actual = sha256_hex(manifest.read_bytes())
    if expected and expected != actual:
        raise RecordError(
            f"this worker's copy of {example}/qscore.yaml differs from the platform's "
            f"({actual[:12]} != {expected[:12]}); update this checkout"
        )
    out_dir = settings.cache_dir / "jobs" / str(job["id"])
    # The platform stored the user's confirmation before queueing the job (05 §5), hence "yes".
    result = services.score_project(manifest, out_dir, on_event=on_event, confirm="yes")
    return result.scorecards


def _run_job(store: NeonStore, worker_id: str, job: dict[str, Any], settings: Settings) -> None:
    job_id: UUID = job["id"]
    log.info("claimed job %s (%s, attempt %s)", job_id, job["kind"], job["attempts"])
    store.start_job(job_id, worker_id)
    with _JobSide(store, worker_id, job_id, int(job["attempts"])) as side:
        try:
            if job["kind"] != "score":
                raise ConfigError(f"this worker runs score jobs only, not {job['kind']!r} (MVP)")
            cards = _run_score_job(job, settings, _examples_dir(), side.add)
            if side.lost.is_set():
                raise ClaimLost(f"job {job_id} was taken over while it ran; results discarded")
            side.flush()
            for card in cards:
                store.insert_scorecard(job_id, card)
            store.finish_job(job_id, worker_id, _result_summary(cards))
            log.info("finished job %s: %s", job_id, [f"{c.item.id}:{c.status}" for c in cards])
        except ClaimLost as exc:
            log.error("%s", exc)  # not ours any more: write nothing, move on (11 §3.1)
        except NeonError:
            raise  # Neon lost: exit non-zero and let the heartbeat timeout requeue (11 §5)
        except BaseException as exc:  # recorded on the job, then re-raised if it must stop us
            log.exception("job %s failed", job_id)
            if not side.lost.is_set():
                side.flush()
                store.fail_job(
                    job_id,
                    worker_id,
                    {
                        "type": type(exc).__name__,
                        "message": str(exc)[:2000] or type(exc).__name__,
                        "at": datetime.now(UTC).isoformat(),
                        "attempt": job["attempts"],
                    },
                )
            if isinstance(exc, WorkerStopped) or not isinstance(exc, Exception):
                raise  # a stop signal: the job is marked failed (not requeued), now exit


def run_worker(settings: Settings, *, once: bool = False) -> None:
    """Claim and run jobs until stopped (11 §5). `once`: return after the first job (tests)."""
    store = NeonStore.from_settings(settings)
    capabilities = _capabilities(settings)
    worker_id = settings.worker_id or f"worker-{socket.gethostname()}"
    if shutil.which("git") is None:
        # The engine's provenance runs `git`; without it every score job would crash.
        raise ConfigError("the `git` program is required on a worker (engine provenance uses it)")
    _examples_dir()
    store.upsert_worker(worker_id, capabilities)
    log.info("worker %s ready with capabilities %s", worker_id, capabilities)

    last_job = time.monotonic()
    while True:
        store.touch_worker(worker_id)  # the GPU-online indicator reads last_seen_at (12 §4)
        store.requeue_stale()
        job = store.claim_job(worker_id, capabilities)
        if job is None:
            idle = time.monotonic() - last_job > IDLE_AFTER_S
            time.sleep(IDLE_POLL_S if idle else POLL_S)
            continue
        _run_job(store, worker_id, job, settings)
        last_job = time.monotonic()
        if once:
            return


def _stop(signum: int, _frame: FrameType | None) -> None:
    """SIGTERM/SIGINT (11 §5): mark the running job failed with `WorkerStopped`, then exit 0.

    Between jobs no engine code is on the stack, so raising is safe. During a job the signal lands
    inside the engine, which (by design) records any exception in a metric as that metric failing
    and carries on; so the handler never raises there. It writes the outcome itself and exits.
    """
    reason = f"worker stopped by signal {signal.Signals(signum).name}"
    side = _ACTIVE
    if side is None:
        raise WorkerStopped(reason)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)  # one stop is enough
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    code = 0
    try:
        side.flush()
        side.store.fail_job(
            side.job_id,
            side.worker_id,
            {
                "type": "WorkerStopped",
                "message": reason,
                "at": datetime.now(UTC).isoformat(),
                "attempt": side.attempt,
            },
        )
        log.info("%s during job %s; job marked failed (not requeued)", reason, side.job_id)
    except QscoreError:
        # Neon unreachable: the heartbeat timeout will requeue the job instead (11 §5).
        log.exception("%s; could not mark job %s failed", reason, side.job_id)
        code = 3
    finally:
        logging.shutdown()
        os._exit(code)  # skip the engine's unwinding; its pool workers exit when we are gone


def main() -> int:
    """Entry point for `python -m qscore.worker`; exit codes follow 05 §11."""
    try:
        settings = get_settings()
    except ConfigError as exc:
        setup_logging("dev", mode="worker")  # settings are unusable; still report through logging
        log.error("configuration error: %s", exc)
        return 4
    setup_logging(settings.profile, mode="worker")
    log_startup(settings)
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    try:
        run_worker(settings)
    except WorkerStopped as exc:
        log.info("%s", exc)
        return 0
    except ConfigError as exc:
        log.error("configuration error: %s", exc)
        return 4
    except QscoreError as exc:
        log.error("worker stopped: %s: %s", type(exc).__name__, exc)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
