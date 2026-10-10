"""Failure artifacts, selection and budget behavior (06 §1; 05 §7)."""

import re
from pathlib import Path

import pytest
from qiskit import QuantumCircuit

from qscore.compile import pipeline, select
from qscore.config import Settings
from qscore.errors import CompileError, MetricError
from qscore.intake.loaders import LoadedCircuit, qpy_sha256
from qscore.manifest.resolve import ResolvedItem, merge_items
from qscore.schemas.manifest import ProjectManifest
from qscore.score.engine import score_item


def score(tmp_path: Path, **defaults: object):
    manifest = ProjectManifest.model_validate(
        {
            "schema": "qscore.project/v0.2",
            "project": {"name": "test"},
            "defaults": {
                "target": {"backend": "line-3"},
                "execution": {"transpiler_seeds": [11]},
                **defaults,
            },
            "circuits": [{"id": "bell", "source": {"qasm": "bell.qasm"}}],
        }
    )
    item, root, origins = merge_items(manifest, tmp_path)[0]
    qc = QuantumCircuit(2)
    qc.h(0)
    qc.cx(0, 1)
    return score_item(
        ResolvedItem(item, root, "a" * 64, origins),
        LoadedCircuit(qc, qpy_sha256(qc), 2),
        "b" * 64,
        Settings(),
    )


def test_compile_failure_is_recorded_once_and_partial_survives(tmp_path, monkeypatch):
    calls = []

    def broken(*args):
        calls.append(1)
        raise CompileError("deliberate compile failure")

    monkeypatch.setattr(pipeline, "compile_item", broken)
    card = score(tmp_path)
    assert card.status == "partial"
    assert card.compile is None
    assert len(calls) == 1
    metrics = {m.id: m for m in card.metrics}
    assert metrics["two_qubit_count"].status == "failed"
    assert metrics["two_qubit_count"].error.type == "CompileError"
    assert metrics["measurement_count"].status == "computed"


def test_resources_only_does_not_compile_routing_reference(tmp_path, monkeypatch):
    def forbidden(*args):
        pytest.fail("unselected routing reference executed")

    monkeypatch.setattr(pipeline, "compile_all_to_all", forbidden)
    card = score(tmp_path, diagnose={"groups": ["resources"]})
    assert card.status == "complete"
    assert card.compile.all_to_all is None
    assert card.compile.route_only is None
    assert all(m.reason == "not selected" for m in card.metrics if m.group != "resources")


def test_budget_records_skipped_metrics(tmp_path):
    card = score(tmp_path, budget={"wall_time_s": 1e-12})
    assert card.status == "complete"
    assert all(m.status == "skipped" for m in card.metrics)
    # Wall time is not reproducible, so the reason names the elapsed time and the limit.
    assert all(
        re.fullmatch(r"budget: \d+\.\d s >= wall_time_s 1e-12", m.reason) for m in card.metrics
    )
    assert card.compile is None


@pytest.mark.parametrize(
    "objective",
    [
        "width",
        "size",
        "routing_overhead",
        "swaps_inserted",
        "compile_ratio",
        "seed_spread",
        "resynthesis_potential",
    ],
)
def test_scalar_cpu_objectives_are_supported(tmp_path, objective):
    card = score(tmp_path, objective={"primary": objective, "direction": "minimize"})
    assert card.status == "complete"
    assert next(m for m in card.metrics if m.id == objective).status == "computed"


def test_maximize_metadata(tmp_path):
    card = score(tmp_path, objective={"primary": "size", "direction": "maximize"})
    assert card.compile.selection_policy.startswith("max primary")


def test_per_seed_and_metric_objectives_break_ties_the_same_way(tmp_path):
    # Bell on line-3: every seed ties on two_qubit_count (1), swaps_inserted (0) and two-qubit
    # depth (1), so both selection paths must fall through to seed order (05 §6; results are
    # sorted by seed, compile/pipeline.py).
    def rep(primary):
        objective = {"primary": primary, "direction": "minimize"}
        execution = {"transpiler_seeds": [97, 11, 42]}
        return score(tmp_path, objective=objective, execution=execution).compile

    per_seed, metric = rep("two_qubit_count"), rep("swaps_inserted")
    assert per_seed.representative_seed == metric.representative_seed == 11


def test_per_seed_compiles_kept_without_representative(tmp_path, monkeypatch):
    def no_pick(*args):
        raise MetricError("deliberate: no representative")

    monkeypatch.setattr(select, "pick_representative", no_pick)
    card = score(tmp_path)
    assert card.status == "partial"
    assert card.compile is not None and card.compile.representative_seed is None
    assert [s.seed for s in card.compile.per_seed] == [11]
