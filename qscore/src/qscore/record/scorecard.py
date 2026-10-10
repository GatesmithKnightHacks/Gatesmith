"""Scorecard files (specs/11-records-and-queue.md §6): atomic writes."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from qscore.schemas.scorecard import Scorecard


def write_scorecard(card: Scorecard, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{card.item.id}.json"
    data = json.dumps(card.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"
    fd, tmp = tempfile.mkstemp(dir=out_dir, prefix=f".{card.item.id}.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(data)
    os.replace(tmp, path)
    return path


def read_scorecard(path: Path) -> Scorecard:
    return Scorecard.model_validate_json(path.read_text(encoding="utf-8"))
