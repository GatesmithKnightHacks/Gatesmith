"""Init/layout/routing stages only, to count SWAPs before they decompose (specs/05 §6)."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from qiskit.circuit import QuantumCircuit
from qiskit.transpiler import PassManager, generate_preset_pass_manager

from qscore.targets.registry import TargetBundle


@dataclass(frozen=True)
class RoutedResult:
    seed: int
    circuit: QuantumCircuit
    swaps_inserted: int
    swaps_per_pair: dict[tuple[int, int], int]


def route_only(circuit: QuantumCircuit, bundle: TargetBundle, seed: int) -> RoutedResult:
    staged = generate_preset_pass_manager(
        optimization_level=3, target=bundle.target, seed_transpiler=seed
    )
    pm = PassManager()
    for stage in (staged.init, staged.layout, staged.routing):
        if stage is not None:
            pm.append(stage.to_flow_controller())
    routed = pm.run(circuit)
    pairs = swap_counts(routed)
    return RoutedResult(seed, routed, sum(pairs.values()), pairs)


def swap_counts(routed: QuantumCircuit) -> dict[tuple[int, int], int]:
    """SWAPs per physical qubit pair (sorted pair), in the routed circuit."""
    found: Counter[tuple[int, int]] = Counter()
    for inst in routed.data:
        if inst.operation.name == "swap":
            a, b = sorted(routed.find_bit(q).index for q in inst.qubits)
            found[(a, b)] += 1
    return dict(sorted(found.items()))
