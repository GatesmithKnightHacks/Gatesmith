"""The package walk of the builder runner stops at the project root (ChP-0037, lead decision)."""

from __future__ import annotations

from pathlib import Path

from qscore.intake.runner import _package


def _pkg(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    (path / "__init__.py").write_text("")
    return path


def test_walk_stops_at_project_root(tmp_path: Path) -> None:
    outer = _pkg(tmp_path / "outer")
    root = _pkg(outer / "proj")
    sub = _pkg(root / "sub")
    (sub / "ghz.py").write_text("")
    # outer/ and the root itself are packages, but the walk stops below the project root.
    assert _package(sub / "ghz.py", root) == (root, "sub.ghz")
    assert _package(root / "top.py", root) is None
    assert outer.is_dir()
    plain = tmp_path / "plain"
    _pkg(plain / "pkg")
    assert _package(plain / "pkg" / "m.py", plain) == (plain, "pkg.m")


def test_not_a_package(tmp_path: Path) -> None:
    (tmp_path / "m.py").write_text("")
    assert _package(tmp_path / "m.py", tmp_path) is None
