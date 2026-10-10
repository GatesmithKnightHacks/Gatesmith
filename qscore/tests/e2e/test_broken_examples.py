"""`examples/broken/`: one fixture per MVP issue code, exact codes and locations (specs/14 §3.3,
05 §12; MVP code list from 15 §3a M1)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from qscore import services
from qscore.cli import app
from qscore.errors import InvalidInput

BROKEN = Path(__file__).parents[2] / "examples" / "broken"
FIXTURES = sorted(d for d in BROKEN.iterdir() if d.is_dir())
MVP_CODES = (
    *(f"Q10{i}" for i in range(8)),
    "Q200",
    "Q206",
    "Q304",
    *(f"Q40{i}" for i in range(9)),
)


def test_every_mvp_code_has_one_fixture() -> None:
    assert sorted(d.name.split("_")[0] for d in FIXTURES) == sorted(MVP_CODES)


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda d: d.name)
def test_fixture_reports_exact_codes_and_locations(fixture: Path, tmp_path: Path) -> None:
    expected = json.loads((fixture / "expected.json").read_text())
    with pytest.raises(InvalidInput) as exc:
        services.score_project(fixture / "qscore.yaml", tmp_path)
    assert exc.value.report is not None, "every issue needs a located report"
    got = [
        {"code": i.code, "item": i.item, **i.location.model_dump(mode="json")}
        for i in exc.value.report.issues
    ]
    assert got == expected["issues"]
    assert fixture.name.split("_")[0] in {i["code"] for i in got}
    assert not (tmp_path / "scorecards").exists(), "nothing is computed for invalid input"


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda d: d.name)
def test_cli_exit_code(fixture: Path, tmp_path: Path) -> None:
    expected = json.loads((fixture / "expected.json").read_text())
    args = ["score", "--manifest", str(fixture / "qscore.yaml"), "--yes", "--out", str(tmp_path)]
    assert CliRunner().invoke(app, args).exit_code == expected["exit_code"]
