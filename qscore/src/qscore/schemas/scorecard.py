"""Scorecard `qscore.scorecard/v0.2` (specs/04-contracts.md §3)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import AwareDatetime, Field, model_validator

from qscore.schemas.common import (
    FallbackUse,
    FindingSeverity,
    MetricGroup,
    MetricKind,
    Provenance,
    QDocument,
    QModel,
    Status,
    issue_error,
)

SCORECARD_SCHEMA = "qscore.scorecard/v0.2"


class ErrorInfo(QModel):
    type: str
    message: str


class Uncertainty(QModel):
    ci95: tuple[float, float]
    trials: int = Field(ge=1)


class MethodInfo(QModel):
    device: str
    aer_method: str | None = None
    precision: Literal["single", "double"] | None = None
    shots: int | None = Field(default=None, ge=1)


class MetricResult(QModel):
    """One metric's outcome. Status is never blank (§3 table)."""

    id: str
    group: MetricGroup
    version: str | None = None
    kind: MetricKind | None = None
    scope: Literal["logical", "compiled", "both"] | None = None
    value: float | int | dict[str, Any] | None = None
    unit: str | None = None
    status: Status
    reason: str | None = None
    error: ErrorInfo | None = None
    evidence: dict[str, Any] | None = None
    uncertainty: Uncertainty | None = None
    method: MethodInfo | None = None

    @model_validator(mode="after")
    def _status_fields(self) -> MetricResult:
        if self.status is Status.COMPUTED:
            if self.value is None:
                raise issue_error("Q103", f"metric {self.id!r}: computed needs a value")
            if self.kind is MetricKind.STATISTICAL and self.uncertainty is None:
                raise issue_error("Q103", f"metric {self.id!r}: statistical needs uncertainty")
        elif self.status in (Status.SKIPPED, Status.UNAVAILABLE):
            if not self.reason:
                raise issue_error("Q103", f"metric {self.id!r}: {self.status} needs a reason")
        elif self.error is None:
            raise issue_error("Q103", f"metric {self.id!r}: failed needs error {{type, message}}")
        return self


class Region(QModel):
    scope: Literal["logical", "compiled"]
    qubits: list[int]
    layers: tuple[int, int]
    gate_indices: list[int] = Field(default_factory=list)


class Threshold(QModel):
    name: str
    value: float
    margin: float


class Suppression(QModel):
    by: Literal["profile", "manifest", "cli"]
    reason: str


class Finding(QModel):
    id: str
    rule: str = Field(pattern=r"^D\d{2}$")
    title: str
    severity: FindingSeverity
    confidence: Literal["rule_fired", "measured"]
    threshold: Threshold | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    region: Region | None = None
    strategies: list[str] = Field(default_factory=list)
    suppressed: Suppression | None = None


class ItemRef(QModel):
    id: str
    item_sha256: str
    circuit_sha256: str
    manifest_sha256: str
    score_version: str


class TargetInfo(QModel):
    name: str
    num_qubits: int = Field(ge=1)
    basis: list[str]
    calibration_id: str | None
    calibration_assumed: bool


class SeedResult(QModel):
    seed: int
    two_qubit_count: int = Field(ge=0)
    two_qubit_depth: int = Field(ge=0)
    depth: int = Field(ge=0)
    time_s: float = Field(ge=0)


class AllToAllInfo(QModel):
    two_qubit_count: int = Field(ge=0)


class RouteOnlyInfo(QModel):
    swaps_inserted: int = Field(ge=0)


class CompileInfo(QModel):
    seeds: list[int] = Field(min_length=1)
    representative_seed: int
    selection_policy: str
    per_seed: list[SeedResult]
    all_to_all: AllToAllInfo | None = None
    route_only: RouteOnlyInfo | None = None

    @model_validator(mode="after")
    def _representative_in_seeds(self) -> CompileInfo:
        if self.representative_seed not in self.seeds:
            raise issue_error("Q103", "representative_seed must be one of the compile seeds")
        return self


class ResourceUse(QModel):
    wall_s: float = Field(ge=0)
    cpu_s: float = Field(ge=0)
    gpu_s: float = Field(ge=0)
    peak_vram_mib: float | None = Field(default=None, ge=0)


class Scorecard(QDocument):
    SCHEMA_ID = SCORECARD_SCHEMA

    schema_: Literal["qscore.scorecard/v0.2"] = Field(alias="schema")
    item: ItemRef
    status: Literal["complete", "partial", "failed"]
    error: ErrorInfo | None = None
    target: TargetInfo | None = None
    compile: CompileInfo | None = None
    metrics: list[MetricResult] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    requests: list[str] = Field(default_factory=list)
    resources: ResourceUse | None = None
    fallbacks_used: list[FallbackUse] = Field(default_factory=list)
    provenance: Provenance
    created_at: AwareDatetime

    @model_validator(mode="after")
    def _status_consistent(self) -> Scorecard:
        any_failed = any(m.status is Status.FAILED for m in self.metrics)
        if self.status == "failed":
            if self.error is None:
                raise issue_error("Q103", "a failed scorecard needs an error")
        elif self.status == "partial" and not any_failed:
            raise issue_error("Q103", "status partial needs at least one failed metric")
        elif self.status == "complete" and any_failed:
            raise issue_error("Q103", "status complete cannot contain a failed metric")
        return self
