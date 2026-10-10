"""Rule boundaries and severity (specs/07-diagnostics.md §1-2, §6; CP-0008 severity)."""

from __future__ import annotations

from typing import Any

import pytest

from qscore.diagnose.policy import apply, effective_policy, rank, thresholds_sha256
from qscore.diagnose.rules import evaluate
from qscore.schemas.scorecard import MetricResult

BASE: dict[str, dict[str, Any]] = {
    "depth": {"group": "resources", "value": 20, "evidence": {"logical": 10}},
    "routing_overhead": {
        "group": "hardware",
        "value": 0.0,
        "evidence": {"top_swap_pairs": {"3-4": 2, "4-5": 1}},
    },
    "seed_spread": {"group": "hardware", "value": 0.0},
    "structure": {"group": "opportunities", "value": {"commuting_runs": []}},
    "resynthesis_potential": {
        "group": "opportunities",
        "value": 0,
        "evidence": {"top_blocks": [{"qubits": [1, 2], "current": 3, "saving": 2}]},
    },
    "reliability_heuristic": {
        "group": "hardware",
        "value": 0.9,
        "evidence": {"total_neg_log": 1.0, "top_contributors": {"0-1": 0.1}},
    },
    "entanglement_variance": {
        "group": "opportunities",
        "value": 0.0,
        "evidence": {"cv": 0.0, "per_qubit": {"0": 1, "1": 1}},
    },
}


def metrics(**overrides: Any) -> dict[str, MetricResult]:
    out = {}
    for mid, fields in BASE.items():
        f = {**fields, **overrides.get(mid, {})}
        out[mid] = MetricResult.model_validate({"id": mid, "status": "computed", **f})
    return out


def fired(ms: dict[str, MetricResult], profile: str | None = None) -> dict[str, str]:
    return {f.rule: f.severity for f in evaluate(ms, effective_policy(profile)).findings}


@pytest.mark.parametrize(
    ("value", "expected"),
    [(0.29, None), (0.30, "warning"), (0.374, "warning"), (0.375, "high"), (0.9, "high")],
)
def test_d01_boundaries(value: float, expected: str | None) -> None:
    assert fired(metrics(routing_overhead={"value": value})).get("D01") == expected


def test_d01_region_from_swap_pairs_and_strategies() -> None:
    run = {"qubits": [0, 1, 2, 3], "layers": [1, 5], "gate_indices": list(range(6)), "num_ops": 6}
    ms = metrics(routing_overhead={"value": 0.5}, structure={"value": {"commuting_runs": [run]}})
    d01 = next(f for f in evaluate(ms, effective_policy(None)).findings if f.rule == "D01")
    assert d01.region is not None and d01.region.qubits == [3, 4, 5]
    assert d01.strategies == ["layout_search", "routing_search", "commutation_aware_routing"]


@pytest.mark.parametrize(("value", "expected"), [(0.14, None), (0.15, "info"), (0.9, "info")])
def test_d02_is_info(value: float, expected: str | None) -> None:
    assert fired(metrics(seed_spread={"value": value})).get("D02") == expected


def _run(ops: int, qubits: int) -> dict[str, Any]:
    return {
        "qubits": list(range(qubits)),
        "layers": [0, ops],
        "gate_indices": list(range(ops)),
        "num_ops": ops,
    }


@pytest.mark.parametrize(
    ("ops", "qubits", "expected"),
    [(5, 4, None), (6, 3, None), (6, 4, "warning"), (8, 5, "high"), (8, 4, "warning")],
)
def test_d03_boundaries_and_min_margin(ops: int, qubits: int, expected: str | None) -> None:
    ms = metrics(structure={"value": {"commuting_runs": [_run(ops, qubits)]}})
    assert fired(ms).get("D03") == expected


def test_d03_qaoa_profile_lowers_min_ops() -> None:
    ms = metrics(structure={"value": {"commuting_runs": [_run(4, 4)]}})
    assert "D03" not in fired(ms) and fired(ms, "qaoa").get("D03") == "warning"


@pytest.mark.parametrize(("value", "expected"), [(0, None), (1, "warning"), (2, "high")])
def test_d04_boundaries(value: int, expected: str | None) -> None:
    assert fired(metrics(resynthesis_potential={"value": value})).get("D04") == expected


@pytest.mark.parametrize(("share", "expected"), [(0.24, None), (0.25, "warning"), (0.3125, "high")])
def test_d06_share(share: float, expected: str | None) -> None:
    ms = metrics(
        reliability_heuristic={
            "evidence": {"total_neg_log": 1.0, "top_contributors": {"0-1": share, "2": 0.01}}
        }
    )
    assert fired(ms).get("D06") == expected


@pytest.mark.parametrize(("cv", "expected"), [(0.49, None), (0.5, "info"), (2.0, "info")])
def test_d08_is_info(cv: float, expected: str | None) -> None:
    ms = metrics(entanglement_variance={"evidence": {"cv": cv, "per_qubit": {"0": 3, "1": 1}}})
    assert fired(ms).get("D08") == expected


def test_uncomputed_metric_records_skipped_rule() -> None:
    ms = metrics()
    ms["routing_overhead"] = MetricResult.model_validate(
        {"id": "routing_overhead", "group": "hardware", "status": "unavailable", "reason": "x"}
    )
    skipped = {s["rule"]: s["reason"] for s in evaluate(ms, effective_policy(None)).skipped}
    assert "D01" in skipped and "unavailable" in skipped["D01"]
    assert {"D05", "D07", "D09", "D10"} <= set(skipped)


def test_profile_off_suppresses_but_keeps_finding() -> None:
    ms = metrics(entanglement_variance={"evidence": {"cv": 1.0, "per_qubit": {"0": 3, "1": 1}}})
    pol = effective_policy("arithmetic")
    out = apply(pol, evaluate(ms, pol).findings)
    d08 = next(f for f in out if f.rule == "D08")
    assert d08.suppressed is not None and d08.suppressed.by == "profile"


def test_manifest_ignore_suppresses() -> None:
    pol = effective_policy(None, {"D04": "known"})
    out = apply(pol, evaluate(metrics(resynthesis_potential={"value": 3}), pol).findings)
    assert out[0].suppressed is not None and out[0].suppressed.by == "manifest"


def test_rank_by_severity_then_rule() -> None:
    ms = metrics(
        routing_overhead={"value": 0.31},
        resynthesis_potential={"value": 5},
        seed_spread={"value": 0.5},
    )
    assert [f.rule for f in rank(evaluate(ms, effective_policy(None)).findings)] == [
        "D04",
        "D01",
        "D02",
    ]


def test_thresholds_hash_is_stable_hex() -> None:
    assert len(thresholds_sha256()) == 64


def test_commuting_run_is_cut_by_a_non_diagonal_gate() -> None:
    """Audit 2026-10-10: h(1) between cz(0,1) and cz(1,2) must split the run (06 §2.3a)."""
    from qiskit import QuantumCircuit

    from qscore.metrics.opportunities.structure import commuting_runs

    qc = QuantumCircuit(3)
    qc.cz(0, 1)
    qc.h(1)
    qc.cz(0, 2)
    qc.cz(1, 2)
    runs = sorted(r["gate_indices"] for r in commuting_runs(qc))
    assert runs == [[0], [2, 3]]
