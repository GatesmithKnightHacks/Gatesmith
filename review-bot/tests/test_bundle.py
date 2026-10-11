import hashlib
import io
import json
import stat
import zipfile
from copy import deepcopy

import pytest
from qscore.errors import RecordError

from qscore_review.bundle import load_bundle, validate_provenance
from qscore_review.settings import AllowedRepository

BASE, HEAD, ENGINE = "a" * 40, "b" * 40, "e" * 40
NOW = "2026-10-11T00:00:00Z"


def allowed():
    return AllowedRepository(
        repository="org/demo",
        repository_id=1,
        installation_id=2,
        workflow_id=3,
        workflow_path=".github/workflows/qscore.yml",
        engine_revision=ENGINE,
    )


def metadata(fork=False):
    run = {
        "id": 4,
        "run_attempt": 1,
        "workflow_id": 3,
        "path": ".github/workflows/qscore.yml",
        "head_sha": HEAD,
        "event": "pull_request",
        "status": "completed",
        "conclusion": "success",
        "pull_requests": [{"number": 5}],
        "html_url": "https://github.com/org/demo/actions/runs/4",
    }
    pr = {
        "number": 5,
        "state": "open",
        "base": {"sha": BASE},
        "head": {"sha": HEAD, "repo": {"id": 9 if fork else 1}},
    }
    return run, pr


def card(count, high=False):
    provenance = {
        "qscore": "0.1",
        "git_commit": ENGINE,
        "git_dirty": False,
        "lock_sha256": None,
        "python": "3.12",
        "qiskit": "2.5.0",
        "qiskit_aer": "0.17",
        "aer_build": "cpu",
        "mqt_qcec": None,
        "profile": "ci",
        "fallbacks_enabled": [],
        "seeds": {"transpiler": [0, 1], "simulator_base": 0},
        "thresholds_sha256": "c" * 64,
        "started_at": NOW,
        "finished_at": NOW,
    }
    return {
        "schema": "qscore.scorecard/v0.3",
        "item": {
            "id": "demo",
            "item_sha256": "c" * 64,
            "circuit_sha256": "d" * 64,
            "manifest_sha256": "f" * 64,
            "score_version": "qscore-2026.2",
        },
        "status": "complete",
        "target": {
            "name": "line-3",
            "num_qubits": 3,
            "basis": ["cx", "rz", "sx"],
            "calibration_id": None,
            "calibration_assumed": True,
        },
        "compile": {
            "seeds": [0, 1],
            "representative_seed": 0,
            "selection_policy": "best",
            "per_seed": [
                {
                    "seed": seed,
                    "two_qubit_count": count + seed * 2,
                    "two_qubit_depth": 5,
                    "depth": 10,
                    "time_s": 0.1,
                }
                for seed in [0, 1]
            ],
        },
        "metrics": [
            {"id": "two_qubit_count", "group": "resources", "status": "computed", "value": count}
        ],
        "findings": [
            {
                "id": "finding-demo-D01",
                "rule": "D01",
                "title": "Routing",
                "severity": "high",
                "confidence": "rule_fired",
                "evidence": {"two_qubit_count": count},
            }
        ]
        if high
        else [],
        "provenance": provenance,
        "created_at": NOW,
    }


def fixture_bundle(
    *,
    config=None,
    base_count=10,
    head_count=20,
    base_high=False,
    head_high=True,
    fork=False,
    mutate=None,
):
    settings = {
        "optimization_level": 3,
        "profile": "ci",
        "engine_revision": ENGINE,
        "device_default": "cpu",
        "fallbacks": [],
        "manifest": "qscore.yaml",
    }
    settings_bytes = json.dumps(settings, sort_keys=True, separators=(",", ":")).encode()
    payloads = {}
    sides = {}
    for side, sha, count, high in [
        ("base", BASE, base_count, base_high),
        ("head", HEAD, head_count, head_high),
    ]:
        raw = json.dumps(card(count, high)).encode()
        path = f"{side}/scorecards/demo.json"
        payloads[path] = raw
        payloads[f"{side}/settings.json"] = settings_bytes
        run = {
            "schema": "qscore.run/v0.3",
            "run_id": side,
            "command": "qscore score qscore.yaml",
            "manifest_sha256": "f" * 64,
            "items": ["demo"],
            "confirmation": {"mode": "yes_flag", "at": NOW, "manifest_sha256": "f" * 64},
            "interpretation": "optimization_level=3",
            "settings_profile": "ci",
            "fallbacks_enabled": [],
            "fallbacks_used": [],
            "started_at": NOW,
            "finished_at": NOW,
            "status": "complete",
            "scorecards": [
                {
                    "item_id": "demo",
                    "item_sha256": "c" * 64,
                    "path": "scorecards/demo.json",
                    "sha256": hashlib.sha256(raw).hexdigest(),
                }
            ],
            "compiled": [],
            "compiled_skipped": [],
            "project_source": {"url": "https://github.com/org/demo", "commit": sha, "dirty": False},
            "provenance": {
                "qscore": "0.1",
                "score_version": "qscore-2026.2",
                "git_commit": ENGINE,
                "git_dirty": False,
                "lock_sha256": None,
                "python": "3.12",
                "qiskit": "2.5.0",
            },
        }
        payloads[f"{side}/run.json"] = json.dumps(run).encode()
        sides[side] = {
            "commit": sha,
            "exit_code": 0,
            "run": f"{side}/run.json",
            "scorecards": [path],
            "compiled_qasm": [],
        }
    from qscore_review.contracts import RepoConfig

    envelope = {
        "schema": "qscore.review-bundle/v0.1",
        "provenance": {
            "repository": "org/demo",
            "repository_id": 1,
            "pull_request": 5,
            "workflow_id": 3,
            "workflow_path": ".github/workflows/qscore.yml",
            "run_id": 4,
            "run_attempt": 1,
            "base_sha": BASE,
            "head_sha": HEAD,
            "engine_revision": ENGINE,
            "score_version": "qscore-2026.2",
            "settings_sha256": hashlib.sha256(settings_bytes).hexdigest(),
            "fork": fork,
        },
        "config": RepoConfig(**(config or {})).model_dump(),
        **sides,
        "detected_versions": [
            {"package": "qiskit", "value": "2.5.0", "source": "requirements.txt", "line": 1}
        ],
        "checksums": {p: hashlib.sha256(v).hexdigest() for p, v in payloads.items()},
    }
    if mutate:
        mutate(envelope, payloads)
    return archive(envelope, payloads)


def archive(envelope, payloads):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("envelope.json", json.dumps(envelope))
        for path, raw in payloads.items():
            z.writestr(path, raw)
    return out.getvalue()


def test_valid_bundle_and_authenticated_provenance():
    loaded = load_bundle(fixture_bundle())
    run, pr = metadata()
    validate_provenance(loaded, allowed(), run, pr)
    assert loaded.cards["head"]["demo"].metrics[0].value == 20


@pytest.mark.parametrize(
    "change",
    [
        lambda e, p: e.update(schema="qscore.review-bundle/v9"),
        lambda e, p: p.update({"base/run.json": b"tampered"}),
        lambda e, p: e["head"].update(run="base/run.json"),
        lambda e, p: e["checksums"].pop("base/run.json"),
    ],
)
def test_schema_checksum_inventory_cross_side_rejected(change):
    with pytest.raises(RecordError):
        load_bundle(fixture_bundle(mutate=change))


@pytest.mark.parametrize("path", ["../escape", "/absolute", "foo\\bar", "base/../foo", "base//foo"])
def test_unsafe_zip_paths_rejected(path):
    with pytest.raises(RecordError):
        load_bundle(archive({}, {path: b"bad"}))


def test_symlink_and_size_limits():
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        info = zipfile.ZipInfo("link")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        z.writestr(info, "target")
    with pytest.raises(RecordError):
        load_bundle(out.getvalue())
    with pytest.raises(RecordError):
        load_bundle(fixture_bundle(), compressed_limit=10)


def test_forged_metadata_or_engine_revision_rejected():
    loaded = load_bundle(fixture_bundle())
    run, pr = metadata()
    for key, value in [
        ("workflow_id", 99),
        ("run_attempt", 2),
        ("head_sha", "c" * 40),
        ("pull_requests", []),
    ]:
        wrong = deepcopy(run)
        wrong[key] = value
        with pytest.raises(RecordError):
            validate_provenance(loaded, allowed(), wrong, pr)
