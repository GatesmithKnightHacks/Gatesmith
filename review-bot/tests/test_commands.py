import asyncio
import hashlib
import json
from pathlib import Path

import pytest
from qscore.errors import PlatformError
from test_bundle import BASE, HEAD, allowed, metadata

from qscore_review.commands import execute_command, parse_command
from qscore_review.state import State

DEFINITIONS = Path(__file__).parents[1] / "knowledge/engine-definitions.json"


class Fake:
    def __init__(self, permission="write"):
        self.permission = permission
        self.writes = []

    async def request(self, method, path, **kwargs):
        if method == "POST":
            self.writes.append(path)
            return None
        if path.endswith("/permission"):
            return {"permission": self.permission}
        if path.endswith("/pulls/5"):
            return metadata()[1]
        if "/runs?" in path:
            return {"workflow_runs": [metadata()[0]]}
        raise AssertionError(path)


def run(command, github=None):
    github = github or Fake()
    payload = {"issue": {"number": 5}, "comment": {"user": {"login": "contributor"}}}
    result = asyncio.run(
        execute_command(parse_command(command), payload, allowed(), github, "fake")
    )
    return result, github


def test_canonical_alias_and_strict_parser():
    assert parse_command("/gatesmith rescore").name == "rescore"
    assert parse_command("@qscore-review rescore").name == "rescore"
    assert parse_command("text\n/gatesmith rescore") is None
    assert parse_command("/gatesmith do-anything") is None


def test_write_access_required_and_only_allowed_workflow_rerun():
    result, github = run("/gatesmith rescore", Fake("read"))
    assert "write access" in result and not github.writes
    result, github = run("/gatesmith rescore")
    assert "Requested a rescore" in result
    assert github.writes == ["/repos/org/demo/actions/runs/4/rerun"]


def test_improve_explicitly_unavailable_and_ignore_only_suggests_valid_yaml():
    result, github = run("/gatesmith improve")
    assert "unavailable" in result and "No optimization" in result and not github.writes
    result, github = run('/gatesmith ignore D05 because "test"')
    assert "- rule: D05" in result and 'reason: "because \\"test\\""' in result
    assert not github.writes


def explanation(command, tmp_path, data=None, github=None, definition_path=DEFINITIONS):
    pack = json.loads(DEFINITIONS.read_text())
    repository = allowed().model_copy(update={"engine_revision": pack["engine_revision"]})
    state = State(tmp_path / "state.db")
    comparison = f"1:5:{BASE}:{HEAD}"
    if data is not None:
        state.accept_generation(comparison, 4, 1)
        state.save_evidence(
            comparison,
            4,
            1,
            {
                "run_id": 4,
                "run_attempt": 1,
                "engine_revision": pack["engine_revision"],
                "score_version": pack["score_version"],
                "evaluation": "recorded",
                "evidence": data,
            },
        )
    payload = {"issue": {"number": 5}, "comment": {"user": {"login": "contributor"}}}
    result = asyncio.run(
        execute_command(
            parse_command(command),
            payload,
            repository,
            github or Fake(),
            "fake",
            state=state,
            definitions_path=definition_path,
        )
    )
    return result, state


def test_committed_definition_pack_copies_catalog_and_has_immutable_sources():
    pack = json.loads(DEFINITIONS.read_text())
    root = Path(__file__).parents[2]
    for path, source in pack["sources"].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == source["sha256"]
        assert f"/blob/{pack['engine_revision']}/{path}" in source["url"]
    assert len(pack["metrics"]) == 20
    assert set(pack["rules"]) == {f"D{i:02d}" for i in range(1, 11)}
    assert "not a success probability" in pack["metrics"]["reliability_heuristic"]["definition"]
    assert "`≥ 6`" in pack["rules"]["D03"]["condition"]


def test_why_uses_current_saved_values_statuses_and_definition(tmp_path):
    result, _ = explanation(
        "/gatesmith why two_qubit_count",
        tmp_path,
        {
            "metric:demo:two_qubit_count": {
                "base": 10,
                "head": 20,
                "base_status": "computed",
                "head_status": "computed",
                "comparison": "worse outside seed spread",
            }
        },
    )
    assert "operation.num_qubits == 2" in result
    assert '"base": 10' in result and '"head": 20' in result
    assert "worse outside seed spread" in result and '"head_status": "computed"' in result
    assert HEAD[:12] in result and "workflow run `4`, attempt `1`" in result


def test_explain_uses_rule_text_and_recorded_finding_not_invented_facts(tmp_path):
    result, _ = explanation(
        "/gatesmith explain D03",
        tmp_path,
        {
            "finding:demo:D03": {
                "comparison": "new",
                "head": [{"severity": "warning", "evidence": {"ops": 7, "threshold": 6}}],
            }
        },
    )
    assert "Commuting block" in result and "`≥ 6`" in result
    assert "Profiles and explicit diagnostic policy" in result
    assert '"ops": 7' in result and '"comparison": "new"' in result
    assert "commutation_aware_routing" in result


def test_explanations_do_not_reuse_absent_or_other_head_evidence(tmp_path):
    result, state = explanation("/gatesmith why depth", tmp_path)
    assert "Current PR evidence is unavailable" in result
    assert '"base":' not in result
    comparison = f"1:5:{BASE}:{'c' * 40}"
    state.accept_generation(comparison, 4, 1)
    state.save_evidence(comparison, 4, 1, {"head": 99})
    result, _ = explanation("/gatesmith why depth", tmp_path)
    assert "Current PR evidence is unavailable" in result and "99" not in result


def test_explanation_bounds_records_escapes_data_and_never_writes(tmp_path):
    github = Fake()
    result, _ = explanation(
        "/gatesmith explain D01",
        tmp_path,
        {f"finding:item{i}:D01": {"head": "@everyone <img> ``` " + "x" * 5000} for i in range(8)},
        github,
    )
    assert "Showing 5 of 8" in result and "truncated" in result
    assert "@everyone" not in result and "<img>" not in result and "```" not in result
    assert len(result) < 8500
    assert not github.writes


def test_definition_failure_is_visible_and_permission_precedes_pack_access(tmp_path):
    missing = tmp_path / "missing.json"
    with pytest.raises(PlatformError, match="definition pack"):
        explanation("/gatesmith why depth", tmp_path, definition_path=missing)
    result, _ = explanation(
        "/gatesmith why depth", tmp_path, github=Fake("read"), definition_path=missing
    )
    assert "write access" in result


def test_unknown_metric_and_absent_finding_are_explicit(tmp_path):
    result, _ = explanation("/gatesmith why imaginary_metric", tmp_path, {})
    assert "Unknown metric id" in result
    result, _ = explanation("/gatesmith explain D03", tmp_path, {})
    assert "does not prove it was evaluated" in result


def test_explanation_never_reuses_prior_generation_after_pending_or_failed_rescore(tmp_path):
    _, state = explanation(
        "/gatesmith why depth", tmp_path, {"metric:demo:depth": {"base": 10, "head": 20}}
    )
    comparison = f"1:5:{BASE}:{HEAD}"
    assert state.accept_generation(comparison, 4, 2)
    result, _ = explanation("/gatesmith why depth", tmp_path)
    assert "Current PR evidence is unavailable" in result and '"head": 20' not in result
    state.save_evidence(
        comparison,
        4,
        2,
        {"run_id": 4, "run_attempt": 2, "evaluation": "failed", "evidence": {}},
    )
    result, _ = explanation("/gatesmith why depth", tmp_path)
    assert "current evaluation failed" in result and '"head": 20' not in result
    assert "attempt `2`" in result


def test_helper_credential_text_is_visibly_omitted(tmp_path):
    credential = "hf_" + "a" * 30
    result, _ = explanation(
        "/gatesmith explain D01",
        tmp_path,
        {"finding:demo:D01": {"untrusted_text": credential}},
    )
    assert credential not in result and "credential-like content omitted" in result
    result, _ = run("/gatesmith ignore D05 " + credential)
    assert credential not in result and "credential-like content" in result
