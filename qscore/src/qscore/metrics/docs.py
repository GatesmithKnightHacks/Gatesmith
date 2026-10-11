"""Generate `docs/metrics.md` from the metric class docstrings (specs/06-metrics.md §5).

Docstring layout: a plain explanation (first paragraph, the UI tooltip), the precise definition
(middle paragraphs, matching 06 §2), then one paragraph `Unit: <unit>. Reference: <reference>`.
Kind, scope, requirements and version come from the metric's attributes.

Regenerate with ``uv run python -m qscore.metrics.docs > docs/metrics.md``.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass

from qscore.metrics.base import Metric
from qscore.metrics.registry import all_metrics

INTRO = """\
# qscore metrics

qscore scores a quantum circuit on the CPU: it compiles the circuit for a target across several
transpiler seeds, picks a representative compile (best seed by the primary objective; ties by
two-qubit depth, then seed order), and computes the metrics below. Every metric result carries a
`status`: `computed`, `unavailable` (a declared requirement is absent, e.g. no calibration),
`skipped` (not selected, or over budget) or `failed` (an error, with its message).

- **Kinds.** `deterministic` values are exact for the given compile; `heuristic` values are
  approximations with a stated label; `statistical` values come from repeated noisy simulation
  with a 95 % interval; `context` values describe the circuit and are never scored.
- **Scope.** `logical` = the circuit as submitted; `compiled` = the representative compile.
  Counts exclude directives (barriers) everywhere.
- **Score version.** These definitions are score version `qscore-2026.2`; changing one is a
  class A change and bumps the version. The source of truth is `specs/06-metrics.md`.

This file is generated from the metric class docstrings (`src/qscore/metrics/`); do not edit it
by hand.
"""


@dataclass(frozen=True)
class MetricDoc:
    tooltip: str
    definition: str
    unit: str
    reference: str


def parse(metric: Metric) -> MetricDoc:
    """Split a metric class docstring into its parts; a malformed docstring raises ValueError."""
    doc = inspect.getdoc(type(metric)) or ""
    paras = [" ".join(p.split()) for p in doc.split("\n\n") if p.strip()]
    if len(paras) < 3 or not paras[-1].startswith("Unit: ") or ". Reference: " not in paras[-1]:
        raise ValueError(f"metric {metric.id}: docstring needs tooltip, definition, Unit/Reference")
    unit, reference = paras[-1].removeprefix("Unit: ").split(". Reference: ", 1)
    return MetricDoc(paras[0], "\n\n".join(paras[1:-1]), unit, reference)


def render() -> str:
    parts = [INTRO]
    group = None
    for metric in all_metrics().values():
        if metric.group != group:
            group = metric.group
            parts.append(f"## {group.value.capitalize()}\n")
        d = parse(metric)
        requires = ", ".join(sorted(r.value for r in metric.requires)) or "none"
        row = [metric.kind.value, metric.scope, d.unit, requires, metric.version]
        parts.append(
            f"### `{metric.id}`\n\n"
            f"{d.tooltip}\n\n"
            f"{d.definition}\n\n"
            f"| Kind | Scope | Unit | Requires | Version |\n|---|---|---|---|---|\n"
            f"| {' | '.join(row)} |\n\n"
            f"Reference: {d.reference}\n"
        )
    return "\n".join(parts)


if __name__ == "__main__":
    print(render(), end="")
