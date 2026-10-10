"""Validate every item before scoring (specs/05 §3-4; MVP M1/M3)."""

from __future__ import annotations

from pathlib import Path

from qscore.config import Settings
from qscore.diagnose.policy import effective_policy
from qscore.errors import ConfigError, InvalidInput
from qscore.intake.loaders import LoadedCircuit, QasmProblem, load_builder, parse_qasm
from qscore.manifest.resolve import ResolvedItem, item_hash, merge_items
from qscore.manifest.yamlio import PositionMap
from qscore.metrics.registry import all_metrics
from qscore.schemas.common import MetricKind
from qscore.schemas.manifest import ProjectManifest, QasmSource
from qscore.schemas.run import IssueModel
from qscore.targets.registry import get_target
from qscore.validate.issues import make_issue
from qscore.validate.reference_checks import reference_issues, target_field
from qscore.validate.schema_checks import report_of
from qscore.validate.semantic_checks import semantic_issues


def run_validation(
    manifest: ProjectManifest,
    manifest_dir: Path,
    settings: Settings,
    manifest_file: str,
    positions: PositionMap | None = None,
) -> list[tuple[ResolvedItem, LoadedCircuit]]:
    """Return validated circuits (builders run only in subprocesses); aggregate input issues."""
    locate = positions.locate if positions is not None else None
    issues: list[IssueModel] = []
    work: list[tuple[ResolvedItem, LoadedCircuit]] = []
    registry = all_metrics()
    for index, (item, root, origins) in enumerate(merge_items(manifest, manifest_dir)):
        at = index if positions is not None else None

        def add(
            code: str,
            field: tuple[str, ...],
            message: str,
            item_id: str = item.id,
            position: int | None = at,
        ) -> None:
            issues.append(
                make_issue(
                    code,
                    item_id,
                    manifest_file,
                    ("circuits", position, *field) if position is not None else None,
                    locate,
                    message,
                    None,
                )
            )

        before = len(issues)
        issues.extend(reference_issues(item, root, manifest_file, at, origins, locate))
        assert item.objective is not None and item.execution is not None
        primary = registry.get(item.objective.primary)
        if primary is None or primary.kind not in (
            MetricKind.DETERMINISTIC,
            MetricKind.STATISTICAL,
        ):
            add(
                "Q103",
                ("objective", "primary"),
                "primary must name a deterministic/statistical metric",
            )
        elif primary.id in {"scalability", "simulated_task_score", "mirror_score"}:
            add(
                "Q103",
                ("objective", "primary"),
                f"{primary.id} cannot select a scalar CPU-MVP baseline",
            )
        for constraint in item.objective.constraints:
            if constraint.metric not in registry:
                add("Q103", ("objective", "constraints"), f"unknown metric {constraint.metric!r}")
        for metric in item.objective.report:
            if metric not in registry:
                add("Q103", ("objective", "report"), f"unknown metric {metric!r}")
        if (item.execution.device or settings.device_default) == "gpu":
            add("Q503", ("execution", "device"), "GPU simulation is not in the CPU MVP build")
        seeds = item.execution.transpiler_seeds or []
        if any(seed < 0 for seed in seeds) or (
            item.execution.seed_simulator is not None and item.execution.seed_simulator < 0
        ):
            add("Q103", ("execution",), "seeds must be nonnegative integers")
        if item.diagnose is not None:
            try:
                effective_policy(item.diagnose.profile)
            except ConfigError as exc:
                add("Q103", ("diagnose", "profile"), str(exc))
        if len(issues) != before:
            continue
        if isinstance(item.source, QasmSource):
            loaded = parse_qasm(root / item.source.qasm)
        else:
            loaded = load_builder(item, root, manifest.project.runner)
        if isinstance(loaded, QasmProblem):
            if isinstance(item.source, QasmSource):
                issues.append(
                    make_issue(
                        loaded.code,
                        item.id,
                        item.source.qasm,
                        ("circuits", index, "source", "qasm") if at is not None else None,
                        None,
                        loaded.message,
                        "Fix the OpenQASM source.",
                        line=loaded.line,
                        column=loaded.column,
                    )
                )
            else:
                field = (
                    ("source", "parameters")
                    if loaded.code in {"Q207", "Q305"}
                    else ("source", "builder")
                )
                add(loaded.code, field, loaded.message)
            continue
        assert item.target is not None
        try:
            target = get_target(item.target, root, loaded.circuit.num_qubits)
        except InvalidInput as exc:
            code = "Q208" if str(exc).startswith("[Q208]") else "Q103"
            add(code, ("target",), str(exc))
            continue
        issues.extend(
            semantic_issues(
                item,
                loaded.circuit,
                root,
                manifest_file,
                at,
                locate,
                target,
                target_field(index, origins),
            )
        )
        work.append((ResolvedItem(item, root, item_hash(item, root), origins), loaded))
    if issues:
        report = report_of(manifest_file, issues)
        raise InvalidInput(f"{manifest_file}: {report.errors} issue(s)", report=report)
    return work
