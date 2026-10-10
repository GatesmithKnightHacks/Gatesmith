"""Score one item: compile, measure, diagnose, assemble the scorecard (specs/05 §6-§9).

Each metric call is wrapped: an exception becomes `status: failed` with `error {type, message}`,
logged at ERROR, and the scorecard becomes `partial` (specs/06 §1, R4) — metrics never catch.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime

from qscore.compile.select import SELECTION_POLICY
from qscore.config import Settings
from qscore.diagnose.policy import apply, effective_policy, rank
from qscore.diagnose.rules import evaluate
from qscore.errors import InvalidInput
from qscore.intake.loaders import LoadedCircuit
from qscore.manifest.resolve import ResolvedItem
from qscore.metrics.base import Metric, Requirement
from qscore.metrics.registry import all_metrics
from qscore.record.provenance import collect
from qscore.schemas.common import Status
from qscore.schemas.scorecard import (
    CompileInfo,
    ErrorInfo,
    ItemRef,
    MetricResult,
    ResourceUse,
    Scorecard,
    SeedResult,
    TargetInfo,
)
from qscore.schemas.versions import SCORE_VERSION
from qscore.score.context import ScoringContext

log = logging.getLogger(__name__)


def _run_metric(metric: Metric, ctx: ScoringContext) -> MetricResult:
    base = {
        "id": metric.id,
        "group": metric.group,
        "version": metric.version,
        "kind": metric.kind,
        "scope": metric.scope,
    }
    dependency = None
    requirements = {
        Requirement.COMPILED: "representative",
        Requirement.ALL_TO_ALL: "all_to_all",
        Requirement.ROUTING_STAGE: "routing_stage",
        Requirement.RAW_TRANSLATION: "raw_translation",
    }
    required = set(metric.requires)
    if Requirement.ROUTING_STAGE in required:
        required.add(Requirement.COMPILED)
    try:
        for requirement, attr in requirements.items():
            if requirement in required:
                dependency = requirement
                if requirement in ctx.failures:
                    raise ctx.failures[requirement]
                getattr(ctx, attr)
        dependency = None
        out = metric.compute(ctx)
        return MetricResult.model_validate(
            {
                **base,
                "status": out.status,
                "value": out.value,
                "unit": out.unit,
                "reason": out.reason,
                "evidence": out.evidence or None,
            }
        )
    except Exception as exc:
        if dependency is not None:
            ctx.failures[dependency] = exc
        log.exception("metric %s failed for item %s", metric.id, ctx.resolved.item.id)
        return MetricResult.model_validate(
            {
                **base,
                "status": Status.FAILED,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }
        )


def score_item(
    resolved: ResolvedItem, loaded: LoadedCircuit, manifest_sha256: str, settings: Settings
) -> Scorecard:
    started, t0, c0 = datetime.now(UTC), time.perf_counter(), _cpu_time()
    item = resolved.item
    ctx = ScoringContext(resolved, loaded.circuit, loaded.rebuild)
    if loaded.circuit.num_qubits > ctx.target.num_qubits:
        raise InvalidInput(
            f"[Q404] item {item.id}: circuit has {loaded.circuit.num_qubits} qubits, target "
            f"{ctx.target.name} has {ctx.target.num_qubits}",
            report=None,
        )
    groups = set(item.diagnose.groups or []) if item.diagnose else set()
    metrics = []
    budget = item.budget.wall_time_s if item.budget is not None else None
    for metric in all_metrics().values():
        reason = "not selected" if groups and metric.group not in groups else None
        if reason is None and budget is not None and time.perf_counter() - t0 >= budget:
            reason = "budget"
        if reason is not None:
            metrics.append(
                MetricResult(
                    id=metric.id,
                    group=metric.group,
                    version=metric.version,
                    kind=metric.kind,
                    scope=metric.scope,
                    status=Status.SKIPPED,
                    reason=reason,
                )
            )
        else:
            metrics.append(_run_metric(metric, ctx))
    by_id = {m.id: m for m in metrics}
    diag = item.diagnose
    policy = effective_policy(
        diag.profile if diag else None,
        {e.rule: e.reason for e in (diag.ignore or [])} if diag else None,
    )
    diagnosis = evaluate(by_id, policy)
    findings = rank(apply(policy, diagnosis.findings))
    # Artifact assembly must not start/retry dependencies or lose failed metric results.
    rep = ctx.__dict__.get("representative")
    target = ctx.target
    all_to_all = ctx.__dict__.get("all_to_all")
    route = ctx.__dict__.get("routing_stage")
    compile_info = None
    if rep is not None:
        policy_text = (
            SELECTION_POLICY
            if ctx.objective.direction == "minimize"
            else ("max primary; tie: two_qubit_depth, seed order")
        )
        compile_info = CompileInfo(
            seeds=ctx.seeds,
            representative_seed=rep.seed,
            selection_policy=policy_text,
            per_seed=[
                SeedResult(
                    seed=r.seed,
                    two_qubit_count=r.two_qubit_count,
                    two_qubit_depth=r.two_qubit_depth,
                    depth=r.depth,
                    time_s=r.time_s,
                )
                for r in ctx.compile_set.results
            ],
            all_to_all=None
            if all_to_all is None
            else {"two_qubit_count": min(r.two_qubit_count for r in all_to_all.results)},
            route_only=None if route is None else {"swaps_inserted": route.swaps_inserted},
        )
    failed = any(m.status is Status.FAILED for m in metrics)
    assert item.execution is not None  # resolved items always carry execution (CP-0021)
    seed_sim = item.execution.seed_simulator
    if seed_sim is None:
        raise InvalidInput(f"[Q104] item {item.id}: execution.seed_simulator is null", report=None)
    return Scorecard.model_validate(
        {
            "schema": "qscore.scorecard/v0.2",
            "item": ItemRef(
                id=item.id,
                item_sha256=resolved.item_sha256,
                circuit_sha256=loaded.circuit_sha256,
                manifest_sha256=manifest_sha256,
                score_version=SCORE_VERSION,
            ),
            "status": "partial" if failed else "complete",
            "target": TargetInfo(
                name=target.name,
                num_qubits=target.num_qubits,
                basis=list(target.basis),
                calibration_id=target.calibration_id,
                calibration_assumed=target.calibration_assumed,
            ),
            "compile": compile_info,
            "metrics": metrics,
            "findings": findings,
            "requests": [],
            "resources": ResourceUse(
                wall_s=time.perf_counter() - t0, cpu_s=_cpu_time() - c0, gpu_s=0.0
            ),
            "fallbacks_used": [],
            "provenance": collect(settings, ctx.seeds, seed_sim, started),
            "created_at": datetime.now(UTC),
            "x-diagnose": {"skipped_rules": diagnosis.skipped},
        }
    )


def error_card_details(exc: Exception) -> ErrorInfo:
    return ErrorInfo(type=type(exc).__name__, message=str(exc))


def _cpu_time() -> float:
    """CPU seconds including reaped compiler child processes on supported platforms."""
    times = os.times()
    return times.user + times.system + times.children_user + times.children_system
