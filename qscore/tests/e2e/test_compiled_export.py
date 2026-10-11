"""Compiled circuit export and run record v0.3 through the CLI (ChP-0034, ChP-0035 D)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from qiskit import qasm3
from typer.testing import CliRunner

from qscore.cli import app
from qscore.schemas.common import sha256_hex
from qscore.schemas.run import RunRecord
from qscore.schemas.scorecard import Scorecard

BELL = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];\n'


def _score(src: Path, out: Path) -> RunRecord:
    result = CliRunner().invoke(
        app, ["score", str(src), "--target", "line-5", "--yes", "--out", str(out)]
    )
    assert result.exit_code == 0, result.stdout
    return RunRecord.model_validate(json.loads((out / "run.json").read_text()))


def test_run_exports_the_representative_compiled_circuit(tmp_path: Path) -> None:
    src = tmp_path / "bell.qasm"
    src.write_text(BELL)
    record = _score(src, tmp_path / "o")
    card = Scorecard.model_validate(json.loads((tmp_path / "o/scorecards/bell.json").read_text()))
    assert card.compile is not None
    [ref] = record.compiled
    assert record.compiled_skipped == []
    assert (ref.item_id, ref.path, ref.seed) == (
        "bell",
        "compiled/bell.qasm",
        card.compile.representative_seed,
    )
    data = (tmp_path / "o" / ref.path).read_bytes()
    assert ref.sha256 == sha256_hex(data)
    header = dict(
        line[3:].split(": ", 1) for line in data.decode().splitlines() if line.startswith("// ")
    )
    assert json.loads(header["item_id"]) == "bell"
    assert json.loads(header["transpiler_seed"]) == card.compile.representative_seed
    assert json.loads(header["target"]) == {"name": "line-5", "num_qubits": 5}
    loaded = qasm3.loads(data.decode())
    compiled_2q = sum(1 for i in loaded.data if i.operation.num_qubits == 2)
    rep = next(s for s in card.compile.per_seed if s.seed == ref.seed)
    assert compiled_2q == rep.two_qubit_count


def test_project_source_null_outside_git_and_read_inside(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # git must not find a work tree above the temporary directory.
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    src = tmp_path / "bell.qasm"
    src.write_text(BELL)
    assert _score(src, tmp_path / "o1").project_source is None
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    git = [
        "git",
        "-C",
        str(tmp_path),
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.org",
        "-c",
        "commit.gpgsign=false",
    ]
    subprocess.run([*git, "add", "bell.qasm"], check=True)
    subprocess.run([*git, "commit", "-qm", "init"], check=True)
    head = subprocess.run([*git, "rev-parse", "HEAD"], capture_output=True, text=True, check=True)
    subprocess.run(
        [*git, "remote", "add", "origin", "https://user:tok@example.org/org/repo"], check=True
    )
    source = _score(src, tmp_path / "o2").project_source
    assert source is not None and not hasattr(source, "error")
    assert source.model_dump() == {
        "url": "https://example.org/org/repo",
        "commit": head.stdout.strip(),
        "dirty": True,  # the first run's output directory is untracked
    }


def test_compile_failure_is_a_skip_with_its_reason(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from qscore.compile import pipeline
    from qscore.errors import CompileError

    def broken(*_args: object, **_kwargs: object) -> None:
        raise CompileError("transpiler exploded")

    monkeypatch.setattr(pipeline, "compile_item", broken)
    src = tmp_path / "bell.qasm"
    src.write_text(BELL)
    out = tmp_path / "o"
    result = CliRunner().invoke(
        app,
        ["score", str(src), "--target", "line-5", "--yes", "--allow-partial", "--out", str(out)],
    )
    assert result.exit_code == 0, result.output
    record = RunRecord.model_validate(json.loads((out / "run.json").read_text()))
    assert record.compiled == []
    [skip] = record.compiled_skipped
    assert skip.item_id == "bell"
    assert skip.reason == "compile failed: CompileError: transpiler exploded"
    assert not (out / "compiled").exists()


def test_exporter_error_exits_3_after_the_scorecard(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from qiskit.qasm3.exceptions import QASM3ExporterError

    from qscore.record import export

    def broken(_circuit: object) -> str:
        raise QASM3ExporterError("cannot export this gate")

    monkeypatch.setattr(export.qasm3, "dumps", broken)
    src = tmp_path / "bell.qasm"
    src.write_text(BELL)
    out = tmp_path / "o"
    result = CliRunner().invoke(
        app, ["score", str(src), "--target", "line-5", "--yes", "--out", str(out)]
    )
    assert result.exit_code == 3
    assert "RecordError" in result.output and "item bell" in result.output
    assert (out / "scorecards/bell.json").is_file()
    assert not list(out.glob("compiled/*"))
    assert not (out / "run.json").exists()
