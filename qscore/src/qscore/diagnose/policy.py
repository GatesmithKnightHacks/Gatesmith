"""Thresholds, profiles, suppression and ranking (specs/07-diagnostics.md §2, §4, §5)."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from importlib import resources
from typing import Any

from ruamel.yaml import YAML

from qscore.errors import ConfigError
from qscore.schemas.common import FindingSeverity, sha256_hex
from qscore.schemas.scorecard import Finding, Suppression

_PKG = "qscore.diagnose"


def _load(name: str) -> dict[str, Any]:
    text = resources.files(_PKG).joinpath(name).read_text(encoding="utf-8")
    data: dict[str, Any] = YAML(typ="safe").load(text)
    return data


def thresholds_text() -> str:
    return resources.files(_PKG).joinpath("thresholds.yaml").read_text(encoding="utf-8")


def thresholds_sha256() -> str:
    return sha256_hex(thresholds_text())


@dataclass(frozen=True)
class Policy:
    thresholds: dict[str, dict[str, Any]]
    severity: dict[str, Any]
    profile: str | None
    off: dict[str, str] = field(default_factory=dict)  # rule -> reason (profile)
    ignore: dict[str, str] = field(default_factory=dict)  # rule -> reason (manifest)


def effective_policy(profile: str | None, ignore: dict[str, str] | None = None) -> Policy:
    """Profile first, then the manifest's `diagnose.ignore` (CLI overrides arrive with T14)."""
    base = _load("thresholds.yaml")
    rules = copy.deepcopy(base["rules"])
    off: dict[str, str] = {}
    if profile is not None:
        path = resources.files(_PKG).joinpath("profiles", f"{profile}.yaml")
        if not path.is_file():
            raise ConfigError(f"unknown diagnose profile {profile!r}")
        prof = _load(f"profiles/{profile}.yaml")
        for rule, values in (prof.get("overrides") or {}).items():
            rules[rule].update(values)
        off = dict(prof.get("off") or {})
    return Policy(rules, base["severity"], profile, off, dict(ignore or {}))


def apply(policy: Policy, findings: list[Finding]) -> list[Finding]:
    """Suppressed findings stay in the list with `suppressed: {by, reason}`."""
    out = []
    for f in findings:
        if f.rule in policy.off:
            f = f.model_copy(
                update={"suppressed": Suppression(by="profile", reason=policy.off[f.rule])}
            )
        elif f.rule in policy.ignore:
            f = f.model_copy(
                update={"suppressed": Suppression(by="manifest", reason=policy.ignore[f.rule])}
            )
        out.append(f)
    return out


_RANK = {FindingSeverity.HIGH: 0, FindingSeverity.WARNING: 1, FindingSeverity.INFO: 2}


def rank(findings: list[Finding]) -> list[Finding]:
    """By severity, then rule id, then region start (measured impact is Tier 2)."""
    return sorted(
        findings,
        key=lambda f: (_RANK[f.severity], f.rule, f.region.layers[0] if f.region else -1, f.id),
    )
