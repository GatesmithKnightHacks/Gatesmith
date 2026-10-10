"""Semantic pass: intent vs circuit (specs/05-pipeline.md §4.3; rules in 04-contracts.md §2.2).

Runs on the loaded circuit, before any compute, and returns every issue at once. Codes here:
Q400 (reversible gate set), Q401 (measurements needed), Q402 (mid-circuit measurement under
`exact_unitary`), Q403 (observable width; Q205 when the observable file cannot be read), Q406
(classical control), Q407 (opaque gate), Q404 (more qubits than the target has).
"""

from __future__ import annotations

import json
from pathlib import Path

from qiskit import QuantumCircuit
from qiskit.circuit import ControlFlowOp
from qiskit.circuit.library import get_standard_gate_name_mapping

from qscore.schemas.manifest import CircuitItem
from qscore.schemas.run import IssueModel
from qscore.targets.registry import TargetBundle
from qscore.validate.issues import FieldPath, Locate, make_issue

REVERSIBLE_GATES = frozenset({"x", "cx", "ccx", "swap"})
MEASUREMENT_INTENTS = frozenset({"known_output", "distribution"})
_NON_GATES = frozenset({"measure", "reset", "barrier", "delay"})


def _mid_circuit_measures(circuit: QuantumCircuit) -> list[int]:
    """Indices of measurements followed, on the same qubit, by anything but a measure/barrier."""
    pending: dict[int, int] = {}  # qubit -> index of the last measure on it
    mid: set[int] = set()
    for idx, inst in enumerate(circuit.data):
        name = inst.operation.name
        qubits = [circuit.find_bit(q).index for q in inst.qubits]
        if name == "barrier":
            continue
        if name == "measure":
            pending[qubits[0]] = idx
            continue
        for q in qubits:
            if q in pending:
                mid.add(pending.pop(q))
    return sorted(mid)


def semantic_issues(
    item: CircuitItem,
    circuit: QuantumCircuit,
    root: Path,
    file: str,
    index: int | None,
    locate: Locate | None = None,
    target: TargetBundle | None = None,
    target_field: FieldPath = ("target", "backend"),
) -> list[IssueModel]:
    """All semantic issues of one item. `index` is the item's position in `circuits` (None for a
    single file); `locate` maps a field path to `file:line:column` when a manifest exists.
    `target` enables Q404, located at `target_field` (where the target name was set)."""
    inv = item.invariants

    def issue(code: str, field: str, message: str, hint: str) -> IssueModel:
        path: FieldPath | None = (
            ("circuits", index, *field.split(".")) if index is not None else None
        )
        return make_issue(code, item.id, file, path, locate, message, hint)

    issues: list[IssueModel] = []
    names = [inst.operation.name for inst in circuit.data]
    mid = _mid_circuit_measures(circuit)

    if inv.intent == "reversible_function":
        bad = sorted({n for n in names if n not in REVERSIBLE_GATES | {"measure", "barrier"}})
        if bad or mid:
            what = f"gates {bad}" if bad else "a measurement before the end"
            issues.append(
                issue(
                    "Q400",
                    "invariants.intent",
                    "intent 'reversible_function' needs only x, cx, ccx, swap and final "
                    f"measurements; found {what}",
                    "Use intent 'exact_unitary' or 'structure_only' for this circuit.",
                )
            )

    if inv.intent in MEASUREMENT_INTENTS and "measure" not in names:
        issues.append(
            issue(
                "Q401",
                "invariants.intent",
                f"intent {inv.intent!r} needs measurements, but the circuit has none",
                "Add final measurements to the circuit, or choose intent 'exact_unitary'.",
            )
        )

    if inv.intent == "exact_unitary" and mid:
        issues.append(
            issue(
                "Q402",
                "invariants.intent",
                f"intent 'exact_unitary' forbids mid-circuit measurement; found {len(mid)} "
                f"(first at instruction {mid[0]})",
                "Move measurements to the end, or choose intent 'structure_only'.",
            )
        )

    if inv.intent == "expectation" and inv.task is not None and inv.task.observable:
        obs_path = root / inv.task.observable
        try:
            doc = json.loads(obs_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            issues.append(
                issue(
                    "Q205",
                    "invariants.task.observable",
                    f"observable file {inv.task.observable} is not valid JSON: {exc}",
                    "See 04-contracts.md §2.4 for the observable format.",
                )
            )
        else:
            width = doc.get("num_qubits") if isinstance(doc, dict) else None
            if not isinstance(width, int) or isinstance(width, bool):
                issues.append(
                    issue(
                        "Q205",
                        "invariants.task.observable",
                        f"observable file {inv.task.observable} has no integer 'num_qubits'",
                        "See 04-contracts.md §2.4 for the observable format.",
                    )
                )
            elif width != circuit.num_qubits:
                issues.append(
                    issue(
                        "Q403",
                        "invariants.task.observable",
                        f"observable acts on {width} qubits, the circuit has {circuit.num_qubits}",
                        "Regenerate the observable for this circuit size.",
                    )
                )

    control = sorted(
        {inst.operation.name for inst in circuit.data if isinstance(inst.operation, ControlFlowOp)}
    )
    if control:
        issues.append(
            issue(
                "Q406",
                "source",
                f"classical control ({', '.join(control)}) is not supported in the MVP",
                "Score a version of the circuit without classical control.",
            )
        )

    standard = get_standard_gate_name_mapping()
    opaque = sorted(
        {
            inst.operation.name
            for inst in circuit.data
            if inst.operation.name not in standard
            and inst.operation.name not in _NON_GATES
            and not isinstance(inst.operation, ControlFlowOp)
            and inst.operation.definition is None
        }
    )
    if opaque:
        issues.append(
            issue(
                "Q407",
                "source",
                f"opaque gate(s) without a definition: {', '.join(opaque)}",
                "Give each custom gate a body ('gate name q { … }') instead of 'opaque'.",
            )
        )
    if target is not None and circuit.num_qubits > target.num_qubits:
        issues.append(
            make_issue(
                "Q404",
                item.id,
                file,
                target_field if index is not None else None,
                locate,
                f"the circuit has {circuit.num_qubits} qubits, target {target.name} has "
                f"{target.num_qubits}",
                "Choose a larger target, or score a smaller instance of the circuit.",
            )
        )
    return issues
