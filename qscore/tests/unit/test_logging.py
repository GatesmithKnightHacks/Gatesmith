"""Secret redaction in logs (rule R10.1)."""

from __future__ import annotations

import json
import logging
import sys

import pytest

from qscore.logging import REDACTED, JsonFormatter, RedactionFilter, redact, setup_logging


def test_secret_env_values_redacted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HF_TOKEN", "hf_abcdefghijklmnop")
    assert redact("token is hf_abcdefghijklmnop") == f"token is {REDACTED}"


def test_url_credentials_redacted() -> None:
    dsn = "postgresql://worker:s3cr3tpass@ep-x.neon.tech/db"
    assert redact(dsn) == f"postgresql://{REDACTED}@ep-x.neon.tech/db"


def test_plain_text_unchanged() -> None:
    assert redact("compiled 12 qubits") == "compiled 12 qubits"


def _record(msg: str, *args: object) -> logging.LogRecord:
    return logging.LogRecord("qscore.t", logging.INFO, __file__, 1, msg, args, None)


def test_filter_redacts_args(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEON_API_KEY", "napi_0123456789")
    record = _record("connecting with %s", "napi_0123456789")
    assert RedactionFilter().filter(record)
    assert record.getMessage() == f"connecting with {REDACTED}"


def test_filter_redacts_exception_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HF_TOKEN", "hf_abcdefghijklmnop")
    try:
        raise RuntimeError("bad token hf_abcdefghijklmnop")
    except RuntimeError:
        record = logging.LogRecord(
            "qscore.t", logging.ERROR, __file__, 1, "failed", None, sys.exc_info()
        )
    RedactionFilter().filter(record)
    assert record.exc_text is not None
    assert "hf_abcdefghijklmnop" not in record.exc_text and REDACTED in record.exc_text


def test_json_formatter_one_object_per_line_utc_z() -> None:
    line = JsonFormatter().format(_record("hello %s", "world"))
    entry = json.loads(line)
    assert "\n" not in line
    assert entry["message"] == "hello world" and entry["level"] == "INFO"
    assert entry["at"].endswith("Z")


def test_worker_mode_logs_json_to_stderr(capsys: pytest.CaptureFixture[str]) -> None:
    setup_logging("ci", mode="worker")
    try:
        logging.getLogger("qscore.t").info("ping")
        captured = capsys.readouterr()
    finally:
        logging.getLogger().handlers.clear()
    assert captured.out == ""
    assert json.loads(captured.err.strip().splitlines()[-1])["message"] == "ping"
