"""Built-in metrics (specs/06-metrics.md §1). Slice S3 (ChP-0022) registers the CPU subset,
plus `scheduled_duration` and `supermarq_profile` (M2); `simulated_task_score` and `mirror_score`
are listed with MVP-build statuses (ChP-0026) until T20; `scalability` (M2). Entry-point
plugins (`qscore.metrics`) arrive with T13."""

from __future__ import annotations

from qscore.metrics.base import Metric
from qscore.metrics.hardware.duration import ScheduledDuration
from qscore.metrics.hardware.reliability import ReliabilityHeuristic
from qscore.metrics.hardware.routing import CompileRatio, RoutingOverhead, SwapsInserted
from qscore.metrics.hardware.seeds import SeedSpreadMetric
from qscore.metrics.opportunities.features import EntanglementVariance
from qscore.metrics.opportunities.structure import ResynthesisPotential, Structure
from qscore.metrics.opportunities.supermarq import SupermarqProfile
from qscore.metrics.research.scalability import Scalability
from qscore.metrics.research.simulated import MirrorScore, SimulatedTaskScore
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
    ScheduledDuration(),
    SeedSpreadMetric(),
    SupermarqProfile(),
    EntanglementVariance(),
    Structure(),
    ResynthesisPotential(),
    Scalability(),
    SimulatedTaskScore(),
    MirrorScore(),
)


def all_metrics() -> dict[str, Metric]:
    return {m.id: m for m in BUILTINS}
