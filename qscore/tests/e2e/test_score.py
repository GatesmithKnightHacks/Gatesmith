"""`qscore score` end to end on the CPU (specs/14 §1 e2e, §3; CP-0022 S6, CP-0024 paste input)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

from qscore.cli import app
from qscore.schemas.scorecard import Scorecard

EXAMPLES = Path(__file__).parents[2] / "examples"
BELL = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];\n'


def run(args: list[str], stdin: str | None = None) -> tuple[int, str]:
    result = CliRunner().invoke(app, args, input=stdin)
    return result.exit_code, result.stdout


def cards(out: Path) -> dict[str, Scorecard]:
    return {
        p.stem: Scorecard.model_validate(json.loads(p.read_text()))
        for p in (out / "scorecards").glob("*.json")
    }


def live_rules(card: Scorecard) -> set[str]:
    return {f.rule for f in card.findings if f.suppressed is None}


@pytest.mark.slow
def test_sidechain_qaoa_fires_d01_and_d03(tmp_path: Path) -> None:
    code, _ = run(
        [
            "score",
            "--manifest",
            str(EXAMPLES / "sidechain_qaoa/qscore.yaml"),
            "--yes",
            "--out",
            str(tmp_path),
        ]
    )
    assert code == 0
    card = cards(tmp_path)["packing_qaoa_p2"]
    assert card.status == "complete"
    assert {"D01", "D03"} <= live_rules(card)  # specs/14 §3.1 expected diagnosis


@pytest.mark.slow
def test_sbox_oracle_scores(tmp_path: Path) -> None:
    code, _ = run(
        [
            "score",
            "--manifest",
            str(EXAMPLES / "sbox_oracle/qscore.yaml"),
            "--yes",
            "--out",
            str(tmp_path),
        ]
    )
    assert code == 0
    card = cards(tmp_path)["sbox_oracle"]
    assert card.status == "complete"
    toffoli = next(m for m in card.metrics if m.id == "toffoli_count")
    assert toffoli.value == 100


def test_single_file_on_a_line_target(tmp_path: Path) -> None:
    qasm = tmp_path / "bell.qasm"
    qasm.write_text(BELL)
    code, _ = run(["score", str(qasm), "--target", "line-5", "--yes", "--out", str(tmp_path / "o")])
    assert code == 0
    assert cards(tmp_path / "o")["bell"].status == "complete"


def test_pasted_qasm_prints_the_report(tmp_path: Path) -> None:
    code, stdout = run(
        ["score", "-", "--target", "line-5", "--yes", "--out", str(tmp_path)], stdin=BELL
    )
    assert code == 0
    assert (tmp_path / "input/pasted.qasm").read_text() == BELL
    assert cards(tmp_path)["pasted"].status == "complete"
    assert "## pasted — complete" in stdout


def test_pasted_qasm_needs_yes(tmp_path: Path) -> None:
    code, _ = run(["score", "-", "--out", str(tmp_path)], stdin=BELL)
    assert code == 2


@pytest.mark.parametrize("text", ["", "OPENQASM 2.0;\nqreg q[2];\nfoo q[0];\n"])
def test_bad_pasted_qasm_exits_2(tmp_path: Path, text: str) -> None:
    code, _ = run(["score", "-", "--yes", "--out", str(tmp_path)], stdin=text)
    assert code == 2


def test_more_qubits_than_target_is_q404(tmp_path: Path) -> None:
    qasm = tmp_path / "bell.qasm"
    qasm.write_text(BELL)
    code, _ = run(["score", str(qasm), "--target", "line-1", "--yes", "--out", str(tmp_path / "o")])
    assert code == 2


def test_bad_fail_on_is_a_usage_error(tmp_path: Path) -> None:
    code, _ = run(["score", "-", "--yes", "--fail-on", "bogus", "--out", str(tmp_path)], stdin=BELL)
    assert code == 2


def test_odd_file_name_gets_a_valid_item_id(tmp_path: Path) -> None:
    qasm = tmp_path / "-bell.qasm"
    qasm.write_text(BELL)
    code, _ = run(["score", str(qasm), "--target", "line-5", "--yes", "--out", str(tmp_path / "o")])
    assert code == 0


def test_manifest_with_synthetic_target_needs_no_calibration(tmp_path: Path) -> None:
    # CP-0025: `defaults.target: {backend: line-5}` alone resolves to `calibration: none`.
    (tmp_path / "bell.qasm").write_text(BELL)
    (tmp_path / "qscore.yaml").write_text(
        "schema: qscore.project/v0.2\nproject: {name: p}\n"
        "defaults: {target: {backend: line-5}}\n"
        "circuits:\n  - id: bell\n    source: {qasm: bell.qasm}\n"
    )
    code, _ = run(
        [
            "score",
            "--manifest",
            str(tmp_path / "qscore.yaml"),
            "--yes",
            "--out",
            str(tmp_path / "out"),
        ]
    )
    assert code == 0
    card = cards(tmp_path / "out")["bell"]
    assert card.status == "complete"
    assert card.target.calibration_id is None
    reliability = next(m for m in card.metrics if m.id == "reliability_heuristic")
    assert (reliability.status, reliability.reason) == ("unavailable", "target has no calibration")
