"""Simulation metrics in the MVP build (specs/06-metrics.md §2.4, ChP-0023, ChP-0026).

`sim/` is final product (T19/T20). Until then both metrics are listed in every scorecard with an
explicit status and reason instead of being absent; they never compute a value here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from qscore.metrics.base import Outcome, Requirement, ScoringContext, skipped, unavailable
from qscore.schemas.common import MetricGroup, MetricKind

NOT_BUILT = "simulation is not in the MVP build (ChP-0023)"
_REQUIRES = frozenset({Requirement.COMPILED, Requirement.SIMULATION})


@dataclass(frozen=True)
class SimulatedTaskScore:
    """How well the compiled circuit still does its job under realistic noise (needs GPU
    simulation; not in the MVP build).

    Noisy simulation of the representative compiled circuit under the target's noise model,
    compared with the ideal result; higher is better, in [0, 1]. `known_output`: noisy
    P(bitstring); `distribution`: `hellinger_fidelity(ideal, noisy)`; `expectation`: `1 -
    |E_noisy - E_ideal| / sum|coeff|`. At least 5 trials, value = mean, 95 % t-interval. MVP
    build: `unavailable` ("intent has no task" or "simulation is not in the MVP build
    (ChP-0023)").

    Unit: score. Reference: Qiskit Aer; `hellinger_fidelity` from `qiskit.quantum_info`.
    """

    id: str = "simulated_task_score"
    group: MetricGroup = MetricGroup.RESEARCH
    version: str = "1"
    kind: MetricKind = MetricKind.STATISTICAL
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = _REQUIRES | {Requirement.TASK}
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "expensive"

    def compute(self, ctx: ScoringContext) -> Outcome:
        return unavailable(NOT_BUILT if ctx.has_task else "intent has no task")


@dataclass(frozen=True)
class MirrorScore:
    """How much noise builds up when the circuit runs forwards then backwards; noise
    accumulation, not task quality.

    Probability of returning to |0...0> after the compiled circuit followed by its inverse,
    under noise; same trial and interval rules as `simulated_task_score`. Selected by
    default only for items whose intent has no task; never substituted for
    `simulated_task_score`. MVP build: `unavailable` or `skipped` (ChP-0023, ChP-0026).

    Unit: probability. Reference: Mirror circuits: Proctor et al., Nature Physics 18, 75
    (2022).
    """

    id: str = "mirror_score"
    group: MetricGroup = MetricGroup.RESEARCH
    version: str = "1"
    kind: MetricKind = MetricKind.STATISTICAL
    scope: Literal["logical", "compiled", "both"] = "compiled"
    requires: frozenset[Requirement] = _REQUIRES
    cost_tier: Literal["trivial", "cheap", "moderate", "expensive"] = "expensive"

    def compute(self, ctx: ScoringContext) -> Outcome:
        # Selected by default only for items whose intent has no task (06 §2.4).
        return skipped("not selected") if ctx.has_task else unavailable(NOT_BUILT)
