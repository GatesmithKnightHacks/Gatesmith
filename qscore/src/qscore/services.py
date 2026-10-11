"""One function per user action; the only door into the package (specs/03 §3.1).

MVP (ChP-0023): `score_project` scores a manifest of QASM items; `score_circuit` scores a single
OpenQASM file with the manual-upload defaults (04 §2.2). Services never print.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from ruamel.yaml.comments import CommentedMap

from qscore.compile.pipeline import OPTIMIZATION_LEVEL
from qscore.config import Settings, get_settings
from qscore.errors import InvalidInput, RecordError
from qscore.intake import compat, fetch
from qscore.intake import draft as drafting
from qscore.intake.discover import Candidate, discover, missing_imports
from qscore.intake.fetch import FetchedRepo, source_of
from qscore.interpret.summary import render_item_text, render_items, render_text
from qscore.manifest.yamlio import PositionMap, load_yaml, single_issue_report
from qscore.record.export import export_compiled
from qscore.record.report import render
from qscore.record.run_record import write_run_record
from qscore.record.scorecard import write_scorecard
from qscore.schemas.common import Location, canonical_json, sha256_hex
from qscore.schemas.manifest import REQUIRED_PLACEHOLDER, BuilderSource, ProjectManifest
from qscore.schemas.run import (
    RUN_SCHEMA,
    Confirmation,
    Event,
    IssueModel,
    RunCompiledRef,
    RunCompiledSkip,
    RunProvenance,
    RunRecord,
    RunScorecardRef,
)
from qscore.schemas.scorecard import Scorecard
from qscore.schemas.versions import SCORE_VERSION
from qscore.score.engine import score_item_compiled
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
    compiled_paths: list[Path] = field(default_factory=list)  # ChP-0034 exports, in item order


@dataclass(frozen=True)
class DiscoveryResult:
    candidates: list[Candidate]
    draft_path: Path | None
    diff: str
    added: list[str]
    skipped: list[drafting.Skipped]
    root: Path | None = None  # the discovery root (`project.root`)
    fetched: FetchedRepo | None = None  # set when PATH was a repository link (ChP-0035)


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


def _discovery_input_error(code: str, location: Location, message: str) -> InvalidInput:
    issue = IssueModel(code=code, severity="error", location=location, message=message)
    return InvalidInput(message, single_issue_report(location.file, issue), code=code)


def _read_discovery_manifest(path: Path) -> tuple[CommentedMap, str, str]:
    """Read only what discovery needs; unfinished items are validated later, when scoring."""
    try:
        doc, positions = load_yaml(path)
        old = path.read_text(encoding="utf-8")
    except UnicodeError as exc:
        raise _discovery_input_error(
            "Q100", Location(file=path.name), f"manifest is not UTF-8: {path}"
        ) from exc
    except OSError as exc:
        raise RecordError(f"could not read manifest {path}: {exc}") from exc
    if not isinstance(doc, CommentedMap) or not isinstance(doc.get("project"), dict):
        raise _discovery_input_error(
            "Q102", positions.locate(("project",)), "manifest and project must be mappings"
        )
    root = doc["project"].get("root", ".")  # declared ProjectInfo default
    if not isinstance(root, str):
        raise _discovery_input_error(
            "Q102", positions.locate(("project", "root")), "project.root must be a string"
        )
    if root == REQUIRED_PLACEHOLDER:
        raise _discovery_input_error(
            "Q107", positions.locate(("project", "root")), "fill project.root before discovery"
        )
    return doc, root, old


def discover_candidates(
    path: Path | str,
    on_event: OnEvent | None = None,
    *,
    draft: bool = False,
    pick: str | None = None,
    values: Path | None = None,
    no_input: bool = False,
    prompt: drafting.Prompt | None = None,
    ref: str | None = None,
    into: Path | None = None,
    subdir: Path | None = None,
) -> DiscoveryResult:
    """Statically list candidates and optionally save a reviewed manifest draft (05 §§1-2).

    `path` may be a repository link: it is cloned first (into `into`, default `./<repo-name>`;
    `ref` = branch, tag or commit) and the clone is the discovery root (ChP-0035). `subdir`
    limits discovery to a subdirectory of the root. Events deliver the candidate list and diff
    before saving. Existing manifests and drafts are never overwritten. Builders run only later,
    in the scoring sandbox.
    """
    emit = _Events(on_event)
    fetched = None
    if isinstance(path, str) and fetch.is_repo_url(path):
        dest = into if into is not None else Path(fetch.repo_name(path))
        emit("stage_started", f"cloning {fetch.strip_userinfo(path)} into {dest}", stage="fetch")
        fetched = fetch.clone(path, dest, ref, timeout_s=get_settings().fetch_timeout_s)
        emit("stage_finished", f"cloned {fetched.url}@{fetched.commit}", stage="fetch")
        path = fetched.path
    elif ref is not None or into is not None:
        raise InvalidInput("--ref and --into apply to a repository link only", report=None)
    path = Path(path).resolve()
    directory = path.parent if path.is_file() else path
    manifest_path = directory / "qscore.yaml"
    old = ""
    root = directory
    if manifest_path.exists():
        doc, project_root, old = _read_discovery_manifest(manifest_path)
        root = (directory / project_root).resolve()
    else:
        doc = drafting.new_manifest(directory.name)
    if subdir is not None:
        if path.is_file():
            raise InvalidInput("--path applies to a directory or a repository link", report=None)
        path = (path / subdir).resolve()
        if not path.is_dir():
            raise InvalidInput(f"--path {subdir}: no such directory under {root}", report=None)
    if path.is_file() or subdir is not None:
        if not path.is_relative_to(root):
            raise InvalidInput(f"{path} is outside project.root {root}", report=None)
        candidates = discover(root, subdir=path.relative_to(root))
    else:
        candidates = discover(root)
    lines = []
    hinted: set[str] = set()
    compat_warnings: list[str] = []
    for c in candidates:
        params = ", ".join(
            p.name
            + (f": {p.annotation}" if p.annotation else "")
            + (f" = {p.default!r}" if p.has_default and p.default_is_literal else "")
            + (" = <nonliteral default>" if p.has_default and not p.default_is_literal else "")
            for p in c.params
        )
        detail = f"({params}) [{c.signal}]" if c.name is not None else f"OpenQASM {c.qasm_version}"
        lines.append(f"{c.index}. {c.reference} {detail} ({c.source_kind}, line {c.line})")
        if c.size_like:
            lines.append(f"   Suggested sweep arguments: {', '.join(c.size_like)}")
        if c.path not in hinted:
            hinted.add(c.path)
            # Removed Qiskit APIs are the same for every candidate of a file (ChP-0037 §2.1 B).
            compat_warnings.extend(compat.describe(h, c.path) for h in c.compat)
    emit("stage_finished", "\n".join(lines) or "No circuit candidates found.", stage="discover")
    for warning in compat_warnings:
        emit("warning", warning, stage="discover")
    if not draft:
        return DiscoveryResult(candidates, None, "", [], [], root, fetched)
    if pick is None and len(candidates) == 1:
        # Exactly one candidate is picked and announced; never the first of several (ChP-0035).
        emit("stage_finished", f"Only one circuit found: {candidates[0].reference} — drafting it")
        pick = "1"
    chosen = drafting.pick_candidates(candidates, pick, prompt, no_input=no_input)
    for c in chosen:
        for miss in missing_imports(c, root):
            emit("warning", miss.describe(), stage="discover")
    supplied = drafting.load_values(values, candidates, root) if values is not None else None
    items = drafting.draft_items(chosen, supplied, prompt, no_input=no_input)
    added, skipped = drafting.merge_into(doc, items)
    for entry in skipped:
        emit("warning", f"{entry.reference}: {entry.reason}", stage="draft")
    new = drafting.dump(doc)
    diff = drafting.diff(old, new, manifest_path.name)
    destination = drafting.draft_target(manifest_path)
    emit("stage_finished", diff or "No changes to draft.", stage="draft", path=str(destination))
    try:
        with destination.open("x", encoding="utf-8") as stream:
            stream.write(new)
    except FileExistsError as exc:
        raise InvalidInput(
            f"refusing to overwrite {destination}; review or move the existing file first",
            report=None,
        ) from exc
    except OSError as exc:
        raise RecordError(f"could not write draft {destination}: {exc}") from exc
    unfilled = drafting.placeholders(destination)
    for loc in unfilled:
        emit(
            "warning",
            f"{loc.file}:{loc.line}: {loc.field} is {REQUIRED_PLACEHOLDER}; fill it in "
            "(scoring refuses placeholders)",
            stage="draft",
        )
    if unfilled:
        emit(
            "run_finished",
            f"Draft saved to {destination}; {len(unfilled)} placeholder(s) must be filled "
            "before scoring (Q107).",
        )
    else:
        emit("run_finished", f"Draft saved to {destination}; review it before scoring.")
    return DiscoveryResult(candidates, destination, diff, added, skipped, root, fetched)


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
    notice: str | None = None,
) -> ScoreResult:
    started = datetime.now(UTC)
    work = run_validation(manifest, manifest_dir, settings, manifest_file, positions)
    blocks = render_items(work, manifest)
    summary = render_text(work, manifest)
    if notice is not None:
        summary = f"{notice}\n\n{summary}"
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
    exported: list[RunCompiledRef] = []
    not_exported: list[RunCompiledSkip] = []
    emit("run_started", f"scoring {len(manifest.circuits)} item(s)")
    for resolved, loaded in work:
        item = resolved.item
        emit("item_started", f"scoring {item.id}", item_id=item.id)
        card, representative = score_item_compiled(resolved, loaded, manifest_sha256, settings)
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
        # After the scorecard is written: an exporter error raises RecordError (ChP-0034).
        if isinstance(representative, str):
            not_exported.append(RunCompiledSkip(item_id=item.id, reason=representative))
        else:
            target = card.target
            if target is None:
                raise RecordError(f"item {item.id}: scorecard has a compile but no target")
            export = export_compiled(
                item.id,
                resolved.item_sha256,
                representative,
                target.name,
                target.num_qubits,
                OPTIMIZATION_LEVEL,
                out_dir,
            )
            exported.append(
                RunCompiledRef(
                    item_id=export.item_id,
                    path=export.path,
                    sha256=export.sha256,
                    seed=export.seed,
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
            "compiled": exported,
            "compiled_skipped": not_exported,
            "project_source": source_of((manifest_dir / manifest.project.root).resolve()),
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
    return ScoreResult(cards, paths, report, run_path, [out_dir / c.path for c in exported])


def trust_notice(builders: int, fetched: FetchedRepo) -> str:
    """The notice shown before builders from a fetched repository run (05 §4.2, ChP-0035)."""
    return (
        f"{builders} builder function(s) from {fetched.url}@{fetched.commit} will run as your "
        "user, with network access. The sandbox limits time and memory and removes secrets from "
        "the environment; it is not a security boundary."
    )


def score_project(
    manifest_path: Path,
    out_dir: Path,
    on_event: OnEvent | None = None,
    *,
    confirm: ConfirmArg,
    fetched: FetchedRepo | None = None,
) -> ScoreResult:
    """Score a manifest. With `fetched` (a repository link), the trust notice is confirmed
    before validation runs any builder, and it heads the interpretation summary (ChP-0035)."""
    manifest, positions = load_manifest_with_positions(manifest_path)
    sha = sha256_hex(manifest_path.read_bytes())
    emit = _Events(on_event)
    notice = None
    builders = sum(isinstance(c.source, BuilderSource) for c in manifest.circuits)
    if fetched is not None and builders:
        notice = trust_notice(builders, fetched)
        if confirm == "yes":
            emit("warning", notice)
        elif not confirm(notice):
            return ScoreResult([], [], out_dir / "report.md", None)
    return _score(
        manifest,
        manifest_path.parent,
        sha,
        out_dir,
        get_settings(),
        emit,
        manifest_path.name,
        positions,
        confirm=confirm,
        notice=notice,
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
