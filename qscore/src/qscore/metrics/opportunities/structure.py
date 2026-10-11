"""Structure and resynthesis potential (specs/06-metrics.md §2.3).

`structure` reports commuting runs, Clifford blocks and linear-function blocks. The blocks are
collected exactly as `CollectCliffords` / `CollectLinearFunctions` collect them (same filter
functions, default options), without collapsing, so each block keeps its gate indices and layers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from qiskit.circuit import QuantumCircuit
from qiskit.circuit.library import CXGate, CZGate, ECRGate
from qiskit.converters import circuit_to_dag
from qiskit.dagcircuit import DAGCircuit
from qiskit.quantum_info import Operator
from qiskit.synthesis import TwoQubitBasisDecomposer
from qiskit.transpiler.passes import Collect2qBlocks
from qiskit.transpiler.passes.optimization.collect_and_collapse import (
    collect_using_filter_function,
)
from qiskit.transpiler.passes.optimization.collect_cliffords import _is_clifford_gate
from qiskit.transpiler.passes.optimization.collect_linear_functions import _is_linear_gate

from qscore.compile import counts as c
from qscore.metrics.base import Outcome, Requirement, ScoringContext, computed
from qscore.schemas.common import MetricGroup, MetricKind

DIAGONAL_2Q = frozenset({"cz", "cp", "crz", "rzz"})
DIAGONAL_1Q = frozenset({"rz", "p", "z", "s", "sdg", "t", "tdg"})
KAK_GATES = {"cx": CXGate(), "cz": CZGate(), "ecr": ECRGate()}


def layers_of(qc: QuantumCircuit) -> list[int]:
    """ASAP layer of each instruction (directives get the layer of their qubits, add none)."""
    level: dict[int, int] = {}
    out = []
    for inst in qc.data:
        qs = [qc.find_bit(q).index for q in inst.qubits]
        layer = max((level.get(q, -1) for q in qs), default=-1) + (0 if c.is_directive(inst) else 1)
        layer = max(layer, 0)
        if not c.is_directive(inst):
            for q in qs:
                level[q] = layer
        out.append(layer)
    return out


def commuting_runs(qc: QuantumCircuit) -> list[dict[str, Any]]:
    """Maximal connected runs of diagonal 2q gates; 1q diagonal gates do not break a run."""
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    run_of: dict[int, int | None] = {}
    closed: set[int] = set()  # roots of runs a non-diagonal op has cut; nothing may join them
    members: dict[int, list[int]] = {}
    for idx, inst in enumerate(qc.data):
        if c.is_directive(inst):
            continue
        name = inst.operation.name
        qs = [qc.find_bit(q).index for q in inst.qubits]
        if name in DIAGONAL_2Q:
            parent[idx] = idx
            for q in qs:
                prev = run_of.get(q)
                if prev is not None and find(prev) not in closed:
                    parent[find(prev)] = find(idx)
            for q in qs:
                run_of[q] = idx
            members[idx] = [idx]
        elif name in DIAGONAL_1Q:
            continue
        else:
            for q in qs:
                prev = run_of.get(q)
                if prev is not None:
                    closed.add(find(prev))
                run_of[q] = None
    groups: dict[int, list[int]] = {}
    for idx in members:
        groups.setdefault(find(idx), []).append(idx)
    layers = layers_of(qc)
    runs = []
    for idxs in groups.values():
        idxs.sort()
        qubits = sorted({qc.find_bit(q).index for i in idxs for q in qc.data[i].qubits})
        runs.append(
            {
                "qubits": qubits,
                "layers": [min(layers[i] for i in idxs), max(layers[i] for i in idxs)],
                "gate_indices": idxs,
                "num_ops": len(idxs),
            }
        )
    return sorted(runs, key=lambda r: (-r["num_ops"], r["gate_indices"][0]))


def _collected_blocks(qc: QuantumCircuit, filter_function: Any) -> list[dict[str, Any]]:
    """Blocks of matching gates (min 2 gates, split over disjoint qubits: the passes' defaults)."""
    dag = DAGCircuit()
    dag.add_qubits(qc.qubits)
    dag.add_clbits(qc.clbits)
    for creg in qc.cregs:
        dag.add_creg(creg)
    index_of: dict[int, int] = {}
    for idx, inst in enumerate(qc.data):
        node = dag.apply_operation_back(inst.operation, inst.qubits, inst.clbits, check=False)
        index_of[node._node_id] = idx
    blocks = collect_using_filter_function(
        dag,
        filter_function,
        split_blocks=True,
        min_block_size=2,
        split_layers=False,
        collect_from_back=False,
        max_block_width=None,
    )
    layers = layers_of(qc)
    out = []
    for nodes in blocks:
        idxs = sorted(index_of[n._node_id] for n in nodes)
        qubits = sorted({qc.find_bit(q).index for i in idxs for q in qc.data[i].qubits})
        out.append(
            {
                "qubits": qubits,
                "layers": [min(layers[i] for i in idxs), max(layers[i] for i in idxs)],
                "gate_indices": idxs,
                "num_ops": len(idxs),
            }
        )
    return sorted(out, key=lambda b: (-len(b["qubits"]), -b["num_ops"], b["gate_indices"][0]))


def clifford_blocks(qc: QuantumCircuit) -> list[dict[str, Any]]:
    return _collected_blocks(qc, _is_clifford_gate)


def linear_function_blocks(qc: QuantumCircuit) -> list[dict[str, Any]]:
    return _collected_blocks(qc, _is_linear_gate)


@dataclass(frozen=True)
class Structure:
    """Regions of the circuit that special-purpose techniques could rewrite; shown for context.

    On the logical circuit: (a) commuting runs, maximal connected DAG runs of two-qubit
    gates diagonal in the computational basis (`cz`, `cp`, `crz`, `rzz`), where one-qubit
    diagonal gates do not break a run; (b) Clifford blocks via `CollectCliffords`; (c)
    linear-function blocks via `CollectLinearFunctions`. Each block lists its qubits, layer
    range and gate indices.

    Unit: dict of lists. Reference: Qiskit `CollectCliffords`, `CollectLinearFunctions`;
    qscore commuting-run detection (06 §2.3).
    """

    id: str = "structure"
    group: MetricGroup = MetricGroup.OPPORTUNITIES
    version: str = "1"
    kind: MetricKind = MetricKind.CONTEXT
    scope: Literal["logical", "compiled", "both"] = "logical"
    requires: frozenset[Requirement] = frozenset({Requirement.LOGICAL})
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "cheap"

    def compute(self, ctx: ScoringContext) -> Outcome:
        qc = ctx.logical
        return computed(
            {
                "commuting_runs": commuting_runs(qc),
                "clifford_blocks": clifford_blocks(qc),
                "linear_function_blocks": linear_function_blocks(qc),
            },
            "dict",
        )


def block_potential(block: QuantumCircuit, two_qubit_gate: str) -> int:
    """Current 2q gates in a ≤2-qubit block minus the KAK minimum for `two_qubit_gate`: the
    two-qubit gates of the exact synthesis. (`num_basis_gates` is not used: in Qiskit 2.5.2
    it returns 0 for SWAP-class blocks at some global phases; ChP-0043.)"""
    current = c.two_qubit_count(block)
    if block.num_qubits != 2 or current == 0:
        return 0
    decomposer = TwoQubitBasisDecomposer(KAK_GATES[two_qubit_gate])
    minimum = decomposer(Operator(block).data).count_ops().get(two_qubit_gate, 0)
    return current - int(minimum)


def _blocks(qc: QuantumCircuit) -> list[tuple[QuantumCircuit, list[int]]]:
    dag = circuit_to_dag(qc)
    pass_ = Collect2qBlocks()
    pass_.run(dag)
    out = []
    for nodes in pass_.property_set["block_list"] or []:
        qubits = sorted({qc.find_bit(q).index for n in nodes for q in n.qargs})
        local = {q: i for i, q in enumerate(qubits)}
        sub = QuantumCircuit(len(qubits))
        for n in nodes:
            sub.append(n.op, [local[qc.find_bit(q).index] for q in n.qargs])
        out.append((sub, qubits))
    return out


def potential(qc: QuantumCircuit, two_qubit_gate: str) -> tuple[int, list[dict[str, Any]]]:
    total = 0
    found: list[tuple[int, list[int], int]] = []
    for sub, qubits in _blocks(qc):
        p = block_potential(sub, two_qubit_gate)
        if p > 0:
            total += p
            found.append((p, qubits, c.two_qubit_count(sub)))
    found.sort(key=lambda t: (-t[0], t[1]))
    top = [{"qubits": q, "current": cur, "saving": p} for p, q, cur in found[:5]]
    return total, top


@dataclass(frozen=True)
class ResynthesisPotential:
    """How many two-qubit gates could be saved by re-synthesizing small two-qubit blocks optimally.

    Sum over two-qubit blocks of the compiled circuit (`Collect2qBlocks` +
    `ConsolidateBlocks`) of the block's current two-qubit gates minus
    the two-qubit gates in `TwoQubitBasisDecomposer(<target's two-qubit gate>)(block unitary)`
    (exact KAK synthesis; ChP-0043).
    Evidence: the top blocks with locations, and the same sum on the raw translation
    (`raw_potential`, informational).

    Unit: gates. Reference: KAK decomposition: Vidal & Dawson, PRA 69, 010301 (2004); Qiskit
    `TwoQubitBasisDecomposer`.
    """

    id: str = "resynthesis_potential"
    group: MetricGroup = MetricGroup.OPPORTUNITIES
    version: str = "1"
    kind: MetricKind = MetricKind.DETERMINISTIC
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = frozenset(
        {Requirement.COMPILED, Requirement.RAW_TRANSLATION}
    )
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "moderate"

    def compute(self, ctx: ScoringContext) -> Outcome:
        gate = ctx.target.two_qubit_gate
        total, top = potential(ctx.representative.circuit, gate)
        raw, _ = potential(ctx.raw_translation, gate)
        return computed(total, "gates", {"top_blocks": top, "raw_potential": raw})
