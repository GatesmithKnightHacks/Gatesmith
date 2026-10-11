"""Every example in specs/04-contracts.md validates; invalid variants raise (T01 acceptance).

Examples are read from the spec itself so the tests cannot drift from it. The spec marks elided
values with "…"; `fill_placeholders` replaces them with valid values chosen by key name:
  *_sha256 → 64 hex chars · attempt_id/job_id → UUIDs · run_id → "run-1" · *_at timestamps →
  2026-10-10T15:02:59Z · `{"…": "…"}` region → a minimal valid Region · provenance → PROVENANCE
  (the scorecard example's own provenance) · any other "…" string → "x".
"""

from __future__ import annotations

import copy
import io
import json
import re
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError
from ruamel.yaml import YAML

from qscore.schemas.improvement import ImprovementRequest, Proposal
from qscore.schemas.manifest import ProjectManifest
from qscore.schemas.records import AttemptRecord, JobSpec
from qscore.schemas.run import Event, IssueReportModel, RunRecord
from qscore.schemas.scorecard import Scorecard

SPEC = Path(__file__).resolve().parents[3] / "specs" / "04-contracts.md"
ELLIPSIS = "…"
UUIDS = {
    "attempt_id": "6f1c2b8e-1d2a-4c3b-9e4f-5a6b7c8d9e0f",
    "job_id": "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
}
TIMESTAMP = "2026-10-10T15:02:59Z"

MODELS: dict[str, type[BaseModel]] = {
    "qscore.project/v0.2": ProjectManifest,
    "qscore.scorecard/v0.3": Scorecard,
    "qscore.request/v0.2": ImprovementRequest,
    "qscore.proposal/v0.2": Proposal,
    "qscore.attempt/v0.2": AttemptRecord,
    "qscore.job/v0.2": JobSpec,
    "qscore.event/v0.2": Event,
    "qscore.issues/v0.2": IssueReportModel,
    "qscore.run/v0.3": RunRecord,
}


def spec_examples() -> dict[str, dict[str, Any]]:
    """All fenced JSON/YAML examples in specs/04 that carry a `schema` id, keyed by it."""
    text = SPEC.read_text(encoding="utf-8")
    found: dict[str, dict[str, Any]] = {}
    for lang, body in re.findall(r"```(json|yaml)\n(.*?)```", text, flags=re.DOTALL):
        doc = json.loads(body) if lang == "json" else YAML(typ="safe").load(io.StringIO(body))
        if isinstance(doc, dict) and "schema" in doc:
            found[doc["schema"]] = doc
    return found


EXAMPLES = spec_examples()
PROVENANCE = EXAMPLES["qscore.scorecard/v0.3"]["provenance"]


def fill_placeholders(node: Any, key: str = "") -> Any:
    if isinstance(node, dict):
        if set(node) == {ELLIPSIS}:
            if key == "provenance":
                return fill_placeholders(copy.deepcopy(PROVENANCE), "provenance")
            if key == "region":
                return {"scope": "compiled", "qubits": [3, 4, 5, 6], "layers": [12, 40]}
        return {k: fill_placeholders(v, k) for k, v in node.items()}
    if isinstance(node, list):
        return [fill_placeholders(v, key) for v in node]
    if node == ELLIPSIS or (isinstance(node, str) and node.startswith(ELLIPSIS)):
        if key.endswith("sha256"):
            return "0" * 64
        if key in UUIDS:
            return UUIDS[key]
        if key == "run_id":
            return "run-1"
        if key == "at" or key.endswith("_at"):
            return TIMESTAMP
        return "x"
    return node


def example(schema_id: str) -> dict[str, Any]:
    return fill_placeholders(copy.deepcopy(EXAMPLES[schema_id]))


def test_spec_has_every_expected_example() -> None:
    assert set(MODELS) <= set(EXAMPLES)


@pytest.mark.parametrize("schema_id", sorted(MODELS))
def test_spec_example_validates(schema_id: str) -> None:
    doc = example(schema_id)
    model = MODELS[schema_id].model_validate(doc)
    dumped = model.model_dump(mode="json")
    assert next(iter(dumped)) == "schema"  # first field (specs/04 §1)
    assert dumped["schema"] == schema_id


@pytest.mark.parametrize("schema_id", sorted(MODELS))
def test_unknown_key_rejected_but_x_keys_kept(schema_id: str) -> None:
    doc = example(schema_id)
    model = MODELS[schema_id].model_validate({**doc, "x-tool": {"note": 1}})
    assert model.model_dump(mode="json")["x-tool"] == {"note": 1}
    with pytest.raises(ValidationError) as err:
        MODELS[schema_id].model_validate({**doc, "bogus": 1})
    assert err.value.errors()[0]["type"] == "Q101"


@pytest.mark.parametrize("schema_id", sorted(MODELS))
def test_wrong_schema_id_rejected(schema_id: str) -> None:
    with pytest.raises(ValidationError):
        MODELS[schema_id].model_validate({**example(schema_id), "schema": "qscore.other/v9.0"})


def _error_types(exc: pytest.ExceptionInfo[ValidationError]) -> set[str]:
    return {e["type"] for e in exc.value.errors()}


def manifest() -> dict[str, Any]:
    return example("qscore.project/v0.2")


def test_manifest_example_shape() -> None:
    m = ProjectManifest.model_validate(manifest())
    assert [c.id for c in m.circuits] == ["packing_qaoa_p2", "sbox_oracle"]
    assert m.circuits[1].invariants.global_phase == "ignore"  # invariant default (§2.1)


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda d: d["circuits"].append(copy.deepcopy(d["circuits"][1])), "Q105"),
        (lambda d: d["circuits"][0].__setitem__("id", "Bad Id"), "Q103"),
        (lambda d: d["circuits"][0]["source"].__setitem__("builder", "qaoa.py"), "Q103"),
        (lambda d: d["circuits"][0]["invariants"].pop("task"), "Q104"),
        (
            lambda d: d["circuits"][0]["invariants"].__setitem__("final_permutation", "forbidden"),
            "Q408",
        ),
        (lambda d: d["circuits"][1]["permitted"].__setitem__("approximation", "1e-3"), "Q405"),
        (
            lambda d: (
                d["defaults"]["privacy"].__setitem__("send_region_only", False)
                or d["defaults"]["privacy"].__setitem__("external_inference", True)
            ),
            "Q410",
        ),
        (lambda d: d["defaults"]["objective"]["constraints"][0].__setitem__("max", 3), "Q103"),
        (lambda d: d["defaults"]["execution"].__setitem__("transpiler_seeds", [1, 1]), "Q103"),
        (
            lambda d: d["defaults"]["diagnose"].__setitem__(
                "ignore", [{"rule": "D02", "reason": " "}]
            ),
            "Q104",
        ),
        (lambda d: d["project"].__setitem__("name", "<required>"), "Q107"),
        (lambda d: d["defaults"]["target"].__setitem__("basis_gates", ["cx"]), "Q103"),
    ],
)
def test_manifest_invalid_variants(mutate: Any, code: str) -> None:
    doc = manifest()
    mutate(doc)
    with pytest.raises(ValidationError) as exc:
        ProjectManifest.model_validate(doc)
    assert code in _error_types(exc)


def scorecard() -> dict[str, Any]:
    return example("qscore.scorecard/v0.3")


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda d: d["metrics"][0].pop("value"), "Q103"),  # computed without value
        (lambda d: d["metrics"][2].pop("uncertainty"), "Q103"),  # statistical without CI
        (lambda d: d["metrics"][3].pop("reason"), "Q103"),  # unavailable without reason
        (lambda d: d["metrics"][3].__setitem__("status", "failed"), "Q103"),  # failed, no error
        (lambda d: d.__setitem__("status", "partial"), "Q103"),  # partial without a failure
        (lambda d: d.__setitem__("status", "failed"), "Q103"),  # failed without error
        (lambda d: d["compile"].__setitem__("representative_seed", 5), "Q103"),
        (lambda d: d["metrics"][3].__setitem__("status", ""), "enum"),  # never blank
    ],
)
def test_scorecard_invalid_variants(mutate: Any, code: str) -> None:
    doc = scorecard()
    mutate(doc)
    with pytest.raises(ValidationError) as exc:
        Scorecard.model_validate(doc)
    assert code in _error_types(exc)


def test_scorecard_failed_metric_makes_partial_valid() -> None:
    doc = scorecard()
    doc["metrics"][3] = {
        "id": "scheduled_duration",
        "group": "hardware",
        "status": "failed",
        "error": {"type": "MetricError", "message": "boom"},
    }
    doc["status"] = "partial"
    assert Scorecard.model_validate(doc).status == "partial"


def test_attempt_decision_enum() -> None:
    doc = example("qscore.attempt/v0.2")
    doc["decision"] = "maybe"
    with pytest.raises(ValidationError):
        AttemptRecord.model_validate(doc)


def test_job_requires_flags_are_boolean() -> None:
    doc = example("qscore.job/v0.2")
    doc["requires"]["gpu"] = "yes please"
    with pytest.raises(ValidationError):
        JobSpec.model_validate(doc)


def test_event_kind_enum() -> None:
    doc = example("qscore.event/v0.2")
    doc["kind"] = "progress"
    with pytest.raises(ValidationError):
        Event.model_validate(doc)


# --- review follow-ups (T01 spec-auditor findings 1-5, 9) -----------------------------------


@pytest.mark.parametrize(
    ("mutate", "code"),
    [
        (lambda d: d["circuits"][1]["source"].__setitem__("builder", "a.py::f"), "Q103"),
        (lambda d: d["circuits"][1].__setitem__("source", {}), "Q103"),
        (
            lambda d: (
                d["circuits"][0]["permitted"].__setitem__("changes", ["routing"])
                or d["circuits"][0]["invariants"].__setitem__("final_permutation", "forbidden")
            ),
            "Q408",
        ),
    ],
)
def test_manifest_more_invalid_variants(mutate: Any, code: str) -> None:
    doc = manifest()
    mutate(doc)
    with pytest.raises(ValidationError) as exc:
        ProjectManifest.model_validate(doc)
    assert code in _error_types(exc)


@pytest.mark.parametrize("schema_id", sorted(MODELS))
def test_unsupported_schema_version_is_q106(schema_id: str) -> None:
    name = schema_id.split("/")[0]
    with pytest.raises(ValidationError) as exc:
        MODELS[schema_id].model_validate({**example(schema_id), "schema": f"{name}/v1.0"})
    assert "Q106" in _error_types(exc)


def test_schema_field_name_is_not_accepted_in_place_of_alias() -> None:
    doc = manifest()
    doc["schema_"] = doc.pop("schema")
    with pytest.raises(ValidationError) as exc:
        ProjectManifest.model_validate(doc)
    assert {"Q101", "missing"} <= _error_types(exc)


def test_unknown_key_reported_together_with_other_errors() -> None:
    doc = manifest()
    doc["bogus"] = 1
    doc["project"]["name"] = ""
    with pytest.raises(ValidationError) as exc:
        ProjectManifest.model_validate(doc)
    assert {"Q101", "string_too_short"} <= _error_types(exc)


def test_nested_unknown_key_rejected_and_nested_x_key_kept() -> None:
    doc = manifest()
    doc["circuits"][0]["permitted"]["x-note"] = "kept"
    m = ProjectManifest.model_validate(doc)
    assert m.model_dump(mode="json")["circuits"][0]["permitted"]["x-note"] == "kept"
    doc["circuits"][0]["permitted"]["bogus"] = 1
    with pytest.raises(ValidationError) as exc:
        ProjectManifest.model_validate(doc)
    assert any(e["type"] == "Q101" and "permitted" in e["loc"] for e in exc.value.errors())


def test_default_job_requires_has_no_null_flags() -> None:
    job = JobSpec.model_validate({"schema": "qscore.job/v0.2", "kind": "score", "project": "p"})
    assert job.model_dump(mode="json")["requires"] == {}
    dumped = JobSpec.model_validate(example("qscore.job/v0.2")).model_dump(mode="json")
    assert dumped["requires"] == {"gpu": True, "aer_gpu": True}  # spec 04 example (ChP-0048)
