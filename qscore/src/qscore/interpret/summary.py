"""Deterministic interpretation before confirmation (specs/05 §5)."""

from __future__ import annotations

from qscore.compile import counts
from qscore.intake.loaders import LoadedCircuit
from qscore.manifest.resolve import ResolvedItem
from qscore.schemas.manifest import ProjectManifest


def render_text(work: list[tuple[ResolvedItem, LoadedCircuit]], manifest: ProjectManifest) -> str:
    """Describe input, intent, defaults, CPU work and excluded simulation/verification."""
    lines = ["Interpretation (CPU scoring and diagnostics):"]
    for resolved, loaded in work:
        item, qc = resolved.item, loaded.circuit
        source = item.source.model_dump(mode="json", exclude_none=True)
        lines.extend(
            [
                f"{item.id}: {source}; {qc.num_qubits} qubits, {counts.size(qc)} operations, "
                f"{counts.measurement_count(qc)} measurements; "
                f"{len(qc.parameters)} unbound parameters.",
                f"  Intent: {item.invariants.intent}; permitted changes: {item.permitted.changes}.",
                f"  Target: {item.target}; objective: {item.objective}.",
                "  CPU metrics across seeds "
                f"{item.execution.transpiler_seeds if item.execution else []}; "
                f"size sweep: {item.size_sweep}.",
            ]
        )
        original = next(c for c in manifest.circuits if c.id == item.id)
        explicit = original.model_dump(mode="json", exclude_unset=True)
        defaults = manifest.defaults.model_dump(mode="json", exclude_unset=True)

        # Mark every leaf supplied by built-ins or model defaults, including nested fields.
        def leaves(value: object, given: object, inherited: object, prefix: str) -> None:
            if isinstance(value, dict):
                for key, val in value.items():
                    leaves(
                        val,
                        given.get(key) if isinstance(given, dict) else None,
                        inherited.get(key) if isinstance(inherited, dict) else None,
                        f"{prefix}.{key}" if prefix else key,
                    )
            elif value is not None and given is None and inherited is None:
                lines.append(f"  {prefix}: {value} (default)")

        leaves(item.model_dump(mode="json", exclude_none=True), explicit, defaults, "")
    lines.append(
        "Not checked: noisy task quality, mirror score, equivalence or improvements. "
        "Simulation metrics are unavailable/skipped; no GPU work is performed."
    )
    return "\n".join(lines)
