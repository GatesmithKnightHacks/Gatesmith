"""Improvement requests from scorecards (specs/04-contracts.md §4, specs/07-diagnostics.md §1, §3,
specs/10-improvement-loop.md §3; ChP-0002, ChP-0013; specs/15-build-plan.md T16)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from qiskit import QuantumCircuit, qasm3
from qiskit.quantum_info import Operator

from qscore.config import Settings
from qscore.diagnose.policy import Policy, effective_policy
from qscore.diagnose.regions import REFERENCE_MAX_QUBITS, is_convex
from qscore.errors import InvalidInput
from qscore.improve.requests import (
    CHANGE_STRATEGIES,
    RequestContext,
    build_requests,
    extract_region,
    splice,
)
from qscore.intake.loaders import LoadedCircuit, qpy_sha256
from qscore.manifest.resolve import ResolvedItem, merge_items
from qscore.schemas.improvement import ImprovementRequest
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.scorecard import Finding, Region, Scorecard, Suppression
from qscore.score.context import ScoringContext
from qscore.score.engine import score_item
from qscore.validate.pipeline import run_validation
from qscore.validate.schema_checks import load_manifest_with_positions

EXAMPLES = Path(__file__).parents[3] / "examples"
ALL_STRATEGIES = frozenset(s for ss in CHANGE_STRATEGIES.values() for s in ss) - {
    "approximate_synthesis"  # stretch: no MVP layer (04 §2.3)
}


def policy_of(resolved: ResolvedItem) -> Policy:
    diag = resolved.item.diagnose
    return effective_policy(
        diag.profile if diag else None,
        {e.rule: e.reason for e in (diag.ignore or [])} if diag else None,
    )


def context_of(
    resolved: ResolvedItem,
    loaded: LoadedCircuit,
    *,
    round: int = 0,
    served: frozenset[str] = ALL_STRATEGIES,
    max_qubits: int = REFERENCE_MAX_QUBITS,
) -> RequestContext:
    """What services will build from the item's ScoringContext."""
    sc = ScoringContext(resolved, loaded.circuit, loaded.rebuild)
    rep = sc.representative
    item = resolved.item
    assert item.objective and item.permitted and item.evidence and item.budget
    return RequestContext(
        round=round,
        logical=loaded.circuit,
        compiled=rep.circuit,
        representative_seed=rep.seed,
        backend=sc.target.name,
        basis=sc.target.basis,
        coupling_map=tuple(
            (int(a), int(b)) for a, b in sc.target.target.build_coupling_map().get_edges()
        ),
        objective=item.objective,
        permitted=item.permitted,
        invariants=item.invariants,
        verification=item.evidence.verification,
        budget=item.budget,
        served_strategies=served,
        max_region_qubits=max_qubits,
    )


# --- a small item scored on line-5 (fast) ---------------------------------------------------


def ring() -> QuantumCircuit:
    """A QAOA-like cost layer: rzz on every pair of 5 qubits (a commuting run), then a mixer."""
    qc = QuantumCircuit(5)
    qc.h(range(5))
    for a in range(5):
        for b in range(a + 1, 5):
            qc.rzz(0.4, a, b)
    qc.rx(0.3, range(5))
    return qc


@pytest.fixture(scope="module")
def small(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    root = tmp_path_factory.mktemp("small")
    manifest = ProjectManifest.model_validate(
        {
            "schema": "qscore.project/v0.2",
            "project": {"name": "test"},
            "defaults": {
                "target": {"backend": "line-5"},
                "execution": {"transpiler_seeds": [11, 23]},
            },
            "circuits": [
                {
                    "id": "ring",
                    "source": {"qasm": "ring.qasm"},
                    "permitted": {
                        "changes": ["layout", "routing", "commuting_reorder", "block_resynthesis"]
                    },
                }
            ],
        }
    )
    item, root_dir, origins = merge_items(manifest, root)[0]
    resolved = ResolvedItem(item, root_dir, "a" * 64, origins)
    qc = ring()
    loaded = LoadedCircuit(qc, qpy_sha256(qc), 2)
    card = score_item(resolved, loaded, "b" * 64, Settings())
    return {"resolved": resolved, "loaded": loaded, "card": card}


def finding(rule: str, region: Region | None, strategies: list[str], **kw: Any) -> Finding:
    return Finding.model_validate(
        {
            "id": f"{rule}#1",
            "rule": rule,
            "title": "t",
            "severity": kw.pop("severity", "high"),
            "confidence": "rule_fired",
            "region": region,
            "strategies": strategies,
            **kw,
        }
    )


def with_findings(card: Scorecard, findings: list[Finding]) -> Scorecard:
    return card.model_copy(update={"findings": findings})


def all_logical(qc: QuantumCircuit) -> Region:
    return Region(scope="logical", qubits=list(range(qc.num_qubits)), layers=(0, 100))


def test_small_card_fires_d03_and_requests_validate(small: dict[str, Any]) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    assert "D03" in {f.rule for f in card.findings}
    built = build_requests(card, context_of(resolved, loaded), policy_of(resolved))
    assert built.requests
    for b in built.requests:
        doc = b.request.model_dump(mode="json", by_alias=True)
        assert ImprovementRequest.model_validate(doc) == b.request
        assert doc["request_id"] == f"ring/r0/{doc['finding']['id']}"
        assert qasm3.loads(doc["circuit"]["qasm"]).num_qubits == doc["circuit"]["num_qubits"]


def test_d03_region_request_is_a_convex_block_of_the_logical_circuit(
    small: dict[str, Any],
) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    ctx = context_of(resolved, loaded)
    d03 = next(f for f in card.findings if f.rule == "D03")
    built = build_requests(with_findings(card, [d03]), ctx, policy_of(resolved))
    (b,) = built.requests
    req = b.request
    assert req.circuit.scope == "region" and b.source == "logical"
    assert b.region is not None and b.region.scope == "logical"
    assert is_convex(loaded.circuit, b.region.gate_indices)
    assert set(b.region.qubits) <= set(d03.region.qubits)  # type: ignore[union-attr]
    sub, qubit_map = extract_region(loaded.circuit, b.region)
    assert req.circuit.qubit_map == qubit_map
    assert req.circuit.qasm == qasm3.dumps(sub)
    assert req.permitted.changes == ["commuting_reorder"]
    # Region qubits map to physical qubits only through the TranspileLayout (ChP-0013); the
    # coupling map is restricted to them, in region-local indices.
    initial = ctx.compiled.layout.initial_index_layout(filter_ancillas=True)  # type: ignore[union-attr]
    physical = [initial[q] for q in b.region.qubits]
    local = {p: i for i, p in enumerate(physical)}
    expected = sorted(
        {(local[a], local[b]) for a, b in ctx.coupling_map if a in local and b in local}
    )
    assert [tuple(e) for e in req.target.coupling_map] == expected
    # The cut splices back exactly.
    out = splice(loaded.circuit, b.region, qasm3.loads(req.circuit.qasm))
    assert Operator(out).equiv(Operator(loaded.circuit))


def test_compiled_region_request_restricts_coupling_to_physical_qubits(
    small: dict[str, Any],
) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    ctx = context_of(resolved, loaded)
    depth = ctx.compiled.depth()
    d04 = finding(
        "D04",
        Region(scope="compiled", qubits=[1, 2], layers=(0, depth)),
        ["block_resynthesis"],
    )
    (b,) = build_requests(with_findings(card, [d04]), ctx, policy_of(resolved)).requests
    assert b.source == "compiled" and b.request.circuit.scope == "region"
    assert b.region is not None and set(b.region.qubits) <= {1, 2}
    assert b.request.circuit.qubit_map == {str(i): q for i, q in enumerate(b.region.qubits)}
    edges = {(int(a), int(c)) for a, c in ctx.coupling_map}
    local = {p: i for i, p in enumerate(b.region.qubits)}
    assert [tuple(e) for e in b.request.target.coupling_map] == sorted(
        (local[a], local[c]) for a, c in edges if a in local and c in local
    )
    assert b.request.finding.region == d04.region


def test_d01_and_whole_circuit_strategies_get_whole_logical_requests(
    small: dict[str, Any],
) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    ctx = context_of(resolved, loaded)
    d01 = finding(
        "D01",
        Region(scope="compiled", qubits=[1, 2], layers=(0, 10)),
        ["layout_search", "routing_search", "commutation_aware_routing"],
    )
    d08 = finding("D08", all_logical(loaded.circuit), ["layout_search"], severity="info")
    built = build_requests(with_findings(card, [d01, d08]), ctx, policy_of(resolved))
    assert [b.request.finding.id for b in built.requests] == ["D01#1", "D08#1"]
    for b in built.requests:
        assert b.request.circuit.scope == "whole" and b.source == "logical" and b.region is None
        assert b.request.circuit.qasm == qasm3.dumps(loaded.circuit)
        assert b.request.circuit.qubit_map == {str(i): i for i in range(5)}
        assert [tuple(e) for e in b.request.target.coupling_map] == sorted(set(ctx.coupling_map))
    assert built.requests[0].request.permitted.changes == [
        "layout",
        "routing",
        "commuting_reorder",
    ]
    assert built.requests[1].request.permitted.changes == ["layout"]


def test_permitted_scope_whole_sends_the_whole_circuit_of_the_finding_scope(
    small: dict[str, Any],
) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    ctx = context_of(resolved, loaded)
    ctx = RequestContext(
        **{**ctx.__dict__, "permitted": ctx.permitted.model_copy(update={"scope": "whole"})}
    )
    d04 = finding(
        "D04", Region(scope="compiled", qubits=[1, 2], layers=(0, 5)), ["block_resynthesis"]
    )
    (b,) = build_requests(with_findings(card, [d04]), ctx, policy_of(resolved)).requests
    assert b.request.circuit.scope == "whole" and b.source == "compiled"
    assert b.request.circuit.qasm == qasm3.dumps(ctx.compiled)
    assert b.request.circuit.num_qubits == ctx.compiled.num_qubits


def test_no_request_rules_suppressed_and_unserved_findings_are_skipped_with_reasons(
    small: dict[str, Any],
) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    region = all_logical(loaded.circuit)
    findings = [
        finding("D02", None, []),
        finding("D09", None, ["routing_search", "commutation_aware_routing"]),
        finding(
            "D05",
            region,
            ["block_resynthesis"],
            suppressed=Suppression(by="manifest", reason="not now"),
        ),
        finding("D06", region.model_copy(update={"scope": "compiled"}), ["noise_aware_layout"]),
    ]
    ctx = context_of(resolved, loaded, served=ALL_STRATEGIES - {"noise_aware_layout"})
    built = build_requests(with_findings(card, findings), ctx, policy_of(resolved))
    assert built.requests == []
    reasons = {s["finding"]: s["reason"] for s in built.skipped}
    assert set(reasons) == {"D02#1", "D09#1", "D05#1", "D06#1"}
    assert "builds no request" in reasons["D02#1"] and "builds no request" in reasons["D09#1"]
    assert reasons["D05#1"] == "suppressed by manifest: not now"
    assert "permitted and served" in reasons["D06#1"]


def test_findings_outside_permitted_changes_build_no_request(small: dict[str, Any]) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    rev = finding("D05", all_logical(loaded.circuit), ["reversible_rewrite"])
    built = build_requests(
        with_findings(card, [rev]), context_of(resolved, loaded), policy_of(resolved)
    )
    assert built.requests == [] and built.skipped[0]["finding"] == "D05#1"


def test_requests_follow_policy_rank(small: dict[str, Any]) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    region = all_logical(loaded.circuit)
    warn = finding("D05", region, ["block_resynthesis"], severity="warning")
    high = finding("D08", region, ["layout_search"], severity="high")
    built = build_requests(
        with_findings(card, [warn, high]), context_of(resolved, loaded), policy_of(resolved)
    )
    assert [b.request.finding.rule for b in built.requests] == ["D08", "D05"]


def test_requests_are_deterministic(small: dict[str, Any]) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    first = build_requests(card, context_of(resolved, loaded, round=2), policy_of(resolved))
    second = build_requests(card, context_of(resolved, loaded, round=2), policy_of(resolved))
    dump = [b.request.model_dump_json(by_alias=True) for b in first.requests]
    assert dump == [b.request.model_dump_json(by_alias=True) for b in second.requests]
    assert all(b.request.request_id.startswith("ring/r2/") for b in first.requests)


def test_representative_mismatch_and_missing_layout_fail_loudly(small: dict[str, Any]) -> None:
    card, resolved, loaded = small["card"], small["resolved"], small["loaded"]
    ctx = context_of(resolved, loaded)
    other = RequestContext(**{**ctx.__dict__, "representative_seed": -1})
    with pytest.raises(InvalidInput, match="representative seed"):
        build_requests(card, other, policy_of(resolved))
    bare = ctx.compiled.copy()
    bare._layout = None
    d03 = next(f for f in card.findings if f.rule == "D03")
    no_layout = RequestContext(**{**ctx.__dict__, "compiled": bare})
    with pytest.raises(InvalidInput, match="TranspileLayout"):
        build_requests(with_findings(card, [d03]), no_layout, policy_of(resolved))


# --- the two examples (real scorecards) -----------------------------------------------------


def score_example(name: str) -> tuple[Scorecard, ResolvedItem, LoadedCircuit]:
    path = EXAMPLES / name / "qscore.yaml"
    manifest, positions = load_manifest_with_positions(path)
    ((resolved, loaded),) = run_validation(manifest, path.parent, Settings(), path.name, positions)
    return score_item(resolved, loaded, "c" * 64, Settings()), resolved, loaded


@pytest.mark.slow
def test_sidechain_qaoa_requests_validate_and_include_d01_and_d03() -> None:
    card, resolved, loaded = score_example("sidechain_qaoa")
    built = build_requests(card, context_of(resolved, loaded), policy_of(resolved))
    rules = [b.request.finding.rule for b in built.requests]
    assert {"D01", "D03"} <= set(rules)
    for b in built.requests:
        ImprovementRequest.model_validate(b.request.model_dump(mode="json", by_alias=True))
        if b.region is not None:
            source = (
                loaded.circuit if b.source == "logical" else context_of(resolved, loaded).compiled
            )
            assert is_convex(source, b.region.gate_indices)
            assert len(b.region.qubits) <= REFERENCE_MAX_QUBITS
    d01 = next(b for b in built.requests if b.request.finding.rule == "D01")
    assert d01.request.circuit.scope == "whole"
    d03 = next(b for b in built.requests if b.request.finding.rule == "D03")
    assert d03.request.circuit.scope == "region"


@pytest.mark.slow
def test_sbox_oracle_builds_no_request_since_only_reversible_rewrite_is_permitted() -> None:
    card, resolved, loaded = score_example("sbox_oracle")
    built = build_requests(card, context_of(resolved, loaded), policy_of(resolved))
    # sbox permits only `reversible_rewrite`; no rule suggests it (07 §1), so nothing is built
    # and every finding is listed with its reason.
    assert built.requests == []
    assert {s["finding"] for s in built.skipped} == {f.id for f in card.findings}
