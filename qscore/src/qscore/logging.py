"""Structured logging (specs/03-code-structure.md §3.1, rule R10).

`setup_logging(profile, mode)`: JSON lines on stderr for the worker, a Rich console for the CLI. A
redaction filter replaces the values of secret-looking environment variables and credentials in
URLs before any record is emitted.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import UTC, datetime
from typing import Literal

# Same patterns the sandbox strips from builder environments (specs/05-pipeline.md §4.2).
_SECRET_ENV = re.compile(r"(_TOKEN|_KEY|_DSN|SECRET|^HF_|^NEON_|^GEMINI_|^OPENAI_)", re.IGNORECASE)
_URL_CREDENTIALS = re.compile(r"(?P<scheme>[a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@", re.IGNORECASE)
REDACTED = "***"


def _secret_values() -> list[str]:
    return sorted(
        (v for k, v in os.environ.items() if _SECRET_ENV.search(k) and len(v) >= 6),
        key=len,
        reverse=True,
    )


def redact(text: str) -> str:
    """Remove secret environment values and URL credentials from `text`."""
    for value in _secret_values():
        text = text.replace(value, REDACTED)
    return _URL_CREDENTIALS.sub(lambda m: f"{m.group('scheme')}{REDACTED}@", text)


class RedactionFilter(logging.Filter):
    """Redacts the fully formatted message (args included) of every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = None
        if record.exc_info and record.exc_info[1] is not None:
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
            record.exc_info = None
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line: at (UTC, Z), level, logger, message, exc (if any)."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "at": datetime.fromtimestamp(record.created, UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_text:
            entry["exc"] = record.exc_text
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(profile: str, mode: Literal["cli", "worker"] = "cli") -> None:
    """Configure the root logger once per process (replaces existing handlers)."""
    handler: logging.Handler
    if mode == "worker":
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(JsonFormatter())
    else:
        from rich.console import Console
        from rich.logging import RichHandler

        # stderr: stdout is reserved for command output (`--json`).
        handler = RichHandler(console=Console(stderr=True), show_path=False, rich_tracebacks=False)
    handler.addFilter(RedactionFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    logging.getLogger("qiskit").setLevel(logging.WARNING)  # per-pass timings are INFO
    logging.getLogger(__name__).debug("logging configured for profile %s (%s)", profile, mode)
