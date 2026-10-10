"""Metric plugin interface (specs/06-metrics.md §1).

`compute()` never catches exceptions to hide them: the engine wraps each call and turns an
exception into `status: failed`. Helpers build outcomes; the engine adds id/group/kind/scope.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Literal, Protocol

from qiskit.circuit import QuantumCircuit

from qscore.compile.pipeline import CompiledResult, CompileSet
from qscore.compile.stages import RoutedResult
from qscore.schemas.common import MetricGroup, MetricKind, Status
from qscore.schemas.manifest import SizeSweep
from qscore.targets.registry import TargetBundle


class Requirement(StrEnum):
    LOGICAL = "logical"
    COMPILED = "compiled"
    ALL_TO_ALL = "all_to_all"
    ROUTING_STAGE = "routing_stage"
    RAW_TRANSLATION = "raw_translation"
    CALIBRATION = "calibration"
    DURATIONS = "durations"
    BUILDER = "builder"
    TASK = "task"
    SIMULATION = "simulation"


class ScoringContext(Protocol):
    """What metrics may read (implemented lazily by `score/context.py`)."""

    @property
    def logical(self) -> QuantumCircuit: ...
    @property
    def has_task(self) -> bool: ...
    @property
    def target(self) -> TargetBundle: ...
    @property
    def compile_set(self) -> CompileSet: ...
    @property
    def representative(self) -> CompiledResult: ...
    @property
    def all_to_all(self) -> CompileSet: ...
    @property
    def routing_stage(self) -> RoutedResult: ...
    @property
    def raw_translation(self) -> QuantumCircuit: ...
    @property
    def seeds(self) -> list[int]: ...
    @property
    def size_sweep(self) -> SizeSweep | None: ...
    @property
    def rebuild(self) -> Callable[[int], QuantumCircuit] | None:
        """Builds the item at another value of the size-sweep argument; None without a builder."""


@dataclass(frozen=True)
class Outcome:
    status: Status
    value: float | int | dict[str, Any] | None = None
    unit: str | None = None
    reason: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)


def computed(
    value: float | int | dict[str, Any], unit: str, evidence: dict[str, Any] | None = None
) -> Outcome:
    return Outcome(Status.COMPUTED, value, unit, None, evidence or {})


def skipped(reason: str) -> Outcome:
    return Outcome(Status.SKIPPED, reason=reason)


def unavailable(reason: str) -> Outcome:
    """Only when a declared requirement is absent — never for an exception (06 §1)."""
    return Outcome(Status.UNAVAILABLE, reason=reason)


class Metric(Protocol):
    @property
    def id(self) -> str: ...
    @property
    def group(self) -> MetricGroup: ...
    @property
    def version(self) -> str: ...
    @property
    def kind(self) -> MetricKind: ...
    @property
    def scope(self) -> Literal["logical", "compiled", "both"]: ...
    @property
    def requires(self) -> frozenset[Requirement]: ...
    @property
    def cost_tier(self) -> Literal["trivial", "cheap", "moderate", "expensive"]: ...

    def compute(self, ctx: ScoringContext) -> Outcome: ...
