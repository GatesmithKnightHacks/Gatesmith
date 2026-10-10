"""Lazy, cached scoring inputs for one item (specs/03-code-structure.md §3.3)."""

from __future__ import annotations

from collections.abc import Callable
from functools import cached_property

from qiskit import QuantumCircuit

from qscore.compile import pipeline, select, stages
from qscore.compile.pipeline import CompiledResult, CompileSet
from qscore.compile.stages import RoutedResult
from qscore.errors import MetricError
from qscore.manifest.resolve import ResolvedItem
from qscore.metrics.base import Requirement
from qscore.metrics.registry import all_metrics
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
        self.failures: dict[Requirement, Exception] = {}
        self._parent: ScoringContext | None = None  # set by `for_seed`
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
        return get_target(self.target_spec, self.resolved.root, self.logical.num_qubits)

    @cached_property
    def compile_set(self) -> CompileSet:
        return pipeline.compile_item(self.logical, self.target, self.seeds)

    @cached_property
    def representative(self) -> CompiledResult:
        primary = self.objective.primary
        if primary in select.PER_SEED_OBJECTIVES + select.LOGICAL_OBJECTIVES:
            return select.pick_representative(self.compile_set, primary, self.objective.direction)
        metric = all_metrics()[primary]
        values: dict[int, float] = {}
        for result in self.compile_set.results:
            outcome = metric.compute(self.for_seed(result))
            if not isinstance(outcome.value, (int, float)):
                raise MetricError(f"objective {primary} did not compute a scalar: {outcome.reason}")
            values[result.seed] = float(outcome.value)
        sign = 1 if self.objective.direction == "minimize" else -1
        order = {r.seed: i for i, r in enumerate(self.compile_set.results)}  # seed-list order
        return min(
            self.compile_set.results,
            key=lambda r: (sign * values[r.seed], r.two_qubit_depth, order[r.seed]),
        )

    def for_seed(self, result: CompiledResult) -> ScoringContext:
        """A context whose representative is `result`; it reuses this context's target and
        compiles (assigning a `cached_property` stores the value; seed-independent stages are
        delegated to the parent), so only seed-specific stages such as `routing_stage` run again."""
        ctx = ScoringContext(self.resolved, self.logical, self.rebuild)
        ctx._parent = self
        ctx.target = self.target
        ctx.compile_set = self.compile_set
        ctx.representative = result
        return ctx

    @cached_property
    def all_to_all(self) -> CompileSet:
        if self._parent is not None:
            return self._parent.all_to_all
        return pipeline.compile_all_to_all(self.logical, self.target, self.seeds)

    @cached_property
    def routing_stage(self) -> RoutedResult:
        return stages.route_only(self.logical, self.target, self.representative.seed)

    @cached_property
    def raw_translation(self) -> QuantumCircuit:
        if self._parent is not None:
            return self._parent.raw_translation
        return pipeline.raw_translation(self.logical, self.target)
