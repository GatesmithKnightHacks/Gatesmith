"""SupermarQ feature profile (specs/06-metrics.md §2.3).

Port of the six `compute_*_with_qiskit` functions in SupermarQ (Tomesh et al., "SupermarQ: A
Scalable Quantum Benchmark Suite", HPCA 2022), source `supermarq-benchmarks/supermarq/features.py`
in github.com/Infleqtion/client-superstaq at commit dcf8318 (Apache-2.0). The port follows the
source, including where it differs from the paper's prose: "measurement" counts layers that
contain a `reset` after final measurements are removed, and "critical depth" sums the longest-path
counts of the gate names that occur as two-qubit operations. Where the source divides by zero
(fewer than 2 qubits for communication, no gates, depth 0) a feature function returns None and the
metric reports 0.0, listing the case in `evidence.undefined_as_zero` (ChP-0026) — the same value
the source itself gives parallelism in the analogous case.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qiskit.circuit import QuantumCircuit
from qiskit.converters import circuit_to_dag
from qiskit.dagcircuit import DAGCircuit

from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed
from qscore.schemas.common import MetricGroup, MetricKind

SOURCE = "SupermarQ features.py @ Infleqtion/client-superstaq dcf8318 (Apache-2.0)"


def _dag(qc: QuantumCircuit) -> DAGCircuit:
    dag = circuit_to_dag(qc)
    dag.remove_all_ops_named("barrier")
    return dag


def communication(qc: QuantumCircuit) -> float | None:
    """Average qubit degree of the interaction graph / degree of a complete graph."""
    n = qc.num_qubits
    if n < 2:
        return None  # fewer than 2 qubits
    edges = {
        frozenset(qc.find_bit(q).index for q in node.qargs) for node in _dag(qc).two_qubit_ops()
    }
    degree_sum = 2 * sum(1 for e in edges if len(e) == 2)
    return float(degree_sum / (n * (n - 1)))


def liveness(qc: QuantumCircuit) -> float | None:
    """Sum of the qubit-by-layer activity matrix / (qubits x depth)."""
    dag = _dag(qc)
    depth = dag.depth()
    if depth == 0:
        return None
    active = {
        (qc.find_bit(q).index, i)
        for i, layer in enumerate(dag.layers())
        for qubits in layer["partition"]
        for q in qubits
    }
    return float(len(active) / (qc.num_qubits * depth))


def parallelism(qc: QuantumCircuit) -> float:
    """max(((gates / depth) - 1) / (qubits - 1), 0); 0 for <= 1 qubit or depth 0."""
    dag = _dag(qc)
    depth = dag.depth()
    if qc.num_qubits <= 1 or depth == 0:
        return 0.0
    return float(max(((len(dag.gate_nodes()) / depth) - 1) / (qc.num_qubits - 1), 0.0))


def measurement(qc: QuantumCircuit) -> float | None:
    """Layers containing a reset (final measurements removed) / depth."""
    stripped = qc.remove_final_measurements(inplace=False)
    dag = _dag(stripped)
    depth = dag.depth()
    if depth == 0:
        return None  # depth 0 after removing final measurements
    reset_layers = sum(
        1 for layer in dag.layers() if any(op.name == "reset" for op in layer["graph"].op_nodes())
    )
    return float(reset_layers / depth)


def entanglement_ratio(qc: QuantumCircuit) -> float | None:
    """Two-qubit operations / gates."""
    dag = _dag(qc)
    gates = len(dag.gate_nodes())
    if gates == 0:
        return None  # no gates
    return len(dag.two_qubit_ops()) / gates


def critical_depth(qc: QuantumCircuit) -> float:
    """Two-qubit operations on the longest path / all two-qubit operations (0 if none on it)."""
    dag = _dag(qc)
    longest = dag.count_ops_longest_path()
    two_qubit = dag.two_qubit_ops()
    n_ed = sum(longest.get(name, 0) for name in {op.name for op in two_qubit})
    if n_ed == 0:
        return 0.0
    return float(n_ed / len(two_qubit))


@dataclass(frozen=True)
class SupermarqProfile:
    """Six standard features describing the circuit's shape; shown for context, never scored.

    SupermarQ's six features on the logical circuit: program communication, critical depth,
    entanglement ratio, parallelism, liveness and measurement, each in [0, 1]. Where a
    formula divides by zero (program communication with fewer than 2 qubits; entanglement
    ratio with no gates; liveness or measurement with depth 0) the feature is 0.0 and the
    case is listed in `evidence.undefined_as_zero` (ChP-0026).

    Unit: dict of 6 values in [0, 1]. Reference: Tomesh et al., "SupermarQ: A Scalable
    Quantum Benchmark Suite", HPCA 2022 (arXiv:2202.11045); formulas ported from the
    published SupermarQ source.
    """

    id: str = "supermarq_profile"
    group: MetricGroup = MetricGroup.OPPORTUNITIES
    version: str = "1"
    kind: MetricKind = MetricKind.CONTEXT
    scope: Literal["logical", "compiled", "both"] = "logical"
    requires: frozenset[Requirement] = frozenset({Requirement.LOGICAL})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "cheap"

    def compute(self, ctx: ScoringContext) -> Outcome:
        qc = ctx.logical
        raw = {
            "program_communication": communication(qc),
            "critical_depth": critical_depth(qc),
            "entanglement_ratio": entanglement_ratio(qc),
            "parallelism": parallelism(qc),
            "liveness": liveness(qc),
            "measurement": measurement(qc),
        }
        value = {k: 0.0 if v is None else v for k, v in raw.items()}
        undefined = sorted(k for k, v in raw.items() if v is None)
        return computed(
            value, "features in [0, 1]", {"source": SOURCE, "undefined_as_zero": undefined}
        )
