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
    """How many physical qubits the compiled circuit actually uses.

    Number of active qubits (touched by at least one non-directive operation) in the
    representative compiled circuit; physical qubits after layout. Evidence: `logical` (the
    same count on the logical circuit).

    Unit: qubits. Reference: Qiskit `QuantumCircuit`; qscore definition (06 §2.1).
    """

    def __init__(self) -> None:
        super().__init__("width", "qubits", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        rep = ctx.representative.circuit
        return computed(
            len(c.active_qubits(rep)), self.unit, {"logical": len(c.active_qubits(ctx.logical))}
        )


class Size(_Count):
    """Total number of operations after compilation.

    `circuit.size()` of the compiled circuit, directives excluded, measurements and resets
    included. Evidence: `logical`.

    Unit: ops. Reference: Qiskit `QuantumCircuit.size`.
    """

    def __init__(self) -> None:
        super().__init__("size", "ops", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(
            c.size(ctx.representative.circuit), self.unit, {"logical": c.size(ctx.logical)}
        )


class Depth(_Count):
    """Number of time steps (layers) of the compiled circuit.

    `circuit.depth()` of the compiled circuit. Evidence: `logical`.

    Unit: layers. Reference: Qiskit `QuantumCircuit.depth`.
    """

    def __init__(self) -> None:
        super().__init__("depth", "layers", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(ctx.representative.depth, self.unit, {"logical": c.depth(ctx.logical)})


class TwoQubitCount(_Count):
    """Number of two-qubit gates after compilation, usually the main cost driver; the default
    objective.

    Number of instructions with `operation.num_qubits == 2` in the compiled circuit.
    Evidence: `logical` and `logical_multi_qubit_ops` (operations on three or more qubits).

    Unit: gates. Reference: qscore definition (06 §2.1).
    """

    def __init__(self) -> None:
        super().__init__("two_qubit_count", "gates", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        ev = {
            "logical": c.two_qubit_count(ctx.logical),
            "logical_multi_qubit_ops": c.multi_qubit_count(ctx.logical),
        }
        return computed(ctx.representative.two_qubit_count, self.unit, ev)


class TwoQubitDepth(_Count):
    """Number of layers of two-qubit gates after compilation.

    `circuit.depth(filter_function=...)` counting only two-qubit, non-directive instructions
    of the compiled circuit. Evidence: `logical`.

    Unit: layers. Reference: Qiskit `QuantumCircuit.depth` with a filter.
    """

    def __init__(self) -> None:
        super().__init__("two_qubit_depth", "layers", "compiled", _LC)

    def compute(self, ctx: ScoringContext) -> Outcome:
        ev = {"logical": c.two_qubit_depth(ctx.logical)}
        return computed(ctx.representative.two_qubit_depth, self.unit, ev)


class MeasurementCount(_Count):
    """How many measurements the circuit makes.

    Number of `measure` instructions in the logical circuit.

    Unit: ops. Reference: qscore definition (06 §2.1).
    """

    def __init__(self) -> None:
        super().__init__("measurement_count", "ops", "logical", _L)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(c.measurement_count(ctx.logical), self.unit)


class ToffoliCount(_Count):
    """How many Toffoli gates the logical circuit uses; the objective for reversible circuits.

    Number of `ccx` instructions (and `mcx` with exactly two controls) in the logical
    circuit.

    Unit: gates. Reference: qscore definition (06 §2.1).
    """

    def __init__(self) -> None:
        super().__init__("toffoli_count", "gates", "logical", _L)

    def compute(self, ctx: ScoringContext) -> Outcome:
        return computed(c.toffoli_count(ctx.logical), self.unit)
