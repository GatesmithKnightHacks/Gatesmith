"""Command-line interface (specs/05-pipeline.md §11; exit codes per ChP-0017).

MVP (ChP-0023): `qscore score` for a manifest or a single OpenQASM file. Other commands arrive
with their tasks.
"""

from __future__ import annotations

import json
import sys
import traceback
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import click
import typer
from rich.console import Console

from qscore import services
from qscore.config import get_settings, log_startup
from qscore.errors import ConfigError, InvalidInput, QscoreError
from qscore.intake.draft import PromptSpec
from qscore.logging import setup_logging
from qscore.schemas.run import Event

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
def discover(
    path: Annotated[
        str,
        typer.Argument(
            help="Repository link (https://, ssh://, git@host:owner/repo, file://), or a "
            "repository, Python, QASM or notebook path."
        ),
    ] = ".",
    draft: Annotated[
        bool, typer.Option("--draft", help="Write a manifest draft after showing its diff.")
    ] = False,
    pick: Annotated[
        str | None, typer.Option(help="Candidate numbers or names, comma-separated.")
    ] = None,
    values: Annotated[Path | None, typer.Option(help="qscore.values/v0.1 YAML file.")] = None,
    no_input: Annotated[
        bool, typer.Option("--no-input", help="Never prompt; requires --pick for drafting.")
    ] = False,
    ref: Annotated[
        str | None, typer.Option(help="Branch, tag or full commit SHA of a repository link.")
    ] = None,
    into: Annotated[
        Path | None, typer.Option(help="Clone destination (default ./<repo-name>).")
    ] = None,
    subdir: Annotated[
        Path | None, typer.Option("--path", help="Limit discovery to this subdirectory.")
    ] = None,
    score_after: Annotated[
        bool, typer.Option("--score", help="Score the draft right after writing it.")
    ] = False,
    out: Annotated[
        Path | None, typer.Option(help="Output directory for --score (default <root>/qscore-out).")
    ] = None,
    yes: Annotated[bool, typer.Option("--yes", help="With --score: do not ask.")] = False,
    allow_partial: Annotated[
        bool, typer.Option("--allow-partial", help="With --score: exit 0 on partial cards.")
    ] = False,
    fail_on: Annotated[
        FailOn | None, typer.Option(help="With --score: exit 1 on findings at/above this.")
    ] = None,
) -> None:
    """Find circuits without executing code; optionally draft their manifest entries."""
    if not draft and (pick is not None or values is not None or no_input or score_after):
        err.print("--pick, --values, --no-input and --score require --draft")
        raise typer.Exit(2)
    if not score_after and (out is not None or yes or allow_partial or fail_on is not None):
        err.print("--out, --yes, --allow-partial and --fail-on require --score")
        raise typer.Exit(2)

    def prompt(spec: PromptSpec) -> str:
        for suggestion in spec.suggestions:
            typer.echo(f"  Suggested: {suggestion.value!r} from {suggestion.where}")
        return str(typer.prompt(spec.message, default="", show_default=False))

    def on_event(event: Event) -> None:
        typer.echo(event.message)

    def confirm(summary: str) -> bool:
        err.print(summary, markup=False)
        return typer.confirm("Continue?", err=True)

    result: services.ScoreResult | None = None
    try:
        found = services.discover_candidates(
            path,
            on_event,
            draft=draft,
            pick=pick,
            values=values,
            no_input=no_input,
            prompt=None if no_input else prompt,
            ref=ref,
            into=into,
            subdir=subdir,
        )
        if score_after:
            assert found.draft_path is not None and found.root is not None  # --draft wrote it
            result = services.score_project(
                found.draft_path,
                out if out is not None else found.root / "qscore-out",
                on_event,
                confirm="yes" if yes else confirm,
                fetched=found.fetched,
            )
    except InvalidInput as exc:
        err.print(f"[red]invalid input:[/red] {exc}")
        if exc.report is not None:
            for issue in exc.report.issues:
                loc = issue.location
                err.print(
                    f"  {issue.code} {loc.file}:{loc.line}:{loc.column} "
                    f"{loc.field or ''} — {issue.message}",
                    markup=False,
                )
                if issue.hint:
                    err.print(f"    {issue.hint}", markup=False)
        raise typer.Exit(2) from exc
    except ConfigError as exc:
        err.print(f"[red]configuration error:[/red] {exc}")
        raise typer.Exit(4) from exc
    except QscoreError as exc:
        err.print(f"[red]runtime failure:[/red] {type(exc).__name__}: {exc}")
        raise typer.Exit(3) from exc
    except click.exceptions.Abort:  # Ctrl-C / EOF at a prompt: click's own "Aborted!" exit
        raise
    except Exception as exc:  # ChP-0017: anything that is not a QscoreError is a bug → exit 3
        err.print(f"[red]unexpected error (a bug):[/red]\n{traceback.format_exc()}")
        raise typer.Exit(3) from exc
    if result is not None:  # --score ran: same output and exit codes as `qscore score`
        _finish_run(result, allow_partial=allow_partial, fail_on=fail_on)


def _finish_run(
    result: services.ScoreResult,
    *,
    allow_partial: bool,
    fail_on: FailOn | None,
    as_json: bool = False,
    pasted: bool = False,
) -> None:
    """Status lines and exit code after a scoring run; shared by `score` and `discover --score`
    (ChP-0042)."""
    if not result.scorecards:
        err.print("not confirmed; nothing scored")
        return
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
    for compiled in result.compiled_paths:
        err.print(f"compiled → {compiled}")
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


@app.command()
def score(
    path: Annotated[
        Path | None,
        typer.Argument(
            help="A manifest (*.yaml/*.yml), a project directory (its qscore.yaml), a single "
            "OpenQASM file, or - to paste QASM on stdin."
        ),
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
        err.print("give exactly one of PATH or --manifest")
        raise typer.Exit(2)
    # PATH routing (ChP-0036): a manifest or a directory's qscore.yaml means manifest mode.
    if path is not None and (path.suffix in (".yaml", ".yml") or path.is_dir()):
        manifest, path = (path / "qscore.yaml" if path.is_dir() else path), None
    pasted = path == Path("-")
    # The mode PATH resolved to is named before anything runs (ChP-0036).
    err.print(
        f"Input: manifest {manifest}"
        if manifest is not None
        else "Input: pasted OpenQASM (stdin)"
        if pasted
        else f"Input: single file {path}",
        markup=False,
    )
    if pasted and not yes:
        err.print("reading QASM from stdin needs --yes (stdin cannot also answer the prompt)")
        raise typer.Exit(2)
    if manifest is not None and target is not None:
        err.print("--target applies to a single QASM input; set the target in your manifest")
        raise typer.Exit(2)

    def confirm(summary: str) -> bool:
        err.print(summary, markup=False)
        return typer.confirm(f"Score these circuits (CPU; results in {out})?", err=True)

    try:
        if pasted:
            if sys.stdin.isatty():
                err.print("Paste OpenQASM 2 or 3, then press Ctrl-D on an empty line:")
            result = services.score_qasm_text(sys.stdin.read(), out, target, confirm="yes")
        elif path is not None:
            result = services.score_circuit(path, out, target, confirm="yes" if yes else confirm)
        else:
            assert manifest is not None  # exactly one was given (checked above)
            result = services.score_project(manifest, out, confirm="yes" if yes else confirm)
    except InvalidInput as exc:
        err.print(f"[red]invalid input:[/red] {exc}")
        if exc.report is not None and hasattr(exc.report, "issues"):
            for i in exc.report.issues:
                loc = i.location
                err.print(
                    f"  {i.code} {loc.file}:{loc.line}:{loc.column} {loc.field or ''} — {i.message}"
                )
                if i.hint:
                    err.print(f"    {i.hint}", markup=False)
        raise typer.Exit(2) from exc
    except ConfigError as exc:
        err.print(f"[red]configuration error:[/red] {exc}")
        raise typer.Exit(4) from exc
    except QscoreError as exc:
        err.print(f"[red]runtime failure:[/red] {type(exc).__name__}: {exc}")
        raise typer.Exit(3) from exc
    except click.exceptions.Abort:  # Ctrl-C / EOF at a prompt: click's own "Aborted!" exit
        raise
    except Exception as exc:  # ChP-0017: anything that is not a QscoreError is a bug → exit 3
        err.print(f"[red]unexpected error (a bug):[/red]\n{traceback.format_exc()}")
        raise typer.Exit(3) from exc
    _finish_run(
        result, allow_partial=allow_partial, fail_on=fail_on, as_json=as_json, pasted=pasted
    )
