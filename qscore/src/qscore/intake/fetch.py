"""Repository links (ChP-0035): clone a repository a researcher points at, and read the git
state of a project root for the run record.

`clone` runs `git clone` with fixed, safe flags (05 §2); `source_of(root)` reads `project.root`
with git at score time (04 §13 `project_source`). No retry, no other transport.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from qscore.errors import FetchError, InvalidInput
from qscore.schemas.common import Location
from qscore.schemas.run import IssueModel, IssueReportModel, ProjectSource, ProjectSourceError

_SCP = re.compile(r"^[\w.-]+@[\w.-]+:(?!/)[^\s]+$")  # git@host:owner/repo[.git]
_SHA = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
_ENV = {"GIT_LFS_SKIP_SMUDGE": "1", "GIT_TERMINAL_PROMPT": "0"}


@dataclass(frozen=True)
class FetchedRepo:
    url: str  # without userinfo secrets
    commit: str  # HEAD of the checkout
    path: Path


def is_repo_url(text: str) -> bool:
    """A git URL (`https://`, `ssh://`, `git@host:owner/repo`, `file://`); anything else is a
    local path (05 §2)."""
    return text.startswith(("https://", "ssh://", "file://")) or bool(_SCP.match(text))


def repo_name(url: str) -> str:
    """`https://github.com/org/repo.git` → `repo` (the default `--into` directory)."""
    tail = url.rstrip("/").rsplit("/", 1)[-1].rsplit(":", 1)[-1]
    return tail.removesuffix(".git")


def _refuse(field: str, message: str, hint: str) -> InvalidInput:
    issue = IssueModel(
        code="Q103",
        severity="error",
        location=Location(file="<command line>", field=field),
        message=message,
        hint=hint,
        docs="docs/issues.md#q103",
    )
    report = IssueReportModel.model_validate(
        {
            "schema": "qscore.issues/v0.2",
            "manifest": "<command line>",
            "errors": 1,
            "warnings": 0,
            "issues": [issue],
        }
    )
    return InvalidInput(f"<command line>: 1 issue(s) (Q103): {message}", report=report, code="Q103")


def _has_credentials(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme in ("https", "http"):
        return "@" in parts.netloc  # any userinfo on https is a token or a password
    return parts.password is not None


def _run(args: list[str], timeout_s: float) -> str:
    step = args[2] if args[0] == "-C" else args[0]
    try:
        proc = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_s,
            env={**os.environ, **_ENV},
        )
    except subprocess.TimeoutExpired as exc:
        raise FetchError(f"git {step} timed out after {timeout_s:g} s") from exc
    except FileNotFoundError as exc:
        raise FetchError("git is not installed") from exc
    if proc.returncode != 0:
        raise FetchError(f"git {step} failed: {proc.stderr.strip()}")
    return proc.stdout


def clone(url: str, dest: Path, ref: str | None = None, *, timeout_s: float) -> FetchedRepo:
    """Shallow-clone `url` into `dest` (branch, tag or full commit SHA `ref`) and return it.

    Credential URLs and an existing non-empty `dest` are refused (Q103). A failed clone raises
    `FetchError` with git's message. The checkout is the researcher's; qscore never deletes it.
    """
    if _has_credentials(url):
        raise _refuse(
            "PATH",
            "the repository URL carries credentials",
            "Remove user:secret@ from the URL; git uses your SSH agent or credential helper.",
        )
    if dest.exists() and (not dest.is_dir() or any(dest.iterdir())):
        raise _refuse(
            "--into",
            f"{dest} already exists and is not empty",
            f"Choose another --into, or run `qscore discover {dest}` to work on it.",
        )
    if ref is not None and _SHA.match(ref):
        # A commit is fetched alone with depth 1, then checked out (detached).
        _run(["init", "-q", str(dest)], timeout_s)
        for args in (
            ["config", "core.symlinks", "false"],
            ["remote", "add", "origin", url],
            ["fetch", "-q", "--depth", "1", "--no-recurse-submodules", "origin", ref],
            ["checkout", "-q", "FETCH_HEAD"],
        ):
            _run(["-C", str(dest), *args], timeout_s)
    else:
        args = ["clone", "-q", "--depth", "1", "--no-recurse-submodules"]
        args += ["-c", "core.symlinks=false"]
        if ref is not None:
            args += ["--branch", ref]
        _run([*args, "--", url, str(dest)], timeout_s)
    commit = _run(["-C", str(dest), "rev-parse", "HEAD"], timeout_s).strip()
    return FetchedRepo(url=strip_userinfo(url), commit=commit, path=dest)


_READ_TIMEOUT_S = 30  # reading local git state; a hang (fsmonitor, network FS) is an error


def _git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        check=False,
        timeout=_READ_TIMEOUT_S,
    )


def strip_userinfo(url: str) -> str:
    """`https://user:token@host/x` → `https://host/x`; scp-style and local URLs unchanged."""
    parts = urlsplit(url)
    if not parts.netloc or "@" not in parts.netloc:
        return url
    return urlunsplit(parts._replace(netloc=parts.netloc.rsplit("@", 1)[1]))


def source_of(root: Path) -> ProjectSource | ProjectSourceError | None:
    """Git state of `root`; None when it is not inside a git work tree, an error entry when
    git is missing or any git read fails (04 §13)."""
    if shutil.which("git") is None:
        return ProjectSourceError(error="git not installed")
    try:
        return _read_source(root)
    except subprocess.TimeoutExpired as exc:
        return ProjectSourceError(error=f"git {exc.cmd[3]} timed out after {_READ_TIMEOUT_S} s")


def _read_source(root: Path) -> ProjectSource | ProjectSourceError | None:
    inside = _git(root, "rev-parse", "--is-inside-work-tree")
    if inside.returncode != 0:
        if "not a git repository" in inside.stderr:
            return None
        return ProjectSourceError(error=f"git rev-parse failed: {inside.stderr.strip()}")
    if inside.stdout.strip() != "true":
        return None  # e.g. inside a .git directory or a bare repository
    head = _git(root, "rev-parse", "HEAD")
    if head.returncode != 0:
        # A work tree without commits has no HEAD to record.
        return ProjectSourceError(error=f"git rev-parse HEAD failed: {head.stderr.strip()}")
    status = _git(root, "status", "--porcelain")
    if status.returncode != 0:
        return ProjectSourceError(error=f"git status failed: {status.stderr.strip()}")
    remote = _git(root, "config", "--get", "remote.origin.url")
    if remote.returncode not in (0, 1):  # 1: the key is not set (no remote)
        return ProjectSourceError(error=f"git config failed: {remote.stderr.strip()}")
    url = strip_userinfo(remote.stdout.strip()) if remote.returncode == 0 else None
    return ProjectSource(url=url or None, commit=head.stdout.strip(), dirty=bool(status.stdout))
