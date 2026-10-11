"""Repository link → discover → draft → score (ChP-0035), on local `file://` repositories."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from typer.testing import CliRunner

from qscore.cli import app
from qscore.errors import InvalidInput
from qscore.intake.fetch import clone, is_repo_url, repo_name
from qscore.schemas.run import RunRecord

GHZ = (
    "from qiskit import QuantumCircuit\n"
    "\n"
    "def ghz(n: int = 3) -> QuantumCircuit:\n"
    "    qc = QuantumCircuit(n)\n"
    "    qc.h(0)\n"
    "    for i in range(n - 1):\n"
    "        qc.cx(i, i + 1)\n"
    "    return qc\n"
)
GIT = ["-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false"]


def git(repo: Path, *args: str) -> str:
    out = subprocess.run(["git", "-C", str(repo), *GIT, *args], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return out.stdout.strip()


def make_repo(tmp_path: Path, files: dict[str, str]) -> tuple[str, str]:
    """A source repository with one commit; returns its file:// URL and HEAD."""
    src = tmp_path / "src" / "demo"
    src.mkdir(parents=True)
    git(src, "init", "-q", "-b", "main")
    for name, text in files.items():
        (src / name).parent.mkdir(parents=True, exist_ok=True)
        (src / name).write_text(text)
    git(src, "add", ".")
    git(src, "commit", "-qm", "init")
    git(src, "tag", "v1")
    return f"file://{src}", git(src, "rev-parse", "HEAD")


def run(*args: str, stdin: str | None = None) -> tuple[int, str]:
    result = CliRunner().invoke(app, list(args), input=stdin)
    return result.exit_code, result.output


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("https://github.com/org/repo", True),
        ("ssh://git@github.com/org/repo.git", True),
        ("git@github.com:org/repo.git", True),
        ("file:///tmp/x", True),
        ("./repo", False),
        ("C:/x", False),
        ("src/a.py", False),
    ],
)
def test_is_repo_url(text: str, expected: bool) -> None:
    assert is_repo_url(text) is expected


def test_repo_name() -> None:
    assert repo_name("https://github.com/org/repo.git") == "repo"
    assert repo_name("git@github.com:org/repo") == "repo"


def test_clone_branch_tag_and_sha(tmp_path: Path) -> None:
    url, head = make_repo(tmp_path, {"ghz.py": GHZ})
    for ref, dest in ((None, "a"), ("v1", "b"), ("main", "c"), (head, "d")):
        repo = clone(url, tmp_path / dest, ref, timeout_s=60)
        assert repo.commit == head and (repo.path / "ghz.py").is_file()


def test_existing_destination_is_refused(tmp_path: Path) -> None:
    url, _ = make_repo(tmp_path, {"ghz.py": GHZ})
    (tmp_path / "busy").mkdir()
    (tmp_path / "busy" / "x").write_text("keep me")
    with pytest.raises(InvalidInput) as err:
        clone(url, tmp_path / "busy", timeout_s=60)
    assert err.value.code == "Q103"
    assert err.value.report.issues[0].location.field == "--into"
    assert (tmp_path / "busy" / "x").read_text() == "keep me"


def test_credential_url_is_refused(tmp_path: Path) -> None:
    with pytest.raises(InvalidInput) as err:
        clone("https://user:secret@example.org/r.git", tmp_path / "r", timeout_s=60)
    assert err.value.code == "Q103" and "secret" not in str(err.value)
    assert not (tmp_path / "r").exists()


def test_failed_clone_exits_3(tmp_path: Path) -> None:
    code, out = run("discover", f"file://{tmp_path}/nope", "--into", str(tmp_path / "x"))
    assert code == 3 and "FetchError" in out


def test_single_candidate_is_picked_and_announced(tmp_path: Path) -> None:
    url, _ = make_repo(tmp_path, {"ghz.py": GHZ})
    dest = tmp_path / "clone"
    code, out = run("discover", url, "--into", str(dest), "--draft", "--no-input")
    assert code == 0, out
    assert "Only one circuit found: ghz.py::ghz" in out
    assert "builder: ghz.py::ghz" in (dest / "qscore.yaml").read_text()


def test_several_candidates_without_pick_is_q104(tmp_path: Path) -> None:
    url, _ = make_repo(tmp_path, {"ghz.py": GHZ, "b.py": GHZ.replace("ghz", "ghz_b")})
    code, out = run("discover", url, "--into", str(tmp_path / "c"), "--draft", "--no-input")
    assert code == 2 and "Q104" in out


def test_missing_import_is_warned(tmp_path: Path) -> None:
    text = "import not_installed_qscore_mod\n" + GHZ
    url, _ = make_repo(tmp_path, {"ghz.py": text})
    code, out = run("discover", url, "--into", str(tmp_path / "c"), "--draft", "--no-input")
    assert code == 0, out
    assert "ghz.py:1: module 'not_installed_qscore_mod' is not installed" in out


def test_path_limits_discovery(tmp_path: Path) -> None:
    url, _ = make_repo(tmp_path, {"a/ghz.py": GHZ, "b/other.py": GHZ.replace("ghz", "other")})
    code, out = run("discover", url, "--into", str(tmp_path / "c"), "--path", "a")
    assert code == 0, out
    assert "a/ghz.py::ghz" in out and "other" not in out


def test_score_stops_on_required_placeholder(tmp_path: Path) -> None:
    url, _ = make_repo(tmp_path, {"ghz.py": GHZ.replace("n: int = 3", "n: int")})
    dest = tmp_path / "c"
    code, out = run(
        "discover", url, "--into", str(dest), "--draft", "--no-input", "--score", "--yes"
    )
    assert code == 2 and "Q107" in out
    assert not (dest / "qscore-out").exists()


def test_link_to_complete_scorecard(tmp_path: Path) -> None:
    url, head = make_repo(tmp_path, {"ghz.py": GHZ})
    dest = tmp_path / "c"
    code, out = run(
        "discover", url, "--into", str(dest), "--draft", "--no-input", "--score", "--yes"
    )
    assert code == 0, out
    assert "1 builder function(s) from " + url + "@" + head in out
    record = RunRecord.model_validate(json.loads((dest / "qscore-out/run.json").read_text()))
    assert record.status == "complete"
    assert record.project_source is not None and not hasattr(record.project_source, "error")
    assert record.project_source.commit == head
    assert record.project_source.url == url
    assert record.interpretation.startswith("1 builder function(s)")


def test_interactive_trust_notice_declined_runs_nothing(tmp_path: Path) -> None:
    url, _ = make_repo(tmp_path, {"ghz.py": GHZ})
    dest = tmp_path / "c"
    code, out = run(
        "discover", url, "--into", str(dest), "--draft", "--no-input", "--score", stdin="n\n"
    )
    assert code == 0, out
    assert "will run as your user" in out
    assert not (dest / "qscore-out").exists()
