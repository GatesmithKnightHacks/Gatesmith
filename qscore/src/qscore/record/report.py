"""Markdown report from scorecards (specs/03-code-structure.md §3.3; Jinja2 later)."""

from __future__ import annotations

import json
from typing import Any

from qscore.schemas.scorecard import Scorecard

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


def render(cards: list[Scorecard]) -> str:
    lines = ["# qscore report", ""]
    for card in cards:
        lines += [f"## {card.item.id} — {card.status}", ""]
        if card.target and card.compile:
            lines += [
                f"Target **{card.target.name}** ({card.target.num_qubits} qubits, basis "
                f"{', '.join(card.target.basis)}); representative seed "
                f"{card.compile.representative_seed} of {card.compile.seeds} "
                f"({card.compile.selection_policy}).",
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
