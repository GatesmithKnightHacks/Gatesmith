"""Golden values of specs/06-metrics.md §4 (spec-approved rows only)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from typing import Any

import pytest
from qiskit import QuantumCircuit
from ruamel.yaml import YAML

from qscore.compile import counts as c
from qscore.compile import pipeline, select, stages
from qscore.compile.pipeline import CompiledResult, CompileSet
from qscore.compile.stages import RoutedResult
from qscore.metrics.base import Outcome
from qscore.metrics.hardware.reliability import reliability_from_ops
from qscore.metrics.hardware.routing import CompileRatio, RoutingOverhead, SwapsInserted
from qscore.metrics.hardware.seeds import SeedSpreadMetric
from qscore.metrics.opportunities.features import EntanglementVariance
from qscore.metrics.opportunities.structure import block_potential
from qscore.schemas.manifest import TargetSpec
from qscore.targets.registry import TargetBundle, get_target

G: dict[str, Any] = YAML(typ="safe").load(Path(__file__).with_name("values.yaml"))


def ghz(n: int) -> QuantumCircuit:
    qc = QuantumCircuit(n)
    qc.h(0)
    for i in range(n - 1):
        qc.cx(i, i + 1)
    return qc


def bell() -> QuantumCircuit:
    qc = QuantumCircuit(2)
    qc.h(0)
    qc.cx(0, 1)
    return qc


def logical_counts(qc: QuantumCircuit) -> dict[str, int]:
    return {
        "width": len(c.active_qubits(qc)),
        "size": c.size(qc),
        "depth": c.depth(qc),
        "two_qubit_count": c.two_qubit_count(qc),
        "two_qubit_depth": c.two_qubit_depth(qc),
        "measurement_count": c.measurement_count(qc),
    }


def test_bell() -> None:
    assert logical_counts(bell()) == G["bell"]


def test_ghz5_logical() -> None:
    got = logical_counts(ghz(5))
    assert {k: got[k] for k in G["ghz5_logical"]} == G["ghz5_logical"]


@dataclass
class Ctx:
    """Minimal ScoringContext for one circuit, one target, the given seeds."""

    logical: QuantumCircuit
    target: TargetBundle
    seeds: list[int]

    @cached_property
    def compile_set(self) -> CompileSet:
        return pipeline.compile_item(self.logical, self.target, self.seeds)

    @cached_property
    def representative(self) -> CompiledResult:
        return select.pick_representative(self.compile_set, "two_qubit_count", "minimize")

    @cached_property
    def all_to_all(self) -> CompileSet:
        return pipeline.compile_all_to_all(self.logical, self.target, self.seeds)

    @cached_property
    def routing_stage(self) -> RoutedResult:
        return stages.route_only(self.logical, self.target, self.representative.seed)

    @cached_property
    def raw_translation(self) -> QuantumCircuit:
        return pipeline.raw_translation(self.logical, self.target)


def value(o: Outcome) -> Any:
    assert o.status == "computed", o
    return o.value


def test_ghz4_entanglement_variance() -> None:
    g = G["ghz4_entanglement"]
    out = EntanglementVariance().compute(
        Ctx(ghz(4), get_target(TargetSpec(backend="line-4")), [11])
    )
    assert list(out.evidence["per_qubit"].values()) == g["per_qubit"]
    assert value(out) == g["variance"]
    assert out.evidence["cv"] == pytest.approx(g["cv"], abs=1e-15)


@pytest.mark.slow
def test_ghz5_line5() -> None:
    g = G["ghz5_line5"]
    ctx = Ctx(ghz(5), get_target(TargetSpec(backend="line-5")), g["seeds"])
    assert value(RoutingOverhead().compute(ctx)) == g["routing_overhead"]
    assert value(SwapsInserted().compute(ctx)) == g["swaps_inserted"]
    assert ctx.representative.two_qubit_count == g["two_qubit_count"]
    assert value(CompileRatio().compute(ctx)) == g["compile_ratio"]
    assert value(SeedSpreadMetric().compute(ctx)) == g["seed_spread"]


def test_reliability_from_ops() -> None:
    g = G["reliability_from_ops"]
    ops = [(n, tuple(q), e) for n, q, e in g["ops"]]
    assert reliability_from_ops(ops) == pytest.approx(g["expected"], abs=g["tol"])


def test_resynthesis_helper() -> None:
    b1 = QuantumCircuit(2)
    b1.cx(0, 1)
    b1.cx(0, 1)
    b2 = QuantumCircuit(2)
    b2.cx(0, 1)
    b2.cx(1, 0)
    b2.cx(0, 1)
    assert block_potential(b1, "cx") == G["resynthesis_cx_cx"]
    assert block_potential(b2, "cx") == G["resynthesis_swap"]


def test_toffoli_count() -> None:
    qc = QuantumCircuit(4)
    qc.ccx(0, 1, 2)
    qc.cx(0, 1)
    qc.ccx(1, 2, 3)
    assert c.toffoli_count(qc) == G["toffoli_ccx_cx_ccx"]


@pytest.mark.slow
def test_ghz5_faketorino_seed11() -> None:
    g = G["ghz5_faketorino_seed11"]
    r = pipeline.compile_item(ghz(5), get_target(TargetSpec(backend="FakeTorino")), [11]).results[0]
    assert (r.two_qubit_count, r.two_qubit_depth, r.depth) == (
        g["two_qubit_count"],
        g["two_qubit_depth"],
        g["depth"],
    )


def test_sbox_oracle_toffoli_count() -> None:
    qasm = Path(__file__).parents[2] / "examples/sbox_oracle/circuits/sbox_layer_4x.qasm"
    qc = QuantumCircuit.from_qasm_file(str(qasm))
    assert c.toffoli_count(qc) == G["sbox_oracle_toffoli_count"]["value"]
