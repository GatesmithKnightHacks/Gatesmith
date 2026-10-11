"""Draft values `qscore.values/v0.1` (specs/04-contracts.md §14, ChP-0029).

Input to `qscore discover --draft --values FILE` only: it never takes part in scoring and is not
part of the item hash. Shape errors carry their issue code (Q101 unknown key, Q102 non-scalar
argument or non-int sweep list, Q103 more than one sweep key). Range strings are parsed, builder
keys and argument names are checked against the discovered candidates, and the `parameters` file
is checked to exist, by `intake/draft.py` (Q103, Q200, Q202-Q204), which locates every issue in
the values file. The `parameters` key was approved by the user on 2026-10-10 (T09 rework).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, WithJsonSchema, field_validator

from qscore.schemas.common import QDocument, QModel, issue_error
from qscore.schemas.manifest import ParametersFile

VALUES_SCHEMA = "qscore.values/v0.1"

ScalarValue = bool | int | float | str | None


def _scalar(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    raise issue_error("Q102", f"argument values must be scalars, got {type(value).__name__}")


def _sweep_spec(value: Any) -> Any:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and all(
        isinstance(v, int) and not isinstance(v, bool) for v in value
    ):
        return [int(v) for v in value]
    raise issue_error(
        "Q102", "a sweep is a range string ('a..b' or 'a..b..s') or a list of integers"
    )


Scalar = Annotated[
    Any,
    BeforeValidator(_scalar),
    WithJsonSchema({"type": ["boolean", "integer", "number", "string", "null"]}),
]
SweepSpec = Annotated[
    Any,
    BeforeValidator(_sweep_spec),
    WithJsonSchema(
        {"anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "integer"}}]}
    ),
]


class BuilderValues(QModel):
    """Values for one builder: scalar `args`, at most one `sweep` argument, and an optional
    `parameters` file (path relative to the project root) copied to `source.parameters`."""

    args: dict[str, Scalar] = Field(default_factory=dict)
    sweep: dict[str, SweepSpec] = Field(default_factory=dict)
    parameters: ParametersFile | None = None

    @field_validator("sweep")
    @classmethod
    def _one_sweep(cls, sweep: dict[str, Any]) -> dict[str, Any]:
        if len(sweep) > 1:
            raise issue_error(
                "Q103", f"at most one sweep argument per builder, got {', '.join(sweep)}"
            )
        return sweep


class DraftValues(QDocument):
    SCHEMA_ID = VALUES_SCHEMA

    schema_: Literal["qscore.values/v0.1"] = Field(alias="schema")
    builders: dict[str, BuilderValues] = Field(default_factory=dict)
