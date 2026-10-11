"""Derived reference distributions (approved ChP-0038 §2.1 C)."""

from __future__ import annotations

from typing import Literal

import numpy as np
from pydantic import AwareDatetime, Field, FiniteFloat, model_validator

from qscore.schemas.common import QDocument, QModel

REFERENCE_SCHEMA = "qscore.reference/v0.1"
WidthBand = Literal["2\u20135", "6\u201310", "11\u201320", "21\u201350", "51+"]


class ReferenceSource(QModel):
    id: str
    url: str
    commit: str = Field(pattern=r"^[0-9a-f]{40}$")
    license: str
    modifications: list[str] = Field(default_factory=list)


class ReferenceFailure(QModel):
    circuit_id: str
    codes: list[str]
    error: str


class ReferenceBand(QModel):
    n: int = Field(ge=1)
    quantiles: dict[str, FiniteFloat]
    circuit_ids: list[str]
    # Retain the measured distribution so placement uses an empirical rank, not an
    # invented interpolation between the five displayed quantiles. IDs align with values.
    values: list[FiniteFloat]

    @model_validator(mode="after")
    def consistent(self) -> ReferenceBand:
        if self.n != len(self.values) or self.n != len(self.circuit_ids):
            raise ValueError("n, values and circuit_ids must have equal lengths")
        if len(set(self.circuit_ids)) != self.n:
            raise ValueError("a circuit may appear only once in a distribution")
        if self.values != sorted(self.values):
            raise ValueError("reference values must be sorted")
        points = [5, 25, 50, 75, 95]
        if set(self.quantiles) != {str(q) for q in points}:
            raise ValueError("quantiles must contain 5, 25, 50, 75 and 95")
        expected = np.percentile(self.values, points, method="linear")
        if any(
            self.quantiles[str(q)] != float(value)
            for q, value in zip(points, expected, strict=True)
        ):
            raise ValueError("quantiles do not match the retained reference values")
        return self


class ReferenceCorpus(QDocument):
    SCHEMA_ID = REFERENCE_SCHEMA
    schema_: Literal["qscore.reference/v0.1"] = Field(alias="schema")
    score_version: str
    created_at: AwareDatetime
    sources: list[ReferenceSource]
    # target name -> metric id -> active compiled width band -> distribution
    targets: dict[str, dict[str, dict[WidthBand, ReferenceBand]]]
    failures: list[ReferenceFailure]
    provenance: dict[str, str | None]


class CorpusEntry(QModel):
    id: str
    repository: str
    source: dict[str, object]


class CorpusCatalog(QModel):
    repositories: list[ReferenceSource]
    circuits: list[CorpusEntry]

    @model_validator(mode="after")
    def unique_entries(self) -> CorpusCatalog:
        repos = [r.id for r in self.repositories]
        ids = [c.id for c in self.circuits]
        if len(repos) != len(set(repos)) or len(ids) != len(set(ids)):
            raise ValueError("duplicate repository or circuit id")
        if any(c.repository not in repos for c in self.circuits):
            raise ValueError("circuit references an unknown repository")
        return self
