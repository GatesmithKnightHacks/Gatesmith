"""Read untrusted archives as bounded, checksummed data. Never extract or load QPY."""

from __future__ import annotations

import hashlib
import io
import json
import re
import stat
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

from pydantic import ValidationError
from qscore.errors import RecordError
from qscore.schemas.run import IssueReportModel, RunCompiledRef, RunRecord, RunScorecardRef
from qscore.schemas.scorecard import Scorecard

from qscore_review.contracts import BundleSide, ReviewBundle
from qscore_review.settings import AllowedRepository


@dataclass
class LoadedBundle:
    envelope: ReviewBundle
    payloads: dict[str, bytes]
    runs: dict[str, RunRecord]
    cards: dict[str, dict[str, Scorecard]]
    issues: dict[str, IssueReportModel]
    discoveries: dict[str, dict[str, Any]]


def _json(raw: bytes) -> Any:
    def unique(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result

    return json.loads(
        raw,
        object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")),
    )


def _safe_path(name: str) -> bool:
    name = name.rstrip("/")
    path = PurePosixPath(name)
    return (
        bool(name)
        and not path.is_absolute()
        and ".." not in path.parts
        and "\\" not in name
        and ":" not in name
        and str(path) == name
    )


def load_bundle(
    raw: bytes, *, compressed_limit: int = 20_000_000, uncompressed_limit: int = 50_000_000
) -> LoadedBundle:
    if len(raw) > compressed_limit:
        raise RecordError("Bundle compressed size exceeds limit")
    payloads: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos = archive.infolist()
            if len(infos) > 1000:
                raise RecordError("Bundle file count exceeds limit")
            total = 0
            seen: set[str] = set()
            for info in infos:
                if not _safe_path(info.filename) or info.filename in seen:
                    raise RecordError("Unsafe or duplicate archive path")
                seen.add(info.filename)
                mode = info.external_attr >> 16
                if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                    raise RecordError("Archive contains a link or special file")
                if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    raise RecordError("Unsupported archive compression")
                if info.flag_bits & 1:
                    raise RecordError("Encrypted archives are not supported")
                if info.is_dir():
                    continue
                total += info.file_size
                if (
                    total > uncompressed_limit
                    or info.file_size > 10_000_000
                    or info.file_size > max(1000, info.compress_size) * 100
                ):
                    raise RecordError("Bundle decompression limit exceeded")
                with archive.open(info) as source:
                    content = source.read(min(info.file_size + 1, 10_000_001))
                if len(content) != info.file_size:
                    raise RecordError("Archive size mismatch")
                payloads[info.filename] = content
        if "envelope.json" not in payloads:
            raise RecordError("Bundle is missing envelope.json")
        envelope = ReviewBundle.model_validate(_json(payloads.pop("envelope.json")))
        if set(envelope.checksums) != set(payloads):
            raise RecordError("Bundle checksum inventory mismatch")
        for name, expected in envelope.checksums.items():
            if not re.fullmatch(r"[0-9a-f]{64}", expected):
                raise RecordError("Invalid payload checksum")
            if hashlib.sha256(payloads[name]).hexdigest() != expected:
                raise RecordError("Bundle payload checksum mismatch")
            if PurePosixPath(name).suffix not in (".json", ".qasm", ".md", ".txt", ".yaml"):
                raise RecordError("Unsupported artifact payload type; QPY is never loaded")
        loaded = LoadedBundle(envelope, payloads, {}, {}, {}, {})
        for name, side in (("base", envelope.base), ("head", envelope.head)):
            _load_side(name, side, loaded)
        if envelope.base.commit != envelope.provenance.base_sha:
            raise RecordError("Base commit mismatch")
        if envelope.head.commit != envelope.provenance.head_sha:
            raise RecordError("Head commit mismatch")
        return loaded
    except (
        zipfile.BadZipFile,
        zlib.error,
        RuntimeError,
        UnicodeDecodeError,
        ValueError,
        ValidationError,
        KeyError,
    ) as exc:
        raise RecordError("Bundle data failed schema or archive validation") from exc


def _load_side(name: str, side: BundleSide, loaded: LoadedBundle) -> None:
    referenced = [side.run, side.issues, side.discovery, *side.scorecards, *side.compiled_qasm]
    for path in referenced:
        if path is not None and (not path.startswith(name + "/") or path not in loaded.payloads):
            raise RecordError("Missing or cross-side bundle reference")
    loaded.cards[name] = {}
    if side.run:
        run = RunRecord.model_validate(_json(loaded.payloads[side.run]))
        if run.provenance.score_version != loaded.envelope.provenance.score_version:
            raise RecordError("Recorded score version mismatch")
        if run.project_source is not None:
            source = run.project_source.model_dump()
            if source.get("commit") != side.commit or source.get("dirty"):
                raise RecordError("Run source commit is missing, dirty or mismatched")
        references: list[RunScorecardRef | RunCompiledRef] = [*run.scorecards, *run.compiled]
        for ref in references:
            path = name + "/" + ref.path
            if not _safe_path(path) or path not in loaded.payloads:
                raise RecordError("Missing engine payload reference")
            if hashlib.sha256(loaded.payloads[path]).hexdigest() != ref.sha256:
                raise RecordError("Engine payload checksum mismatch")
        if {name + "/" + ref.path for ref in run.scorecards} != set(side.scorecards):
            raise RecordError("Scorecard inventory differs from run.json")
        if {name + "/" + ref.path for ref in run.compiled} != set(side.compiled_qasm):
            raise RecordError("Compiled QASM inventory differs from run.json")
        loaded.runs[name] = run
    for path in side.scorecards:
        card = Scorecard.model_validate(_json(loaded.payloads[path]))
        if card.item.id in loaded.cards[name]:
            raise RecordError("Duplicate stable item id")
        if card.item.score_version != loaded.envelope.provenance.score_version:
            raise RecordError("Scorecard score version mismatch")
        loaded.cards[name][card.item.id] = card
    if side.issues:
        loaded.issues[name] = IssueReportModel.model_validate(_json(loaded.payloads[side.issues]))
    if side.discovery:
        discovery = _json(loaded.payloads[side.discovery])
        if not isinstance(discovery, dict):
            raise RecordError("Invalid discovery payload")
        loaded.discoveries[name] = discovery
    if side.exit_code in (0, 1) and side.run is None and not side.discovery:
        raise RecordError("Successful side lacks a scoring or discovery record")


def validate_provenance(
    loaded: LoadedBundle, allowed: AllowedRepository, run: dict[str, Any], pr: dict[str, Any]
) -> None:
    p = loaded.envelope.provenance
    expected = {
        "repository": allowed.repository,
        "repository_id": allowed.repository_id,
        "workflow_id": allowed.workflow_id,
        "workflow_path": allowed.workflow_path,
        "run_id": run["id"],
        "run_attempt": run["run_attempt"],
        "base_sha": pr["base"]["sha"],
        "head_sha": pr["head"]["sha"],
        "pull_request": pr["number"],
        "engine_revision": allowed.engine_revision,
        "fork": pr["head"]["repo"]["id"] != allowed.repository_id,
    }
    for key, value in expected.items():
        if getattr(p, key) != value:
            raise RecordError("Bundle provenance mismatch: " + key)
    if (
        run["workflow_id"] != allowed.workflow_id
        or run["path"] != allowed.workflow_path
        or run["head_sha"] != p.head_sha
        or run["event"] != "pull_request"
    ):
        raise RecordError("Workflow identity or PR head is not allowed")
    linked = {item["number"] for item in run.get("pull_requests", [])}
    if p.pull_request not in linked:
        raise RecordError("Workflow has no authenticated link to this PR")
