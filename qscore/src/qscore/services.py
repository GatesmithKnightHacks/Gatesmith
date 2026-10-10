"""One function per user action; the only door into the package (specs/03 §3.1).

MVP (CP-0023): `score_project` scores a manifest of QASM items; `score_circuit` scores a single
OpenQASM file with the manual-upload defaults (04 §2.2). Services never print.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from qscore.config import Settings, get_settings
from qscore.errors import InvalidInput
from qscore.interpret.summary import render_text
from qscore.manifest.yamlio import PositionMap
from qscore.record.report import render
from qscore.record.scorecard import write_scorecard
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.run import Event
from qscore.schemas.scorecard import Scorecard
from qscore.score.engine import score_item
from qscore.validate.pipeline import run_validation
from qscore.validate.schema_checks import load_manifest_with_positions

OnEvent = Callable[[Event], None]
Confirm = Callable[[str], bool]


@dataclass(frozen=True)
class ScoreResult:
    scorecards: list[Scorecard]
    paths: list[Path]
    report_path: Path


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
    confirm: Confirm | None = None,
) -> ScoreResult:
    work = run_validation(manifest, manifest_dir, settings, manifest_file, positions)
    summary = render_text(work, manifest)
    if confirm is not None and not confirm(summary):
        return ScoreResult([], [], out_dir / "report.md")
    confirmation = {
        "mode": "interactive" if confirm is not None else "yes",
        "at": datetime.now(UTC).isoformat(),
        "manifest_sha256": manifest_sha256,
    }
    out_dir.mkdir(parents=True, exist_ok=True)

    cards, paths = [], []
    emit("run_started", f"scoring {len(manifest.circuits)} item(s)")
    for resolved, loaded in work:
        item = resolved.item
        emit("item_started", f"scoring {item.id}", item_id=item.id)
        card = score_item(resolved, loaded, manifest_sha256, settings)
        card = card.model_copy(update={"x-confirmation": confirmation, "x-interpretation": summary})
        cards.append(card)
        paths.append(write_scorecard(card, out_dir / "scorecards"))
        emit("item_finished", f"{item.id}: {card.status}", item_id=item.id)
    report = out_dir / "report.md"
    report.write_text(render(cards), encoding="utf-8")
    emit("run_finished", "done")
    return ScoreResult(cards, paths, report)


def score_project(
    manifest_path: Path,
    out_dir: Path,
    on_event: OnEvent | None = None,
    confirm: Confirm | None = None,
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
        confirm,
    )


def score_circuit(
    qasm_path: Path,
    out_dir: Path,
    target: str | None = None,
    on_event: OnEvent | None = None,
    confirm: Confirm | None = None,
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
        # Calibration follows the target kind in resolve (CP-0025).
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
    text: str, out_dir: Path, target: str | None = None, on_event: OnEvent | None = None
) -> ScoreResult:
    """Pasted OpenQASM (CLI `qscore score -`, CP-0024): kept as `<out>/input/pasted.qasm` so the
    run stays reproducible, then scored like a single file."""
    if not text.strip():
        raise InvalidInput("no OpenQASM text was given", report=None)
    src = out_dir / "input" / "pasted.qasm"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_text(text, encoding="utf-8")
    return score_circuit(src, out_dir, target, on_event)
