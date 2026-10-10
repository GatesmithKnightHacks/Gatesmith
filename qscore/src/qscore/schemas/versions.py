"""Schema ids, score version, compatibility and migration (specs/04-contracts.md §1, §12)."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from qscore.errors import InvalidInput

SCORE_VERSION = "qscore-2026.1"

# Every schema id in specs/04 §1, with its current version.
SCHEMA_VERSIONS: dict[str, str] = {
    "qscore.project": "v0.2",
    "qscore.scorecard": "v0.2",
    "qscore.request": "v0.2",
    "qscore.proposal": "v0.2",
    "qscore.attempt": "v0.2",
    "qscore.job": "v0.2",
    "qscore.event": "v0.2",
    "qscore.plan": "v0.2",
    "qscore.issues": "v0.2",
    "qscore.profile": "v0.2",
    "qscore.bench": "v0.2",
    "qscore.conformance": "v0.2",
}

_SCHEMA_ID = re.compile(r"^(?P<name>qscore\.[a-z]+)/v(?P<major>\d+)\.(?P<minor>\d+)$")

# One function per version step: (name, from_version) -> function returning the next version's
# document. Empty while every schema is at its first version.
MIGRATIONS: dict[tuple[str, str], Callable[[dict[str, Any]], dict[str, Any]]] = {}


def _parse(schema_id: object) -> tuple[str, int, int]:
    match = _SCHEMA_ID.match(schema_id) if isinstance(schema_id, str) else None
    if match is None or match["name"] not in SCHEMA_VERSIONS:
        raise InvalidInput(f"[Q106] unknown schema id {schema_id!r}", report=None)
    return match["name"], int(match["major"]), int(match["minor"])


def check_compatible(document: dict[str, Any]) -> str:
    """Accept the same major version and any minor ≤ current; return the schema id.

    Raises `InvalidInput` naming the version for anything else (specs/04 §12).
    """
    name, major, minor = _parse(document.get("schema"))
    _, cur_major, cur_minor = _parse(f"{name}/{SCHEMA_VERSIONS[name]}")
    if major != cur_major or minor > cur_minor:
        raise InvalidInput(
            f"[Q106] {name}/v{major}.{minor} is not supported by this qscore "
            f"(current {name}/{SCHEMA_VERSIONS[name]})",
            report=None,
        )
    return f"{name}/v{major}.{minor}"


def migrate(document: dict[str, Any], to_version: str) -> dict[str, Any]:
    """Upgrade `document` step by step to `to_version` (e.g. "v0.2")."""
    name, major, minor = _parse(document.get("schema"))
    current = f"v{major}.{minor}"
    while current != to_version:
        step = MIGRATIONS.get((name, current))
        if step is None:
            raise InvalidInput(
                f"no migration from {name}/{current} towards {to_version}", report=None
            )
        document = step(document)
        _, major, minor = _parse(document.get("schema"))
        current = f"v{major}.{minor}"
    return document
