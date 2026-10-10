"""Project manifest `qscore.project/v0.2` (specs/04-contracts.md §2).

The models mirror the YAML: fields a user may omit are optional here, and resolution
(defaults → profile → item, `manifest/resolve.py`, T07) fills them. Cross-field rules that need only
the manifest live here, raising errors typed with their issue code; rules that need the loaded
circuit (Q400-Q403, Q406, Q407) are semantic checks (T10).
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import Field, field_validator, model_validator

from qscore.schemas.common import MetricGroup, QDocument, QModel, issue_error

PROJECT_SCHEMA = "qscore.project/v0.2"
REQUIRED_PLACEHOLDER = "<required>"
ITEM_ID_PATTERN = r"^[a-z0-9_][a-z0-9_\-]{0,63}$"
BUILDER_PATTERN = re.compile(r"^[^:]+\.py::[A-Za-z_][A-Za-z0-9_]*$")

Intent = Literal[
    "exact_unitary",
    "reversible_function",
    "known_output",
    "distribution",
    "expectation",
    "structure_only",
]
PermittedChange = Literal[
    "layout",
    "routing",
    "commuting_reorder",
    "block_resynthesis",
    "reversible_rewrite",
    "approximate_synthesis",
]
TASK_INTENTS: frozenset[str] = frozenset({"known_output", "distribution", "expectation"})
EXACT_INTENTS: frozenset[str] = frozenset({"exact_unitary", "reversible_function"})


class Runner(QModel):
    env: Literal["engine", "uv"] = "engine"
    timeout_s: float = Field(default=60, gt=0)
    mem_mb: int = Field(default=4096, gt=0)


class ProjectInfo(QModel):
    name: str = Field(min_length=1)
    root: str = "."
    runner: Runner = Field(default_factory=Runner)


class CalibrationFile(QModel):
    file: str


class TargetSpec(QModel):
    """A named backend, or a custom `{coupling_map, basis_gates}` target (§2.2, Q103)."""

    backend: str | None = None
    coupling_map: list[tuple[int, int]] | None = None
    basis_gates: list[str] | None = None
    calibration: Literal["from_backend", "none"] | CalibrationFile | None = None

    @model_validator(mode="after")
    def _named_or_custom(self) -> TargetSpec:
        custom = self.coupling_map is not None or self.basis_gates is not None
        if self.backend is not None and custom:
            raise issue_error(
                "Q103", "target: give either 'backend' or {coupling_map, basis_gates}"
            )
        if self.backend is None and not (self.coupling_map and self.basis_gates):
            raise issue_error(
                "Q103", "target: a custom target needs both coupling_map and basis_gates"
            )
        return self


class Constraint(QModel):
    """A metric and exactly one bound (§2.2, Q103)."""

    metric: str
    max_vs_baseline: float | None = None
    min_vs_baseline: float | None = None
    max: float | None = None
    min: float | None = None

    @model_validator(mode="after")
    def _exactly_one_bound(self) -> Constraint:
        bounds = [self.max_vs_baseline, self.min_vs_baseline, self.max, self.min]
        if sum(b is not None for b in bounds) != 1:
            raise issue_error(
                "Q103",
                f"constraint on {self.metric!r} needs exactly one of "
                "max_vs_baseline, min_vs_baseline, max, min",
            )
        return self


class Objective(QModel):
    primary: str
    direction: Literal["minimize", "maximize"]
    constraints: list[Constraint] = Field(default_factory=list)
    report: list[str] = Field(default_factory=list)


class Evidence(QModel):
    verification: Literal["exact", "probabilistic_ok"] = "exact"
    on_inconclusive: Literal["reject"] = "reject"


class Precision(QModel):
    screen: Literal["single", "double"] = "single"
    confirm: Literal["double"] = "double"


class Execution(QModel):
    device: Literal["auto", "cpu", "gpu"] | None = None
    precision: Precision | None = None
    transpiler_seeds: list[int] | None = None
    seed_simulator: int | None = None
    shots: int | None = Field(default=None, gt=0)

    @field_validator("transpiler_seeds")
    @classmethod
    def _seeds_nonempty_unique(cls, seeds: list[int] | None) -> list[int] | None:
        if seeds is not None and (not seeds or len(set(seeds)) != len(seeds)):
            raise issue_error("Q103", "transpiler_seeds must be a non-empty list of unique ints")
        return seeds


class Budget(QModel):
    wall_time_s: float | None = Field(default=None, gt=0)
    gpu_time_s: float | None = Field(default=None, ge=0)
    max_rounds: int | None = Field(default=None, ge=0)
    max_proposals: int | None = Field(default=None, ge=1)
    layer_timeout_s: float | None = Field(default=None, gt=0)


class IgnoreEntry(QModel):
    rule: str = Field(pattern=r"^D\d{2}$")
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_nonempty(cls, reason: str) -> str:
        if not reason.strip():
            raise issue_error("Q104", "diagnose.ignore entries need a non-empty reason")
        return reason


class DiagnoseSettings(QModel):
    profile: str | None = None
    groups: list[MetricGroup] | None = None
    ignore: list[IgnoreEntry] | None = None


class Privacy(QModel):
    external_inference: bool = False
    send_region_only: bool = True

    @model_validator(mode="after")
    def _region_only_in_mvp(self) -> Privacy:
        if self.external_inference and not self.send_region_only:
            raise issue_error(
                "Q410", "external inference requires send_region_only: true in the MVP"
            )
        return self


class Defaults(QModel):
    target: TargetSpec | None = None
    objective: Objective | None = None
    evidence: Evidence | None = None
    execution: Execution | None = None
    budget: Budget | None = None
    diagnose: DiagnoseSettings | None = None
    privacy: Privacy | None = None


class ParametersFile(QModel):
    file: str


class QasmSource(QModel):
    qasm: str


class BuilderSource(QModel):
    builder: str
    args: dict[str, object] = Field(default_factory=dict)
    parameters: ParametersFile | None = None

    @field_validator("builder")
    @classmethod
    def _builder_format(cls, builder: str) -> str:
        if not BUILDER_PATTERN.match(builder):
            raise issue_error("Q103", "builder must be 'path/to/file.py::function'")
        return builder


class SizeSweep(QModel):
    arg: str
    values: list[int] = Field(min_length=1)


class Task(QModel):
    """Intent-specific task (§2.1): `bitstring`/`min_probability` for known_output, `tolerance`
    for distribution/expectation, `observable` for expectation; `shots` for all three."""

    bitstring: str | None = Field(default=None, pattern=r"^[01]+$")
    min_probability: float | None = Field(default=None, ge=0, le=1)
    observable: str | None = None
    tolerance: float | None = Field(default=None, ge=0)
    shots: int = Field(gt=0)


class ReliabilityInvariant(QModel):
    min_vs_baseline: float


class Invariants(QModel):
    intent: Intent = "exact_unitary"
    global_phase: Literal["ignore", "exact"] = "ignore"
    final_permutation: Literal["allowed", "forbidden"] = "allowed"
    task: Task | None = None
    reliability: ReliabilityInvariant | None = None

    @model_validator(mode="after")
    def _task_matches_intent(self) -> Invariants:
        if self.intent in TASK_INTENTS:
            if self.task is None:
                raise issue_error("Q104", f"intent {self.intent!r} requires a task")
            need = {
                "known_output": ("bitstring", "min_probability"),
                "distribution": ("tolerance",),
                "expectation": ("observable", "tolerance"),
            }[self.intent]
            missing = [f for f in need if getattr(self.task, f) is None]
            if missing:
                raise issue_error(
                    "Q104", f"intent {self.intent!r} task needs: {', '.join(missing)}"
                )
        return self


class Ancillas(QModel):
    add: int = Field(default=0, ge=0)
    reuse: bool = True


class Permitted(QModel):
    changes: list[PermittedChange] = Field(default_factory=list)
    ancillas: Ancillas = Field(default_factory=Ancillas)
    approximation: str = "none"
    scope: Literal["region", "whole"] = "region"


class CircuitItem(QModel):
    id: str
    source: QasmSource | BuilderSource
    size_sweep: SizeSweep | None = None
    invariants: Invariants = Field(default_factory=Invariants)
    permitted: Permitted = Field(default_factory=Permitted)
    target: TargetSpec | None = None
    objective: Objective | None = None
    evidence: Evidence | None = None
    execution: Execution | None = None
    budget: Budget | None = None
    diagnose: DiagnoseSettings | None = None
    privacy: Privacy | None = None

    @field_validator("id")
    @classmethod
    def _id_format(cls, value: str) -> str:
        if not re.match(ITEM_ID_PATTERN, value):
            raise issue_error("Q103", f"item id {value!r} must match {ITEM_ID_PATTERN}")
        return value

    @model_validator(mode="before")
    @classmethod
    def _exactly_one_source(cls, data: object) -> object:
        if isinstance(data, dict) and isinstance(data.get("source"), dict):
            kinds = [k for k in ("qasm", "builder") if k in data["source"]]
            if len(kinds) != 1:
                raise issue_error("Q103", "source needs exactly one of 'qasm' or 'builder'")
        return data

    @model_validator(mode="after")
    def _cross_field(self) -> CircuitItem:
        changes = set(self.permitted.changes)
        if changes & {"layout", "routing"} and self.invariants.final_permutation != "allowed":
            raise issue_error(
                "Q408", "final_permutation must be 'allowed' when layout or routing is permitted"
            )
        if self.invariants.intent in EXACT_INTENTS and self.permitted.approximation != "none":
            raise issue_error(
                "Q405",
                f"approximation {self.permitted.approximation!r} contradicts the exact intent "
                f"{self.invariants.intent!r}",
            )
        return self


class ProjectManifest(QDocument):
    SCHEMA_ID = PROJECT_SCHEMA

    schema_: Literal["qscore.project/v0.2"] = Field(alias="schema")
    project: ProjectInfo
    defaults: Defaults = Field(default_factory=Defaults)
    circuits: list[CircuitItem]

    @model_validator(mode="before")
    @classmethod
    def _no_placeholders(cls, data: object) -> object:
        def walk(node: object, path: str) -> None:
            if node == REQUIRED_PLACEHOLDER:
                raise issue_error("Q107", f"placeholder <required> not filled at {path or '.'}")
            if isinstance(node, dict):
                for k, v in node.items():
                    walk(v, f"{path}.{k}" if path else str(k))
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, f"{path}[{i}]")

        walk(data, "")
        return data

    @model_validator(mode="after")
    def _unique_ids(self) -> ProjectManifest:
        seen: set[str] = set()
        for item in self.circuits:
            if item.id in seen:
                raise issue_error("Q105", f"duplicate item id {item.id!r}")
            seen.add(item.id)
        return self
