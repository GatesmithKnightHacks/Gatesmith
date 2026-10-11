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
from typing import Annotated, Literal

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


def _disabled(values: list[str] | None, allowed: set[str]) -> set[str]:
    disabled = {name.strip() for value in (values or []) for name in value.split(",")}
    unknown = disabled - allowed
    if unknown:
        raise typer.BadParameter(
            f"unknown/empty name(s) {', '.join(repr(n) for n in sorted(unknown))}; "
            f"valid names: {', '.join(sorted(allowed))}",
            param_hint="--not",
        )
    return disabled


def _complete_not(ctx: typer.Context, incomplete: str) -> list[str]:
    allowed = {
        "discover": ["input", "confirm"],
        "score": ["confirm"],
        "deps": ["confirm"],
        "bench": ["fusion"],
    }
    prefix, separator, tail = incomplete.rpartition(",")
    before = prefix + separator
    return [before + name for name in allowed[str(ctx.command.name)] if name.startswith(tail)]


def _legacy_input(value: bool) -> bool:
    if value:
        raise typer.BadParameter("--no-input was removed; use --not input")
    return value


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
    disable: Annotated[
        list[str] | None,
        typer.Option(
            "--not",
            autocompletion=_complete_not,
            help="Disable input prompts or score confirmation: input,confirm (repeatable).",
        ),
    ] = None,
    legacy_no_input: Annotated[
        bool, typer.Option("--no-input", hidden=True, callback=_legacy_input, is_eager=True)
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
    disabled = _disabled(disable, {"input", "confirm"} if score_after else {"input"})
    no_input = "input" in disabled
    yes = yes or "confirm" in disabled
    if not draft and (pick is not None or values is not None or no_input or score_after):
        err.print("--pick, --values, --not input and --score require --draft")
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
    except typer.Abort:  # Ctrl-C / EOF at a prompt: Typer's own "Aborted!" exit
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
    disable: Annotated[
        list[str] | None,
        typer.Option(
            "--not",
            autocompletion=_complete_not,
            help="Disable confirmation: confirm (repeatable).",
        ),
    ] = None,
    allow_partial: Annotated[bool, typer.Option("--allow-partial")] = False,
    fail_on: Annotated[
        FailOn | None, typer.Option(help="Exit 1 on findings at/above this severity.")
    ] = None,
    as_json: Annotated[bool, typer.Option("--json", help="Print scorecards as JSON.")] = False,
) -> None:
    """Score circuits: compile across seeds, compute metrics, run diagnostics."""
    disabled = _disabled(disable, {"confirm"})
    yes = yes or "confirm" in disabled
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
    except typer.Abort:  # Ctrl-C / EOF at a prompt: Typer's own "Aborted!" exit
        raise
    except Exception as exc:  # ChP-0017: anything that is not a QscoreError is a bug → exit 3
        err.print(f"[red]unexpected error (a bug):[/red]\n{traceback.format_exc()}")
        raise typer.Exit(3) from exc
    _finish_run(
        result, allow_partial=allow_partial, fail_on=fail_on, as_json=as_json, pasted=pasted
    )


reference_app = typer.Typer(help="Build the pinned public reference corpus.", no_args_is_help=True)
app.add_typer(reference_app, name="reference")


@reference_app.command("build")
def reference_build(
    out: Annotated[
        Path, typer.Option(help="Source checkouts, runs and derived corpus output.")
    ] = Path("qscore-reference-src"),
) -> None:
    """Maintainer command: clone pinned sources and score them in the builder sandbox."""
    try:
        result = services.build_reference(out, on_event=lambda event: typer.echo(event.message))
    except ConfigError as exc:
        err.print(f"configuration error: {exc}")
        raise typer.Exit(4) from exc
    except InvalidInput as exc:
        err.print(str(exc))
        raise typer.Exit(2) from exc
    except QscoreError as exc:
        err.print(str(exc))
        raise typer.Exit(3) from exc
    except Exception as exc:
        traceback.print_exc()
        raise typer.Exit(3) from exc
    raise typer.Exit(result.exit_code)


@app.command()
def deps(
    path: Annotated[Path, typer.Argument(help="Project directory or qscore manifest.")] = Path("."),
    disable: Annotated[
        list[str] | None,
        typer.Option(
            "--not",
            autocompletion=_complete_not,
            help="Disable confirmation: confirm (repeatable).",
        ),
    ] = None,
) -> None:
    """Prepare an isolated builder environment with the engine's exact Qiskit version."""
    disabled = _disabled(disable, {"confirm"})

    def confirm(summary: str) -> bool:
        err.print(summary, markup=False)
        return typer.confirm("Install these project dependencies?", err=True)

    try:
        result = services.prepare_dependencies(
            path,
            on_event=lambda e: typer.echo(e.message),
            confirm="yes" if "confirm" in disabled else confirm,
        )
    except ConfigError as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(4) from exc
    except InvalidInput as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(2) from exc
    except QscoreError as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(3) from exc
    except typer.Abort:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise typer.Exit(3) from exc
    if not result.installed:
        typer.echo("not confirmed; no dependencies installed")


class BenchDevice(StrEnum):
    both = "both"
    cpu = "cpu"
    gpu = "gpu"


@app.command()
def bench(
    out: Annotated[Path, typer.Option(help="Output directory for the benchmark files.")] = Path(
        "qscore-bench"
    ),
    device: Annotated[BenchDevice, typer.Option(help="Devices to time.")] = BenchDevice.both,
    sizes: Annotated[
        str | None, typer.Option(help="Comma-separated qubit counts (default: the suite's).")
    ] = None,
    reps: Annotated[int, typer.Option(min=1, help="Measured repetitions per row.")] = 3,
    disable: Annotated[
        list[str] | None,
        typer.Option(
            "--not",
            autocompletion=_complete_not,
            help="Disable steps: fusion (the GPU fusion sweep). Repeatable.",
        ),
    ] = None,
) -> None:
    """EXPERIMENTAL: CPU vs AMD GPU (ROCm Aer) statevector benchmark with an evidence report."""
    try:
        size_list = [int(s) for s in sizes.split(",")] if sizes else None
    except ValueError as exc:
        err.print(f"--sizes must be comma-separated integers: {sizes!r}", markup=False)
        raise typer.Exit(2) from exc
    devices: list[Literal["cpu", "gpu"]] = (
        ["cpu", "gpu"] if device is BenchDevice.both else [device.value]  # type: ignore[list-item]
    )
    try:
        result = services.run_bench(
            out,
            devices,
            size_list,
            reps,
            1,
            "fusion" not in _disabled(disable, {"fusion"}),
            on_event=lambda e: typer.echo(e.message),
        )
    except ConfigError as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(4) from exc
    except InvalidInput as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(2) from exc
    except QscoreError as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(3) from exc
    typer.echo(f"report: {result.report_path}")


@app.command()
def improve(
    manifest: Annotated[Path, typer.Argument(help="qscore.yaml of the project.")],
    item: Annotated[str, typer.Option("--item", help="Item id to improve.")],
    layers: Annotated[
        str, typer.Option(help="One layer: hf or reference-qiskit (this build).")
    ] = "hf",
    out: Annotated[Path, typer.Option(help="Output directory.")] = Path("qscore-out/improve"),
    model: Annotated[
        str | None, typer.Option(help="hf layer: a model id pinned in improve/models.yaml.")
    ] = None,
) -> None:
    """EXPERIMENTAL (ChP-0049): one verified improvement round; writes the improved circuit."""
    if layers not in ("hf", "reference-qiskit"):
        err.print("this build runs one layer: hf or reference-qiskit (ChP-0049; full loop T24)")
        raise typer.Exit(4)
    try:
        result = services.improve_once(
            manifest,
            item,
            out,
            layers,  # type: ignore[arg-type]
            on_event=lambda e: typer.echo(e.message),
            model=model,
        )
    except ConfigError as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(4) from exc
    except InvalidInput as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(2) from exc
    except QscoreError as exc:
        err.print(str(exc), markup=False)
        raise typer.Exit(3) from exc
    typer.echo(f"{result.summary['outcome']}\nrecord: {result.path}")
    if result.improved is not None:
        typer.echo(f"improved circuit: {result.improved}")
