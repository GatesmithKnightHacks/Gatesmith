"""Run record `<out>/run.json` (`qscore.run/v0.2`, specs/04 §13, ChP-0004, ChP-0028)."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from qscore.schemas.run import RunRecord

RUN_FILE = "run.json"


def write_run_record(record: RunRecord, out_dir: Path) -> Path:
    """Write atomically, so a reader never sees a half-written record."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / RUN_FILE
    data = json.dumps(record.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"
    fd, tmp = tempfile.mkstemp(dir=out_dir, prefix=".run.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(data)
    os.replace(tmp, path)
    return path


def read_run_record(path: Path) -> RunRecord:
    return RunRecord.model_validate_json(path.read_text(encoding="utf-8"))
