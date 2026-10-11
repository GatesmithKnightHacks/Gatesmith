"""`qscore score PATH` accepts a manifest or a project directory (ChP-0036, 05 §11)."""

from __future__ import annotations

from pathlib import Path

from typer.testing import CliRunner

from qscore.cli import app

BELL = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];\ncx q[0],q[1];\n'
MANIFEST = """\
schema: qscore.project/v0.2
project: {name: p, root: .}
circuits:
  - id: bell
    source: {qasm: bell.qasm}
    target: {backend: line-5}
"""


def _project(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    root.mkdir()
    (root / "bell.qasm").write_text(BELL)
    (root / "qscore.yaml").write_text(MANIFEST)
    return root


def _run(*args: str) -> tuple[int, str]:
    result = CliRunner().invoke(app, ["score", *args])
    return result.exit_code, result.output


def test_manifest_path(tmp_path: Path) -> None:
    root = _project(tmp_path)
    code, out = _run(str(root / "qscore.yaml"), "--yes", "--out", str(tmp_path / "o"))
    assert code == 0, out
    assert f"Input: manifest {root / 'qscore.yaml'}" in out.replace("\n", "")
    assert (tmp_path / "o/scorecards/bell.json").is_file()


def test_directory_path(tmp_path: Path) -> None:
    root = _project(tmp_path)
    code, out = _run(str(root), "--yes", "--out", str(tmp_path / "o"))
    assert code == 0, out
    assert (tmp_path / "o/scorecards/bell.json").is_file()


def test_directory_without_manifest_is_q200(tmp_path: Path) -> None:
    code, out = _run(str(tmp_path), "--yes", "--out", str(tmp_path / "o"))
    assert code == 2
    assert "Q200" in out and "qscore.yaml" in out


def test_path_and_manifest_together_exit_2(tmp_path: Path) -> None:
    root = _project(tmp_path)
    m = str(root / "qscore.yaml")
    assert _run(m, "--manifest", m, "--yes")[0] == 2


def test_target_with_manifest_path_exit_2(tmp_path: Path) -> None:
    root = _project(tmp_path)
    assert _run(str(root), "--target", "line-5", "--yes")[0] == 2


def test_qasm_file_unchanged(tmp_path: Path) -> None:
    root = _project(tmp_path)
    code, out = _run(
        str(root / "bell.qasm"), "--target", "line-5", "--yes", "--out", str(tmp_path / "o")
    )
    assert code == 0, out
    assert "compiled → " in out and "bell.qasm" in out.split("compiled → ")[1]
