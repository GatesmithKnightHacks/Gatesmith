"""Seeded level-3 compiles, the all-to-all reference and the raw translation
(specs/05-pipeline.md §6; slice S2 of ChP-0022). Results are always sorted by seed.
"""

from __future__ import annotations

import multiprocessing
import os
import time
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass

from qiskit.circuit import QuantumCircuit
from qiskit.transpiler import Target, TranspilerError, generate_preset_pass_manager

from qscore.compile import counts
from qscore.errors import CompileError, InvalidInput
from qscore.targets.registry import TargetBundle, all_to_all_for


@dataclass(frozen=True)
class CompiledResult:
    seed: int
    circuit: QuantumCircuit
    two_qubit_count: int
    two_qubit_depth: int
    depth: int
    time_s: float


@dataclass(frozen=True)
class CompileSet:
    """Compiles of one circuit for one target, one per seed, sorted by seed."""

    target_name: str
    results: tuple[CompiledResult, ...]

    @property
    def seeds(self) -> list[int]:
        return [r.seed for r in self.results]


def _pool_init() -> None:
    os.environ["RAYON_NUM_THREADS"] = "1"  # avoid oversubscription with Qiskit's Rust threads


def _compile_one(circuit: QuantumCircuit, target: Target, seed: int) -> CompiledResult:
    start = time.perf_counter()
    pm = generate_preset_pass_manager(optimization_level=3, target=target, seed_transpiler=seed)
    out = pm.run(circuit)
    return CompiledResult(
        seed,
        out,
        counts.two_qubit_count(out),
        counts.two_qubit_depth(out),
        counts.depth(out),
        time.perf_counter() - start,
    )


def _compile_many(
    circuit: QuantumCircuit, target: Target, seeds: Sequence[int]
) -> list[CompiledResult]:
    if len(set(seeds)) != len(seeds) or not seeds:
        raise InvalidInput("[Q103] seeds must be a non-empty list of unique ints", report=None)
    workers = min(len(seeds), os.cpu_count() or 1)
    if workers == 1:
        try:
            results = [_compile_one(circuit, target, s) for s in seeds]
        except TranspilerError as exc:
            raise CompileError(f"compiling {circuit.name!r} failed: {exc}") from exc
    else:
        ctx = multiprocessing.get_context("spawn")
        with ProcessPoolExecutor(workers, mp_context=ctx, initializer=_pool_init) as pool:
            futures = [pool.submit(_compile_one, circuit, target, s) for s in seeds]
            try:
                results = [f.result() for f in futures]
            except TranspilerError as exc:
                raise CompileError(f"compiling {circuit.name!r} failed: {exc}") from exc
    return sorted(results, key=lambda r: r.seed)


def compile_item(circuit: QuantumCircuit, bundle: TargetBundle, seeds: Sequence[int]) -> CompileSet:
    """Level-3 compile once per seed for `bundle` (process pool)."""
    return CompileSet(bundle.name, tuple(_compile_many(circuit, bundle.target, seeds)))


def compile_all_to_all(
    circuit: QuantumCircuit, bundle: TargetBundle, seeds: Sequence[int]
) -> CompileSet:
    """The routing reference: same basis and seeds, full connectivity (06 §6 pitfall)."""
    ref = all_to_all_for(bundle, circuit.num_qubits)
    return CompileSet(ref.name, tuple(_compile_many(circuit, ref.target, seeds)))


def raw_translation(circuit: QuantumCircuit, bundle: TargetBundle) -> QuantumCircuit:
    """The logical circuit translated to the target basis at level 0, no coupling map (06 §1)."""
    pm = generate_preset_pass_manager(optimization_level=0, basis_gates=list(bundle.basis))
    return pm.run(circuit)
