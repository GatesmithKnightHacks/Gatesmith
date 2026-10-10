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
from qscore.intake.loaders import QasmProblem, parse_qasm
from qscore.manifest.resolve import merge_items, resolve_items
from qscore.manifest.yamlio import PositionMap
from qscore.record.report import render
from qscore.record.scorecard import write_scorecard
from qscore.schemas.common import canonical_json, sha256_hex
from qscore.schemas.manifest import ProjectManifest, QasmSource
from qscore.schemas.run import Event
from qscore.schemas.scorecard import Scorecard
from qscore.score.engine import score_item
from qscore.targets.registry import get_target
from qscore.validate.issues import make_issue
from qscore.validate.reference_checks import reference_issues, target_field
from qscore.validate.schema_checks import load_manifest_with_positions, report_of
from qscore.validate.semantic_checks import semantic_issues

OnEvent = Callable[[Event], None]


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
) -> ScoreResult:
    # Stages 3-4 for every item before any compute: all issues in one report (05 §3-4).
    locate = positions.locate if positions is not None else None
    loaded_items, issues = [], []
    for index, (item, root, origins) in enumerate(merge_items(manifest, manifest_dir)):
        if not isinstance(item.source, QasmSource):
            raise InvalidInput(
                f"item {item.id}: builder sources arrive with M3 (CP-0023)", report=None
            )
        at = index if positions is not None else None
        ref = reference_issues(item, root, manifest_file, at, origins, locate)
        issues += ref
        if ref:
            continue
        loaded = parse_qasm(root / item.source.qasm)
        if isinstance(loaded, QasmProblem):
            issues.append(
                make_issue(
                    loaded.code,
                    item.id,
                    item.source.qasm,
                    ("circuits", index, "source", "qasm") if at is not None else None,
                    None,  # located in the QASM file, at the parser's position
                    loaded.message,
                    "Fix the OpenQASM source.",
                    line=loaded.line,
                    column=loaded.column,
                )
            )
            continue
        assert item.target is not None  # filled by merge_items (built-in defaults)
        issues += semantic_issues(
            item,
            loaded.circuit,
            root,
            manifest_file,
            at,
            locate,
            get_target(item.target),
            target_field(index, origins),
        )
        loaded_items.append(loaded)
    if issues:
        issue_report = report_of(manifest_file, issues)
        raise InvalidInput(f"{manifest_file}: {issue_report.errors} issue(s)", report=issue_report)
    work = list(zip(resolve_items(manifest, manifest_dir), loaded_items, strict=True))

    cards, paths = [], []
    emit("run_started", f"scoring {len(manifest.circuits)} item(s)")
    for resolved, loaded in work:
        item = resolved.item
        emit("item_started", f"scoring {item.id}", item_id=item.id)
        card = score_item(resolved, loaded, manifest_sha256, settings)
        cards.append(card)
        paths.append(write_scorecard(card, out_dir / "scorecards"))
        emit("item_finished", f"{item.id}: {card.status}", item_id=item.id)
    report = out_dir / "report.md"
    report.write_text(render(cards), encoding="utf-8")
    emit("run_finished", "done")
    return ScoreResult(cards, paths, report)


def score_project(
    manifest_path: Path, out_dir: Path, on_event: OnEvent | None = None
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
    )


def score_circuit(
    qasm_path: Path, out_dir: Path, target: str | None = None, on_event: OnEvent | None = None
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
        manifest, qasm_path.parent, sha, out_dir, get_settings(), _Events(on_event), qasm_path.name
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
