"""HF adapter data and call-accounting contracts (10 §5, ChP-0004)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictHfModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Pricing(StrictHfModel):
    input: float = Field(ge=0)
    output: float = Field(ge=0)


class ModelEntry(StrictHfModel):
    id: str
    provider: str
    license: str
    strategies: list[str]
    pricing_usd_per_mtok: Pricing
    checked_at: str
    default: bool = False  # models.yaml marks the improvement loop's default model

    @property
    def routed_id(self) -> str:
        return f"{self.id}:{self.provider}"


class HfCandidate(StrictHfModel):
    format: Literal["openqasm3", "openqasm2"]
    qasm: str
    rationale: str = Field(max_length=600)
    estimate: float = Field(allow_inf_nan=False)
    equivalent: bool


class CandidateSet(StrictHfModel):
    candidates: list[HfCandidate]


class CallRecord(StrictHfModel):
    call_id: str
    request_id: str
    model: str
    provider: str
    prompt_version: str
    latency_ms: float = Field(ge=0)
    prompt_tokens: int | None = Field(default=None, ge=0)
    completion_tokens: int | None = Field(default=None, ge=0)
    cost_usd_estimate: float | None = Field(default=None, ge=0)
    accounting_known: bool = False
    retries: int = Field(ge=0, le=2)
    http_status: int | None
    outcome: Literal["proposals", "empty", "parse_failure", "layer_error"]
    reply_parsed: bool
    n_proposals: int = Field(ge=0)
    invalid_candidates: list[str] = Field(default_factory=list)
    error_type: str | None = None
