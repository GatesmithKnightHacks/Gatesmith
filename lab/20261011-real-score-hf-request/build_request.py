"""Offline experiment: real validation/scoring -> real region request; no inference."""

from __future__ import annotations

import json
from pathlib import Path

from qiskit import qasm3
from qscore.compile.pipeline import CompiledResult
from qscore.config import Settings
from qscore.diagnose.policy import effective_policy
from qscore.diagnose.regions import MODEL_LAYER_MAX_QUBITS
from qscore.improve.requests import RequestContext, build_requests
from qscore.record.scorecard import write_scorecard
from qscore.schemas.common import sha256_hex
from qscore.schemas.improvement import ImprovementRequest
from qscore.score.engine import score_item_compiled
from qscore.targets.registry import get_target
from qscore.validate.pipeline import run_validation
from qscore.validate.schema_checks import load_manifest_with_positions


def main() -> None:
    folder = Path(__file__).resolve().parent
    path = folder / "qscore.yaml"
    manifest, positions = load_manifest_with_positions(path)
    settings = Settings(profile="dev", device_default="cpu", fallbacks=frozenset())
    work = run_validation(manifest, folder, settings, path.name, positions)
    if len(work) != 1:
        raise RuntimeError("experiment requires exactly one validated circuit")
    resolved, loaded = work[0]
    card, representative = score_item_compiled(
        resolved, loaded, sha256_hex(path.read_bytes()), settings
    )
    if card.status != "complete" or not isinstance(representative, CompiledResult):
        raise RuntimeError("experiment requires a complete, compiled real scorecard")
    scorecard_path = write_scorecard(card, folder / "scorecards")
    (folder / "representative.qasm").write_text(qasm3.dumps(representative.circuit))

    item = resolved.item
    if any(
        block is None
        for block in (
            item.target,
            item.objective,
            item.evidence,
            item.budget,
            item.diagnose,
        )
    ):
        raise RuntimeError("validation did not resolve the required manifest blocks")
    assert (
        item.target
        and item.objective
        and item.evidence
        and item.budget
        and item.diagnose
    )
    target = get_target(item.target, resolved.root, loaded.circuit.num_qubits)
    context = RequestContext(
        round=1,
        logical=loaded.circuit,
        compiled=representative.circuit,
        representative_seed=representative.seed,
        backend=target.name,
        basis=target.basis,
        coupling_map=tuple(
            tuple(edge) for edge in target.target.build_coupling_map().get_edges()
        ),
        objective=item.objective,
        permitted=item.permitted,
        invariants=item.invariants,
        verification=item.evidence.verification,
        budget=item.budget,
        served_strategies=frozenset({"commutation_aware_routing"}),
        max_region_qubits=MODEL_LAYER_MAX_QUBITS,
        privacy=item.privacy,
    )
    policy = effective_policy(
        item.diagnose.profile,
        {entry.rule: entry.reason for entry in item.diagnose.ignore or []},
    )
    built = build_requests(card, context, policy)
    selected = [
        entry for entry in built.requests if entry.request.finding.rule == "D03"
    ]
    if len(selected) != 1:
        raise RuntimeError(f"expected one real D03 request; skipped={built.skipped}")
    request = selected[0].request
    request_path = folder / "request.json"
    request_path.write_text(request.model_dump_json(indent=2) + "\n")
    # Prove that a consumer reloads the generated persisted contract unchanged.
    if ImprovementRequest.model_validate_json(request_path.read_text()) != request:
        raise RuntimeError(
            "saved request did not round-trip against the request schema"
        )
    summary = {
        "scorecard": scorecard_path.relative_to(folder).as_posix(),
        "status": card.status,
        "item_sha256": card.item.item_sha256,
        "circuit_sha256": card.item.circuit_sha256,
        "representative_seed": representative.seed,
        "compiled_two_qubit_count": representative.two_qubit_count,
        "findings": [{"id": f.id, "rule": f.rule} for f in card.findings],
        "request_id": request.request_id,
        "request_scope": request.circuit.scope,
        "request_qubits": request.circuit.num_qubits,
        "request_source": selected[0].source,
        "extracted_region": selected[0].region.model_dump(mode="json"),
        "skipped": built.skipped,
    }
    (folder / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
