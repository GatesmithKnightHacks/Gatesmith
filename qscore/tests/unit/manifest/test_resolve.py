"""Item resolution (CP-0014 merge rules, CP-0025 calibration default by target kind)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from qscore.errors import InvalidInput
from qscore.manifest.resolve import merge, resolve_items
from qscore.schemas.manifest import ProjectManifest


def resolve(tmp_path: Path, defaults: dict[str, Any] | None, item: dict[str, Any]) -> Any:
    (tmp_path / "c.qasm").write_text('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\n')
    doc: dict[str, Any] = {
        "schema": "qscore.project/v0.2",
        "project": {"name": "p"},
        "circuits": [{"id": "c", "source": {"qasm": "c.qasm"}, **item}],
    }
    if defaults is not None:
        doc["defaults"] = defaults
    (resolved,) = resolve_items(ProjectManifest.model_validate(doc), tmp_path)
    return resolved.item.target


def test_builtin_default_is_faketorino_from_backend(tmp_path: Path) -> None:
    target = resolve(tmp_path, None, {})
    assert (target.backend, target.calibration) == ("FakeTorino", "from_backend")


@pytest.mark.parametrize("backend", ["line-5", "grid-2x3", "heavy-hex-3"])
def test_synthetic_manifest_target_defaults_to_no_calibration(tmp_path: Path, backend: str) -> None:
    target = resolve(tmp_path, {"target": {"backend": backend}}, {})
    assert (target.backend, target.calibration) == (backend, "none")


def test_synthetic_item_target_defaults_to_no_calibration(tmp_path: Path) -> None:
    target = resolve(tmp_path, None, {"target": {"backend": "line-5"}})
    assert target.calibration == "none"


def test_named_backend_set_by_manifest_reads_its_calibration(tmp_path: Path) -> None:
    target = resolve(tmp_path, {"target": {"backend": "FakeTorino"}}, {})
    assert target.calibration == "from_backend"


def test_explicit_calibration_is_kept(tmp_path: Path) -> None:
    # An explicit from_backend on a synthetic target stays (the registry refuses it with Q103).
    target = resolve(tmp_path, {"target": {"backend": "line-5", "calibration": "from_backend"}}, {})
    assert target.calibration == "from_backend"


def test_manifest_calibration_is_inherited_when_item_overrides_backend(tmp_path: Path) -> None:
    target = resolve(
        tmp_path,
        {"target": {"backend": "FakeTorino", "calibration": "none"}},
        {"target": {"backend": "line-5"}},
    )
    assert (target.backend, target.calibration) == ("line-5", "none")


def test_item_backend_override_takes_kind_default_over_builtin(tmp_path: Path) -> None:
    target = resolve(
        tmp_path, {"target": {"backend": "line-5"}}, {"target": {"backend": "FakeTorino"}}
    )
    assert (target.backend, target.calibration) == ("FakeTorino", "from_backend")


def _manifest(item: dict[str, Any]) -> ProjectManifest:
    return ProjectManifest.model_validate(
        {"schema": "qscore.project/v0.2", "project": {"name": "p"}, "circuits": [item]}
    )


def test_missing_qasm_file_is_q200(tmp_path: Path) -> None:
    manifest = _manifest({"id": "c", "source": {"qasm": "absent.qasm"}})
    with pytest.raises(InvalidInput, match=r"\[Q200\].*absent\.qasm"):
        resolve_items(manifest, tmp_path)


def test_missing_builder_file_is_q201(tmp_path: Path) -> None:
    manifest = _manifest({"id": "c", "source": {"builder": "src/absent.py::build"}})
    with pytest.raises(InvalidInput, match=r"\[Q201\].*absent\.py"):
        resolve_items(manifest, tmp_path)


def test_missing_parameters_file_is_q200(tmp_path: Path) -> None:
    (tmp_path / "b.py").write_text("def build(): ...\n")
    manifest = _manifest(
        {"id": "c", "source": {"builder": "b.py::build", "parameters": {"file": "p.json"}}}
    )
    with pytest.raises(InvalidInput, match=r"\[Q200\].*p\.json"):
        resolve_items(manifest, tmp_path)


def test_merge_mappings_merge_per_key_and_lists_replace() -> None:
    base = {"execution": {"device": "auto", "transpiler_seeds": [1, 2, 3]}}
    over = {"execution": {"transpiler_seeds": [7]}}
    assert merge(base, over) == {"execution": {"device": "auto", "transpiler_seeds": [7]}}


def test_merge_objective_is_atomic() -> None:
    base = {"objective": {"primary": "two_qubit_count", "constraints": [{"metric": "depth"}]}}
    over = {"objective": {"primary": "toffoli_count"}}
    assert merge(base, over) == {"objective": {"primary": "toffoli_count"}}


def test_merge_diagnose_ignore_concatenates() -> None:
    base = {"diagnose": {"profile": None, "ignore": [{"rule": "D02", "reason": "a"}]}}
    over = {"diagnose": {"ignore": [{"rule": "D08", "reason": "b"}]}}
    merged = merge(base, over)
    assert merged["diagnose"]["ignore"] == [
        {"rule": "D02", "reason": "a"},
        {"rule": "D08", "reason": "b"},
    ]
    assert base["diagnose"]["ignore"] == [{"rule": "D02", "reason": "a"}]  # inputs untouched
