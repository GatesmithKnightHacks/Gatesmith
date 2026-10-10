"""Plan, event, issue report, hardware profile and bench result (specs/04-contracts.md §8-§11).

`RunRecord` and `ItemSummary` (specs/03 §3.2) have no contract in 04 yet; they are defined with
CP-0004.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, Field

from qscore.schemas.common import Location, Provenance, QDocument, QModel, Severity

PLAN_SCHEMA = "qscore.plan/v0.2"
EVENT_SCHEMA = "qscore.event/v0.2"
ISSUES_SCHEMA = "qscore.issues/v0.2"
PROFILE_SCHEMA = "qscore.profile/v0.2"
BENCH_SCHEMA = "qscore.bench/v0.2"

EventKind = Literal[
    "run_started",
    "stage_started",
    "stage_finished",
    "item_started",
    "item_finished",
    "metric_done",
    "warning",
    "error",
    "fallback_used",
    "telemetry",
    "run_finished",
]


class MetricPlan(QModel):
    metric: str
    device: Literal["cpu", "gpu"]
    method: str | None = None
    precision: Literal["single", "double"] | None = None
    est_bytes: int | None = Field(default=None, ge=0)
    est_seconds: float | None = Field(default=None, ge=0)
    status: Literal["planned", "skipped", "unavailable"]
    reason: str | None = None


class PlanTotals(QModel):
    est_bytes: int = Field(ge=0)
    est_seconds: float = Field(ge=0)


class ItemPlan(QModel):
    item_id: str
    metrics: list[MetricPlan]
    totals: PlanTotals


class Plan(QDocument):
    SCHEMA_ID = PLAN_SCHEMA

    schema_: Literal["qscore.plan/v0.2"] = Field(alias="schema")
    items: list[ItemPlan]
    memory_mode: Literal["model_loaded", "exclusive"]
    hardware_profile_id: str | None


class Event(QDocument):
    SCHEMA_ID = EVENT_SCHEMA

    schema_: Literal["qscore.event/v0.2"] = Field(alias="schema")
    run_id: str
    job_id: UUID | None = None
    seq: int = Field(ge=0)
    at: AwareDatetime
    kind: EventKind
    stage: str | None = None
    item_id: str | None = None
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class IssueModel(QModel):
    code: str = Field(pattern=r"^Q\d{3}$")
    severity: Severity
    item: str | None = None
    location: Location
    message: str
    hint: str | None = None
    docs: str | None = None


class IssueReportModel(QDocument):
    SCHEMA_ID = ISSUES_SCHEMA

    schema_: Literal["qscore.issues/v0.2"] = Field(alias="schema")
    manifest: str
    errors: int = Field(ge=0)
    warnings: int = Field(ge=0)
    issues: list[IssueModel]


class CpuInfo(QModel):
    model: str
    cores: int = Field(ge=1)
    ram_gib: float = Field(gt=0)


class GpuProfile(QModel):
    name: str
    arch: str
    vram_gib: float = Field(gt=0)
    rocm: str | None
    driver: str | None


class AerOptionsSupported(QModel):
    batched_shots_gpu: bool | None
    runtime_parameter_bind_enable: bool | None
    fusion: bool | None
    max_parallel_experiments: bool | None


class AerInfo(QModel):
    version: str
    build: Literal["cpu", "rocm"]
    gpu_available: bool
    options_supported: AerOptionsSupported


class PerPrecision(QModel):
    single: float | None = None
    double: float | None = None


class HardwareProfile(QDocument):
    SCHEMA_ID = PROFILE_SCHEMA

    schema_: Literal["qscore.profile/v0.2"] = Field(alias="schema")
    profile_id: str
    measured_at: AwareDatetime
    cpu: CpuInfo
    gpu: GpuProfile | None
    aer: AerInfo
    crossover_qubits: PerPrecision
    overhead_factor: float | None
    fusion_best: PerPrecision
    cache_knee_qubits: PerPrecision
    notes: list[str] = Field(default_factory=list)


class BenchRow(QModel):
    circuit: str
    qubits: int = Field(ge=1)
    method: str
    precision: Literal["single", "double"]
    fusion_max_qubit: int | None
    device: Literal["cpu", "gpu"]
    median_s: float = Field(ge=0)
    p10_s: float = Field(ge=0)
    p90_s: float = Field(ge=0)
    throughput: float | None = Field(default=None, ge=0)


class BenchResult(QDocument):
    SCHEMA_ID = BENCH_SCHEMA

    schema_: Literal["qscore.bench/v0.2"] = Field(alias="schema")
    suite: str
    devices: list[Literal["cpu", "gpu"]]
    reps: int = Field(ge=1)
    warmup: int = Field(ge=0)
    rows: list[BenchRow]
    crossover: dict[str, Any] = Field(default_factory=dict)
    provenance: Provenance
