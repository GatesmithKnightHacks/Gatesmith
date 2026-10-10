"""One function per user action; the only door into the package (specs/03 §3.1).

MVP (ChP-0023): `score_project` scores a manifest of QASM items; `score_circuit` scores a single
OpenQASM file with the manual-upload defaults (04 §2.2). Services never print.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from qscore.config import Settings, get_settings
from qscore.errors import InvalidInput
from qscore.interpret.summary import render_item_text, render_items, render_text
from qscore.manifest.yamlio import PositionMap
from qscore.record.report import render
from qscore.record.run_record import write_run_record
from qscore.record.scorecard import write_scorecard
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.run import (
    RUN_SCHEMA,
    Confirmation,
    Event,
    RunProvenance,
    RunRecord,
    RunScorecardRef,
)
from qscore.schemas.scorecard import Scorecard
from qscore.schemas.versions import SCORE_VERSION
from qscore.score.engine import score_item
from qscore.validate.pipeline import run_validation
from qscore.validate.schema_checks import load_manifest_with_positions

OnEvent = Callable[[Event], None]
Confirm = Callable[[str], bool]
# A callback shows the summary and answers (interactive), or the literal "yes" (`--yes`). There is
# no default: every caller states how the run is confirmed (05 §5, ChP-0028).
ConfirmArg = Confirm | Literal["yes"]


@dataclass(frozen=True)
class ScoreResult:
    scorecards: list[Scorecard]
    paths: list[Path]
    report_path: Path
    run_record_path: Path | None  # None when the run was not confirmed


class _Events:
    def __init__(self, on_event: OnEvent | None) -> None:
        self.on_event, self.seq, self.run_id = on_event, 0, f"run-{datetime.now(UTC):%Y%m%dT%H%M%S}"

    def __call__(self, kind: str, message: str, **data: object) -> None:
        if self.on_event is None:
            return
        self.seq += 1
        self.on_event(
            Event.model_validate(
                {
                    "schema": "qscore.event/v0.2",
                    "run_id": self.run_id,
                    "seq": self.seq,
                    "at": datetime.now(UTC),
                    "kind": kind,
                    "message": message,
                    "data": data,
                    "item_id": data.get("item_id"),
                }
            )
        )


def _score(
    manifest: ProjectManifest,
    manifest_dir: Path,
    manifest_sha256: str,
    out_dir: Path,
    settings: Settings,
    emit: _Events,
    manifest_file: str,
    positions: PositionMap | None = None,
    *,
    confirm: ConfirmArg,
) -> ScoreResult:
    started = datetime.now(UTC)
    work = run_validation(manifest, manifest_dir, settings, manifest_file, positions)
    blocks = render_items(work, manifest)
    summary = render_text(work, manifest)
    if confirm == "yes":
        mode: Literal["interactive", "yes_flag"] = "yes_flag"
    elif confirm(summary):
        mode = "interactive"
    else:
        return ScoreResult([], [], out_dir / "report.md", None)
    confirmation = Confirmation(mode=mode, at=datetime.now(UTC), manifest_sha256=manifest_sha256)
    x_run = {"run_id": emit.run_id, "manifest_sha256": manifest_sha256, "confirmation_mode": mode}
    out_dir.mkdir(parents=True, exist_ok=True)

    cards, paths, refs = [], [], []
    emit("run_started", f"scoring {len(manifest.circuits)} item(s)")
    for resolved, loaded in work:
        item = resolved.item
        emit("item_started", f"scoring {item.id}", item_id=item.id)
        card = score_item(resolved, loaded, manifest_sha256, settings)
        card = card.model_copy(
            update={"x-run": x_run, "x-interpretation": render_item_text(blocks[item.id])}
        )
        path = write_scorecard(card, out_dir / "scorecards")
        cards.append(card)
        paths.append(path)
        refs.append(
            RunScorecardRef(
                item_id=item.id,
                item_sha256=resolved.item_sha256,
                path=path.relative_to(out_dir).as_posix(),
                sha256=sha256_hex(path.read_bytes()),
            )
        )
        emit("item_finished", f"{item.id}: {card.status}", item_id=item.id)
    report = out_dir / "report.md"
    report.write_text(render(cards), encoding="utf-8")
    statuses = {c.status for c in cards}
    first = cards[0].provenance
    record = RunRecord.model_validate(
        {
            "schema": RUN_SCHEMA,
            "run_id": emit.run_id,
            "command": "score",
            "manifest_sha256": manifest_sha256,
            "items": [c.item.id for c in cards],
            "confirmation": confirmation,
            "interpretation": summary,
            "settings_profile": settings.profile,
            "fallbacks_enabled": sorted(settings.enabled_fallbacks),
            "fallbacks_used": sorted({f.id for c in cards for f in c.fallbacks_used}),
            "started_at": started,
            "finished_at": datetime.now(UTC),
            "status": (
                "complete"
                if statuses == {"complete"}
                else "failed"
                if statuses == {"failed"}
                else "partial"
            ),
            "scorecards": refs,
            "provenance": RunProvenance(
                qscore=first.qscore,
                score_version=SCORE_VERSION,
                git_commit=first.git_commit,
                git_dirty=first.git_dirty,
                lock_sha256=first.lock_sha256,
                python=first.python,
                qiskit=first.qiskit,
            ),
        }
    )
    run_path = write_run_record(record, out_dir)
    emit("run_finished", "done")
    return ScoreResult(cards, paths, report, run_path)


def score_project(
    manifest_path: Path,
    out_dir: Path,
    on_event: OnEvent | None = None,
    *,
    confirm: ConfirmArg,
) -> ScoreResult:
    manifest, positions = load_manifest_with_positions(manifest_path)
    sha = sha256_hex(manifest_path.read_bytes())
    return _score(
        manifest,
        manifest_path.parent,
        sha,
        out_dir,
        get_settings(),
        _Events(on_event),
        manifest_path.name,
        positions,
        confirm=confirm,
    )


def score_circuit(
    qasm_path: Path,
    out_dir: Path,
    target: str | None = None,
    on_event: OnEvent | None = None,
    *,
    confirm: ConfirmArg,
) -> ScoreResult:
    """Single OpenQASM file, manual-upload defaults (04 §2.2), optional target override."""
    safe = "".join(
        ch if ch.isascii() and (ch.isalnum() or ch in "_-") else "_"
        for ch in qasm_path.stem.lower()
    )
    item_id = ("c_" + safe if safe.startswith("-") else safe)[
        :64
    ] or "circuit"  # 04 §2.2 id pattern
    doc = {
        "schema": "qscore.project/v0.2",
        "project": {"name": item_id, "root": "."},
        "circuits": [{"id": item_id, "source": {"qasm": qasm_path.name}}],
    }
    if target is not None:
        # Calibration follows the target kind in resolve (ChP-0025).
        doc["defaults"] = {"target": {"backend": target}}
    manifest = ProjectManifest.model_validate(doc)
    sha = sha256_hex(canonical_json(manifest.model_dump(mode="json")))
    return _score(
        manifest,
        qasm_path.parent,
        sha,
        out_dir,
        get_settings(),
        _Events(on_event),
        qasm_path.name,
        confirm=confirm,
    )


def score_qasm_text(
    text: str,
    out_dir: Path,
    target: str | None = None,
    on_event: OnEvent | None = None,
    *,
    confirm: Literal["yes"],
) -> ScoreResult:
    """Pasted OpenQASM (CLI `qscore score -`, ChP-0024): kept as `<out>/input/pasted.qasm` so the
    run stays reproducible, then scored like a single file."""
    if not text.strip():
        raise InvalidInput("no OpenQASM text was given", report=None)
    src = out_dir / "input" / "pasted.qasm"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_text(text, encoding="utf-8")
    return score_circuit(src, out_dir, target, on_event, confirm=confirm)
