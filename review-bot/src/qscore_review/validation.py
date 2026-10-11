"""Filter untrusted model comments against changed lines, evidence and version facts."""

from __future__ import annotations

import fnmatch
import math
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any, cast

from packaging.specifiers import InvalidSpecifier, SpecifierSet
from packaging.version import InvalidVersion, Version

from qscore_review.contracts import DetectedVersion, RepoConfig, ReviewComment, ReviewDraft

SECRET = re.compile(
    r"(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
    r"AIza[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_-]{40,}|hf_[A-Za-z0-9]{20,}|"
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    r"(?i:api[_-]?key|password|secret|token)['\"]?\s*[:=]\s*['\"][^'\"]{8,}['\"])"
)
NUMBER = re.compile(
    r"(?<![\w.])[-+]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)"
    r"(?:[eE][-+]?\d+)?%?"
)
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")
QUANTUM_EXTENSIONS = {".py", ".qasm", ".ipynb"}


@dataclass
class DiffContext:
    anchors: set[tuple[str, int]] = field(default_factory=set)
    hunks: list[dict[str, str]] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    code_evidence: dict[str, dict[str, Any]] = field(default_factory=dict)


def excluded(path: str, patterns: list[str]) -> bool:
    parts = PurePosixPath(path).parts
    return (
        not parts
        or path.startswith("/")
        or ".." in parts
        or "\\" in path
        or any(part == ".env" or part.startswith(".env.") for part in parts)
        or any(
            part.lower() in {"secrets", "credentials", ".git", ".ssh", ".ipynb_checkpoints"}
            for part in parts
        )
        or PurePosixPath(path).name.lower()
        in {
            ".npmrc",
            ".pypirc",
            ".netrc",
            ".git-credentials",
            ".dockercfg",
            "credentials.json",
            "service-account.json",
        }
        or PurePosixPath(path).suffix.lower() in {".pem", ".key", ".p12", ".pfx", ".env"}
        or any(fnmatch.fnmatch(path, pattern) for pattern in patterns)
    )


def prepare_diff(
    files: list[dict[str, Any]],
    config: RepoConfig,
    *,
    max_chars: int = 80_000,
    max_lines: int = 2500,
) -> DiffContext:
    result = DiffContext()
    ordered = sorted(
        files,
        key=lambda f: (
            PurePosixPath(f["filename"]).suffix not in QUANTUM_EXTENSIONS,
            f["filename"],
        ),
    )
    total_chars = total_lines = 0
    for item in ordered:
        path, patch = item["filename"], item.get("patch")
        reason: str | None = None
        if excluded(path, config.exclude):
            reason = "excluded or sensitive filename"
        elif not isinstance(patch, str):
            reason = "no textual diff (binary or GitHub truncation)"
        elif SECRET.search(patch):
            reason = "possible credential in diff"
        elif len(result.hunks) >= config.max_files:
            reason = "file budget"
        elif (
            total_chars + len(patch) > max_chars
            or total_lines + len(patch.splitlines()) > max_lines
        ):
            reason = "diff context budget"
        if reason:
            result.skipped.append(path + ": " + reason)
            continue
        patch = cast(str, patch)
        # GitHub's patch hunks contain changed lines and a bounded amount of context.
        # Truncated patches never cause a fetch of whole files or arbitrary URLs.
        line = None
        context_count = 0
        safe_lines: list[str] = []
        for text in patch.splitlines():
            match = HUNK.match(text)
            if match:
                line = int(match[1])
                context_count = 0
                safe_lines.append(text)
                continue
            if line is None or text.startswith("\\"):
                continue
            if text.startswith("+"):
                result.anchors.add((path, line))
                result.code_evidence[f"code:{path}:{line}"] = {
                    "numbers": [line],
                    "error": False,
                }
                safe_lines.append(text)
                line += 1
                context_count = 0
            elif text.startswith("-"):
                safe_lines.append(text)
                context_count = 0
            elif text.startswith(" "):
                if context_count < 40:
                    safe_lines.append(text)
                line += 1
                context_count += 1
        result.hunks.append({"path": path, "patch": "\n".join(safe_lines)})
        total_chars += len(patch)
        total_lines += len(patch.splitlines())
    return result


def _version_valid(assumptions: dict[str, str], detected: list[DetectedVersion]) -> bool:
    known = {item.package: item.value for item in detected}
    for package, assumption in assumptions.items():
        value = known.get(package)
        if value is None or value.startswith(
            ("ambiguous lock declarations:", "conditional lock declaration:")
        ):
            return False
        if assumption == value:
            continue
        try:
            actual = Version(value)
            spec = SpecifierSet(
                assumption
                if assumption.startswith(("<", ">", "=", "!", "~"))
                else "==" + assumption
            )
            if actual not in spec:
                return False
        except (InvalidVersion, InvalidSpecifier):
            # Unknown overlap of ranges is not proof of compatibility.
            return False
    return True


def _numbers_valid(comment: ReviewComment, evidence: dict[str, dict[str, Any]]) -> bool:
    text = comment.body
    # Version text is exempt only in an explicitly named, validated package assumption.
    # Replacing a bare version value globally could erase an invented metric value.
    for package, version in comment.assumes_versions.items():
        version_pattern = (
            r"\b"
            + re.escape(package)
            + r"\s*(?:version\s*)?(?:==|~=)?\s*"
            + re.escape(version)
            + r"(?![\w.*])"
        )
        text = re.sub(version_pattern, "VERSION", text, flags=re.I)
    text = re.sub(r"\b[QD]\d{2,3}\b", "RULE", text)
    # Locations can authorize only explicit file:line references, never metric numbers.
    for key in comment.evidence:
        if key.startswith("code:"):
            path, line = key[len("code:") :].rsplit(":", 1)
            text = re.sub(re.escape(path + ":" + line) + r"(?!\d)", "LOCATION", text)
    metrics = {key: evidence[key] for key in comment.evidence if key.startswith("metric:")}
    patterns = {
        key: re.compile(r"(?<![A-Za-z_])" + re.escape(key.rsplit(":", 1)[1]) + r"(?=$|[^A-Za-z_])")
        for key in metrics
    }
    for data in metrics.values():
        if data.get("comparison") == "within seed spread" and re.search(
            r"\b(better|worse|improv\w*|regress\w*)\b", text, re.I
        ):
            return False
    # A semicolon or newline explicitly separates claims. When a numeric clause mentions
    # several metrics, reject it rather than guess which number belongs to which metric.
    for clause in re.split(r"[;\n]", text):
        named = [key for key, pattern in patterns.items() if pattern.search(clause)]
        numeric_text = clause
        for pattern in patterns.values():
            numeric_text = pattern.sub(" METRIC ", numeric_text)
        matches = list(NUMBER.finditer(numeric_text))
        if not matches:
            continue
        if len(named) == 1:
            sources = [metrics[named[0]]]
        elif len(named) > 1 or len(metrics) > 1:
            return False
        elif metrics:
            sources = list(metrics.values())
        else:
            sources = [evidence[key] for key in comment.evidence if not key.startswith("code:")]
        allowed = [
            float(value)
            for data in sources
            for value in data.get("numbers", [])
            if isinstance(value, (int, float)) and not isinstance(value, bool)
        ]
        for match in matches:
            raw = match[0].replace(",", "")
            value = float(raw.rstrip("%")) / (100 if raw.endswith("%") else 1)
            if not any(
                math.isclose(value, known, rel_tol=1e-8, abs_tol=1e-10) for known in allowed
            ):
                return False
    return True


@dataclass
class ValidatedReview:
    comments: list[ReviewComment]
    dropped: list[str]
    summary_note: str


def validate_review(
    draft: ReviewDraft,
    diff: DiffContext,
    evidence: dict[str, dict[str, Any]],
    config: RepoConfig,
    versions: list[DetectedVersion],
) -> ValidatedReview:
    kept: list[ReviewComment] = []
    dropped: list[str] = []
    for comment in draft.comments:
        reason: str | None = None
        if (comment.path, comment.line) not in diff.anchors:
            reason = "anchor is not a changed RIGHT line"
        elif any(key not in evidence for key in comment.evidence):
            reason = "missing evidence"
        elif SECRET.search(comment.body) or (
            comment.suggestion and SECRET.search(comment.suggestion)
        ):
            reason = "possible credential in model response"
        elif comment.suggestion is not None and (
            len(comment.suggestion.splitlines()) > 10 or "```" in comment.suggestion
        ):
            reason = "suggestion exceeds 10 lines"
        elif not _version_valid(comment.assumes_versions, versions):
            reason = "version assumption is not supported by declared versions"
        elif comment.category == "qiskit-api" and (
            not comment.assumes_versions
            or not any(key.startswith(("knowledge:", "compat:")) for key in comment.evidence)
        ):
            reason = "API comment lacks a declared version assumption or bounded API evidence"
        elif comment.severity == "error" and not any(
            evidence[key].get("error") for key in comment.evidence
        ):
            reason = "error severity lacks error evidence"
        elif not _numbers_valid(comment, evidence):
            reason = "number or seed-spread claim is unsupported"
        if reason:
            dropped.append(reason)
        else:
            kept.append(comment)
    general = [c for c in kept if c.category == "general"]
    quantum = [c for c in kept if c.category != "general"]
    cap = min(config.general_comments, len(quantum) // 3)
    dropped.extend("general comment exceeds count or 25% cap" for _ in general[cap:])
    comments = quantum + general[:cap]
    # Summary prose has no per-claim citations in the schema: only number-free prose is allowed.
    note = draft.summary_note
    if SECRET.search(note) or re.search(r"\d", note):
        dropped.append("summary note contains uncited numbers or possible credential")
        note = ""
    return ValidatedReview(comments, dropped, note)
