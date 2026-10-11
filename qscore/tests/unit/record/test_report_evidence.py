"""report.md shows the evidence 07 §1 lists for each rule ("Evidence shown" column)."""

from __future__ import annotations

from typing import Any

import pytest

from qscore.record.report import evidence_line
from qscore.schemas.scorecard import Finding

CASES: list[tuple[str, dict[str, Any], str]] = [
    (
        "D01",
        {
            "routing_overhead": 0.42,
            "routed_two_qubit": 50,
            "all_to_all_two_qubit": 29,
            "swaps_inserted": 7,
            "top_swap_pairs": {"3-4": 4, "4-5": 2},
        },
        "Routing adds 42% of the two-qubit gates (50 routed vs 29 all-to-all; 7 SWAPs, most on "
        "3-4 (4), 4-5 (2)).",
    ),
    (
        "D02",
        {"seed_spread": 0.2, "min": 10, "median": 12, "max": 14},
        "Two-qubit count varies 20% across seeds (min 10, median 12, max 14).",
    ),
    (
        "D06",
        {"faulty_ops": [{"op": "cz", "qargs": [15, 19], "error": 1.0, "count": 6}]},
        "The compiled circuit uses 1 operation(s) the target's calibration marks faulty "
        "(error 1): cz [15, 19] x6; reliability is 0 on this calibration snapshot.",
    ),
    (
        "D06",
        {"contributor": "0-1", "share": 0.5, "top_contributors": {"0-1": 0.5}, "faulty_ops": []},
        "0-1 carries 50% of the circuit's -log(reliability) (top: 0-1 (0.5)).",
    ),
    (
        "D09",
        {"overhead_rising": True, "exponent_gap": 0.4},
        "Routing overhead rises at every sweep size; compiled size grows with exponent +0.40 "
        "over logical.",
    ),
]


@pytest.mark.parametrize(("rule", "evidence", "expected"), CASES)
def test_evidence_line(rule: str, evidence: dict[str, Any], expected: str) -> None:
    f = Finding(
        id=f"{rule}-1",
        rule=rule,
        title="t",
        severity="warning",
        confidence="rule_fired",
        evidence=evidence,
    )
    assert evidence_line(f) == expected


def test_rule_without_summary() -> None:
    f = Finding(id="D10-1", rule="D10", title="t", severity="high", confidence="measured")
    assert evidence_line(f) is None
