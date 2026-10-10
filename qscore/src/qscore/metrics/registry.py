"""Built-in metrics (specs/06-metrics.md §1). Slice S3 (CP-0022) registers the CPU subset;
`scheduled_duration`, `supermarq_profile`, `scalability`, `simulated_task_score` and
`mirror_score` follow with T13/T20. Entry-point plugins (`qscore.metrics`) arrive with T13."""

from __future__ import annotations

from qscore.metrics.base import Metric
from qscore.metrics.hardware.reliability import ReliabilityHeuristic
from qscore.metrics.hardware.routing import CompileRatio, RoutingOverhead, SwapsInserted
from qscore.metrics.hardware.seeds import SeedSpreadMetric
from qscore.metrics.opportunities.features import EntanglementVariance
from qscore.metrics.opportunities.structure import ResynthesisPotential, Structure
from qscore.metrics.resources.counts import (
    Depth,
    MeasurementCount,
    Size,
    ToffoliCount,
    TwoQubitCount,
    TwoQubitDepth,
    Width,
)

BUILTINS: tuple[Metric, ...] = (
    Width(),
    Size(),
    Depth(),
    TwoQubitCount(),
    TwoQubitDepth(),
    MeasurementCount(),
    ToffoliCount(),
    RoutingOverhead(),
    SwapsInserted(),
    CompileRatio(),
    ReliabilityHeuristic(),
    SeedSpreadMetric(),
    EntanglementVariance(),
    Structure(),
    ResynthesisPotential(),
)


def all_metrics() -> dict[str, Metric]:
    return {m.id: m for m in BUILTINS}
