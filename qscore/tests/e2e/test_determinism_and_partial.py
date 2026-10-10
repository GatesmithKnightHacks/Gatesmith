"""Same input → same scorecard apart from timings; a failed metric → `partial` and exit 3
unless `--allow-partial` (specs/04-contracts.md scorecard `status`, 05 §11, 14 §2)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from typer.testing import CliRunner

from qscore import services
from qscore.cli import app
from qscore.metrics.base import Outcome
from qscore.metrics.base import ScoringContext as MetricContext
from qscore.metrics.resources.counts import Depth
from qscore.record.run_record import read_run_record
from qscore.schemas.common import sha256_hex

GHZ4 = (
    'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[4];\ncreg c[4];\n'
    "h q[0];\ncx q[0],q[1];\ncx q[1],q[2];\ncx q[2],q[3];\nmeasure q -> c;\n"
)
# Wall-clock fields: the only ones allowed to differ between two runs.
VOLATILE = {"created_at", "resources", "x-run"}


@pytest.fixture
def ghz(tmp_path: Path) -> Path:
    path = tmp_path / "ghz.qasm"
    path.write_text(GHZ4, encoding="utf-8")
    return path


def _stable(card: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in card.items() if k not in VOLATILE}
    out["provenance"] = {
        k: v for k, v in card["provenance"].items() if k not in {"started_at", "finished_at"}
    }
    out["compile"] = {
        **card["compile"],
        "per_seed": [
            {k: v for k, v in s.items() if k != "time_s"} for s in card["compile"]["per_seed"]
        ],
    }
    return out


def test_scoring_is_deterministic(ghz: Path, tmp_path: Path) -> None:
    a = (
        services.score_circuit(ghz, tmp_path / "a", confirm="yes")
        .scorecards[0]
        .model_dump(mode="json")
    )
    b = (
        services.score_circuit(ghz, tmp_path / "b", confirm="yes")
        .scorecards[0]
        .model_dump(mode="json")
    )
    assert a["status"] == "complete"
    assert _stable(a) == _stable(b)


def _boom(self: Depth, ctx: MetricContext) -> Outcome:
    raise RuntimeError("injected failure")


def test_failed_metric_makes_partial_and_exit_3(
    ghz: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Depth, "compute", _boom)
    card = services.score_circuit(ghz, tmp_path / "svc", confirm="yes").scorecards[0]
    assert card.status == "partial"
    depth = next(m for m in card.metrics if m.id == "depth")
    assert depth.status == "failed" and depth.error is not None
    assert depth.error.message == "injected failure"
    assert all(m.status != "failed" for m in card.metrics if m.id != "depth")

    args = ["score", str(ghz), "--yes", "--out", str(tmp_path / "cli")]
    assert CliRunner().invoke(app, args).exit_code == 3
    assert CliRunner().invoke(app, [*args, "--allow-partial"]).exit_code == 0


def test_run_record_links_cards(ghz: Path, tmp_path: Path) -> None:
    out = tmp_path / "run"
    result = services.score_circuit(ghz, out, confirm="yes")
    assert result.run_record_path == out / "run.json"
    record = read_run_record(out / "run.json")
    card = result.scorecards[0]
    assert record.confirmation.mode == "yes_flag"
    assert record.status == "complete" and record.items == [card.item.id]
    assert record.interpretation.startswith("Interpretation (CPU scoring and diagnostics):")
    ref = record.scorecards[0]
    assert ref.sha256 == sha256_hex((out / ref.path).read_bytes())
    extra = card.model_dump(mode="json")
    assert extra["x-run"] == {
        "run_id": record.run_id,
        "manifest_sha256": record.manifest_sha256,
        "confirmation_mode": "yes_flag",
    }
    assert card.item.id in extra["x-interpretation"]
    assert "x-confirmation" not in extra


def test_declined_run_writes_nothing(ghz: Path, tmp_path: Path) -> None:
    result = services.score_circuit(ghz, tmp_path / "no", confirm=lambda summary: False)
    assert result.scorecards == [] and result.run_record_path is None
    assert not (tmp_path / "no" / "run.json").exists()
