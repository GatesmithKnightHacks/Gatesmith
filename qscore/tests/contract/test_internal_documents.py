"""Plan, hardware profile and bench result (specs/04 §9, §11): 04 gives field lists, no examples,
so these fixtures are built from the field lists."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from qscore.schemas.export import EXPORTED, export_json_schemas, file_name
from qscore.schemas.run import BenchResult, HardwareProfile, Plan
from tests.contract.test_examples import PROVENANCE, fill_placeholders

PLAN: dict[str, Any] = {
    "schema": "qscore.plan/v0.2",
    "items": [
        {
            "item_id": "packing_qaoa_p2",
            "metrics": [
                {"metric": "two_qubit_count", "device": "cpu", "status": "planned"},
                {
                    "metric": "simulated_task_score",
                    "device": "gpu",
                    "method": "density_matrix",
                    "precision": "double",
                    "est_bytes": 4 * 2**30,
                    "est_seconds": 12.5,
                    "status": "planned",
                },
                {
                    "metric": "scalability",
                    "device": "cpu",
                    "status": "unavailable",
                    "reason": "no size_sweep",
                },
            ],
            "totals": {"est_bytes": 4 * 2**30, "est_seconds": 12.5},
        }
    ],
    "memory_mode": "exclusive",
    "hardware_profile_id": "hp-1",
}
PROFILE: dict[str, Any] = {
    "schema": "qscore.profile/v0.2",
    "profile_id": "hp-1",
    "measured_at": "2026-10-10T15:00:00Z",
    "cpu": {"model": "Ryzen", "cores": 16, "ram_gib": 64},
    "gpu": {
        "name": "Radeon PRO W7900",
        "arch": "gfx1100",
        "vram_gib": 48,
        "rocm": "10.0.0",
        "driver": "x",
    },
    "aer": {
        "version": "0.17.2",
        "build": "rocm",
        "gpu_available": True,
        "options_supported": {
            "batched_shots_gpu": True,
            "runtime_parameter_bind_enable": True,
            "fusion": True,
            "max_parallel_experiments": False,
        },
    },
    "crossover_qubits": {"single": 18, "double": 17},
    "overhead_factor": 1.15,
    "fusion_best": {"single": 3, "double": 5},
    "cache_knee_qubits": {"single": 23, "double": 22},
    "notes": [],
}
BENCH: dict[str, Any] = {
    "schema": "qscore.bench/v0.2",
    "suite": "default",
    "devices": ["cpu", "gpu"],
    "reps": 3,
    "warmup": 1,
    "rows": [
        {
            "circuit": "random_layered",
            "qubits": 24,
            "method": "statevector",
            "precision": "double",
            "fusion_max_qubit": 5,
            "device": "gpu",
            "median_s": 0.8,
            "p10_s": 0.7,
            "p90_s": 0.9,
            "throughput": 1.25,
        }
    ],
    "crossover": {"double": 17},
    "provenance": fill_placeholders(copy.deepcopy(PROVENANCE), "provenance"),
}
CASES: list[tuple[type[BaseModel], dict[str, Any]]] = [
    (Plan, PLAN),
    (HardwareProfile, PROFILE),
    (BenchResult, BENCH),
]


@pytest.mark.parametrize(("model", "doc"), CASES)
def test_valid(model: type[BaseModel], doc: dict[str, Any]) -> None:
    assert model.model_validate(doc).model_dump(mode="json")["schema"] == doc["schema"]


def test_plan_bad_device_and_status() -> None:
    for field, bad in (("device", "tpu"), ("status", "maybe")):
        doc = copy.deepcopy(PLAN)
        doc["items"][0]["metrics"][0][field] = bad
        with pytest.raises(ValidationError):
            Plan.model_validate(doc)


def test_profile_aer_build_enum() -> None:
    doc = copy.deepcopy(PROFILE)
    doc["aer"]["build"] = "cuda"
    with pytest.raises(ValidationError):
        HardwareProfile.model_validate(doc)


def test_bench_requires_full_provenance() -> None:
    doc = copy.deepcopy(BENCH)
    doc["provenance"] = {"host": "w7900"}
    with pytest.raises(ValidationError):
        BenchResult.model_validate(doc)


def test_export_json_schemas_writes_every_file(tmp_path: Path) -> None:
    paths = export_json_schemas(tmp_path / "out")
    assert [p.name for p in paths] == sorted(file_name(s) for s in EXPORTED)
    assert all(p.read_text(encoding="utf-8").endswith("\n") for p in paths)
