"""Diagnostic rules (specs/07-diagnostics.md §1-2; severity per ChP-0008, regions per ChP-0013).

Each rule reads computed metric results and returns findings. A rule whose metric is not
`computed` returns no finding and is recorded in `skipped` with the reason (never silent).
Evaluates D01-D09; D10 is final product (ChP-0023).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import pairwise
from typing import Any

from qscore.diagnose.policy import Policy
from qscore.schemas.common import FindingSeverity, Status
from qscore.schemas.scorecard import Finding, MetricResult, Region, Threshold

TITLES = {
    "D01": "Routing-dominated",
    "D02": "Seed-sensitive",
    "D03": "Commuting block",
    "D04": "Resynthesizable blocks",
    "D05": "Clifford or linear block",
    "D06": "Reliability hot spot",
    "D07": "Decoherence risk",
    "D08": "Uneven entanglement",
    "D09": "Poor scaling",
    "D10": "Low task score",
}
NOT_IN_SLICE = {
    "D10": "simulation metrics are final product (ChP-0023)",
}


@dataclass
class Diagnosis:
    findings: list[Finding] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)


def severity(rule: str, margin: float, policy: Policy) -> FindingSeverity:
    if rule in policy.severity["info_rules"]:
        return FindingSeverity.INFO
    return (
        FindingSeverity.HIGH
        if margin >= policy.severity["high_margin"]
        else FindingSeverity.WARNING
    )


def _ok(metrics: dict[str, MetricResult], *ids: str) -> str | None:
    for i in ids:
        m = metrics.get(i)
        if m is None or m.status is not Status.COMPUTED:
            return f"metric {i} not computed ({'absent' if m is None else m.status})"
    return None


def _num(m: MetricResult) -> float:
    if not isinstance(m.value, (int, float)):
        raise TypeError(f"metric {m.id}: expected a number, got {type(m.value).__name__}")
    return float(m.value)


def _dict(m: MetricResult) -> dict[str, Any]:
    if not isinstance(m.value, dict):
        raise TypeError(f"metric {m.id}: expected a dict, got {type(m.value).__name__}")
    return m.value


def _finding(
    rule: str,
    n: int,
    sev: FindingSeverity,
    threshold: Threshold | None,
    evidence: dict[str, Any],
    region: Region | None,
    strategies: list[str],
) -> Finding:
    return Finding(
        id=f"{rule}#{n}",
        rule=rule,
        title=TITLES[rule],
        severity=sev,
        confidence="rule_fired",
        threshold=threshold,
        evidence=evidence,
        region=region,
        strategies=strategies,
        suppressed=None,
    )


def _full_layers(metrics: dict[str, MetricResult], logical: bool) -> tuple[int, int]:
    """Layer hull of the whole circuit in the region's scope. D01, D04, D06 and D08 regions
    localize qubits only: ChP-0013 forbids mapping gate positions across scopes, and the metrics
    record no per-block layer range yet, so the range covers every layer (never a guess)."""
    d = metrics["depth"]
    depth = int(d.evidence["logical"]) if logical and d.evidence else int(_num(d))
    return (0, max(depth - 1, 0))


def _d05(structure: dict[str, Any], p: dict[str, Any]) -> list[Finding]:
    """One finding per Clifford or linear-function block of min_qubits..max_qubits qubits.
    A linear block inside a reported Clifford block is the same opportunity (cx/swap are
    Clifford) and is not reported twice. Severity is always `warning` (ChP-0008)."""
    lo, hi = p["min_qubits"], p["max_qubits"]
    found: list[Finding] = []
    covered: set[int] = set()
    for kind, key in (
        ("clifford", "clifford_blocks"),
        ("linear_function", "linear_function_blocks"),
    ):
        for block in structure[key]:
            n = len(block["qubits"])
            if not lo <= n <= hi or (
                kind == "linear_function" and covered >= set(block["gate_indices"])
            ):
                continue
            if kind == "clifford":
                covered |= set(block["gate_indices"])
            found.append(
                _finding(
                    "D05",
                    len(found) + 1,
                    FindingSeverity.WARNING,
                    Threshold(name="min_qubits", value=lo, margin=(n - lo) / lo),
                    {"block_type": kind, "num_qubits": n, "num_ops": block["num_ops"]},
                    Region(
                        scope="logical",
                        qubits=block["qubits"],
                        layers=tuple(block["layers"]),
                        gate_indices=block["gate_indices"],
                    ),
                    ["block_resynthesis"],
                )
            )
    return found


def _d09(fit: dict[str, Any], per_size: list[dict[str, Any]], p: dict[str, Any]) -> Finding | None:
    """Routing overhead strictly rising across >= min_sizes sizes (ordered by qubit count), or
    b_compiled - b_logical >= exponent_gap_min (both fits present, ChP-0007). Severity `high`
    when both criteria hold, else `warning` (ChP-0008). No region; no request (07 §1)."""
    rows = sorted(per_size, key=lambda r: r["qubits"])
    overheads = [float(r["routing_overhead"]) for r in rows]
    rising = len(rows) >= p["min_sizes"] and all(a < b for a, b in pairwise(overheads))
    gap = (
        None
        if fit["b_compiled"] is None or fit["b_logical"] is None
        else float(fit["b_compiled"]) - float(fit["b_logical"])
    )
    thr = p["exponent_gap_min"]
    steep = gap is not None and gap >= thr
    if not (rising or steep):
        return None
    return _finding(
        "D09",
        1,
        FindingSeverity.HIGH if rising and steep else FindingSeverity.WARNING,
        None
        if gap is None
        else Threshold(name="exponent_gap", value=thr, margin=(gap - thr) / thr),
        {
            "overhead_rising": rising,
            "exponent_gap": gap,
            **fit,
            "per_size": rows,
        },
        None,
        ["routing_search", "commutation_aware_routing"],
    )


def evaluate(metrics: dict[str, MetricResult], policy: Policy) -> Diagnosis:
    out = Diagnosis()
    t = policy.thresholds
    commuting = False

    # D03 first: D01's strategies depend on it.
    d03: list[Finding] = []
    if (why := _ok(metrics, "structure")) is not None:
        out.skipped.append({"rule": "D03", "reason": why})
    else:
        p = t["D03"]
        runs = _dict(metrics["structure"]).get("commuting_runs", [])
        for run in runs:
            if run["num_ops"] >= p["min_ops"] and len(run["qubits"]) >= p["min_qubits"]:
                margin = min(
                    (run["num_ops"] - p["min_ops"]) / p["min_ops"],
                    (len(run["qubits"]) - p["min_qubits"]) / p["min_qubits"],
                )
                region = Region(
                    scope="logical",
                    qubits=run["qubits"],
                    layers=tuple(run["layers"]),
                    gate_indices=run["gate_indices"],
                )
                d03.append(
                    _finding(
                        "D03",
                        len(d03) + 1,
                        severity("D03", margin, policy),
                        Threshold(name="min_ops", value=p["min_ops"], margin=margin),
                        {"num_ops": run["num_ops"], "num_qubits": len(run["qubits"])},
                        region,
                        ["commutation_aware_routing"],
                    )
                )
        commuting = bool(d03)

    if (why := _ok(metrics, "routing_overhead", "depth")) is not None:
        out.skipped.append({"rule": "D01", "reason": why})
    else:
        m, thr = metrics["routing_overhead"], t["D01"]["routing_overhead_min"]
        v = _num(m)
        if v >= thr:
            ev = m.evidence or {}
            pairs = ev.get("top_swap_pairs", {})
            qubits = sorted({int(q) for k in pairs for q in k.split("-")})
            region = Region(scope="compiled", qubits=qubits, layers=_full_layers(metrics, False))
            strategies = ["layout_search", "routing_search"] + (
                ["commutation_aware_routing"] if commuting else []
            )
            margin = (v - thr) / thr
            out.findings.append(
                _finding(
                    "D01",
                    1,
                    severity("D01", margin, policy),
                    Threshold(name="routing_overhead", value=thr, margin=margin),
                    {"routing_overhead": v, **ev},
                    region if qubits else None,
                    strategies,
                )
            )

    if (why := _ok(metrics, "seed_spread")) is not None:
        out.skipped.append({"rule": "D02", "reason": why})
    else:
        m, thr = metrics["seed_spread"], t["D02"]["seed_spread_min"]
        v = _num(m)
        if v >= thr:
            margin = (v - thr) / thr
            out.findings.append(
                _finding(
                    "D02",
                    1,
                    severity("D02", margin, policy),
                    Threshold(name="seed_spread", value=thr, margin=margin),
                    {"seed_spread": v, **(m.evidence or {})},
                    None,
                    [],
                )
            )

    out.findings.extend(d03)

    if (why := _ok(metrics, "resynthesis_potential", "depth")) is not None:
        out.skipped.append({"rule": "D04", "reason": why})
    else:
        m, thr = metrics["resynthesis_potential"], t["D04"]["resynthesis_potential_min"]
        v = _num(m)
        if v >= thr:
            top = (m.evidence or {}).get("top_blocks", [])
            d04_region: Region | None = (
                Region(
                    scope="compiled", qubits=top[0]["qubits"], layers=_full_layers(metrics, False)
                )
                if top
                else None
            )
            margin = (v - thr) / thr
            out.findings.append(
                _finding(
                    "D04",
                    1,
                    severity("D04", margin, policy),
                    Threshold(name="resynthesis_potential", value=thr, margin=margin),
                    {"resynthesis_potential": v, "top_blocks": top},
                    d04_region,
                    ["block_resynthesis"],
                )
            )

    if (why := _ok(metrics, "structure")) is not None:
        out.skipped.append({"rule": "D05", "reason": why})
    else:
        out.findings.extend(_d05(_dict(metrics["structure"]), t["D05"]))

    if (why := _ok(metrics, "reliability_heuristic", "depth")) is not None:
        out.skipped.append({"rule": "D06", "reason": why})
    else:
        ev = metrics["reliability_heuristic"].evidence or {}
        thr = t["D06"]["share_min"]
        if ev["faulty_ops"]:  # the circuit uses ops the calibration marks unusable (ChP-0041)
            faulty = ev["faulty_ops"]
            out.findings.append(
                _finding(
                    "D06",
                    1,
                    FindingSeverity.INFO
                    if "D06" in policy.severity["info_rules"]
                    else FindingSeverity.HIGH,
                    Threshold(name="faulty_ops", value=0, margin=float(len(faulty))),
                    {"faulty_ops": faulty, "top_contributors": ev["top_contributors"]},
                    Region(
                        scope="compiled",
                        qubits=sorted({q for f in faulty for q in f["qargs"]}),
                        layers=_full_layers(metrics, False),
                    ),
                    ["noise_aware_layout"],
                )
            )
        elif (total := float(ev["total_neg_log"])) > 0:
            key, share_raw = max(ev["top_contributors"].items(), key=lambda kv: (kv[1], kv[0]))
            share = share_raw / total
            if share >= thr:
                margin = (share - thr) / thr
                region = Region(
                    scope="compiled",
                    qubits=[int(q) for q in key.split("-")],
                    layers=_full_layers(metrics, False),
                )
                out.findings.append(
                    _finding(
                        "D06",
                        1,
                        severity("D06", margin, policy),
                        Threshold(name="share", value=thr, margin=margin),
                        {
                            "contributor": key,
                            "share": share,
                            "top_contributors": ev["top_contributors"],
                        },
                        region,
                        ["noise_aware_layout"],
                    )
                )

    if (why := _ok(metrics, "scheduled_duration")) is not None:
        out.skipped.append({"rule": "D07", "reason": why})
    else:
        ev = metrics["scheduled_duration"].evidence or {}
        ratio, thr = float(ev["ratio_to_median_t2"]), t["D07"]["ratio_to_t2_min"]
        if ratio >= thr:
            margin = (ratio - thr) / thr
            out.findings.append(
                _finding(
                    "D07",
                    1,
                    severity("D07", margin, policy),
                    Threshold(name="ratio_to_median_t2", value=thr, margin=margin),
                    {
                        "scheduled_duration_s": _num(metrics["scheduled_duration"]),
                        "median_t2_s": ev["median_t2_s"],
                        "ratio_to_median_t2": ratio,
                    },
                    None,
                    ["routing_search", "commutation_aware_routing"],
                )
            )

    if (why := _ok(metrics, "entanglement_variance", "depth")) is not None:
        out.skipped.append({"rule": "D08", "reason": why})
    else:
        ev = metrics["entanglement_variance"].evidence or {}
        cv, thr = float(ev["cv"]), t["D08"]["cv_min"]
        if cv >= thr:
            per = {int(k): v for k, v in ev["per_qubit"].items()}
            busiest = sorted(q for q, v in per.items() if v == max(per.values()))
            margin = (cv - thr) / thr
            out.findings.append(
                _finding(
                    "D08",
                    1,
                    severity("D08", margin, policy),
                    Threshold(name="cv", value=thr, margin=margin),
                    {"cv": cv, "per_qubit": ev["per_qubit"]},
                    Region(scope="logical", qubits=busiest, layers=_full_layers(metrics, True)),
                    ["layout_search"],
                )
            )

    if (why := _ok(metrics, "scalability")) is not None:
        out.skipped.append({"rule": "D09", "reason": why})
    else:
        m = metrics["scalability"]
        if (f := _d09(_dict(m), (m.evidence or {})["per_size"], t["D09"])) is not None:
            out.findings.append(f)

    for rule, reason in NOT_IN_SLICE.items():
        out.skipped.append({"rule": rule, "reason": reason})
    return out
