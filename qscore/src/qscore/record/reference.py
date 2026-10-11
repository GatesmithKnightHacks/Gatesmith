"""Derived public-circuit distributions (approved ChP-0038 §2.1, §4-5)."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import tempfile
from importlib import resources
from pathlib import Path

import numpy as np
from pydantic import ValidationError

from qscore.errors import RecordError
from qscore.schemas.common import Status
from qscore.schemas.reference import ReferenceBand, ReferenceCorpus, WidthBand
from qscore.schemas.scorecard import Scorecard


def width_band(width: int) -> WidthBand | None:
    """Return the declared active-width band; zero/one qubit have no band."""
    if isinstance(width, bool) or not isinstance(width, int) or width < 0:
        raise RecordError(f"Invalid reference circuit width: {width!r}")
    if width < 2:
        return None
    if width <= 5:
        return "2\u20135"
    if width <= 10:
        return "6\u201310"
    if width <= 20:
        return "11\u201320"
    if width <= 50:
        return "21\u201350"
    return "51+"


def _scalar(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def summarize(cards: list[Scorecard]) -> dict[str, dict[str, dict[WidthBand, ReferenceBand]]]:
    """Summarize complete cards' finite scalar measurements by target and active width."""
    samples: dict[tuple[str, str, WidthBand], list[tuple[float, str]]] = {}
    seen: set[tuple[str, str]] = set()
    for card in cards:
        if card.target is None:
            continue
        target = card.target.name
        identity = (target, card.item.id)
        if identity in seen:
            raise RecordError(f"Duplicate reference circuit {card.item.id!r} for target {target!r}")
        seen.add(identity)
        if card.status != "complete":
            continue
        width = next((metric for metric in card.metrics if metric.id == "width"), None)
        if width is None or width.status != Status.COMPUTED or not _scalar(width.value):
            continue
        # Width is the computed active compiled width, never target.num_qubits.
        if not isinstance(width.value, (int, float)) or not float(width.value).is_integer():
            raise RecordError(f"Non-integral reference width for circuit {card.item.id!r}")
        band = width_band(int(width.value))
        if band is None:
            continue
        for metric in card.metrics:
            if metric.status != Status.COMPUTED or not _scalar(metric.value):
                continue
            if isinstance(metric.value, (int, float)):
                samples.setdefault((target, metric.id, band), []).append(
                    (float(metric.value), card.item.id)
                )
    result: dict[str, dict[str, dict[WidthBand, ReferenceBand]]] = {}
    for (target, metric_id, band), entries in sorted(samples.items()):
        entries.sort()
        values = [value for value, _ in entries]
        quantiles = np.percentile(values, [5, 25, 50, 75, 95], method="linear")
        result.setdefault(target, {}).setdefault(metric_id, {})[band] = ReferenceBand(
            n=len(entries),
            quantiles=dict(zip(["5", "25", "50", "75", "95"], map(float, quantiles), strict=True)),
            values=values,
            circuit_ids=[circuit_id for _, circuit_id in entries],
        )
    return result


def write_corpus(corpus: ReferenceCorpus, path: Path) -> Path:
    """Atomically write a stable JSON document, including its final newline."""
    try:
        data = (
            json.dumps(
                corpus.model_dump(mode="json"),
                sort_keys=True,
                indent=2,
                ensure_ascii=False,
                allow_nan=False,
            )
            + "\n"
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(data)
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
    except (OSError, ValueError, TypeError) as exc:
        raise RecordError(f"Cannot write reference corpus {path}: {exc}") from exc
    return path


def load_corpus(score_version: str) -> tuple[ReferenceCorpus, str] | None:
    """Load the shipped version and hash its exact bytes; only an absent file returns None."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", score_version):
        raise RecordError(f"Unsafe reference score version: {score_version!r}")
    name = f"corpus-{score_version}.json"
    try:
        resource = resources.files("qscore.reference").joinpath(name)
    except (ImportError, OSError, TypeError) as exc:
        raise RecordError(f"Cannot locate shipped reference package for {name}: {exc}") from exc
    try:
        data = resource.read_bytes()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise RecordError(f"Cannot read reference corpus {name}: {exc}") from exc
    try:
        corpus = ReferenceCorpus.model_validate_json(data)
    except ValidationError as exc:
        raise RecordError(f"Invalid reference corpus {name}: {exc}") from exc
    if corpus.score_version != score_version:
        raise RecordError(
            f"Reference corpus {name} has score version {corpus.score_version!r}, "
            f"expected {score_version!r}"
        )
    return corpus, hashlib.sha256(data).hexdigest()
