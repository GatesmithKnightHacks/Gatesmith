"""Improvement requests `qscore.request/v0.2` from a scorecard's findings (specs/04-contracts.md
§4, specs/07-diagnostics.md §1, §3-§4, specs/10-improvement-loop.md §3; ChP-0002, ChP-0013).

`build_requests(scorecard, ctx, policy)` turns ranked, unsuppressed findings into requests:

- Findings of rules that build no request (D02, D07, D09, D10; 07 §1), suppressed findings, and
  findings with no strategy that is both permitted (04 §2.3) and served by an enabled layer
  produce no request; each one is listed in `RequestBuild.skipped` with the reason.
- `circuit.scope` is `whole` when the item permits `scope: whole`, when every strategy of the
  request is a whole-circuit strategy (`layout_search`, `noise_aware_layout`,
  `routing_search`; ChP-0002), or for D01, whose region names qubits only and is a whole-circuit
  request (ChP-0013). Whole-circuit strategies get the logical circuit (ChP-0002); a `scope:
  whole` region-rewrite request gets the whole circuit named by the finding's scope.
- Otherwise the request carries one convex block cut with `diagnose.regions.convex_blocks` from
  the circuit named by the region's scope (the largest block, ties to the earliest), as
  OpenQASM 3 with a region-local `qubit_map`; the target's coupling map is restricted to the
  physical qubits of the block (logical qubits are mapped only through the representative
  compile's `TranspileLayout`, ChP-0013) and expressed in region-local indices, the indices the
  candidate uses.

`extract_region` and `splice` are exact inverses on a convex region:
`splice(c, r, extract_region(c, r)[0])` is the same DAG as `c`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from qiskit import qasm3
from qiskit.circuit import Gate, QuantumCircuit

from qscore.diagnose.policy import Policy, apply, rank
from qscore.diagnose.regions import convex_blocks, is_convex
from qscore.errors import InvalidInput
from qscore.schemas.improvement import (
    PROPOSAL_SCHEMA,
    REQUEST_SCHEMA,
    ImprovementRequest,
)
from qscore.schemas.manifest import Budget, Invariants, Objective, Permitted, PermittedChange
from qscore.schemas.scorecard import Finding, Region, Scorecard

# 04 §2.3: permitted change -> strategy ids.
CHANGE_STRATEGIES: dict[str, tuple[str, ...]] = {
    "layout": ("layout_search", "noise_aware_layout"),
    "routing": ("routing_search",),
    "commuting_reorder": ("commutation_aware_routing",),
    "block_resynthesis": ("block_resynthesis",),
    "reversible_rewrite": ("reversible_rewrite",),
    "approximate_synthesis": ("approximate_synthesis",),
}
# ChP-0002: these re-place/re-route the whole compiled circuit.
WHOLE_CIRCUIT_STRATEGIES = frozenset({"layout_search", "noise_aware_layout", "routing_search"})
# 07 §1: rules that build no request.
NO_REQUEST_RULES = frozenset({"D02", "D07", "D09", "D10"})
# ChP-0013: D01's region is qubits only; it is a whole-circuit request.
WHOLE_REQUEST_RULES = frozenset({"D01"})
# 07 §1 / ChP-0013: the scope each rule detects in (used when a finding carries no region).
RULE_SCOPE: dict[str, Literal["logical", "compiled"]] = {
    "D01": "compiled",
    "D03": "logical",
    "D04": "compiled",
    "D05": "logical",
    "D06": "compiled",
    "D08": "logical",
}


@dataclass(frozen=True)
class RequestContext:
    """What `build_requests` needs besides the scorecard; the services layer builds it from the
    item's `ScoringContext` (the improve layer may not import the pipeline layer).

    - `round`: improvement round; part of `request_id` (`<item>/r<round>/<finding id>`, 04 §4).
    - `logical`: the item's logical circuit (parameters bound), scope `logical`.
    - `compiled`: the representative compile, scope `compiled`; its `.layout` must be the
      `TranspileLayout` the compile recorded (logical -> physical qubits, ChP-0013).
    - `representative_seed`: seed of `compiled`; must equal the scorecard's representative.
    - `backend`, `basis`: the target's name and basis gates (`TargetBundle.name`, `.basis`).
    - `coupling_map`: every directed edge of the target, in physical qubit indices.
    - `objective`, `permitted`, `invariants`, `budget`: the resolved item's blocks.
    - `verification`: the resolved item's `evidence.verification`.
    - `served_strategies`: strategy ids served by the enabled layers (`capabilities()`).
    - `max_region_qubits`: widest block a region request may carry (07 §3: 8 for model layers,
      16 for `reference-qiskit`; `diagnose.regions.MODEL_LAYER_MAX_QUBITS`,
      `REFERENCE_MAX_QUBITS`).
    """

    round: int
    logical: QuantumCircuit
    compiled: QuantumCircuit
    representative_seed: int
    backend: str
    basis: tuple[str, ...]
    coupling_map: tuple[tuple[int, int], ...]
    objective: Objective
    permitted: Permitted
    invariants: Invariants
    verification: Literal["exact", "probabilistic_ok"]
    budget: Budget
    served_strategies: frozenset[str]
    max_region_qubits: int


@dataclass(frozen=True)
class BuiltRequest:
    """A request plus what the loop needs to splice a region candidate back: the scope of the
    circuit it was cut from and the convex block as a region (None for whole requests)."""

    request: ImprovementRequest
    source: Literal["logical", "compiled"]
    region: Region | None


@dataclass
class RequestBuild:
    requests: list[BuiltRequest] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)  # {finding, reason}


def _validate_cut(circuit: QuantumCircuit, region: Region) -> list[int]:
    """The region's gate indices, checked: unique in-range qubits, at least one gate, every gate
    a unitary `Gate` without classical bits on the region's qubits, and convex (07 §3)."""
    qubits = region.qubits
    if len(set(qubits)) != len(qubits) or any(not 0 <= q < circuit.num_qubits for q in qubits):
        raise InvalidInput(
            f"region qubits {qubits} are not unique qubits of a {circuit.num_qubits}-qubit circuit",
            report=None,
        )
    idxs = sorted(set(region.gate_indices))
    if not idxs or len(idxs) != len(region.gate_indices):
        raise InvalidInput(
            f"region gate indices {region.gate_indices} must be non-empty and unique",
            report=None,
        )
    allowed = set(qubits)
    for i in idxs:
        if not 0 <= i < len(circuit.data):
            raise InvalidInput(f"region gate index {i} is outside the circuit", report=None)
        inst = circuit.data[i]
        on = {circuit.find_bit(q).index for q in inst.qubits}
        if not isinstance(inst.operation, Gate) or inst.clbits:
            raise InvalidInput(
                f"region gate {i} ({inst.operation.name}) is not a unitary gate", report=None
            )
        if not on <= allowed:
            raise InvalidInput(
                f"region gate {i} ({inst.operation.name}) acts on qubits {sorted(on)} outside "
                f"the region's qubits {qubits}",
                report=None,
            )
    if not is_convex(circuit, idxs):
        raise InvalidInput(
            f"region gates {idxs} are not convex: a DAG path leaves and re-enters them (07 §3)",
            report=None,
        )
    return idxs


def extract_region(
    circuit: QuantumCircuit, region: Region
) -> tuple[QuantumCircuit, dict[str, int]]:
    """The region's gates as a circuit on `len(region.qubits)` qubits; local qubit `i` is
    circuit qubit `region.qubits[i]` (`qubit_map[str(i)]`)."""
    idxs = _validate_cut(circuit, region)
    local = {q: i for i, q in enumerate(region.qubits)}
    sub = QuantumCircuit(len(region.qubits))
    for i in idxs:
        inst = circuit.data[i]
        sub.append(
            inst.operation, [sub.qubits[local[circuit.find_bit(q).index]] for q in inst.qubits]
        )
    return sub, {str(i): q for i, q in enumerate(region.qubits)}


def splice(original: QuantumCircuit, region: Region, candidate: QuantumCircuit) -> QuantumCircuit:
    """`original` with the region's gates replaced by `candidate` (local qubit `i` acts on
    `region.qubits[i]`); the candidate's global phase is added to the circuit's.

    Order: everything before the region's first gate, then the in-between gates the region
    depends on, then the candidate, then the remaining gates, each group in original order.
    Because the region is convex this respects every dependency of `original`."""
    idxs = _validate_cut(original, region)
    if candidate.num_qubits != len(region.qubits):
        raise InvalidInput(
            f"candidate has {candidate.num_qubits} qubits; the region has {len(region.qubits)}",
            report=None,
        )
    if candidate.num_clbits:
        raise InvalidInput(
            "candidate has classical bits; a region candidate is unitary", report=None
        )
    for inst in candidate.data:
        if not isinstance(inst.operation, Gate):
            raise InvalidInput(
                f"candidate instruction {inst.operation.name} is not a unitary gate", report=None
            )
    members = set(idxs)
    first, last = idxs[0], idxs[-1]
    # Reverse sweep over the span: an instruction is an ancestor of the region when a later
    # region gate or ancestor uses one of its wires.
    live: set[object] = set()
    ancestors: set[int] = set()
    for i in range(last, first - 1, -1):
        inst = original.data[i]
        wires = set(inst.qubits) | set(inst.clbits)
        if i in members:
            live |= wires
        elif wires & live:
            ancestors.add(i)
            live |= wires
    out = original.copy_empty_like()
    out.global_phase = original.global_phase + candidate.global_phase
    data = original.data
    for i in range(first):
        out.append(data[i])
    for i in range(first, last + 1):
        if i in ancestors:
            out.append(data[i])
    for inst in candidate.data:
        out.append(
            inst.operation,
            [original.qubits[region.qubits[candidate.find_bit(q).index]] for q in inst.qubits],
        )
    for i in range(first, last + 1):
        if i not in members and i not in ancestors:
            out.append(data[i])
    for i in range(last + 1, len(data)):
        out.append(data[i])
    return out


def _strategies(finding: Finding, ctx: RequestContext) -> list[str]:
    permitted = {s for c in ctx.permitted.changes for s in CHANGE_STRATEGIES[c]}
    return [s for s in finding.strategies if s in permitted and s in ctx.served_strategies]


def _changes(strategies: list[str], ctx: RequestContext) -> list[PermittedChange]:
    return [c for c in ctx.permitted.changes if set(CHANGE_STRATEGIES[c]) & set(strategies)]


def _restricted_coupling(physical: list[int], ctx: RequestContext) -> list[tuple[int, int]]:
    local = {p: i for i, p in enumerate(physical)}
    return sorted({(local[a], local[b]) for a, b in ctx.coupling_map if a in local and b in local})


def _physical(
    source: Literal["logical", "compiled"], qubits: list[int], ctx: RequestContext
) -> list[int]:
    if source == "compiled":
        return list(qubits)
    layout = ctx.compiled.layout
    if layout is None:
        raise InvalidInput(
            "the representative compile carries no TranspileLayout; logical qubits cannot be "
            "mapped to physical qubits (ChP-0013)",
            report=None,
        )
    initial = layout.initial_index_layout(filter_ancillas=True)
    return [initial[q] for q in qubits]


def build_requests(scorecard: Scorecard, ctx: RequestContext, policy: Policy) -> RequestBuild:
    """Requests for the scorecard's findings, top findings first (`policy.rank`)."""
    rep = scorecard.compile.representative_seed if scorecard.compile else None
    if rep != ctx.representative_seed:
        raise InvalidInput(
            f"scorecard representative seed {rep} differs from the context's "
            f"{ctx.representative_seed}; requests must be cut from the scored compile",
            report=None,
        )
    budget = ctx.budget
    if budget.max_proposals is None or budget.layer_timeout_s is None:
        raise InvalidInput(
            "budget.max_proposals and budget.layer_timeout_s must be resolved", report=None
        )
    out = RequestBuild()
    for f in rank(apply(policy, scorecard.findings)):
        if f.suppressed is not None:
            out.skipped.append(
                {
                    "finding": f.id,
                    "reason": f"suppressed by {f.suppressed.by}: {f.suppressed.reason}",
                }
            )
            continue
        if f.rule in NO_REQUEST_RULES:
            out.skipped.append({"finding": f.id, "reason": f"rule {f.rule} builds no request"})
            continue
        strategies = _strategies(f, ctx)
        if not strategies:
            out.skipped.append(
                {
                    "finding": f.id,
                    "reason": f"no strategy of {f.strategies} is permitted and served",
                }
            )
            continue
        whole_strategies = all(s in WHOLE_CIRCUIT_STRATEGIES for s in strategies)
        whole = ctx.permitted.scope == "whole" or whole_strategies or f.rule in WHOLE_REQUEST_RULES
        cut: Region | None = None
        if whole:
            # Whole-circuit strategies re-place the logical circuit (ChP-0002); a `scope: whole`
            # region rewrite gets the whole circuit its finding was detected on.
            source: Literal["logical", "compiled"] = (
                "logical"
                if whole_strategies or f.rule in WHOLE_REQUEST_RULES
                else (f.region.scope if f.region is not None else RULE_SCOPE[f.rule])
            )
            sub = ctx.logical if source == "logical" else ctx.compiled
            qubit_map = {str(i): i for i in range(sub.num_qubits)}
            coupling = (
                sorted(set(ctx.coupling_map))
                if source == "logical"
                else _restricted_coupling(list(range(sub.num_qubits)), ctx)
            )
        else:
            if f.region is None:
                out.skipped.append(
                    {"finding": f.id, "reason": "region request but the finding has no region"}
                )
                continue
            source = f.region.scope
            circuit = ctx.logical if source == "logical" else ctx.compiled
            blocks = convex_blocks(circuit, f.region, ctx.max_region_qubits)
            if not blocks:
                out.skipped.append(
                    {
                        "finding": f.id,
                        "reason": "no convex block of unitary gates within "
                        f"{ctx.max_region_qubits} qubits in the region",
                    }
                )
                continue
            cut = blocks[0].region(source)
            sub, qubit_map = extract_region(circuit, cut)
            coupling = _restricted_coupling(_physical(source, cut.qubits, ctx), ctx)
        request = ImprovementRequest.model_validate(
            {
                "schema": REQUEST_SCHEMA,
                "request_id": f"{scorecard.item.id}/r{ctx.round}/{f.id}",
                "item": {
                    "id": scorecard.item.id,
                    "item_sha256": scorecard.item.item_sha256,
                    "score_version": scorecard.item.score_version,
                },
                "finding": {
                    "id": f.id,
                    "rule": f.rule,
                    "severity": f.severity,
                    "region": f.region,
                    "evidence": f.evidence,
                },
                "circuit": {
                    "format": "openqasm3",
                    "scope": "whole" if whole else "region",
                    "qasm": qasm3.dumps(sub),
                    "qubit_map": qubit_map,
                    "num_qubits": sub.num_qubits,
                },
                "target": {
                    "backend": ctx.backend,
                    "basis": list(ctx.basis),
                    "coupling_map": coupling,
                },
                "objective": {
                    "primary": ctx.objective.primary,
                    "direction": ctx.objective.direction,
                },
                "permitted": {
                    "changes": _changes(strategies, ctx),
                    "ancillas": ctx.permitted.ancillas,
                },
                "invariants": {
                    "intent": ctx.invariants.intent,
                    "verification": ctx.verification,
                    "global_phase": ctx.invariants.global_phase,
                },
                "budget": {
                    "max_proposals": budget.max_proposals,
                    "timeout_s": budget.layer_timeout_s,
                },
                "proposal_schema": PROPOSAL_SCHEMA,
            }
        )
        out.requests.append(BuiltRequest(request=request, source=source, region=cut))
    return out
