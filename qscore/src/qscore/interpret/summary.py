"""Deterministic interpretation before confirmation (specs/05 §5)."""

from __future__ import annotations

from collections import Counter

from qiskit import QuantumCircuit

from qscore.compile import counts
from qscore.intake.loaders import LoadedCircuit
from qscore.interpret import templates as t
from qscore.manifest.resolve import ResolvedItem
from qscore.schemas.manifest import ProjectManifest


def gate_counts(qc: QuantumCircuit) -> dict[str, int]:
    """Gate counts by name, sorted by name; directives and measurements are excluded."""
    names = Counter(
        inst.operation.name
        for inst in qc.data
        if not counts.is_directive(inst) and inst.operation.name != "measure"
    )
    return dict(sorted(names.items()))


HEADER = "Interpretation (CPU scoring and diagnostics):"


def render_text(work: list[tuple[ResolvedItem, LoadedCircuit]], manifest: ProjectManifest) -> str:
    """Describe input, intent, defaults, CPU work and excluded simulation/verification."""
    blocks = render_items(work, manifest)
    return "\n".join([HEADER, *blocks.values(), t.NOT_CHECKED])


def render_item_text(block: str) -> str:
    """One item's interpretation on its own (a scorecard's `x-interpretation`, ChP-0028)."""
    return "\n".join([HEADER, block, t.NOT_CHECKED])


def render_items(
    work: list[tuple[ResolvedItem, LoadedCircuit]], manifest: ProjectManifest
) -> dict[str, str]:
    """Item id → that item's interpretation block, in manifest order."""
    blocks: dict[str, str] = {}
    for resolved, loaded in work:
        lines: list[str] = []
        item, qc = resolved.item, loaded.circuit
        assert item.target is not None and item.execution is not None
        groups = item.diagnose.groups if item.diagnose and item.diagnose.groups else []
        lines.extend(
            [
                f"{item.id}:",
                f"  {t.source_sentence(item)}",
                "  "
                + t.circuit_sentence(
                    qc.num_qubits,
                    gate_counts(qc),
                    counts.measurement_count(qc),
                    len(qc.parameters),
                ),
                f"  {t.intent_sentence(item)}",
                f"  {t.permitted_sentence(item)}",
                f"  {t.target_sentence(item.target)}",
                f"  {t.objective_sentence(item)}",
                "  "
                + t.compute_sentence(
                    list(item.execution.transpiler_seeds or []), list(groups), item.size_sweep
                ),
            ]
        )
        original = next(c for c in manifest.circuits if c.id == item.id)
        explicit = original.model_dump(mode="json", exclude_unset=True)
        defaults = manifest.defaults.model_dump(mode="json", exclude_unset=True)

        _defaults(item.model_dump(mode="json", exclude_none=True), explicit, defaults, "", lines)
        blocks[item.id] = "\n".join(lines)
    return blocks


def _defaults(value: object, given: object, inherited: object, prefix: str, out: list[str]) -> None:
    """Mark every leaf supplied by built-ins or model defaults, including nested fields."""
    if isinstance(value, dict):
        for key, val in value.items():
            _defaults(
                val,
                given.get(key) if isinstance(given, dict) else None,
                inherited.get(key) if isinstance(inherited, dict) else None,
                f"{prefix}.{key}" if prefix else key,
                out,
            )
    elif value is not None and given is None and inherited is None:
        out.append(f"  {prefix}: {_value(value)} (default)")


def _value(value: object) -> str:
    """A default's value as plain text (lists comma-separated, mappings as key=value)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return t.listing([_value(v) for v in value])
    if isinstance(value, dict):
        return "{" + ", ".join(f"{k}={_value(v)}" for k, v in value.items()) + "}"
    return str(value)
