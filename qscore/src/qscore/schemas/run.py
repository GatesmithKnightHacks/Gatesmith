"""Plan, event, issue report, hardware profile and bench result (specs/04-contracts.md §8-§11).

`RunRecord` is `qscore.run/v0.3` (04 §13: ChP-0004 fields plus ChP-0028 `interpretation` and
scorecard hashes, ChP-0034 compiled circuit exports, ChP-0035 `project_source`).
`ItemSummary` (specs/03 §3.2) is not built in the MVP.
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
RUN_SCHEMA = "qscore.run/v0.3"

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


class Confirmation(QModel):
    """How the run was confirmed before compute (05 §5); modes as stored with a job (11 §3)."""

    mode: Literal["interactive", "yes_flag", "stored"]
    at: AwareDatetime
    manifest_sha256: str


class RunScorecardRef(QModel):
    item_id: str
    item_sha256: str
    path: str  # relative to the run's output directory
    sha256: str  # of the scorecard file bytes


class RunCompiledRef(QModel):
    """One exported compiled circuit (ChP-0034): `<out>/compiled/<item_id>.qasm`."""

    item_id: str
    path: str  # relative to the run's output directory
    sha256: str  # of the file bytes
    seed: int  # equals the scorecard's `compile.representative_seed`


class RunCompiledSkip(QModel):
    """An item without an exported compiled circuit, and why (ChP-0034)."""

    item_id: str
    reason: str


class ProjectSource(QModel):
    """Git state of `project.root` at score time (ChP-0035 §2.1 D)."""

    url: str | None  # remote.origin.url without userinfo; null when there is no remote
    commit: str  # HEAD
    dirty: bool  # uncommitted changes present


class ProjectSourceError(QModel):
    """Why the git state could not be read, e.g. "git not installed" (ChP-0035 §2.1 D)."""

    error: str


class RunProvenance(QModel):
    """Run-wide versions; per-item seeds and settings stay in each scorecard's provenance."""

    qscore: str
    score_version: str
    git_commit: str | None
    git_dirty: bool
    lock_sha256: str | None
    python: str
    qiskit: str


class RunRecord(QDocument):
    """One scoring run, written last as `<out>/run.json` (04 §13)."""

    SCHEMA_ID = RUN_SCHEMA
    schema_: Literal["qscore.run/v0.3"] = Field(alias="schema")
    run_id: str
    job_id: UUID | None = None
    command: str
    manifest_sha256: str
    items: list[str]
    confirmation: Confirmation
    interpretation: str
    settings_profile: str
    fallbacks_enabled: list[str]
    fallbacks_used: list[str]
    started_at: AwareDatetime
    finished_at: AwareDatetime
    status: Literal["complete", "partial", "failed"]
    # The CLI applies --allow-partial/--fail-on after the record is written (05 §11), so the
    # record carries no exit code in the MVP; the worker sets it for queued jobs.
    exit_code: int | None = None
    scorecards: list[RunScorecardRef]
    compiled: list[RunCompiledRef]
    compiled_skipped: list[RunCompiledSkip]
    # null when `project.root` is not inside a git work tree (ChP-0035 §2.1 D).
    project_source: ProjectSource | ProjectSourceError | None
    provenance: RunProvenance
