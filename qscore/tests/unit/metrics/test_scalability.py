"""scalability (specs/06-metrics.md §2.4; ChP-0007 item 5 for zero/degenerate cases)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from qiskit import QuantumCircuit

from qscore.metrics.research.scalability import Scalability, fit_power_law
from qscore.schemas.manifest import SizeSweep, TargetSpec
from qscore.targets.registry import TargetBundle, get_target


def test_fit_recovers_exact_power_law() -> None:
    fit = fit_power_law([(n, 3 * n**2) for n in (2, 4, 8, 16)])
    assert fit["b"] == pytest.approx(2.0) and fit["r2"] == pytest.approx(1.0)
    assert fit["excluded_n"] == []


def test_fit_excludes_zero_counts_and_needs_three_sizes() -> None:
    fit = fit_power_law([(2, 0), (4, 4), (8, 8)])
    assert fit == {"b": None, "r2": None, "excluded_n": [2]}
    fit = fit_power_law([(2, 0), (4, 4), (8, 8), (16, 16)])
    assert fit["b"] == pytest.approx(1.0) and fit["excluded_n"] == [2]


def test_fit_constant_counts_is_exact_zero_slope() -> None:
    fit = fit_power_law([(2, 5), (4, 5), (8, 5)])
    assert fit["b"] == pytest.approx(0.0) and fit["r2"] == 1.0


def ghz(n: int) -> QuantumCircuit:
    qc = QuantumCircuit(n)
    qc.h(0)
    for i in range(n - 1):
        qc.cx(i, i + 1)
    return qc


@dataclass
class Ctx:
    target: TargetBundle
    size_sweep: SizeSweep | None
    rebuild: Callable[[int], QuantumCircuit] | None
    seeds: list[int]


def line8() -> TargetBundle:
    return get_target(TargetSpec(backend="line-8"))


def test_unavailable_without_size_sweep_or_builder() -> None:
    out = Scalability().compute(Ctx(line8(), None, ghz, [11]))  # type: ignore[arg-type]
    assert out.status == "unavailable" and out.reason == "no size_sweep"
    sweep = SizeSweep(arg="n", values=[3, 4, 5])
    out = Scalability().compute(Ctx(line8(), sweep, None, [11]))  # type: ignore[arg-type]
    assert out.status == "unavailable" and "no builder" in str(out.reason)


def test_ghz_on_a_line_scales_like_its_logical_circuit() -> None:
    sweep = SizeSweep(arg="n", values=[3, 4, 5, 6])
    ctx = Ctx(line8(), sweep, ghz, [11, 23, 37, 41])
    out = Scalability().compute(ctx)  # type: ignore[arg-type]
    assert out.status == "computed" and isinstance(out.value, dict)
    rows = out.evidence["per_size"]
    assert [
        (r["n"], r["qubits"], r["logical_two_qubit"], r["compiled_two_qubit"]) for r in rows
    ] == [
        (3, 3, 2, 2),
        (4, 4, 3, 3),
        (5, 5, 4, 4),
        (6, 6, 5, 5),
    ]
    assert all(r["routing_overhead"] == 0.0 for r in rows)
    assert out.evidence["seeds"] == [11, 23, 37]  # the first 3 seeds
    assert out.value["b_logical"] == pytest.approx(out.value["b_compiled"])
