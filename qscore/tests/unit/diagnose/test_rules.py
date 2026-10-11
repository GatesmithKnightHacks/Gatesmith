"""Rule boundaries and severity (specs/07-diagnostics.md §1-2, §6; ChP-0008 severity)."""

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
    "structure": {
        "group": "opportunities",
        "value": {"commuting_runs": [], "clifford_blocks": [], "linear_function_blocks": []},
    },
    "resynthesis_potential": {
        "group": "opportunities",
        "value": 0,
        "evidence": {"top_blocks": [{"qubits": [1, 2], "current": 3, "saving": 2}]},
    },
    "reliability_heuristic": {
        "group": "hardware",
        "value": 0.9,
        "evidence": {"total_neg_log": 1.0, "top_contributors": {"0-1": 0.1}, "faulty_ops": []},
    },
    "entanglement_variance": {
        "group": "opportunities",
        "value": 0.0,
        "evidence": {"cv": 0.0, "per_qubit": {"0": 1, "1": 1}},
    },
    "scalability": {
        "group": "research",
        "value": {"b_logical": 1.0, "b_compiled": 1.0, "r2_logical": 1.0, "r2_compiled": 1.0},
        "evidence": {
            "per_size": [
                {"qubits": 4, "routing_overhead": 0.1},
                {"qubits": 6, "routing_overhead": 0.1},
                {"qubits": 8, "routing_overhead": 0.1},
            ]
        },
    },
    "scheduled_duration": {
        "group": "hardware",
        "value": 2e-6,
        "evidence": {"ratio_to_median_t2": 0.02, "median_t2_s": 1e-4},
    },
}


def metrics(**overrides: Any) -> dict[str, MetricResult]:
    out = {}
    for mid, fields in BASE.items():
        f = {**fields, **overrides.get(mid, {})}
        if mid == "structure":  # partial structure overrides keep the other keys
            f["value"] = {**fields["value"], **f["value"]}
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
            "evidence": {
                "total_neg_log": 1.0,
                "top_contributors": {"0-1": share, "2": 0.01},
                "faulty_ops": [],
            }
        }
    )
    assert fired(ms).get("D06") == expected


def test_d06_faulty_ops_are_high_with_their_qubits() -> None:
    # ChP-0041: a compiled op the calibration marks faulty (error 1) is a high D06 finding.
    faulty = [{"op": "cz", "qargs": [15, 19], "error": 1.0, "count": 6}]
    ms = metrics(
        reliability_heuristic={
            "value": 0.0,
            "evidence": {"total_neg_log": None, "top_contributors": {}, "faulty_ops": faulty},
        }
    )
    (d06,) = [f for f in evaluate(ms, effective_policy(None)).findings if f.rule == "D06"]
    assert d06.severity == "high"
    assert d06.evidence["faulty_ops"] == faulty
    assert d06.region is not None and d06.region.qubits == [15, 19]


@pytest.mark.parametrize(("cv", "expected"), [(0.49, None), (0.5, "info"), (2.0, "info")])
def test_d08_is_info(cv: float, expected: str | None) -> None:
    ms = metrics(entanglement_variance={"evidence": {"cv": cv, "per_qubit": {"0": 3, "1": 1}}})
    assert fired(ms).get("D08") == expected


@pytest.mark.parametrize(
    ("ratio", "expected"), [(0.49, None), (0.5, "warning"), (0.62, "warning"), (0.625, "high")]
)
def test_d07_ratio_to_t2(ratio: float, expected: str | None) -> None:
    ms = metrics(
        scheduled_duration={"evidence": {"ratio_to_median_t2": ratio, "median_t2_s": 1e-4}}
    )
    assert fired(ms).get("D07") == expected


def test_d07_skipped_when_duration_unavailable() -> None:
    ms = metrics()
    ms["scheduled_duration"] = MetricResult.model_validate(
        {
            "id": "scheduled_duration",
            "group": "hardware",
            "status": "unavailable",
            "reason": "target has no gate durations",
        }
    )
    skipped = {s["rule"]: s["reason"] for s in evaluate(ms, effective_policy(None)).skipped}
    assert "unavailable" in skipped["D07"]


def test_d07_fault_tolerant_profile_suppresses() -> None:
    ms = metrics(scheduled_duration={"evidence": {"ratio_to_median_t2": 0.9, "median_t2_s": 1e-4}})
    pol = effective_policy("fault_tolerant")
    d07 = next(f for f in apply(pol, evaluate(ms, pol).findings) if f.rule == "D07")
    assert d07.suppressed is not None and d07.suppressed.by == "profile"


def test_uncomputed_metric_records_skipped_rule() -> None:
    ms = metrics()
    ms["routing_overhead"] = MetricResult.model_validate(
        {"id": "routing_overhead", "group": "hardware", "status": "unavailable", "reason": "x"}
    )
    skipped = {s["rule"]: s["reason"] for s in evaluate(ms, effective_policy(None)).skipped}
    assert "D01" in skipped and "unavailable" in skipped["D01"]
    assert "D10" in skipped


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


def _block(n_qubits: int, start: int = 0) -> dict[str, Any]:
    return {
        "qubits": list(range(n_qubits)),
        "layers": [0, 3],
        "gate_indices": list(range(start, start + 4)),
        "num_ops": 4,
    }


def _structure(cliff: list[Any], lin: list[Any]) -> dict[str, Any]:
    return {
        "value": {"commuting_runs": [], "clifford_blocks": cliff, "linear_function_blocks": lin}
    }


@pytest.mark.parametrize(
    ("n_qubits", "expected"), [(2, None), (3, "warning"), (9, "warning"), (10, None)]
)
def test_d05_block_size_range_and_fixed_severity(n_qubits: int, expected: str | None) -> None:
    """07 §1-2: 3-9 qubits fire; ChP-0008: always warning."""
    assert fired(metrics(structure=_structure([_block(n_qubits)], []))).get("D05") == expected
    assert fired(metrics(structure=_structure([], [_block(n_qubits)]))).get("D05") == expected


def test_d05_region_and_linear_block_inside_clifford_block_not_repeated() -> None:
    ms = metrics(structure=_structure([_block(4)], [_block(3), _block(5, start=10)]))
    d05 = [f for f in evaluate(ms, effective_policy(None)).findings if f.rule == "D05"]
    assert [f.evidence["block_type"] for f in d05] == ["clifford", "linear_function"]
    assert [f.id for f in d05] == ["D05#1", "D05#2"]
    r = d05[0].region
    assert r is not None and r.scope == "logical" and r.qubits == [0, 1, 2, 3]
    assert r.gate_indices == [0, 1, 2, 3] and d05[0].strategies == ["block_resynthesis"]


def test_d05_skipped_when_structure_unavailable() -> None:
    ms = metrics()
    ms["structure"] = MetricResult.model_validate(
        {
            "id": "structure",
            "group": "opportunities",
            "status": "failed",
            "reason": "boom",
            "error": {"type": "MetricError", "message": "boom"},
        }
    )
    diagnosis = evaluate(ms, effective_policy(None))
    skipped = {s["rule"]: s["reason"] for s in diagnosis.skipped}
    assert "structure" in skipped["D05"] and "failed" in skipped["D05"]
    assert not any(f.rule == "D05" for f in diagnosis.findings)


def test_d05_off_in_qaoa_profile() -> None:
    pol = effective_policy("qaoa")
    out = apply(pol, evaluate(metrics(structure=_structure([_block(4)], [])), pol).findings)
    d05 = next(f for f in out if f.rule == "D05")
    assert d05.suppressed is not None and d05.suppressed.by == "profile"


def test_structure_collects_clifford_and_linear_blocks() -> None:
    """06 §2.3 (b)(c): blocks as CollectCliffords / CollectLinearFunctions collect them."""
    from qiskit import QuantumCircuit

    from qscore.metrics.opportunities.structure import clifford_blocks, linear_function_blocks

    qc = QuantumCircuit(5)
    qc.h(0)  # 0
    qc.cx(0, 1)  # 1
    qc.cx(1, 2)  # 2
    qc.s(2)  # 3
    qc.rz(0.3, 3)  # 4 (not Clifford: cuts blocks on qubit 3)
    qc.cx(2, 3)  # 5
    qc.swap(3, 4)  # 6
    qc.t(0)  # 7
    qc.cx(0, 4)  # 8
    cl = clifford_blocks(qc)
    assert [(b["gate_indices"], b["qubits"]) for b in cl] == [([0, 1, 2, 3, 5, 6], [0, 1, 2, 3, 4])]
    assert cl[0]["layers"] == [0, 5]  # h, cx, cx, s, cx(2,3), swap(3,4)
    lin = linear_function_blocks(qc)
    assert sorted(b["gate_indices"] for b in lin) == [[1, 2], [5, 6, 8]]


def _scal(b_compiled: float | None, overheads: list[float]) -> dict[str, Any]:
    return {
        "value": {
            "b_logical": 1.0,
            "b_compiled": b_compiled,
            "r2_logical": 1.0,
            "r2_compiled": 1.0,
        },
        "evidence": {
            # listed out of qubit order: the rule orders sizes by qubit count
            "per_size": [
                {"qubits": 4 + 2 * i, "routing_overhead": o} for i, o in enumerate(overheads)
            ][::-1]
        },
    }


@pytest.mark.parametrize(
    ("b_compiled", "overheads", "expected"),
    [
        (1.29, [0.1, 0.2, 0.2], None),  # gap 0.29 < 0.3, overhead not strictly rising
        (1.30, [0.1, 0.2, 0.2], "warning"),  # gap at the threshold
        (1.0, [0.1, 0.2, 0.3], "warning"),  # rising across 3 sizes
        (1.0, [0.1, 0.2], None),  # rising, but only 2 sizes
        (1.5, [0.1, 0.2, 0.3], "high"),  # both criteria (ChP-0008)
        (None, [0.3, 0.2, 0.1], None),  # compiled fit absent (ChP-0007), falling overhead
        (None, [0.1, 0.2, 0.3], "warning"),
    ],
)
def test_d09_criteria_and_severity(
    b_compiled: float | None, overheads: list[float], expected: str | None
) -> None:
    assert fired(metrics(scalability=_scal(b_compiled, overheads))).get("D09") == expected


def test_d09_has_no_region_and_skips_without_scalability() -> None:
    ms = metrics(scalability=_scal(1.5, [0.1, 0.2, 0.3]))
    d09 = next(f for f in evaluate(ms, effective_policy(None)).findings if f.rule == "D09")
    assert d09.region is None and d09.evidence["overhead_rising"] is True
    ms["scalability"] = MetricResult.model_validate(
        {
            "id": "scalability",
            "group": "research",
            "status": "unavailable",
            "reason": "no size_sweep",
        }
    )
    skipped = {s["rule"] for s in evaluate(ms, effective_policy(None)).skipped}
    assert "D09" in skipped


def test_d06_faulty_ops_respect_info_rules() -> None:
    import copy

    policy = copy.deepcopy(effective_policy(None))
    policy.severity["info_rules"] = [*policy.severity["info_rules"], "D06"]
    faulty = [{"op": "cz", "qargs": [15, 19], "error": 1.0, "count": 1}]
    ms = metrics(
        reliability_heuristic={
            "value": 0.0,
            "evidence": {"total_neg_log": None, "top_contributors": {}, "faulty_ops": faulty},
        }
    )
    (d06,) = [f for f in evaluate(ms, policy).findings if f.rule == "D06"]
    assert d06.severity == "info"
