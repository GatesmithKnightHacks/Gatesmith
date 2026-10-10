"""Command-line interface (specs/05-pipeline.md §11; exit codes per CP-0017).

MVP (CP-0023): `qscore score` for a manifest or a single OpenQASM file. Other commands arrive
with their tasks.
"""

from __future__ import annotations

import json
import sys
import traceback
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from qscore import services
from qscore.config import get_settings, log_startup
from qscore.errors import ConfigError, InvalidInput, QscoreError
from qscore.logging import setup_logging

app = typer.Typer(
    name="qscore",
    help="Score quantum circuits: validate, compile, measure, diagnose, improve, verify.",
    no_args_is_help=True,
    add_completion=False,
)
err = Console(stderr=True)
SEVERITY_ORDER = {"info": 0, "warning": 1, "high": 2}


class FailOn(StrEnum):
    info = "info"
    warning = "warning"
    high = "high"


@app.callback()
def main() -> None:
    """qscore: a scoring engine for quantum circuits (Qiskit)."""
    try:
        settings = get_settings()
    except ConfigError as exc:
        err.print(f"[red]configuration error:[/red] {exc}")
        raise typer.Exit(4) from exc
    setup_logging(settings.profile, mode="cli")
    log_startup(settings)


@app.command()
def score(
    path: Annotated[
        Path | None,
        typer.Argument(help="A single OpenQASM file to score, or - to paste QASM on stdin."),
    ] = None,
    manifest: Annotated[Path | None, typer.Option(help="qscore.yaml manifest.")] = None,
    target: Annotated[
        str | None, typer.Option(help="Target for a single file (default FakeTorino).")
    ] = None,
    out: Annotated[Path, typer.Option(help="Output directory.")] = Path("qscore-out"),
    yes: Annotated[bool, typer.Option("--yes", help="Do not ask for confirmation.")] = False,
    allow_partial: Annotated[bool, typer.Option("--allow-partial")] = False,
    fail_on: Annotated[
        FailOn | None, typer.Option(help="Exit 1 on findings at/above this severity.")
    ] = None,
    as_json: Annotated[bool, typer.Option("--json", help="Print scorecards as JSON.")] = False,
) -> None:
    """Score circuits: compile across seeds, compute metrics, run diagnostics."""
    if (path is None) == (manifest is None):
        err.print("give exactly one of PATH (an OpenQASM file) or --manifest")
        raise typer.Exit(2)
    pasted = path == Path("-")
    if pasted and not yes:
        err.print("reading QASM from stdin needs --yes (stdin cannot also answer the prompt)")
        raise typer.Exit(2)
    if not yes and not typer.confirm(f"Score {path or manifest} (CPU; results in {out})?"):
        raise typer.Exit(0)
    try:
        if pasted:
            if sys.stdin.isatty():
                err.print("Paste OpenQASM 2 or 3, then press Ctrl-D on an empty line:")
            result = services.score_qasm_text(sys.stdin.read(), out, target)
        elif path is not None:
            result = services.score_circuit(path, out, target)
        else:
            assert manifest is not None  # exactly one was given (checked above)
            result = services.score_project(manifest, out)
    except InvalidInput as exc:
        err.print(f"[red]invalid input:[/red] {exc}")
        if exc.report is not None and hasattr(exc.report, "issues"):
            for i in exc.report.issues:
                loc = i.location
                err.print(
                    f"  {i.code} {loc.file}:{loc.line}:{loc.column} {loc.field or ''} — {i.message}"
                )
        raise typer.Exit(2) from exc
    except ConfigError as exc:
        err.print(f"[red]configuration error:[/red] {exc}")
        raise typer.Exit(4) from exc
    except QscoreError as exc:
        err.print(f"[red]runtime failure:[/red] {type(exc).__name__}: {exc}")
        raise typer.Exit(3) from exc
    except Exception as exc:  # CP-0017: anything that is not a QscoreError is a bug → exit 3
        err.print(f"[red]unexpected error (a bug):[/red]\n{traceback.format_exc()}")
        raise typer.Exit(3) from exc
    if as_json:
        sys.stdout.write(
            json.dumps([c.model_dump(mode="json") for c in result.scorecards], indent=2) + "\n"
        )
    for card, p in zip(result.scorecards, result.paths, strict=True):
        live = [f for f in card.findings if f.suppressed is None]
        err.print(
            f"{card.item.id}: {card.status} · {len(live)} finding(s) "
            f"({', '.join(f'{f.rule}:{f.severity}' for f in live) or 'none'}) → {p}"
        )
    err.print(f"report → {result.report_path}")
    if pasted and not as_json:
        sys.stdout.write(result.report_path.read_text(encoding="utf-8"))
    if any(c.status == "partial" for c in result.scorecards) and not allow_partial:
        raise typer.Exit(3)
    if fail_on is not None:
        worst = max(
            (
                SEVERITY_ORDER[f.severity]
                for c in result.scorecards
                for f in c.findings
                if f.suppressed is None
            ),
            default=-1,
        )
        if worst >= SEVERITY_ORDER[fail_on]:
            raise typer.Exit(1)
