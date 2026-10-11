import json

import pytest
from qscore.errors import RecordError
from test_bundle import fixture_bundle

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
