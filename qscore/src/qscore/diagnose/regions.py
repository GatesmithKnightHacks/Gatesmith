"""Regions: merging and convex block collection (specs/07-diagnostics.md §3; ChP-0013).

A region names qubits, an inclusive layer range and (optionally) gate indices, i.e. positions
in `circuit.data`, of the circuit named by its scope. Layers are the ASAP layers that the
`structure` metric reports (`metrics.opportunities.structure.layers_of`), so a window cut here
lines up with the regions the rules emit.

`convex_blocks` is the ★ default extraction (DAG-based convex block collection): it collects
blocks of gates restricted to the region's qubits and layers in the way `CollectMultiQBlocks`
style passes do (Qiskit's `BlockCollector`, greedy from the inputs, one block per frontier
sweep), so a block never contains two gates joined by a DAG path through a gate outside the
block. Every block is checked with `is_convex` before it is returned. A window whose gates are
not convex is therefore shrunk into convex blocks; it is never returned whole.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from qiskit.circuit import CircuitInstruction, Gate, QuantumCircuit
from qiskit.dagcircuit import DAGCircuit, DAGOpNode
from qiskit.dagcircuit.collect_blocks import BlockCollector

from qscore.errors import InvalidInput, QscoreError
from qscore.metrics.opportunities.structure import layers_of
from qscore.schemas.scorecard import Region

MODEL_LAYER_MAX_QUBITS = 8  # default block width for model layers (07 §3)
REFERENCE_MAX_QUBITS = 16  # default block width for `reference-qiskit` (07 §3)


@dataclass(frozen=True)
class Block:
    """A convex block of `circuit.data`: sorted circuit qubits, sorted gate indices, and the
    inclusive ASAP layer range of those gates."""

    qubits: tuple[int, ...]
    gate_indices: tuple[int, ...]
    layers: tuple[int, int]

    @property
    def num_ops(self) -> int:
        return len(self.gate_indices)

    def region(self, scope: str) -> Region:
        """The block as a region of the circuit it was cut from (same scope)."""
        return Region.model_validate(
            {
                "scope": scope,
                "qubits": list(self.qubits),
                "layers": self.layers,
                "gate_indices": list(self.gate_indices),
            }
        )


def merge(regions: Sequence[Region]) -> Region:
    """Union of qubits and gate indices, hull of layers (07 §3). Regions of different scopes
    cannot be merged: positions are never mapped across scopes (ChP-0013)."""
    if not regions:
        raise InvalidInput("merge: no regions to merge", report=None)
    scopes = {r.scope for r in regions}
    if len(scopes) != 1:
        raise InvalidInput(
            f"merge: regions have different scopes {sorted(scopes)}; positions are never "
            "mapped across scopes (ChP-0013)",
            report=None,
        )
    return Region(
        scope=regions[0].scope,
        qubits=sorted({q for r in regions for q in r.qubits}),
        layers=(min(r.layers[0] for r in regions), max(r.layers[1] for r in regions)),
        gate_indices=sorted({i for r in regions for i in r.gate_indices}),
    )


def _wires(circuit: QuantumCircuit, inst: CircuitInstruction) -> list[tuple[str, int]]:
    return [("q", circuit.find_bit(q).index) for q in inst.qubits] + [
        ("c", circuit.find_bit(c).index) for c in inst.clbits
    ]


def is_convex(circuit: QuantumCircuit, gate_indices: Iterable[int]) -> bool:
    """True when no DAG path leaves the set of instructions and re-enters it (07 §3).

    One sweep in circuit order: an instruction outside the set is *tainted* when it depends on
    the set (directly or through tainted instructions); the set is non-convex as soon as one of
    its members depends on a tainted instruction."""
    members = set(gate_indices)
    out_of_range = sorted(i for i in members if not 0 <= i < len(circuit.data))
    if out_of_range:
        raise InvalidInput(f"is_convex: gate indices out of range: {out_of_range}", report=None)
    last_on_wire: dict[tuple[str, int], int] = {}
    tainted: set[int] = set()
    for idx, inst in enumerate(circuit.data):
        wires = _wires(circuit, inst)
        preds = {last_on_wire[w] for w in wires if w in last_on_wire}
        if idx in members:
            if preds & tainted:
                return False
        elif preds & (members | tainted):
            tainted.add(idx)
        for w in wires:
            last_on_wire[w] = idx
    return True


def _check_region_bounds(circuit: QuantumCircuit, region: Region) -> None:
    if len(set(region.qubits)) != len(region.qubits):
        raise InvalidInput(f"region qubits are not unique: {region.qubits}", report=None)
    bad = [q for q in region.qubits if not 0 <= q < circuit.num_qubits]
    if bad:
        raise InvalidInput(
            f"region qubits {bad} are outside the circuit's {circuit.num_qubits} qubits",
            report=None,
        )
    if region.layers[0] > region.layers[1]:
        raise InvalidInput(f"region layers {region.layers} are not a range", report=None)


def convex_blocks(circuit: QuantumCircuit, region: Region, max_qubits: int) -> list[Block]:
    """Convex blocks inside the region's qubits and inclusive layer window (07 §3).

    Only unitary gates (`Gate`, no classical bits) on the region's qubits, in the window, and
    at most `max_qubits` wide are collected; measurements, resets, barriers and delays are never
    part of a block. Blocks are split over disjoint qubit sets and ordered largest first (most
    gates, then earliest first gate)."""
    if max_qubits < 1:
        raise InvalidInput(f"convex_blocks: max_qubits must be >= 1, got {max_qubits}", report=None)
    _check_region_bounds(circuit, region)
    start, end = region.layers
    allowed = set(region.qubits)
    layers = layers_of(circuit)

    dag = DAGCircuit()
    dag.add_qubits(circuit.qubits)
    dag.add_clbits(circuit.clbits)
    for creg in circuit.cregs:
        dag.add_creg(creg)
    index_of: dict[DAGOpNode, int] = {}
    for idx, inst in enumerate(circuit.data):
        node = dag.apply_operation_back(inst.operation, inst.qubits, inst.clbits, check=False)
        index_of[node] = idx

    def eligible(node: DAGOpNode) -> bool:
        idx = index_of[node]
        inst = circuit.data[idx]
        qubits = {circuit.find_bit(q).index for q in inst.qubits}
        return (
            isinstance(inst.operation, Gate)
            and not inst.clbits
            # A gate wider than max_qubits can never join a block (and would stall the
            # collector, which neither takes nor skips it).
            and len(qubits) <= max_qubits
            and qubits <= allowed
            and start <= layers[idx] <= end
        )

    collected = BlockCollector(dag).collect_all_matching_blocks(
        eligible,
        split_blocks=True,
        min_block_size=1,
        split_layers=False,
        collect_from_back=False,
        max_block_width=max_qubits,
    )
    blocks = []
    for nodes in collected:
        idxs = tuple(sorted(index_of[n] for n in nodes))
        if not is_convex(circuit, idxs):
            raise QscoreError(f"convex_blocks: collected block {list(idxs)} is not convex")
        qubits = tuple(
            sorted({circuit.find_bit(q).index for i in idxs for q in circuit.data[i].qubits})
        )
        blocks.append(
            Block(
                qubits=qubits,
                gate_indices=idxs,
                layers=(min(layers[i] for i in idxs), max(layers[i] for i in idxs)),
            )
        )
    return sorted(blocks, key=lambda b: (-b.num_ops, b.gate_indices[0]))
