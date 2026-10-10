"""scheduled_duration (specs/06-metrics.md §2.2): ALAP critical path, ratio to median T2."""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from functools import cached_property

import pytest
from qiskit import QuantumCircuit

from qscore.compile import counts as c
from qscore.compile import pipeline, select
from qscore.compile.pipeline import CompiledResult, CompileSet
from qscore.metrics.hardware.duration import ScheduledDuration
from qscore.schemas.manifest import TargetSpec
from qscore.targets.registry import TargetBundle, get_target


@dataclass
class Ctx:
    logical: QuantumCircuit
    target: TargetBundle

    @cached_property
    def compile_set(self) -> CompileSet:
        return pipeline.compile_item(self.logical, self.target, [11])

    @cached_property
    def representative(self) -> CompiledResult:
        return select.pick_representative(self.compile_set, "two_qubit_count", "minimize")


def ghz5() -> QuantumCircuit:
    qc = QuantumCircuit(5)
    qc.h(0)
    for i in range(4):
        qc.cx(i, i + 1)
    qc.measure_all()
    return qc


def test_faketorino_matches_qiskit_estimate_and_t2_ratio() -> None:
    bundle = get_target(TargetSpec(backend="FakeTorino", calibration="from_backend"))
    ctx = Ctx(ghz5(), bundle)
    out = ScheduledDuration().compute(ctx)  # type: ignore[arg-type]
    assert out.status == "computed" and out.unit == "s"
    compiled = ctx.representative.circuit
    assert out.value == pytest.approx(compiled.estimate_duration(bundle.target, unit="s"))
    props = bundle.target.qubit_properties
    assert props is not None
    t2 = statistics.median(props[q].t2 for q in c.active_qubits(compiled))
    assert out.evidence["median_t2_s"] == t2
    assert out.evidence["ratio_to_median_t2"] == pytest.approx(out.value / t2)


def test_synthetic_target_is_unavailable() -> None:
    out = ScheduledDuration().compute(Ctx(ghz5(), get_target(TargetSpec(backend="line-5"))))  # type: ignore[arg-type]
    assert out.status == "unavailable" and out.reason == "target has no gate durations"
