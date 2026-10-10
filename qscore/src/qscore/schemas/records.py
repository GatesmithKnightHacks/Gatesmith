"""Attempt record `qscore.attempt/v0.2` and job spec `qscore.job/v0.2` (specs/04 §6-§7).

`JobResultSummary` has only a column comment in specs/11 §3, not a contract; it is defined with
ChP-0004.
"""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, SerializerFunctionWrapHandler, model_serializer

from qscore.schemas.common import (
    FallbackUse,
    MetricGroup,
    Provenance,
    QDocument,
    QModel,
    VerificationStatus,
)
from qscore.schemas.improvement import LayerInfo
from qscore.schemas.scorecard import Region

ATTEMPT_SCHEMA = "qscore.attempt/v0.2"
JOB_SCHEMA = "qscore.job/v0.2"
Decision = Literal["accepted", "rejected", "inconclusive", "invalid"]


class AttemptItem(QModel):
    id: str
    item_sha256: str


class AttemptFinding(QModel):
    rule: str = Field(pattern=r"^D\d{2}$")
    region: Region | None = None


class Prediction(QModel):
    metric: str
    direction: Literal["decrease", "increase"]
    estimate: float | None = None


class VerificationResult(QModel):
    method: str
    status: VerificationStatus
    time_s: float = Field(ge=0)
    evidence: dict[str, Any] = Field(default_factory=dict)


class PermittedCheck(QModel):
    ok: bool
    violations: list[str] = Field(default_factory=list)


class BeforeAfter(QModel):
    before: float
    after: float


class ConstraintCheck(QModel):
    metric: str
    ok: bool
    before: float
    after: float


class AttemptCompute(QModel):
    cpu_s: float | None = Field(default=None, ge=0)
    gpu_s: float | None = Field(default=None, ge=0)
    device: str | None = None
    latency_ms: int | None = Field(default=None, ge=0)
    tokens: dict[str, Any] | None = None


class AttemptRecord(QDocument):
    SCHEMA_ID = ATTEMPT_SCHEMA

    schema_: Literal["qscore.attempt/v0.2"] = Field(alias="schema")
    attempt_id: UUID
    job_id: UUID
    round: int = Field(ge=0)
    item: AttemptItem
    request_id: str
    finding: AttemptFinding
    layer: LayerInfo
    strategy: str
    proposal_sha256: str
    parse_ok: bool
    prediction: Prediction | None = None
    verification: VerificationResult | None = None
    permitted_check: PermittedCheck | None = None
    measured: dict[str, BeforeAfter] = Field(default_factory=dict)
    constraints: list[ConstraintCheck] = Field(default_factory=list)
    decision: Decision
    decision_reason: str
    compute: AttemptCompute = Field(default_factory=AttemptCompute)
    fallbacks_used: list[FallbackUse] = Field(default_factory=list)
    provenance: Provenance
    created_at: AwareDatetime


class JobRequirements(QModel):
    """Boolean capability flags only, so matching is JSONB containment (§7)."""

    gpu: bool | None = None
    aer_gpu: bool | None = None
    local_model: bool | None = None
    hub_write: bool | None = None
    neon_write: bool | None = None

    @model_serializer(mode="wrap")
    def _omit_unset_flags(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        """Flags not given are omitted (never null), so JSONB containment works (§7)."""
        data: dict[str, Any] = handler(self)
        return {k: v for k, v in data.items() if v is not None}


class JobOptions(QModel):
    groups: list[MetricGroup] | None = None
    metrics: list[str] | None = None
    skip: list[str] = Field(default_factory=list)
    device: Literal["auto", "cpu", "gpu"] = "auto"
    precision: Literal["single", "double"] | None = None
    seeds: list[int] | None = None
    no_cache: bool = False


class ImproveOptions(QModel):
    layers: list[str] = Field(min_length=1)
    rounds: int = Field(ge=1)
    max_proposals: int = Field(ge=1)


class BenchOptions(QModel):
    suite: str
    devices: list[Literal["cpu", "gpu"]] = Field(min_length=1)
    reps: int = Field(ge=1)


class ConformOptions(QModel):
    layer: str
    model: str | None = None
    fixtures: str = "default"


class JobBudget(QModel):
    wall_time_s: float | None = Field(default=None, gt=0)
    gpu_time_s: float | None = Field(default=None, ge=0)


class JobSpec(QDocument):
    SCHEMA_ID = JOB_SCHEMA

    schema_: Literal["qscore.job/v0.2"] = Field(alias="schema")
    kind: Literal["validate", "score", "improve", "bench", "conform", "profile"]
    project: str
    manifest_sha256: str | None = None
    items: list[str] = Field(default_factory=list)
    options: JobOptions = Field(default_factory=JobOptions)
    improve: ImproveOptions | None = None
    bench: BenchOptions | None = None
    conform: ConformOptions | None = None
    requires: JobRequirements = Field(default_factory=JobRequirements)
    budget: JobBudget = Field(default_factory=JobBudget)
