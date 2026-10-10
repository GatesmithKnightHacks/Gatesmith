"""Lazy, cached scoring inputs for one item (specs/03-code-structure.md §3.3)."""

from __future__ import annotations

from collections.abc import Callable
from functools import cached_property

from qiskit import QuantumCircuit

from qscore.compile import pipeline, select, stages
from qscore.compile.pipeline import CompiledResult, CompileSet
from qscore.compile.stages import RoutedResult
from qscore.manifest.resolve import ResolvedItem
from qscore.schemas.manifest import TASK_INTENTS, Execution, Objective, SizeSweep, TargetSpec
from qscore.targets.registry import TargetBundle, get_target


class ScoringContext:
    def __init__(
        self,
        resolved: ResolvedItem,
        logical: QuantumCircuit,
        rebuild: Callable[[int], QuantumCircuit] | None = None,
    ) -> None:
        self.resolved = resolved
        self._logical = logical
        self._rebuild = rebuild
        item = resolved.item
        assert item.target is not None and item.objective is not None and item.execution is not None
        self.target_spec: TargetSpec = item.target
        self.objective: Objective = item.objective
        self.execution: Execution = item.execution

    @property
    def logical(self) -> QuantumCircuit:
        return self._logical

    @property
    def has_task(self) -> bool:
        """The item's intent carries a task (known_output, distribution, expectation; 04 §2.1)."""
        return self.resolved.item.invariants.intent in TASK_INTENTS

    @property
    def size_sweep(self) -> SizeSweep | None:
        return self.resolved.item.size_sweep

    @property
    def rebuild(self) -> Callable[[int], QuantumCircuit] | None:
        """Builder at another size-sweep value (the sandbox, M3); None for QASM items."""
        return self._rebuild

    @property
    def seeds(self) -> list[int]:
        assert self.execution.transpiler_seeds is not None
        return list(self.execution.transpiler_seeds)

    @cached_property
    def target(self) -> TargetBundle:
        return get_target(self.target_spec)

    @cached_property
    def compile_set(self) -> CompileSet:
        return pipeline.compile_item(self.logical, self.target, self.seeds)

    @cached_property
    def representative(self) -> CompiledResult:
        return select.pick_representative(
            self.compile_set, self.objective.primary, self.objective.direction
        )

    @cached_property
    def all_to_all(self) -> CompileSet:
        return pipeline.compile_all_to_all(self.logical, self.target, self.seeds)

    @cached_property
    def routing_stage(self) -> RoutedResult:
        return stages.route_only(self.logical, self.target, self.representative.seed)

    @cached_property
    def raw_translation(self) -> QuantumCircuit:
        return pipeline.raw_translation(self.logical, self.target)
