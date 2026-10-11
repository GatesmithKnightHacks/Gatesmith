"""Markdown report from scorecards (specs/03-code-structure.md §3.3; Jinja2 later)."""

from __future__ import annotations

import json
from typing import Any

from qscore.schemas.scorecard import Finding, Scorecard

GROUPS = ("resources", "hardware", "opportunities", "research")
STATUS_ICON = {
    "computed": "✔ computed",
    "skipped": "⏭ skipped",
    "unavailable": "∅ unavailable",
    "failed": "✖ FAILED",
}
SEVERITY_ICON = {"high": "▲ high", "warning": "■ warning", "info": "● info"}


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False)
        return text if len(text) <= 80 else text[:77] + "…"
    return "—" if value is None else str(value)


def _pairs(counts: dict[str, Any], n: int = 3) -> str:
    return ", ".join(
        f"{k} ({v:.3g})" if isinstance(v, float) else f"{k} ({v})"
        for k, v in list(counts.items())[:n]
    )


def evidence_line(f: Finding) -> str | None:
    """One sentence of the evidence 07 §1 lists for the rule ("Evidence shown"); None for rules
    without a summary (D10, not built yet)."""
    ev = f.evidence
    if f.rule == "D01":
        return (
            f"Routing adds {ev['routing_overhead']:.0%} of the two-qubit gates "
            f"({ev['routed_two_qubit']} routed vs {ev['all_to_all_two_qubit']} all-to-all; "
            f"{ev['swaps_inserted']} SWAPs, most on {_pairs(ev['top_swap_pairs']) or '—'})."
        )
    if f.rule == "D02":
        return (
            f"Two-qubit count varies {ev['seed_spread']:.0%} across seeds "
            f"(min {ev['min']}, median {ev['median']}, max {ev['max']})."
        )
    if f.rule == "D03":
        return f"A commuting run of {ev['num_ops']} two-qubit ops on {ev['num_qubits']} qubits."
    if f.rule == "D04":
        blocks = "; ".join(
            f"qubits {b['qubits']}: {b['current']} → {b['current'] - b['saving']}"
            for b in ev["top_blocks"][:3]
        )
        return f"{ev['resynthesis_potential']} two-qubit gates removable by resynthesis ({blocks})."
    if f.rule == "D05":
        return (
            f"A {ev['block_type']} block of {ev['num_qubits']} qubits and {ev['num_ops']} ops "
            "(synthesizable as a whole)."
        )
    if f.rule == "D06" and "faulty_ops" in ev and ev["faulty_ops"]:
        ops = ev["faulty_ops"]
        shown = ", ".join(f"{o['op']} {o['qargs']} x{o['count']}" for o in ops[:5])
        more = f" and {len(ops) - 5} more" if len(ops) > 5 else ""
        return (
            f"The compiled circuit uses {len(ops)} operation(s) the target's calibration marks "
            f"faulty (error 1): {shown}{more}; reliability is 0 on this calibration snapshot."
        )
    if f.rule == "D06":
        return (
            f"{ev['contributor']} carries {ev['share']:.0%} of the circuit's -log(reliability) "
            f"(top: {_pairs(ev['top_contributors'])})."
        )
    if f.rule == "D07":
        return (
            f"Scheduled duration {ev['scheduled_duration_s']:.3g} s is "
            f"{ev['ratio_to_median_t2']:.2g}x the median T2 ({ev['median_t2_s']:.3g} s)."
        )
    if f.rule == "D08":
        cv = ev["cv"]
        return (
            f"Two-qubit gates are spread unevenly over qubits (coefficient of variation {cv:.2f})."
        )
    if f.rule == "D09":
        parts = []
        if ev["overhead_rising"]:
            parts.append("routing overhead rises at every sweep size")
        if ev["exponent_gap"] is not None:
            parts.append(
                f"compiled size grows with exponent {ev['exponent_gap']:+.2f} over logical"
            )
        return "; ".join(parts).capitalize() + "."
    return None


def render(cards: list[Scorecard]) -> str:
    lines = ["# qscore report", ""]
    for card in cards:
        lines += [f"## {card.item.id} — {card.status}", ""]
        if card.target and card.compile:
            rep = card.compile.representative_seed
            chosen = (
                f"representative seed {rep} of {card.compile.seeds} "
                f"({card.compile.selection_policy})"
                if rep is not None
                else f"no representative seed could be chosen among {card.compile.seeds}"
            )
            lines += [
                f"Target **{card.target.name}** ({card.target.num_qubits} qubits, basis "
                f"{', '.join(card.target.basis)}); {chosen}.",
                "",
            ]
        for group in GROUPS:
            rows = [m for m in card.metrics if m.group == group]
            if not rows:
                continue
            lines += [
                f"### {group.capitalize()}",
                "",
                "| Metric | Value | Unit | Status |",
                "|---|---|---|---|",
            ]
            for m in rows:
                detail = m.reason or (m.error.message if m.error else "")
                status = STATUS_ICON[m.status] + (f" ({detail})" if detail else "")
                lines.append(f"| `{m.id}` | {_fmt(m.value)} | {m.unit or ''} | {status} |")
            lines.append("")
        lines += reference_lines(card)
        lines += ["### Findings", ""]
        if not card.findings:
            lines.append("No rule fired.")
        for f in card.findings:
            where = f" — {f.region.scope} qubits {f.region.qubits}" if f.region else ""
            sup = (
                f" _(suppressed by {f.suppressed.by}: {f.suppressed.reason})_"
                if f.suppressed
                else ""
            )
            lines.append(
                f"- **{f.rule} {f.title}** · {SEVERITY_ICON[f.severity]}{where}; "
                f"strategies: {', '.join(f.strategies) or '—'}{sup}"
            )
            if (why := evidence_line(f)) is not None:
                lines.append(f"  {why}")
        extra = card.model_dump(mode="json").get("x-diagnose", {})
        if extra.get("skipped_rules"):
            lines += [
                "",
                "Rules not evaluated: "
                + "; ".join(f"{s['rule']} ({s['reason']})" for s in extra["skipped_rules"]),
            ]
        lines += [
            "",
            "_Bitstrings use Qiskit's order: qubit 0 is the rightmost bit. "
            "Reliability is a calibration-based heuristic, not a success probability._",
            "",
        ]
    return "\n".join(lines)


def reference_lines(card: Scorecard) -> list[str]:
    """Render the descriptive comparison without judging different algorithms."""
    reference = card.model_dump(mode="json").get("x-reference", {})
    lines = ["### Public reference circuits", ""]
    benchmark = reference.get("benchpress")
    if benchmark:
        if "error" in benchmark:
            lines.append(f"Benchpress convention FAILED: {benchmark['error']}")
        else:
            lines.append(
                f"Benchpress convention: {benchmark['gate_count_2q']} {benchmark['two_q_gate']} "
                f"gates, {benchmark['depth_2q']} two-qubit layers; optimization level 2, "
                f"seed {benchmark['seed']}. Benchpress leaves its seed unset; qscore fixes it."
            )
        lines.append("")
    if reference.get("corpus") is None:
        lines += [f"no reference corpus for {card.item.score_version}", ""]
    elif "placement" not in reference:
        target = card.target.name if card.target else "this target"
        lines += [f"No reference corpus coverage for {target}.", ""]
    else:
        values = {m.id: m.value for m in card.metrics}
        target = card.target.name if card.target else "this target"
        for metric, entry in reference["placement"].items():
            n, band = entry["n"], entry["band"]
            if "percentile" in entry:
                position = round(entry["percentile"])
                suffix = (
                    "th"
                    if 10 <= position % 100 <= 20
                    else {1: "st", 2: "nd", 3: "rd"}.get(position % 10, "th")
                )
                lines.append(
                    f"- `{metric}`: {_fmt(values[metric])} · {position}{suffix} percentile of "
                    f"{n} reference circuits ({band} qubits, {target}); "
                    f"median {_fmt(entry['median'])}."
                )
            else:
                lines.append(f"- `{metric}`: {entry['reason']} ({n}, {band} qubits, {target}).")
        lines += [
            "",
            "Compared with public benchmark circuits of similar width. Different "
            "algorithms are not directly comparable; percentiles are descriptive, "
            "not quality ratings.",
            "",
        ]
    return lines
