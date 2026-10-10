"""Representative compile and seed spread (specs/05-pipeline.md §6)."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Literal

from qscore.compile.pipeline import CompiledResult, CompileSet
from qscore.errors import InvalidInput

SELECTION_POLICY = "min primary; tie: two_qubit_depth, seed order"
PER_SEED_OBJECTIVES = ("two_qubit_count", "two_qubit_depth", "depth")
LOGICAL_OBJECTIVES = ("toffoli_count", "measurement_count", "entanglement_variance")


def pick_representative(
    compile_set: CompileSet, primary: str, direction: Literal["minimize", "maximize"]
) -> CompiledResult:
    """Best seed by the primary objective; ties by two-qubit depth, then seed order.

    Logical objectives (e.g. `toffoli_count`) do not vary per seed and tie on every seed; other
    compiled objectives are not computed per seed yet and are refused rather than ignored.
    """
    if primary not in PER_SEED_OBJECTIVES + LOGICAL_OBJECTIVES:
        raise InvalidInput(
            f"[Q103] objective.primary {primary!r} cannot select a representative seed yet "
            f"(supported: {', '.join(PER_SEED_OBJECTIVES + LOGICAL_OBJECTIVES)})",
            report=None,
        )
    sign = 1 if direction == "minimize" else -1
    order = {r.seed: i for i, r in enumerate(compile_set.results)}

    def key(r: CompiledResult) -> tuple[float, int, int]:
        value = getattr(r, primary) if primary in PER_SEED_OBJECTIVES else 0
        return (sign * value, r.two_qubit_depth, order[r.seed])

    return min(compile_set.results, key=key)


@dataclass(frozen=True)
class SeedSpread:
    minimum: int
    median: float
    maximum: int
    per_seed: dict[int, int]


def spread(compile_set: CompileSet) -> SeedSpread:
    values = {r.seed: r.two_qubit_count for r in compile_set.results}
    v = list(values.values())
    return SeedSpread(min(v), statistics.median(v), max(v), values)
