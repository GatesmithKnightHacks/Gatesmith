"""Resource metrics (specs/06-metrics.md §2.1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qscore.compile import counts as c
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed
from qscore.schemas.common import MetricGroup, MetricKind

_LC = frozenset({Requirement.LOGICAL, Requirement.COMPILED})
_L = frozenset({Requirement.LOGICAL})


@dataclass(frozen=True)
class _Count:
    id: str
    unit: str
    scope: Literal["logical", "compiled", "both"]
    requires: frozenset[Requirement]
    group: MetricGroup = MetricGroup.RESOURCES
    version: str = "1"
    kind: MetricKind = MetricKind.DETERMINISTIC
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "trivial"


class Width(_Count):
    """Active qubits (touched by ≥1 non-directive operation) of the compiled circuit."""

    def __init__(self) -> None:
        super().__init__("width", "qubits", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        rep = ctx.representative.circuit
        return computed(
            len(c.active_qubits(rep)), self.unit, {"logical": len(c.active_qubits(ctx.logical))}
        )


class Size(_Count):
    """Operations of the compiled circuit (directives excluded; measurements/resets included)."""

    def __init__(self) -> None:
        super().__init__("size", "ops", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(
            c.size(ctx.representative.circuit), self.unit, {"logical": c.size(ctx.logical)}
        )


class Depth(_Count):
    """Depth of the compiled circuit."""

    def __init__(self) -> None:
        super().__init__("depth", "layers", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(ctx.representative.depth, self.unit, {"logical": c.depth(ctx.logical)})


class TwoQubitCount(_Count):
    """Two-qubit instructions of the compiled circuit (the default primary objective)."""

    def __init__(self) -> None:
        super().__init__("two_qubit_count", "gates", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        ev = {
            "logical": c.two_qubit_count(ctx.logical),
            "logical_multi_qubit_ops": c.multi_qubit_count(ctx.logical),
        }
        return computed(ctx.representative.two_qubit_count, self.unit, ev)


class TwoQubitDepth(_Count):
    """Depth counting only two-qubit instructions, on the compiled circuit."""

    def __init__(self) -> None:
        super().__init__("two_qubit_depth", "layers", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        ev = {"logical": c.two_qubit_depth(ctx.logical)}
        return computed(ctx.representative.two_qubit_depth, self.unit, ev)


class MeasurementCount(_Count):
    """`measure` instructions of the logical circuit."""

    def __init__(self) -> None:
        super().__init__("measurement_count", "ops", "logical", _L)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(c.measurement_count(ctx.logical), self.unit)


class ToffoliCount(_Count):
    """`ccx` (and 2-control `mcx`) instructions of the logical circuit."""

    def __init__(self) -> None:
        super().__init__("toffoli_count", "gates", "logical", _L)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(c.toffoli_count(ctx.logical), self.unit)
