"""Shared contract types (specs/04-contracts.md §1, §3; specs/03-code-structure.md §3.2, §5).

Every model rejects unknown keys except `x-…` extension keys, which are preserved and ignored.
Errors whose issue code the spec states explicitly carry it as the pydantic error type (`Q101`,
`Q103`, `Q104`, `Q105`, `Q106`, `Q107`, `Q405`, `Q408`, `Q410`). Pydantic's own error types are
mapped by the validation stage (T08): `missing` → Q104, type errors → Q102, other value errors
(`literal_error`, `enum`, bounds, patterns) → Q103.
"""

from __future__ import annotations

import difflib
import hashlib
import json
from enum import StrEnum
from typing import Any, ClassVar

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    ModelWrapValidatorHandler,
    ValidationError,
    model_validator,
)
from pydantic_core import InitErrorDetails, PydanticCustomError


def issue_error(
    code: str, message: str, field: tuple[int | str, ...] | None = None
) -> PydanticCustomError:
    """A validation error whose type is the catalog issue code (specs/05-pipeline.md §12).
    `field` locates errors raised by a document-level validator, whose own pydantic location is
    the document root (read back by `validate.schema_checks`)."""
    if field is None:
        return PydanticCustomError(code, message)
    return PydanticCustomError(code, message, {"qscore_field": field})


def _x_keys_schema(schema: dict[str, Any]) -> None:
    schema["additionalProperties"] = False
    schema["patternProperties"] = {"^x-": {}}


def _unknown(key: str, known: set[str]) -> str:
    """Q101 message with a "did you mean" suggestion when a known field is close (05 §3)."""
    close = difflib.get_close_matches(key, sorted(known), n=1)
    return f"unknown field {key!r}" + (f"; did you mean {close[0]!r}?" if close else "")


class QModel(BaseModel):
    """Base for every contract model: strict keys, `x-` extensions kept, aliases on input/output."""

    model_config = ConfigDict(
        extra="allow",
        validate_by_name=False,
        validate_by_alias=True,
        serialize_by_alias=True,
        json_schema_extra=_x_keys_schema,
    )

    @model_validator(mode="wrap")
    @classmethod
    def _only_x_extensions(cls, data: Any, handler: ModelWrapValidatorHandler[Any]) -> Any:
        """Report unknown keys (Q101) together with every other error in the same object."""
        known = {f.alias or name for name, f in cls.model_fields.items()}
        unknown = (
            sorted(
                k for k in data if isinstance(k, str) and k not in known and not k.startswith("x-")
            )
            if isinstance(data, dict)
            else []
        )
        if not unknown:
            return handler(data)
        details: list[InitErrorDetails] = [
            {"type": issue_error("Q101", _unknown(k, known)), "loc": (k,), "input": data[k]}
            for k in unknown
        ]
        try:
            handler({k: v for k, v in data.items() if k not in unknown})
        except ValidationError as exc:
            details += [
                {
                    "type": PydanticCustomError(e["type"], e["msg"]),
                    "loc": e["loc"],
                    "input": e.get("input"),
                }
                for e in exc.errors()
            ]
        raise ValidationError.from_exception_data(cls.__name__, details)


class QDocument(QModel):
    """A top-level document: `schema` must equal SCHEMA_ID; any other id is Q106 (specs/04 §1,
    §2.2). Older minor versions are accepted by `versions.check_compatible` and must go through
    `versions.migrate` before validation."""

    SCHEMA_ID: ClassVar[str]

    @model_validator(mode="before")
    @classmethod
    def _schema_id(cls, data: Any) -> Any:
        if isinstance(data, dict) and "schema" in data and data["schema"] != cls.SCHEMA_ID:
            raise issue_error(
                "Q106",
                f"unsupported schema {data['schema']!r}; this qscore reads {cls.SCHEMA_ID}",
                ("schema",),
            )
        return data


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class FindingSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    HIGH = "high"


class Status(StrEnum):
    COMPUTED = "computed"
    SKIPPED = "skipped"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"


class VerificationStatus(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    INCONCLUSIVE = "inconclusive"
    UNSUPPORTED = "unsupported"


class MetricGroup(StrEnum):
    RESOURCES = "resources"
    HARDWARE = "hardware"
    OPPORTUNITIES = "opportunities"
    RESEARCH = "research"


class MetricKind(StrEnum):
    DETERMINISTIC = "deterministic"
    HEURISTIC = "heuristic"
    STATISTICAL = "statistical"
    CONTEXT = "context"


class Location(QModel):
    """Where an issue is: file, 1-based line and column, and the field path."""

    file: str
    line: int | None = Field(default=None, ge=1)
    column: int | None = Field(default=None, ge=1)
    field: str | None = None


class FallbackUse(QModel):
    """One activation of a planned fallback (specs/17-fallbacks.md §1)."""

    id: str = Field(pattern=r"^FB-\d{2}$")
    reason: str
    at: AwareDatetime
    scope: str


class GpuInfo(QModel):
    name: str
    arch: str


class SeedInfo(QModel):
    transpiler: list[int]
    simulator_base: int


class Provenance(QModel):
    """Versions, seeds and settings behind a result (specs/04-contracts.md §3)."""

    qscore: str
    git_commit: str | None
    git_dirty: bool
    lock_sha256: str | None
    python: str
    qiskit: str
    qiskit_aer: str
    aer_build: str
    mqt_qcec: str | None
    rocm: str | None = None
    gpu: GpuInfo | None = None
    hardware_profile_id: str | None = None
    profile: str
    fallbacks_enabled: list[str]
    seeds: SeedInfo
    thresholds_sha256: str | None
    started_at: AwareDatetime
    finished_at: AwareDatetime | None


def canonical_json(obj: Any) -> str:
    """Canonical JSON for hashing (specs/03-code-structure.md §5): sorted keys, compact."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(data: bytes | str) -> str:
    """Lowercase hex SHA-256 of bytes, or of a string encoded as UTF-8."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()
