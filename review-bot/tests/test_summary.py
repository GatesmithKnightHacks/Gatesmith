import hashlib
import json
import re
import shlex

import pytest
from qscore.errors import RecordError
from test_bundle import BASE, ENGINE, HEAD, fixture_bundle

from qscore_review.bundle import load_bundle
from qscore_review.contracts import RepoConfig
from qscore_review.summary import build_summary


def summary(**kwargs):
    config = kwargs.pop("config", {"fail_on": "new_high"})
    return build_summary(
        load_bundle(fixture_bundle(config=config, **kwargs)),
        RepoConfig(**config),
        run_url="https://github.com/run",
        docs_url="https://github.com/docs",
    )


def test_outside_spread_and_new_high_fail():
    result = summary()
    assert result.conclusion == "failure"
    assert "worse outside seed spread" in result.body
    assert "new D01" in result.body
    assert "qscore-2026.2" in result.body
    assert result.evidence["metric:demo:two_qubit_count"]["head"] == 20


def test_existing_high_does_not_fail_new_high_policy():
    assert summary(base_high=True).conclusion == "success"


def test_within_spread_is_not_regression():
    result = summary(head_count=11, head_high=False, config={"fail_on": "regression"})
    assert result.conclusion == "success"
    assert "within seed spread" in result.body


def test_fork_stays_advisory_and_no_policy_neutral():
    assert summary(fork=True).conclusion == "neutral"
    assert summary(config={}).conclusion == "neutral"


def test_mismatched_settings_fail_instead_of_comparison():
    loaded = load_bundle(fixture_bundle())
    loaded.payloads["head/settings.json"] = json.dumps({"optimization_level": 0}).encode()
    with pytest.raises(RecordError, match="Incomparable"):
        build_summary(loaded, RepoConfig(), run_url="url", docs_url="url")


def test_objective_change_cannot_be_comparable_under_same_direction():
    loaded = load_bundle(fixture_bundle())
    settings = json.loads(loaded.payloads["head/settings.json"])
    settings["items"]["demo"]["declared"]["objective"]["primary"] = "depth"
    loaded.payloads["head/settings.json"] = json.dumps(settings).encode()
    with pytest.raises(RecordError, match="Incomparable declared evaluation"):
        build_summary(loaded, RepoConfig(fail_on="new_high"), run_url="url", docs_url="url")


def test_invalid_head_never_passes_gate_or_claims_resolved_findings():
    loaded = load_bundle(fixture_bundle(base_high=True))
    loaded.envelope.head.exit_code = 2
    loaded.cards["head"] = {}
    loaded.runs.pop("head")
    result = build_summary(loaded, RepoConfig(fail_on="new_high"), run_url="url", docs_url="url")
    assert result.conclusion == "failure"
    assert "resolved D01" not in result.body
    assert "unassessed (incomplete evaluation) D01" in result.body
    assert "not evaluated" in result.body


def test_removed_manifest_discovery_never_passes_gate():
    loaded = load_bundle(fixture_bundle(base_high=True))
    loaded.envelope.head.run = None
    loaded.envelope.head.discovery = "head/discovery.json"
    loaded.runs.pop("head")
    loaded.cards["head"] = {}
    loaded.discoveries["head"] = {"candidates": []}
    loaded.payloads["head/qscore.suggested.yaml"] = b"version: 0.2\nproject: <required>\n"
    result = build_summary(loaded, RepoConfig(fail_on="new_high"), run_url="url", docs_url="url")
    assert result.conclusion == "failure"
    assert "resolved D01" not in result.body
    assert "Draft manifest" in result.body
    assert "<required>" in result.body


@pytest.mark.parametrize("credential", ["hf_" + "a" * 30, "AQ." + "a" * 48])
def test_credential_like_finding_text_is_omitted_without_changing_values_or_failure(credential):
    loaded = load_bundle(fixture_bundle())
    loaded.cards["head"]["demo"].findings[0].evidence["untrusted_text"] = credential
    result = build_summary(loaded, RepoConfig(fail_on="new_high"), run_url="url", docs_url="url")
    assert credential not in result.body
    assert "credential-like content omitted" in result.body
    assert "| 10 | 20 |" in result.body and "new D01" in result.body
    assert result.conclusion == "failure"


def test_credential_like_manifest_draft_is_visibly_omitted():
    loaded = load_bundle(fixture_bundle())
    loaded.discoveries["head"] = {"candidates": []}
    credential = "ghp_" + "a" * 30
    loaded.payloads["head/qscore.suggested.yaml"] = f"project: {credential}\n".encode()
    result = build_summary(loaded, RepoConfig(), run_url="url", docs_url="url")
    assert credential not in result.body
    assert "credential-like draft content omitted" in result.body


def test_quoted_credential_keys_are_filtered_from_diagnostic_evidence():
    loaded = load_bundle(fixture_bundle())
    loaded.cards["head"]["demo"].findings[0].evidence["api_key"] = "synthetic-private-value"
    result = build_summary(loaded, RepoConfig(fail_on="new_high"), run_url="url", docs_url="url")
    assert "synthetic-private-value" not in result.body
    assert "credential-like content omitted" in result.body
    assert result.conclusion == "failure"


def reproduction_fixture(config):
    loaded = load_bundle(fixture_bundle(config=config.model_dump()))
    for side in ("base", "head"):
        path = f"{side}/settings.json"
        settings = json.loads(loaded.payloads[path])
        settings.update(manifest=config.manifest, target=config.target)
        loaded.payloads[path] = json.dumps(settings).encode()
    runtime = {key: value for key, value in settings.items() if key not in {"items", "comparison"}}
    loaded.envelope.provenance.settings_sha256 = hashlib.sha256(
        json.dumps(runtime, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return loaded


def shell_recipe(body):
    opening = next(line for line in body.splitlines() if re.fullmatch(r"`{3,}sh", line))
    fence = opening[:-2]
    recipe = body.split(opening + "\n", 1)[1].split("\n" + fence + "\n", 1)[0]
    return fence, recipe


def test_local_recipe_uses_exact_engine_commits_and_isolated_runtime_without_target():
    result = summary()
    _, recipe = shell_recipe(result.body)
    commands = [shlex.split(line) for line in recipe.splitlines()]
    root = "../gatesmith-review-1-5-4-1"
    assert [
        root + "/engine/bin/python",
        "-m",
        "pip",
        "install",
        (
            "qscore @ git+https://github.com/GatesmithKnightHacks/Gatesmith.git@"
            + ENGINE
            + "#subdirectory=qscore"
        ),
    ] in commands
    assert ["python3.12", "-m", "venv", root + "/engine"] in commands
    assert ["git", "worktree", "add", "--detach", root + "/base", BASE] in commands
    assert ["git", "worktree", "add", "--detach", root + "/head", HEAD] in commands
    scores = [command for command in commands if command and command[0] == "env"]
    assert len(scores) == 2
    for side, command in zip(("base", "head"), scores, strict=True):
        assert command == [
            "env",
            "QSCORE_PROFILE=ci",
            "QSCORE_DEVICE_DEFAULT=cpu",
            "QSCORE_FALLBACKS=",
            "QSCORE_CACHE_DIR=../cache-" + side,
            "PYTHONNOUSERSITE=1",
            "../engine/bin/qscore",
            "score",
            "./qscore.yaml",
            "--out",
            "../results-" + side,
            "--yes",
        ]
    assert "Equivalent local reproduction (not the original absolute CI command)" in result.body
    assert "Recorded engine operation:" in result.body and "Command:" not in result.body
    assert ["set", "-eu"] in commands


def test_shell_quoting_preserves_manifest_and_optional_target_without_markdown_escaping():
    manifest = "circuits/a'b; $(touch unwanted) `literal` | example.qasm"
    target = "target'name; $HOME | literal"
    config = RepoConfig(manifest=manifest, target=target)
    result = build_summary(reproduction_fixture(config), config, run_url="url", docs_url="url")
    _, recipe = shell_recipe(result.body)
    scores = [
        shlex.split(line.strip()) for line in recipe.splitlines() if line.strip().startswith("env ")
    ]
    assert len(scores) == 2
    for command in scores:
        assert command[command.index("score") + 1] == "./" + manifest
        assert command[-2:] == ["--target", target]
    assert "\\|" not in recipe and "&#64;" not in recipe


def test_multiline_backtick_path_cannot_escape_recipe_fence():
    manifest = "odd/```\n@someone\nend.qasm"
    config = RepoConfig(manifest=manifest)
    result = build_summary(reproduction_fixture(config), config, run_url="url", docs_url="url")
    fence, recipe = shell_recipe(result.body)
    assert len(fence) == 4
    assert "./" + manifest in recipe
    assert not any(line.startswith(fence) for line in recipe.splitlines())
    assert len(re.findall(r"(?m)^" + re.escape(fence) + r"(?:sh)?$", result.body)) == 2


@pytest.mark.parametrize("field", ["manifest", "target"])
def test_credential_configuration_omits_recipe_without_exposing_content(field):
    credential = "AQ." + "a" * 48
    config = RepoConfig(**{field: credential})
    result = build_summary(reproduction_fixture(config), config, run_url="url", docs_url="url")
    assert credential not in result.body
    assert (
        "Equivalent local reproduction omitted: configuration contains credential-like content"
        in result.body
    )
    assert "env QSCORE_" not in result.body


def test_failed_evaluation_never_guesses_missing_or_other_runtime_settings():
    loaded = load_bundle(fixture_bundle())
    loaded.envelope.head.exit_code = 2
    del loaded.payloads["head/settings.json"]
    with pytest.raises(RecordError, match="reproduction runtime settings"):
        build_summary(loaded, RepoConfig(), run_url="url", docs_url="url")
    loaded = load_bundle(fixture_bundle())
    loaded.envelope.head.exit_code = 2
    settings = json.loads(loaded.payloads["head/settings.json"])
    settings["profile"] = "dev"
    loaded.payloads["head/settings.json"] = json.dumps(settings).encode()
    with pytest.raises(RecordError, match="mismatched reproduction runtime settings"):
        build_summary(loaded, RepoConfig(), run_url="url", docs_url="url")


def test_discovery_side_has_exact_checkout_but_no_claimed_scoring_command():
    loaded = load_bundle(fixture_bundle())
    loaded.envelope.head.discovery = "head/discovery.json"
    loaded.envelope.head.run = None
    loaded.runs.pop("head")
    loaded.cards["head"] = {}
    loaded.discoveries["head"] = {"candidates": []}
    result = build_summary(loaded, RepoConfig(), run_url="url", docs_url="url")
    _, recipe = shell_recipe(result.body)
    assert HEAD in recipe and "head: discovery only; no manifest was scored" in recipe
    assert recipe.count("../engine/bin/qscore score") == 1


def test_unsafe_configured_path_is_not_published_as_a_reproduction_command():
    config = RepoConfig(manifest="../outside.qasm")
    with pytest.raises(RecordError, match="Unsafe configured reproduction input path"):
        build_summary(reproduction_fixture(config), config, run_url="url", docs_url="url")
