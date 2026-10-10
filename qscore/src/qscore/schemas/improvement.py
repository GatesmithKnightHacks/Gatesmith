"""Improvement request `qscore.request/v0.2` and proposal `qscore.proposal/v0.2`
(specs/04-contracts.md §4-§5).

`ConformanceReport` (specs/03 §3.2) has no contract in 04 yet; it is defined with ChP-0004.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from qscore.schemas.common import FindingSeverity, QDocument, QModel
from qscore.schemas.manifest import Ancillas, Intent, PermittedChange
from qscore.schemas.scorecard import Region

REQUEST_SCHEMA = "qscore.request/v0.2"
PROPOSAL_SCHEMA = "qscore.proposal/v0.2"
# OpenQASM 2 is accepted and recorded as such (specs/10-improvement-loop.md §9).
QasmFormat = Literal["openqasm3", "openqasm2"]


class RequestItem(QModel):
    id: str
    item_sha256: str
    score_version: str


class RequestFinding(QModel):
    id: str
    rule: str = Field(pattern=r"^D\d{2}$")
    severity: FindingSeverity
    region: Region | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class CircuitPayload(QModel):
    format: QasmFormat
    scope: Literal["region", "whole"]
    qasm: str
    qubit_map: dict[str, int]
    num_qubits: int = Field(ge=1)


class RequestTarget(QModel):
    backend: str
    basis: list[str]
    coupling_map: list[tuple[int, int]]


class RequestObjective(QModel):
    primary: str
    direction: Literal["minimize", "maximize"]


class RequestPermitted(QModel):
    changes: list[PermittedChange]
    ancillas: Ancillas = Field(default_factory=Ancillas)


class RequestInvariants(QModel):
    intent: Intent
    verification: Literal["exact", "probabilistic_ok"]
    global_phase: Literal["ignore", "exact"]


class RequestBudget(QModel):
    max_proposals: int = Field(ge=1)
    timeout_s: float = Field(gt=0)


class ImprovementRequest(QDocument):
    SCHEMA_ID = REQUEST_SCHEMA

    schema_: Literal["qscore.request/v0.2"] = Field(alias="schema")
    request_id: str
    item: RequestItem
    finding: RequestFinding
    circuit: CircuitPayload
    target: RequestTarget
    objective: RequestObjective
    permitted: RequestPermitted
    invariants: RequestInvariants
    budget: RequestBudget
    proposal_schema: Literal["qscore.proposal/v0.2"]


class LayerInfo(QModel):
    name: str
    version: str
    model: str | None = None
    provider: str | None = None
    prompt_version: str | None = None


class Candidate(QModel):
    format: QasmFormat
    scope: Literal["region", "whole"]
    qasm: str


class Claims(QModel):
    metric: str
    direction: Literal["decrease", "increase"]
    estimate: float
    equivalent: bool


class Proposal(QDocument):
    SCHEMA_ID = PROPOSAL_SCHEMA

    schema_: Literal["qscore.proposal/v0.2"] = Field(alias="schema")
    request_id: str
    layer: LayerInfo
    candidate: Candidate
    claims: Claims
    rationale: str
