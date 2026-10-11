"""Reference distributions, storage and missing-data semantics (ChP-0038 §4-5)."""

from __future__ import annotations

import hashlib
import json
import os
from importlib import resources
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from qscore.errors import RecordError
from qscore.record import reference
from qscore.schemas.common import MetricGroup, Status
from qscore.schemas.reference import ReferenceCorpus
from qscore.schemas.scorecard import MetricResult, Scorecard


def _card(
    circuit_id: str, width: int = 4, value: float = 10, target: str = "FakeTorino"
) -> Scorecard:
    data: dict[str, Any] = {
        "schema": "qscore.scorecard/v0.3",
        "item": {
            "id": circuit_id,
            "item_sha256": "item",
            "circuit_sha256": "circuit",
            "manifest_sha256": "manifest",
            "score_version": "qscore-2026.2",
        },
        "status": "complete",
        "target": {
            "name": target,
            "num_qubits": 133,
            "basis": ["cz"],
            "calibration_id": None,
            "calibration_assumed": False,
        },
        "provenance": {
            "qscore": "0.1.0",
            "git_commit": None,
            "git_dirty": False,
            "lock_sha256": None,
            "python": "3.12",
            "qiskit": "2.5",
            "qiskit_aer": "0.17",
            "aer_build": "cpu",
            "mqt_qcec": None,
            "profile": "ci",
            "fallbacks_enabled": [],
            "seeds": {"transpiler": [11], "simulator_base": 1234},
            "thresholds_sha256": None,
            "started_at": "2026-10-11T00:00:00Z",
            "finished_at": "2026-10-11T00:00:00Z",
        },
        "created_at": "2026-10-11T00:00:00Z",
    }
    data["item"]["id"] = circuit_id
    data["target"]["name"] = target
    data["metrics"] = [
        {"id": "width", "group": "resources", "value": width, "status": "computed"},
        {"id": "depth", "group": "resources", "value": value, "status": "computed"},
    ]
    return Scorecard.model_validate(data)


def _corpus() -> ReferenceCorpus:
    return ReferenceCorpus.model_validate(
        {
            "schema": "qscore.reference/v0.1",
            "score_version": "qscore-2026.2",
            "created_at": "2026-10-11T00:00:00Z",
            "sources": [],
            "targets": reference.summarize([_card("sample")]),
            "failures": [],
            "provenance": {},
        }
    )


@pytest.mark.parametrize(
    ("width", "band"),
    [
        (0, None),
        (1, None),
        (2, "2\u20135"),
        (5, "2\u20135"),
        (6, "6\u201310"),
        (10, "6\u201310"),
        (11, "11\u201320"),
        (20, "11\u201320"),
        (21, "21\u201350"),
        (50, "21\u201350"),
        (51, "51+"),
        (1000, "51+"),
    ],
)
def test_width_band_boundaries(width: int, band: str | None) -> None:
    assert reference.width_band(width) == band


@pytest.mark.parametrize("width", [-1, True, 2.5])
def test_invalid_width_is_typed(width: Any) -> None:
    with pytest.raises(RecordError, match="width"):
        reference.width_band(width)


def test_distribution_quantiles_cardinality_and_ties() -> None:
    cards = [
        _card("z", value=10),
        _card("b", value=1),
        _card("a", value=1),
        _card("c", value=6),
        _card("d", value=100),
        _card("e", value=-2),
    ]
    summary = reference.summarize(cards)
    band = summary["FakeTorino"]["depth"]["2\u20135"]
    assert band.n == len(cards) == len(band.values) == len(band.circuit_ids)
    assert list(zip(band.values, band.circuit_ids, strict=True)) == sorted(
        (card.metrics[1].value, card.item.id) for card in cards
    )
    expected = np.percentile(band.values, [5, 25, 50, 75, 95], method="linear")
    np.testing.assert_array_equal(list(band.quantiles.values()), expected)
    assert reference.summarize(list(reversed(cards))) == summary
    assert set(summary["FakeTorino"]["width"]) == {"2\u20135"}  # Not physical target width 133.


def test_targets_and_widths_are_separate() -> None:
    result = reference.summarize(
        [_card("same"), _card("same", target="line-5"), _card("wide", width=12)]
    )
    assert set(result) == {"FakeTorino", "line-5"}
    assert set(result["FakeTorino"]["depth"]) == {"2\u20135", "11\u201320"}
    assert result["FakeTorino"]["depth"]["11\u201320"].n == 1


def test_duplicate_ids_rejected_within_target() -> None:
    with pytest.raises(RecordError, match=r"Duplicate.*same.*FakeTorino"):
        reference.summarize([_card("same"), _card("same", width=12)])


def test_noncomplete_cards_and_noncomputed_or_nonscalar_metrics_excluded() -> None:
    card = _card("complete")
    invalid_values: list[Any] = [True, False, float("inf"), float("-inf"), float("nan"), {}]
    for index, value in enumerate(invalid_values):
        # model_construct keeps bool intact: the generic metric schema coerces bool to int.
        card.metrics.append(
            MetricResult.model_construct(
                id=f"invalid_{index}",
                group=MetricGroup.RESOURCES,
                status=Status.COMPUTED,
                value=value,
            )
        )
    card.metrics.append(
        MetricResult(
            id="absent",
            group="resources",
            status="unavailable",
            reason="no calibration",
        )
    )
    failed = _card("failed").model_dump(mode="json")
    failed.update(status="failed", error={"type": "CompileError", "message": "failed"})
    partial = _card("partial").model_dump(mode="json")
    partial["status"] = "partial"
    partial["metrics"].append(
        {
            "id": "broken",
            "group": "resources",
            "status": "failed",
            "error": {"type": "MetricError", "message": "failed"},
        }
    )
    result = reference.summarize(
        [card, Scorecard.model_validate(failed), Scorecard.model_validate(partial)]
    )
    assert set(result["FakeTorino"]) == {"width", "depth"}
    assert result["FakeTorino"]["depth"]["2\u20135"].circuit_ids == ["complete"]


def test_no_computed_width_has_no_band() -> None:
    card = _card("missing")
    card.metrics = card.metrics[1:]
    assert reference.summarize([card, _card("zero", width=0), _card("one", width=1)]) == {}


def test_write_and_load_stable_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    corpus = _corpus()
    path = tmp_path / f"corpus-{corpus.score_version}.json"
    assert reference.write_corpus(corpus, path) == path
    data = path.read_bytes()
    assert data.endswith(b"\n")
    assert (
        data
        == (
            json.dumps(corpus.model_dump(mode="json"), sort_keys=True, indent=2, ensure_ascii=False)
            + "\n"
        ).encode()
    )
    monkeypatch.setattr(resources, "files", lambda package: tmp_path)
    assert reference.load_corpus(corpus.score_version) == (corpus, hashlib.sha256(data).hexdigest())
    assert list(tmp_path.iterdir()) == [path]


def test_atomic_write_failure_preserves_existing_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "corpus.json"
    path.write_text("original")

    def fail_replace(source: str, destination: Path) -> None:
        raise PermissionError("denied")

    monkeypatch.setattr(os, "replace", fail_replace)
    with pytest.raises(RecordError, match=r"Cannot write.*denied"):
        reference.write_corpus(_corpus(), path)
    assert path.read_text() == "original"
    assert list(tmp_path.iterdir()) == [path]


def test_missing_file_is_only_absence(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(resources, "files", lambda package: tmp_path)
    assert reference.load_corpus("qscore-2026.2") is None


@pytest.mark.parametrize("content", [b"{", b"{}", b"\xff", b'{"schema":"bad"}'])
def test_corrupted_file_is_error(
    content: bytes,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / "corpus-qscore-2026.2.json").write_bytes(content)
    monkeypatch.setattr(resources, "files", lambda package: tmp_path)
    with pytest.raises(RecordError, match="Invalid reference corpus"):
        reference.load_corpus("qscore-2026.2")


def test_version_mismatch_is_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reference.write_corpus(_corpus(), tmp_path / "corpus-other.json")
    monkeypatch.setattr(resources, "files", lambda package: tmp_path)
    with pytest.raises(RecordError, match=r"score version.*expected 'other'"):
        reference.load_corpus("other")


@pytest.mark.parametrize("version", ["", "../foo", "/tmp/x", "a/b", "a\\b", "x\n", ".", ".."])
def test_unsafe_version_is_error(version: str) -> None:
    with pytest.raises(RecordError, match="Unsafe"):
        reference.load_corpus(version)


def test_unreadable_resource_is_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_read(path: Path) -> bytes:
        raise PermissionError("denied")

    monkeypatch.setattr(resources, "files", lambda package: Path("/unused"))
    monkeypatch.setattr(Path, "read_bytes", fail_read)
    with pytest.raises(RecordError, match=r"Cannot read.*denied"):
        reference.load_corpus("qscore-2026.2")


def test_missing_package_is_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_locate(package: str) -> Path:
        raise ModuleNotFoundError(package)

    monkeypatch.setattr(resources, "files", fail_locate)
    with pytest.raises(RecordError, match="Cannot locate"):
        reference.load_corpus("qscore-2026.2")


def test_corrupt_quantiles_are_rejected() -> None:
    from pydantic import ValidationError

    from qscore.schemas.reference import ReferenceBand

    band = reference.summarize([_card(f"ref_{i}", value=i * 10) for i in range(5)])["FakeTorino"][
        "depth"
    ]["2\u20135"].model_dump(mode="json")
    band["quantiles"]["50"] = 1000000
    with pytest.raises(ValidationError, match="quantiles do not match"):
        ReferenceBand.model_validate(band)


def test_reference_schema_version_is_registered() -> None:
    from qscore.schemas.versions import check_compatible

    assert check_compatible({"schema": "qscore.reference/v0.1"}) == "qscore.reference/v0.1"
