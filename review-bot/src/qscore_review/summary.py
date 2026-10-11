"""Evidence-only comparisons and policy; a model cannot change the conclusion."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from qscore.errors import RecordError
from qscore.schemas.scorecard import Scorecard

from qscore_review.bundle import LoadedBundle
from qscore_review.contracts import RepoConfig

METRICS = (
    "two_qubit_count",
    "two_qubit_depth",
    "depth",
    "size",
    "routing_overhead",
    "swaps_inserted",
    "reliability_heuristic",
    "seed_spread",
    "scheduled_duration",
)
SPREAD_METRICS = {"two_qubit_count", "two_qubit_depth", "depth"}


@dataclass
class Summary:
    body: str
    conclusion: str
    evidence: dict[str, dict[str, Any]]
    regressions: list[str]


def _safe(text: Any) -> str:
    return str(text).replace("`", "'").replace("|", "\\|").replace("@", "&#64;")[:1500]


def _groups(card: Scorecard | None) -> dict[str, list[Any]]:
    groups: dict[str, list[Any]] = {}
    if card is not None:
        for finding in card.findings:
            if finding.suppressed is None:
                groups.setdefault(finding.rule, []).append(finding)
    return groups


def _numeric(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def ensure_comparable(loaded: LoadedBundle) -> None:
    """Refuse comparisons across settings/target/seed/threshold/calibration changes."""
    for side in ("base", "head"):
        path = f"{side}/settings.json"
        if path not in loaded.payloads:
            raise RecordError("Missing evaluation settings provenance")
    base_settings = json.loads(loaded.payloads["base/settings.json"])
    head_settings = json.loads(loaded.payloads["head/settings.json"])
    runtime = {}
    item_settings = {}
    for side, settings in (("base", base_settings), ("head", head_settings)):
        if (
            not isinstance(settings, dict)
            or settings.get("comparison") != "conservative_declared_evaluation/v1"
            or not isinstance(settings.get("items"), dict)
        ):
            raise RecordError("Incomparable declared settings provenance")
        runtime[side] = {
            key: value for key, value in settings.items() if key not in {"comparison", "items"}
        }
        item_settings[side] = settings["items"]
    if runtime["base"] != runtime["head"]:
        raise RecordError("Incomparable evaluation runtime settings")
    expected = hashlib.sha256(
        json.dumps(runtime["base"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if expected != loaded.envelope.provenance.settings_sha256:
        raise RecordError("Evaluation settings fingerprint mismatch")
    for item in item_settings["base"].keys() & item_settings["head"].keys():
        if item_settings["base"][item] != item_settings["head"][item]:
            raise RecordError("Incomparable declared evaluation for item " + item)
    for item in loaded.cards["base"].keys() & loaded.cards["head"].keys():
        base, head = loaded.cards["base"][item], loaded.cards["head"][item]
        if base.target != head.target:
            raise RecordError("Incomparable target or calibration for item " + item)
        if base.compile is not None and head.compile is not None:
            if (
                base.compile.seeds != head.compile.seeds
                or base.compile.selection_policy != head.compile.selection_policy
            ):
                raise RecordError("Incomparable seeds or compile policy for item " + item)
        elif base.compile != head.compile:
            raise RecordError("Missing comparable compilation for item " + item)
        for field in ("profile", "thresholds_sha256", "fallbacks_enabled", "qiskit"):
            if getattr(base.provenance, field) != getattr(head.provenance, field):
                raise RecordError("Incomparable " + field + " for item " + item)


def build_summary(
    loaded: LoadedBundle, config: RepoConfig, *, run_url: str, docs_url: str
) -> Summary:
    p = loaded.envelope.provenance
    lines = [
        "<!-- gatesmith:qscore-summary -->",
        "## Gatesmith circuit comparison",
        f"Base `{p.base_sha[:12]}` → head `{p.head_sha[:12]}`.",
        "",
    ]
    evidence: dict[str, dict[str, Any]] = {}
    regressions: list[str] = []
    new_high = False
    head_errors = False
    engine_failed = loaded.envelope.base.exit_code in (2, 3, 4) or (
        loaded.envelope.head.exit_code in (2, 3, 4)
    )
    evaluated = {
        side: side in loaded.runs and getattr(loaded.envelope, side).exit_code in (0, 1)
        for side in ("base", "head")
    }
    unevaluated = not all(evaluated.values())
    if not engine_failed:
        ensure_comparable(loaded)
    for item in sorted(loaded.cards["base"].keys() | loaded.cards["head"].keys()):
        base, head = loaded.cards["base"].get(item), loaded.cards["head"].get(item)
        head_status = (
            _safe(head.status) if head else ("removed" if evaluated["head"] else "not evaluated")
        )
        lines.extend(
            [
                f"### `{_safe(item)}`",
                f"Status: {_safe(base.status) if base else 'not present'} → {head_status}.",
                "",
                "Metric | Base | Head | Comparison",
                "--- | ---: | ---: | ---",
            ]
        )
        bm = {m.id: m for m in base.metrics} if base else {}
        hm = {m.id: m for m in head.metrics} if head else {}
        for metric in METRICS:
            b, h = bm.get(metric), hm.get(metric)
            bv, hv = b.value if b else None, h.value if h else None
            context = "unavailable"
            vals = [value for value in (bv, hv) if _numeric(value)]
            if (
                not unevaluated
                and b
                and h
                and b.status == h.status == "computed"
                and _numeric(bv)
                and _numeric(hv)
            ):
                if bv == hv:
                    context = "unchanged"
                elif metric in SPREAD_METRICS and base and base.compile:
                    spread = [getattr(seed, metric) for seed in base.compile.per_seed]
                    vals.extend(spread)
                    if spread and min(spread) <= hv <= max(spread):
                        context = "within seed spread"
                    elif spread:
                        context = (
                            "worse outside seed spread"
                            if hv > max(spread)
                            else ("better outside seed spread")
                        )
                        if hv > max(spread):
                            regressions.append(f"{item}:{metric}")
                else:
                    context = "changed; per-seed range unavailable"
            elif h:
                context = str(h.status)
            lines.append(
                f"`{metric}` | {_safe(bv) if b else '—'} | {_safe(hv) if h else '—'} | {context}"
            )
            evidence[f"metric:{item}:{metric}"] = {
                "numbers": vals,
                "base": bv,
                "head": hv,
                "comparison": context,
                "error": False,
            }
        bg, hg = _groups(base), _groups(head)
        lines.extend(["", "Findings:"])
        if not bg and not hg:
            lines.append("- None.")
        for rule in sorted(bg.keys() | hg.keys()):
            status = (
                "unchanged" if rule in bg and rule in hg else ("new" if rule in hg else "resolved")
            )
            if unevaluated:
                status = "unassessed (incomplete evaluation)"
            findings = hg.get(rule, bg.get(rule, []))
            high_head = any(f.severity == "high" for f in hg.get(rule, []))
            high_base = any(f.severity == "high" for f in bg.get(rule, []))
            new_high |= high_head and not high_base and not unevaluated
            regions = [f.region.model_dump() if f.region else None for f in findings]
            numbers: list[int | float] = []
            for finding in findings:
                numbers.extend(v for v in finding.evidence.values() if _numeric(v))
            ev = {
                "findings": [f.model_dump(mode="json") for f in findings],
                "numbers": numbers,
                "error": False,
            }
            evidence[f"finding:{item}:{rule}"] = ev
            lines.append(
                f"- **{status} {rule}** ({', '.join(sorted({str(f.severity) for f in findings}))})"
                f" · region `{_safe(regions)}` · evidence `{_safe([f.evidence for f in findings])}`"
            )
        if head and head.status == "failed":
            engine_failed = True
    lines.extend(["", "### Validation"])
    for side, report in loaded.issues.items():
        for issue in report.issues:
            location = issue.location
            evidence[f"issue:{issue.code}:{location.file}:{location.line}"] = {
                "numbers": [location.line] if location.line is not None else [],
                "error": issue.severity == "error",
                "code": issue.code,
                "message": issue.message,
            }
            if side == "head" and issue.severity == "error":
                head_errors = True
            lines.append(
                f"- {side}: **{issue.code}** `{_safe(location.file)}:{location.line}`"
                f" {_safe(issue.message)}" + (f" · {_safe(issue.hint)}" if issue.hint else "")
            )
    for side, discovery in loaded.discoveries.items():
        lines.append(
            f"- {side}: discovery record in `{side}/discovery.json`; no manifest was scored."
        )
        # The discovery schema is engine-owned. Display its explicit draft only, never execute it.
        draft = discovery.get("draft")
        draft_path = f"{side}/qscore.suggested.yaml"
        if draft_path in loaded.payloads:
            draft = loaded.payloads[draft_path].decode("utf-8")
        if isinstance(draft, str):
            lines.extend(
                [
                    "",
                    "Draft manifest (review placeholders before using):",
                    "```yaml",
                    draft.replace("```", "'''")[:12000],
                    "```",
                ]
            )
    if engine_failed:
        lines.append(
            "- **Evaluation failed**: invalid input, engine exit 3/4 or failed scorecard; "
            "no passing score."
        )
    if unevaluated:
        lines.append(
            "- **Not evaluated**: discovery or incomplete scoring cannot establish a passing gate."
        )
    policy_failure = (
        (config.fail_on is not None and unevaluated)
        or (config.fail_on == "new_high" and new_high)
        or (config.fail_on == "regression" and bool(regressions))
        or (config.fail_on == "error" and head_errors)
    )
    conclusion = "failure" if engine_failed or policy_failure else "neutral"
    if config.fail_on and not engine_failed and not policy_failure and not unevaluated:
        conclusion = "success"
    if p.fork:
        conclusion = "neutral"
        lines.append("- Fork-produced results are advisory. A rerun does not establish trust.")
    lines.extend(
        [
            "",
            "### Reproduce",
            f"Engine revision `{p.engine_revision}`; "
            f"score version `{_safe(p.score_version)}`; "
            f"evaluation fingerprint `{p.settings_sha256}`.",
            "Comparability uses conservative declared evaluation settings under the pinned engine; "
            "equivalent declaration edits may still be reported as incomparable.",
        ]
    )
    for side, run in loaded.runs.items():
        digest = hashlib.sha256(loaded.payloads[getattr(loaded.envelope, side).run]).hexdigest()
        lines.append(
            f"- {side}: qscore `{_safe(run.provenance.qscore)}`, "
            f"Qiskit `{_safe(run.provenance.qiskit)}`, `run.json` SHA-256 `{digest}`."
        )
        lines.append(f"  Command: `{_safe(run.command)}`")
    for side, cards in loaded.cards.items():
        for item, card in cards.items():
            if card.compile:
                lines.append(
                    f"- {side} `{_safe(item)}`: target "
                    f"`{_safe(card.target.name) if card.target else 'unavailable'}`, "
                    f"seeds `{card.compile.seeds}`, representative seed "
                    f"`{card.compile.representative_seed}`."
                )
    lines.extend(
        [
            f"[Workflow and compiled QASM artifact]({run_url}) · "
            f"[Gatesmith documentation]({docs_url})",
            "",
            "The engine decides scores and policy. Model comments are advisory.",
        ]
    )
    return Summary("\n".join(lines), conclusion, evidence, regressions)
