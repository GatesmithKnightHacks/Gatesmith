"""Fixed sentence templates for the interpretation (specs/05 §5): no generated prose, so the
summary doubles as alt text for the circuit drawing."""

from __future__ import annotations

from qscore.schemas.manifest import (
    BuilderSource,
    CalibrationFile,
    CircuitItem,
    Constraint,
    QasmSource,
    SizeSweep,
    TargetSpec,
)

INTENT_SENTENCES: dict[str, str] = {
    "exact_unitary": "The circuit's full unitary must be preserved {phase}.",
    "reversible_function": "The circuit's classical reversible function must be preserved.",
    "known_output": "The circuit must output bitstring {bitstring} with probability at least "
    "{min_probability}.",
    "distribution": "The circuit's output distribution must be preserved within tolerance "
    "{tolerance}.",
    "expectation": "The expectation value of {observable} must be preserved within tolerance "
    "{tolerance}.",
    "structure_only": "Only the circuit's structure is scored; its function is not checked.",
}


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def listing(values: list[str]) -> str:
    return ", ".join(values) if values else "none"


def source_sentence(item: CircuitItem) -> str:
    source = item.source
    if isinstance(source, QasmSource):
        return f"Source: OpenQASM file {source.qasm}."
    assert isinstance(source, BuilderSource)
    args = listing([f"{k}={v}" for k, v in source.args.items()])
    params = (
        f"; angles bound from {source.parameters.file}" if source.parameters is not None else ""
    )
    return f"Source: builder {source.builder} with arguments {args}{params}."


def circuit_sentence(
    num_qubits: int, gate_counts: dict[str, int], measurements: int, unbound: int
) -> str:
    gates = listing([f"{name} {n}" for name, n in gate_counts.items()])
    return (
        f"Circuit: {plural(num_qubits, 'qubit')}, {plural(measurements, 'measurement')}, "
        f"{plural(unbound, 'unbound parameter')}; gate counts: {gates}."
    )


def intent_sentence(item: CircuitItem) -> str:
    inv = item.invariants
    fields = inv.task.model_dump() if inv.task is not None else {}
    fields["phase"] = (
        "including global phase" if inv.global_phase == "exact" else "up to global phase"
    )
    return "Intent: " + INTENT_SENTENCES[inv.intent].format(**fields)


def permitted_sentence(item: CircuitItem) -> str:
    return f"Permitted changes: {listing(list(item.permitted.changes))}."


def target_sentence(spec: TargetSpec) -> str:
    if spec.backend is not None:
        shape = f"backend {spec.backend}"
    else:
        assert spec.coupling_map is not None and spec.basis_gates is not None
        shape = (
            f"custom target with {plural(len(spec.coupling_map), 'coupling edge')} and basis "
            f"{listing(spec.basis_gates)}"
        )
    cal = spec.calibration
    if isinstance(cal, CalibrationFile):
        calibration = f"calibration from {cal.file}"
    elif cal == "from_backend":
        calibration = "calibration from the backend"
    elif cal == "none":
        calibration = "no calibration"
    else:
        calibration = "calibration not stated"
    return f"Target: {shape}; {calibration}."


def constraint_text(c: Constraint) -> str:
    if c.max_vs_baseline is not None:
        return f"{c.metric} at most {c.max_vs_baseline:g} times the baseline"
    if c.min_vs_baseline is not None:
        return f"{c.metric} at least {c.min_vs_baseline:g} times the baseline"
    if c.max is not None:
        return f"{c.metric} at most {c.max:g}"
    assert c.min is not None
    return f"{c.metric} at least {c.min:g}"


def objective_sentence(item: CircuitItem) -> str:
    obj = item.objective
    assert obj is not None
    return (
        f"Objective: {obj.direction} {obj.primary}; constraints: "
        f"{listing([constraint_text(c) for c in obj.constraints])}; also reported: "
        f"{listing(obj.report)}."
    )


def compute_sentence(seeds: list[int], groups: list[str], sweep: SizeSweep | None) -> str:
    sweep_text = (
        "no size sweep"
        if sweep is None
        else f"size sweep over {sweep.arg} = {listing([str(v) for v in sweep.values])}"
    )
    return (
        f"Planned compute (CPU): level-3 compile on {plural(len(seeds), 'seed')} "
        f"({listing([str(s) for s in seeds])}); metric groups "
        f"{listing(groups) if groups else 'all'}; {sweep_text}."
    )


NOT_CHECKED = (
    "Not checked: noisy task quality, mirror score, equivalence or improvements. "
    "Simulation metrics are unavailable or skipped; no GPU work is performed."
)
