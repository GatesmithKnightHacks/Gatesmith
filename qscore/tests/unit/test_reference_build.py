"""Maintainer build uses normal scoring and records invalid corpus entries."""

from __future__ import annotations

from importlib import resources
from pathlib import Path

import pytest
from ruamel.yaml import YAML
from typer.testing import CliRunner

from qscore import services
from qscore.cli import app
from qscore.intake.fetch import FetchedRepo
from qscore.schemas.reference import ReferenceCorpus


def test_build_keeps_failures_and_default_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    package = tmp_path / "data"
    package.mkdir()
    commit = "a" * 40
    doc = {
        "repositories": [
            {
                "id": "sample",
                "url": "https://example.org/sample.git",
                "commit": commit,
                "license": "test",
            }
        ],
        "circuits": [
            {"id": "bell", "repository": "sample", "source": {"qasm": "bell.qasm"}},
            {"id": "broken", "repository": "sample", "source": {"qasm": "missing.qasm"}},
        ],
    }
    with (package / "corpus.yaml").open("w") as stream:
        YAML().dump(doc, stream)
    original_files = resources.files
    monkeypatch.setattr(
        resources,
        "files",
        lambda name: package if name == "qscore.reference" else original_files(name),
    )
    calls = []

    def clone(url: str, dest: Path, ref: str, *, timeout_s: float) -> FetchedRepo:
        calls.append((url, ref))
        dest.mkdir(parents=True)
        (dest / "bell.qasm").write_text(
            'OPENQASM 2.0; include "qelib1.inc"; qreg q[2]; h q[0]; cx q[0],q[1];'
        )
        return FetchedRepo(url, commit, dest)

    monkeypatch.setattr(services.fetch, "clone", clone)
    result = services.build_reference(tmp_path / "build")
    assert result.scored == 1 and result.failures == 1 and result.exit_code == 2
    data = ReferenceCorpus.model_validate_json(result.path.read_bytes())
    assert data.failures[0].circuit_id == "broken" and data.failures[0].codes == ["Q200"]
    assert data.targets["FakeTorino"]["width"]["2\u20135"].circuit_ids == ["bell"]
    assert calls == [(doc["repositories"][0]["url"], commit)]
    run = (tmp_path / "build/runs/bell/scorecards/bell.json").read_text()
    assert '"representative_seed"' in run and "97" in run


def test_reference_cli_propagates_build_status(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        services,
        "build_reference",
        lambda *a, **kw: services.ReferenceBuildResult(tmp_path / "corpus.json", 5, 1, 3),
    )
    result = CliRunner().invoke(app, ["reference", "build", "--out", str(tmp_path)])
    assert result.exit_code == 3


def test_packaged_catalog_matches_maintainer_catalog() -> None:
    root = Path(__file__).resolve().parents[2]
    assert (root / "reference/corpus.yaml").read_bytes() == resources.files(
        "qscore.reference"
    ).joinpath("corpus.yaml").read_bytes()
