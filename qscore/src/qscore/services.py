"""One function per user action; the only door into the package (specs/03 §3.1).

MVP (ChP-0023): `score_project` scores a manifest of QASM items; `score_circuit` scores a single
OpenQASM file with the manual-upload defaults (04 §2.2). Services never print.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from ruamel.yaml.comments import CommentedMap

from qscore.compile.pipeline import OPTIMIZATION_LEVEL
from qscore.config import Settings, get_settings
from qscore.errors import ConfigError, InvalidInput, LayerError, RecordError
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
from qscore.schemas.run import (
    BenchResult as BenchResultDoc,
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
    unreadable: list[IssueModel] = []  # files skipped by a folder scan (ChP-0044)
    if path.is_file() or subdir is not None:
        if not path.is_relative_to(root):
            raise InvalidInput(f"{path} is outside project.root {root}", report=None)
        candidates = discover(root, subdir=path.relative_to(root), unreadable=unreadable)
    else:
        candidates = discover(root, unreadable=unreadable)
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
    for issue in unreadable:
        loc = issue.location
        emit(
            "warning",
            f"{loc.file}:{loc.line}:{loc.column}: {issue.code} {issue.message} — not scanned; "
            "its circuits are not listed (fix the file, or limit discovery with --path)",
            stage="discover",
        )
    if not draft:
        return DiscoveryResult(candidates, None, "", [], [], root, fetched)
    if pick is None and len(candidates) == 1:
        # Exactly one candidate is picked and announced; never the first of several (ChP-0035).
        emit("stage_finished", f"Only one circuit found: {candidates[0].reference} — drafting it")
        pick = "1"
    chosen = drafting.pick_candidates(candidates, pick, prompt, no_input=no_input)
    from qscore.intake import deps

    has_declarations = deps.declares_dependencies(root)
    for c in chosen:
        for miss in missing_imports(c, root):
            emit(
                "warning",
                miss.describe()
                + (
                    f" Dependency declarations exist; run qscore deps {root}."
                    if has_declarations
                    else ""
                ),
                stage="discover",
            )
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
    # Read git state before anything is written, so qscore's own outputs never count as dirty.
    project_source = source_of((manifest_dir / manifest.project.root).resolve())
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
            "project_source": project_source,
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


@dataclass(frozen=True)
class ReferenceBuildResult:
    path: Path
    scored: int
    failures: int
    exit_code: int


def build_reference(
    out_dir: Path = Path("qscore-reference-src"), on_event: OnEvent | None = None
) -> ReferenceBuildResult:
    """Score the pinned public corpus with default settings (ChP-0038 R3).

    This maintainer command executes the selected builders in the normal sandbox.
    Each invalid/partial entry remains in the output's failure ledger. Infrastructure
    and recording failures abort the command; a missing dependency is never installed.
    """
    from importlib.resources import files

    from pydantic import ValidationError
    from ruamel.yaml import YAML
    from ruamel.yaml.error import YAMLError

    from qscore.record.reference import summarize, write_corpus
    from qscore.schemas.reference import (
        REFERENCE_SCHEMA,
        CorpusCatalog,
        ReferenceCorpus,
        ReferenceFailure,
    )

    emit = _Events(on_event)
    try:
        catalog = CorpusCatalog.model_validate(
            YAML(typ="safe").load(files("qscore.reference").joinpath("corpus.yaml").read_text())
        )
    except (OSError, UnicodeError, YAMLError, ValidationError) as exc:
        raise RecordError(f"could not read pinned reference catalog: {exc}") from exc
    settings = get_settings()
    out_dir = out_dir.resolve()
    repos = {}
    sources = []
    for source in catalog.repositories:
        emit("stage_started", f"cloning {source.url}@{source.commit}", stage="reference")
        repo = fetch.clone(
            source.url, out_dir / source.id, source.commit, timeout_s=settings.fetch_timeout_s
        )
        if repo.commit != source.commit:
            raise RecordError(
                f"reference source {source.id}: expected {source.commit}, got {repo.commit}"
            )
        modifications = list(source.modifications)
        if source.id == "mqt":
            # Explicit approved corpus preparation, not an import-error recovery path.
            stub = repo.path / "src/mqt/bench/_version.py"
            if stub.exists():
                raise RecordError(f"reference source unexpectedly contains generated file: {stub}")
            try:
                stub.write_text(
                    "# Generated explicitly for qscore reference build; not a release version.\n"
                    'version = "0+qscore.reference.613281f"\n'
                    'version_tuple = (0, "qscore.reference.613281f")\n',
                    encoding="utf-8",
                )
            except OSError as exc:
                raise RecordError(f"could not prepare MQT version metadata {stub}: {exc}") from exc
            modifications.append("src/mqt/bench/_version.py: explicit reference-build version stub")
        sources.append(source.model_copy(update={"modifications": modifications}))
        repos[source.id] = repo
    cards: list[Scorecard] = []
    failures: list[ReferenceFailure] = []
    for index, entry in enumerate(catalog.circuits, 1):
        emit(
            "item_started",
            f"reference {index}/{len(catalog.circuits)}: {entry.id}",
            item_id=entry.id,
        )
        repo = repos[entry.repository]
        manifest = ProjectManifest.model_validate(
            {
                "schema": "qscore.project/v0.2",
                "project": {"name": "qscore-reference", "root": "."},
                "circuits": [{"id": entry.id, "source": entry.source}],
            }
        )
        digest = sha256_hex(canonical_json(manifest.model_dump(mode="json")))
        try:
            result = _score(
                manifest,
                repo.path,
                digest,
                out_dir / "runs" / entry.id,
                settings,
                emit,
                "<reference corpus>",
                confirm="yes",
            )
        except InvalidInput as exc:
            codes = sorted({issue.code for issue in exc.report.issues}) if exc.report else []
            failures.append(ReferenceFailure(circuit_id=entry.id, codes=codes, error=str(exc)))
            emit("warning", f"{entry.id}: {exc}", item_id=entry.id)
            continue
        card = result.scorecards[0]
        cards.append(card)
        if card.status != "complete":
            errors = [f"{m.id}: {m.error.message}" for m in card.metrics if m.error is not None]
            reference = card.model_dump(mode="json").get("x-reference", {}).get("benchpress", {})
            if "error" in reference:
                errors.append(f"Benchpress: {reference['error']}")
            failures.append(
                ReferenceFailure(
                    circuit_id=entry.id,
                    codes=[],
                    error="; ".join(errors) or f"card status {card.status}",
                )
            )
    first = cards[0].provenance if cards else None
    corpus = ReferenceCorpus.model_validate(
        {
            "schema": REFERENCE_SCHEMA,
            "score_version": SCORE_VERSION,
            "created_at": datetime.now(UTC),
            "sources": sources,
            "targets": summarize(cards),
            "failures": failures,
            "provenance": {
                "qiskit": first.qiskit if first else None,
                "lock_sha256": first.lock_sha256 if first else None,
                "git_commit": first.git_commit if first else None,
                "catalog_sha256": sha256_hex(canonical_json(catalog.model_dump(mode="json"))),
            },
        }
    )
    path = write_corpus(corpus, out_dir / f"corpus-{SCORE_VERSION}.json")
    good = sum(c.status == "complete" for c in cards)
    emit("run_finished", f"reference corpus: {good} complete, {len(failures)} failed; {path}")
    return ReferenceBuildResult(
        path, good, len(failures), 2 if any(f.codes for f in failures) else 3 if failures else 0
    )


@dataclass(frozen=True)
class DependencyResult:
    environment: Path
    installed: bool


def prepare_dependencies(
    path: Path = Path("."), on_event: OnEvent | None = None, *, confirm: ConfirmArg
) -> DependencyResult:
    """Show the dependency plan and exact manifest diff before installing (ChP-0039)."""
    import io
    import os
    import tempfile

    from ruamel.yaml import YAML

    from qscore.intake import deps

    emit = _Events(on_event)
    path = path.resolve()
    if not path.exists():
        raise InvalidInput(f"dependency project path not found: {path}", report=None)
    manifest_path = path if path.is_file() else path / "qscore.yaml"
    root = path.parent if path.is_file() else path
    original = new_text = None
    if manifest_path.is_file():
        doc, project_root, original = _read_discovery_manifest(manifest_path)
        root = (manifest_path.parent / project_root).resolve()
        project = doc["project"]
        if "runner" in project and not isinstance(project["runner"], dict):
            raise InvalidInput("project.runner must be a mapping", report=None)
        if "runner" not in project:
            project["runner"] = CommentedMap()
        project["runner"]["env"] = "uv"
        stream = io.StringIO()
        YAML(typ="rt").dump(doc, stream)
        new_text = stream.getvalue()
    plan = deps.inspect_dependencies(root)
    summary = deps.render_plan(plan)
    if original is not None and new_text is not None:
        summary += "\n\n" + drafting.diff(original, new_text, manifest_path.name)
    else:
        summary += "\nNo manifest exists; set project.runner.env: uv in your subsequent draft."
    if confirm == "yes":
        emit("warning", summary, stage="deps", confirmation="yes_flag")
    elif not confirm(summary):
        return DependencyResult(plan.environment, False)
    else:
        emit(
            "stage_finished",
            "Dependency installation confirmed",
            stage="deps",
            confirmation="interactive",
        )
    if original is not None and _dependency_manifest_text(manifest_path) != original:
        raise RecordError("manifest changed after confirmation; run qscore deps again")
    prepared = deps.prepare(plan)
    environment = prepared.environment
    if new_text is not None:
        # Preserve a concurrent researcher edit instead of overwriting it after installation.
        if _dependency_manifest_text(manifest_path) != original:
            raise RecordError(
                f"environment prepared, but {manifest_path} changed; set runner.env: uv manually"
            )
        try:
            fd, temporary = tempfile.mkstemp(prefix=".qscore-deps-", dir=manifest_path.parent)
            with os.fdopen(fd, "w", encoding="utf-8") as manifest_stream:
                manifest_stream.write(new_text)
            os.replace(temporary, manifest_path)
        except OSError as exc:
            raise RecordError(f"environment prepared but manifest update failed: {exc}") from exc
    if prepared.previous is not None:
        emit(
            "warning",
            f"Previous environment kept at {prepared.previous}; delete it when no longer needed",
            stage="deps",
        )
    emit("stage_finished", f"Project dependencies ready: {environment}", stage="deps")
    return DependencyResult(environment, True)


# --- EXPERIMENTAL AMD ROCm benchmark (09 §7, ChP-0032 downscaled by ChP-0046) ---------------


@dataclass
class BenchRunResult:
    bench: BenchResultDoc
    report_path: Path
    out_dir: Path


def run_bench(
    out_dir: Path,
    devices: list[Literal["cpu", "gpu"]],
    sizes: list[int] | None = None,
    reps: int = 3,
    warmup: int = 1,
    fusion_sweep: bool = True,
    on_event: OnEvent | None = None,
) -> BenchRunResult:
    """CPU vs GPU statevector suite; writes bench.json, gpu-identity.json, telemetry.jsonl and
    amd-w7900.md to `out_dir`. A requested GPU that Aer cannot use raises SimulationError."""
    import json
    import math

    from qscore.bench.suite import BENCH_SUITE, SUITE_NAME
    from qscore.bench.suite import run_bench as run_suite
    from qscore.errors import SimulationError
    from qscore.hardware.profiler import amd_smi_json, detect_gpu, is_w7900
    from qscore.record.provenance import collect
    from qscore.record.w7900 import render_w7900
    from qscore.schemas.common import GpuInfo
    from qscore.sim.backends import aer_build, gpu_available
    from qscore.sim.telemetry import GpuSampler, parse_metric

    emit = _Events(on_event)
    started = datetime.now(UTC)
    settings = get_settings()
    aer_version, build = aer_build()
    has_gpu_device = gpu_available()
    if "gpu" in devices and not has_gpu_device:
        raise SimulationError(
            f"--device gpu requested but Aer ({aer_version}, build {build}) has no GPU device"
        )
    gpu = detect_gpu() if "gpu" in devices else None  # CPU-only runs need no ROCm tooling
    budget: int | None = None
    planning: dict[str, object] | None = None
    if "gpu" in devices:
        if gpu is None:
            raise SimulationError("Aer has a GPU device but amd-smi is not on PATH (identity)")
        free_mb = parse_metric(amd_smi_json("metric", "--mem-usage"))["free_vram_mb"]
        if free_mb is None:
            raise SimulationError("amd-smi did not report free VRAM; cannot admit GPU work")
        total = int(gpu.vram_gib * 1024**3)
        free = int(free_mb * 1024**2)
        budget = math.floor(0.9 * min(total, free))  # ChP-0032 B, exclusive mode: R = 0
        planning = {
            "total_bytes_T": total,
            "free_bytes_F": free,
            "reserved_bytes_R": 0,
            "mode": "exclusive",
            "overhead_factor": 1.2,
            "overhead_source": "declared initial estimate (not measured)",
            "safety_margin": 0.10,
            "budget_bytes": budget,
        }
        emit("stage_started", f"GPU {gpu.name} ({gpu.arch}); budget {budget / 1024**3:.1f} GiB")
    out_dir.mkdir(parents=True, exist_ok=True)
    sampler = GpuSampler()
    progress = lambda message: emit("stage_started", message, stage="bench")  # noqa: E731
    if "gpu" in devices:
        with sampler:
            outcome = run_suite(
                devices,
                sizes or list(BENCH_SUITE["sizes"]),
                reps,
                warmup,
                fusion_sweep,
                budget,
                progress,
            )
    else:
        outcome = run_suite(
            devices, sizes or list(BENCH_SUITE["sizes"]), reps, warmup, False, None, progress
        )
    provenance = collect(settings, [], int(BENCH_SUITE["seed"]), started)
    if gpu is not None:
        provenance = provenance.model_copy(
            update={"rocm": gpu.rocm, "gpu": GpuInfo(name=gpu.name, arch=gpu.arch)}
        )
    bench = BenchResultDoc.model_validate(
        {
            "schema": "qscore.bench/v0.2",
            "suite": SUITE_NAME,
            "devices": devices,
            "reps": reps,
            "warmup": warmup,
            "rows": [r.model_dump(mode="json") for r in outcome.rows],
            "crossover": {
                "double": outcome.crossover_qubits,
                "fusion_best_double": outcome.fusion_best,
            },
            "provenance": provenance.model_dump(mode="json"),
        }
    )
    telemetry = (
        sampler.summary()
        if "gpu" in devices
        else {"status": "unavailable", "reason": "no GPU work requested"}
    )
    evidence = {
        "w7900": is_w7900(gpu),
        "differential": outcome.differential,
        "telemetry": telemetry,
        "unmeasured": outcome.unmeasured,
        "aer": {"version": aer_version, "build": build, "gpu_available": has_gpu_device},
        "memory_planning": planning,
        "experimental": True,
    }
    (out_dir / "bench.json").write_text(
        json.dumps(bench.model_dump(mode="json", by_alias=True), indent=2) + "\n"
    )
    (out_dir / "gpu-identity.json").write_text(
        json.dumps(
            {"gpu": gpu.model_dump(mode="json") if gpu else None, "evidence": evidence}, indent=2
        )
        + "\n"
    )
    with (out_dir / "telemetry.jsonl").open("w") as fh:
        for row in sampler.samples:
            fh.write(json.dumps(row) + "\n")
    report = out_dir / "amd-w7900.md"
    report.write_text(render_w7900(gpu, bench, evidence))
    emit("stage_finished", f"Benchmark written to {out_dir}", stage="bench")
    return BenchRunResult(bench, report, out_dir)


def _dependency_manifest_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise RecordError(f"cannot recheck dependency manifest {path}: {exc}") from exc


@dataclass
class ImproveOnceResult:
    """One round of the downscaled loop (ChP-0049)."""

    path: Path
    summary: dict[str, object]
    improved: Path | None


def _region_size(qc: object) -> dict[str, int]:
    from qiskit.circuit import QuantumCircuit

    assert isinstance(qc, QuantumCircuit)
    two_q = sum(1 for i in qc.data if i.operation.num_qubits == 2)
    return {"two_qubit_count": two_q, "size": qc.size(), "depth": qc.depth()}


def _primary(card: Scorecard, metric_id: str) -> tuple[float | None, str]:
    for m in card.metrics:
        if m.id == metric_id:
            if m.status != "computed" or not isinstance(m.value, (int, float)):
                return None, f"{metric_id} is {m.status}"
            if m.kind == "statistical":
                return None, f"{metric_id} is statistical (interval rule not in this slice)"
            return float(m.value), "computed"
    return None, f"{metric_id} not in scorecard"


def _constraints(
    objective: Any, before: Scorecard, after: Scorecard
) -> tuple[bool | None, list[dict[str, object]]]:
    """08 §4 constraints of the objective: True all hold, False one fails, None inconclusive."""
    from qscore.errors import VerificationError
    from qscore.improve.loop import check_relative_constraint

    rows: list[dict[str, object]] = []
    verdict: bool | None = True
    by_id_b = {m.id: m for m in before.metrics}
    by_id_a = {m.id: m for m in after.metrics}
    for c in objective.constraints or []:
        b, a = by_id_b.get(c.metric), by_id_a.get(c.metric)
        if b is None or a is None:
            rows.append({"metric": c.metric, "ok": None, "reason": "metric missing"})
            verdict = None if verdict else verdict
            continue
        try:
            if c.max_vs_baseline is not None or c.min_vs_baseline is not None:
                direction: Literal["max_vs_baseline", "min_vs_baseline"] = (
                    "max_vs_baseline" if c.max_vs_baseline is not None else "min_vs_baseline"
                )
                factor = c.max_vs_baseline if c.max_vs_baseline is not None else c.min_vs_baseline
                check = check_relative_constraint(b, a, factor, direction)
                ok = check.ok
            else:
                value = a.value
                if a.status != "computed" or not isinstance(value, (int, float)):
                    raise VerificationError(f"{c.metric} is {a.status}")
                ok = (c.max is None or value <= c.max) and (c.min is None or value >= c.min)
        except VerificationError as exc:
            rows.append({"metric": c.metric, "ok": None, "reason": str(exc)})
            verdict = None if verdict else verdict
            continue
        rows.append({"metric": c.metric, "ok": ok, "before": b.value, "after": a.value})
        if not ok:
            verdict = False
    return verdict, rows


def improve_once(
    manifest_path: Path,
    item_id: str,
    out_dir: Path,
    layer_name: Literal["hf", "reference-qiskit"] = "hf",
    on_event: OnEvent | None = None,
    *,
    client: object | None = None,
    max_requests: int = 3,
    model: str | None = None,
) -> ImproveOnceResult:
    """Experimental single round of `improve_item` (10 §3, ChP-0049).

    Score the item; build region requests for the layer's strategies (top `max_requests`, policy
    order); ask the layer once per request; for every candidate check permitted gates/coupling
    (compiled regions), verify the region exactly (08 §2 `region_operator`), splice it into the
    circuit; re-score logical-scope splices with the same seeds and keep the best candidate whose
    primary metric is strictly better (08 §4, deterministic metrics only). Compiled-scope splices
    cannot be re-scored here (the pipeline compiles logical circuits); they are kept only when
    the region's two-qubit count strictly drops, and say so. Writes `<out>/improve-once.json` and,
    when a candidate wins, `<out>/improved/<item>.qasm` (OpenQASM 3) plus its scorecard."""
    from qiskit import qasm3

    from qscore.diagnose.policy import effective_policy
    from qscore.diagnose.regions import MODEL_LAYER_MAX_QUBITS, REFERENCE_MAX_QUBITS
    from qscore.improve.hf_layer import HfLayer, default_model, load_models, parse_qasm
    from qscore.improve.reference_qiskit import ReferenceQiskitLayer
    from qscore.improve.requests import RequestContext, build_requests, extract_region, splice
    from qscore.intake.loaders import LoadedCircuit, qpy_sha256
    from qscore.score.context import ScoringContext
    from qscore.verify.equivalence import region_operator

    emit = _Events(on_event)
    settings = get_settings()
    manifest, positions = load_manifest_with_positions(manifest_path)
    sha = sha256_hex(manifest_path.read_bytes())
    work = run_validation(manifest, manifest_path.parent, settings, manifest_path.name, positions)
    match = [(r, lo) for r, lo in work if r.item.id == item_id]
    if not match:
        raise InvalidInput(f"no item {item_id!r} in {manifest_path.name}", report=None)
    resolved, loaded = match[0]
    item = resolved.item
    if not (item.objective and item.permitted and item.evidence and item.budget):
        raise ConfigError(f"item {item_id}: resolved item lacks objective/permitted/budget")
    layer: HfLayer | ReferenceQiskitLayer
    if model is not None and layer_name != "hf":
        raise ConfigError(f"--model applies to the hf layer only (got layer {layer_name})")
    if layer_name == "hf":
        if model is None:
            entry = default_model()
        else:
            pinned = {e.id: e for e in load_models()}
            if model not in pinned:
                raise ConfigError(
                    f"model {model!r} is not pinned in improve/models.yaml: {sorted(pinned)}"
                )
            entry = pinned[model]
        if client is None:
            if settings.hf_token is None:
                raise ConfigError("HF_TOKEN is not set (Inference Providers token)")
            import openai  # extra [hf]

            client = openai.OpenAI(
                base_url=settings.hf_router_base_url,
                api_key=settings.hf_token.get_secret_value(),
                max_retries=0,  # the layer owns retries (10 §5)
            )
        privacy = item.privacy
        layer = HfLayer(
            entry,
            client,
            external_inference=bool(privacy and privacy.external_inference),
            timeout_s=settings.layer_timeout_s,
            max_calls=settings.hf_max_calls,
            max_cost_usd=settings.hf_max_cost_usd,
        )
        max_qubits = MODEL_LAYER_MAX_QUBITS
    else:
        layer = ReferenceQiskitLayer()
        max_qubits = REFERENCE_MAX_QUBITS
    emit("item_started", f"scoring {item_id}", item_id=item_id)
    card, _ = score_item_compiled(resolved, loaded, sha, settings)
    sc = ScoringContext(resolved, loaded.circuit, loaded.rebuild)
    rep = sc.representative
    diag = item.diagnose
    policy = effective_policy(
        diag.profile if diag else None,
        {e.rule: e.reason for e in (diag.ignore or [])} if diag else None,
    )
    coupling = tuple((int(a), int(b)) for a, b in sc.target.target.build_coupling_map().get_edges())
    ctx = RequestContext(
        round=1,
        logical=loaded.circuit,
        compiled=rep.circuit,
        representative_seed=rep.seed,
        backend=sc.target.name,
        basis=sc.target.basis,
        coupling_map=coupling,
        objective=item.objective,
        permitted=item.permitted,
        invariants=item.invariants,
        verification=item.evidence.verification,
        budget=item.budget,
        served_strategies=frozenset(layer.capabilities()),
        max_region_qubits=max_qubits,
    )
    built = build_requests(card, ctx, policy)
    regional = [b for b in built.requests if b.region is not None][:max_requests]
    objective = item.objective
    baseline, baseline_note = _primary(card, objective.primary)
    sign = 1.0 if objective.direction == "minimize" else -1.0
    summary: dict[str, object] = {
        "experimental": "ChP-0049: one round, region verification, no multi-round loop",
        "item": item_id,
        "layer": {"name": layer.name, "version": layer.version},
        "objective": objective.model_dump(mode="json"),
        "baseline": {"value": baseline, "note": baseline_note},
        "findings": [f.id for f in card.findings],
        "requests_built": len(built.requests),
        "requests_sent": len(regional),
        "skipped": built.skipped,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    attempts: list[dict[str, object]] = []
    best: tuple[float, Any, Scorecard | None, dict[str, object]] | None = None
    basis = set(sc.target.basis) | {"barrier"}
    for built_req in regional:
        assert built_req.region is not None
        request = built_req.request
        source = loaded.circuit if built_req.source == "logical" else rep.circuit
        original_region, _ = extract_region(source, built_req.region)
        allowed_pairs = {tuple(sorted(e)) for e in request.target.coupling_map}
        emit("stage_started", f"{layer.name}: {request.request_id}", item_id=item_id)
        error = None
        try:
            proposals = layer.propose(request)
        except LayerError as exc:  # 10 §2: recorded, the loop continues with the next request
            proposals, error = [], str(exc)
        for n, proposal in enumerate(proposals):
            candidate = parse_qasm(proposal.candidate.format, proposal.candidate.qasm)
            attempt: dict[str, object] = {
                "request_id": request.request_id,
                "candidate": n,
                "region_source": built_req.source,
                "region_before": _region_size(original_region),
                "region_after": _region_size(candidate),
                "claims": proposal.claims.model_dump(mode="json"),
                "rationale": proposal.rationale,
            }
            outside = {i.operation.name for i in candidate.data} - basis
            pairs = {
                tuple(sorted(candidate.find_bit(q).index for q in i.qubits))
                for i in candidate.data
                if i.operation.num_qubits == 2
            }
            if built_req.source == "compiled" and (outside or not pairs <= allowed_pairs):
                # 08 §2 step 1 / 10 §9: compiled regions keep native gates and the coupling map.
                attempt["verification"] = {
                    "status": "failed",
                    "method": "permitted",
                    "reason": f"non-native gates {sorted(outside)} or uncoupled pairs",
                }
                attempt["decision"] = "invalid"
                attempts.append(attempt)
                continue
            check = region_operator(original_region, candidate, item.invariants.global_phase)
            attempt["verification"] = {
                "status": check.status,
                "method": check.method,
                "reason": check.reason,
            }
            if check.status != "passed":
                attempt["decision"] = "rejected"
                attempts.append(attempt)
                continue
            spliced = splice(source, built_req.region, candidate)
            if built_req.source == "logical":
                emit("stage_started", f"re-scoring candidate {n}", item_id=item_id)
                new_card, _ = score_item_compiled(
                    resolved, LoadedCircuit(spliced, qpy_sha256(spliced), None), sha, settings
                )
                value, note = _primary(new_card, objective.primary)
                held, rows = _constraints(objective, card, new_card)
                attempt["rescored"] = {"value": value, "note": note, "constraints": rows}
                better = (
                    value is not None
                    and baseline is not None
                    and sign * value < sign * baseline
                    and held is True
                )
                key = sign * value if value is not None else float("inf")
            else:
                before = _region_size(original_region)["two_qubit_count"]
                after = _region_size(candidate)["two_qubit_count"]
                new_card = None
                attempt["rescored"] = {"value": None, "note": "compiled region: not re-scored"}
                better = after < before
                held = None
                key = float(after - before)
            attempt["decision"] = (
                "improved"
                if better
                else "constraint_failed_or_inconclusive"
                if built_req.source == "logical" and held is not True
                else "no_gain"
            )
            attempts.append(attempt)
            if better and (best is None or key < best[0]):
                best = (key, spliced, new_card, attempt)
        if error is not None:
            attempts.append({"request_id": request.request_id, "layer_error": error})
    summary["attempts"] = attempts
    if isinstance(layer, HfLayer):
        summary["calls"] = [c.__dict__ for c in layer.calls]
        summary["cost_usd_estimate"] = layer.spent_usd
    improved = None
    if best is not None:
        _, circuit, new_card, attempt = best
        improved = out_dir / "improved" / f"{item_id}.qasm"
        improved.parent.mkdir(parents=True, exist_ok=True)
        improved.write_text(qasm3.dumps(circuit), encoding="utf-8")
        if new_card is not None:
            write_scorecard(new_card, out_dir / "improved")
        summary["improved"] = {
            "path": improved.relative_to(out_dir).as_posix(),
            "from": attempt["request_id"],
            "candidate": attempt["candidate"],
            "rescored": attempt["rescored"],
        }
        outcome = f"improved circuit written ({attempt['request_id']})"
    else:
        outcome = "no verified improvement"
    statuses = [a.get("verification") for a in attempts]
    passed = sum(1 for v in statuses if isinstance(v, dict) and v.get("status") == "passed")
    summary["outcome"] = f"{outcome}; {passed} of {len(attempts)} attempt(s) verified"
    path = out_dir / "improve-once.json"
    path.write_text(json.dumps(summary, indent=2, sort_keys=True, default=str), encoding="utf-8")
    emit("item_finished", f"{item_id}: {summary['outcome']}", item_id=item_id)
    return ImproveOnceResult(path, summary, improved)
