"""CLI skeleton (T00 acceptance: `qscore --help` works)."""

from __future__ import annotations

from typer.testing import CliRunner

from qscore.cli import app


def test_help_exits_zero() -> None:
    result = CliRunner().invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "Usage" in result.output
