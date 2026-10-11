from qscore_review.contracts import DetectedVersion, RepoConfig, ReviewDraft
from qscore_review.validation import prepare_diff, validate_review


def comment(**overrides):
    data = {
        "path": "circuit.py",
        "line": 2,
        "side": "RIGHT",
        "category": "circuit-regression",
        "severity": "warning",
        "body": "two_qubit_count 10 → 20 is outside seed spread.",
        "suggestion": None,
        "evidence": ["metric:demo:two_qubit_count"],
        "assumes_versions": {},
    }
    return dict(data, **overrides)


def validate(comments, **kwargs):
    config = RepoConfig()
    diff = prepare_diff(
        [{"filename": "circuit.py", "patch": "@@ -1,1 +1,2 @@\n old\n+new"}], config
    )
    evidence = {
        "metric:demo:two_qubit_count": {
            "numbers": [10, 20],
            "error": False,
            "comparison": "worse outside seed spread",
        }
    }
    evidence.update(diff.code_evidence)
    draft = ReviewDraft.model_validate(
        {"schema": "qscore.review/v0.1", "summary_note": "", "comments": comments}
    )
    return validate_review(
        draft,
        diff,
        evidence,
        config,
        [DetectedVersion(package="qiskit", value="2.5.0", source="uv.lock", line=1)],
        **kwargs,
    )


def test_anchor_evidence_numbers_severity_version_and_suggestion_gates():
    result = validate(
        [
            comment(),
            comment(line=99),
            comment(evidence=["missing"]),
            comment(body="two_qubit_count 999 is worse."),
            comment(severity="error"),
            comment(assumes_versions={"qiskit": "1.2.*"}),
            comment(suggestion="\n".join("x" for _ in range(11))),
        ]
    )
    assert len(result.comments) == 1
    assert len(result.dropped) == 6


def test_general_cap_and_no_numbered_summary_claims():
    assert len(validate([comment(category="general")]).comments) == 0
    result = validate(
        [comment(), comment(), comment(), comment(category="general"), comment(category="general")]
    )
    assert len(result.comments) == 4
    assert len(result.dropped) == 1


def test_sensitive_diff_is_never_sent():
    config = RepoConfig()
    result = prepare_diff(
        [
            {"filename": ".env.local", "patch": "@@ -0,0 +1 @@\n+KEY=abc"},
            {"filename": "private.pem", "patch": "@@ -0,0 +1 @@\n+key"},
            {"filename": "circuit.py", "patch": "@@ -0,0 +1 @@\n+hf_" + "x" * 40},
        ],
        config,
    )
    assert not result.hunks and not result.anchors
    assert len(result.skipped) == 3


def test_ambiguous_version_text_cannot_be_treated_as_an_exact_version():
    from qscore_review.validation import _version_valid

    value = 'ambiguous lock declarations: [{"version":"2.5.0"},{"version":"2.6.0"}]'
    assert not _version_valid(
        {"qiskit": value},
        [DetectedVersion(package="qiskit", value=value, source="uv.lock", line=1)],
    )


def test_code_line_cannot_authorize_fabricated_second_metric_number():
    result = validate(
        [
            comment(
                body="two_qubit_count10→2 is outside seed spread",
                evidence=["metric:demo:two_qubit_count", "code:circuit.py:2"],
            )
        ]
    )
    assert not result.comments
    assert result.dropped == ["number or seed-spread claim is unsupported"]


def test_other_metric_numbers_cannot_contaminate_metric_claim():
    from qscore_review.contracts import ReviewComment
    from qscore_review.validation import _numbers_valid

    evidence = {
        "metric:demo:two_qubit_count": {"numbers": [10, 20]},
        "metric:demo:depth": {"numbers": [2, 5]},
        "code:circuit.py:2": {"numbers": [2]},
    }
    draft = ReviewComment.model_validate(
        comment(
            body="two_qubit_count10→2 is outside seed spread",
            evidence=list(evidence),
        )
    )
    assert not _numbers_valid(draft, evidence)
    draft.body = "two_qubit_count10→20; depth2→5"
    assert _numbers_valid(draft, evidence)
    draft.body = "two_qubit_count10→20 and depth2→5"
    assert not _numbers_valid(draft, evidence)


def test_only_explicit_code_location_is_exempt_from_metric_number_checks():
    result = validate(
        [
            comment(
                body="two_qubit_count10→20 (see circuit.py:2)",
                evidence=["metric:demo:two_qubit_count", "code:circuit.py:2"],
            ),
            comment(
                body="two_qubit_count10→20; this metric actually becomes 2",
                evidence=["metric:demo:two_qubit_count", "code:circuit.py:2"],
            ),
        ]
    )
    assert len(result.comments) == 1 and len(result.dropped) == 1


def test_valid_version_assumption_does_not_erase_bare_metric_number():
    from qscore_review.contracts import ReviewComment
    from qscore_review.validation import _numbers_valid

    evidence = {"metric:demo:two_qubit_count": {"numbers": [10, 20]}}
    draft = ReviewComment.model_validate(
        comment(
            body="Qiskit 2: two_qubit_count10→2",
            assumes_versions={"qiskit": "2"},
        )
    )
    assert not _numbers_valid(draft, evidence)
    draft.body = "Qiskit 2: two_qubit_count10→20"
    assert _numbers_valid(draft, evidence)
