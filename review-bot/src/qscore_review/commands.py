"""Write-collaborator commands; no command writes source or accepts candidates."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from qscore.errors import PlatformError

from qscore_review.github import GitHub
from qscore_review.settings import AllowedRepository
from qscore_review.state import State
from qscore_review.validation import SECRET


@dataclass(frozen=True)
class Command:
    name: str
    argument: str


def parse_command(body: str) -> Command | None:
    match = re.fullmatch(
        r"\s*(?:/gatesmith|@qscore-review)\s+"
        r"(rescore|improve|explain|why|ignore|full)(?:\s+([^\n]+))?\s*",
        body,
    )
    if not match:
        return None
    return Command(match[1], (match[2] or "").strip())


def _display(value: Any, limit: int = 1200) -> str:
    # Artifact strings remain quoted data; prevent fences, mentions and embedded markup.
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    if SECRET.search(text):
        return "[credential-like content omitted]"
    text = text.replace("`", "'").replace("@", "&#64;").replace("<", "&lt;")
    return text if len(text) <= limit else text[:limit] + "… (truncated)"


def explain_recorded(
    command: Command,
    allowed: AllowedRepository,
    pr: dict[str, Any],
    state: State | None,
    definitions_path: Path,
) -> str:
    try:
        pack = json.loads(definitions_path.read_text())
    except (OSError, ValueError) as exc:
        raise PlatformError("Committed engine definition pack is missing or invalid") from exc
    if pack["engine_revision"] != allowed.engine_revision:
        return "The committed definition pack does not match this repository's pinned engine."
    key = command.argument
    if command.name == "explain":
        if key not in pack["rules"]:
            return "Use `/gatesmith explain D03` with a rule from D01-D10."
        entry = pack["rules"][key]
        source = pack["sources"]["specs/07-diagnostics.md"]["url"]
        lines = [
            f"**{key}: {entry['title']}**",
            "Starting rule condition: " + entry["condition"],
            "Expected evidence: " + entry["evidence"],
            "Suggested strategies: " + entry["strategies"],
            "Profiles and explicit diagnostic policy may override starting thresholds; "
            "the recorded finding threshold and severity describe this run.",
        ]
        evidence_prefix = "finding:"
    else:
        if key not in pack["metrics"]:
            return "Unknown metric id. Use `/gatesmith why two_qubit_count` with a defined metric."
        entry = pack["metrics"][key]
        source = pack["sources"]["specs/06-metrics.md"]["url"]
        lines = [
            f"**Metric `{key}`** ({entry['kind']}; unit: {entry['unit']})",
            entry["definition"],
        ]
        if entry["notes"]:
            lines.append("Requirements or notes: " + entry["notes"])
        evidence_prefix = "metric:"
    lines.append(f"[Committed engine definition]({source}) · pack `{pack['version']}`.")
    comparison = f"{allowed.repository_id}:{pr['number']}:{pr['base']['sha']}:{pr['head']['sha']}"
    saved = state.current_evidence(comparison) if state else None
    if saved is None:
        lines.append(
            "Current PR evidence is unavailable: no completed evaluation for this exact "
            "base/head and latest workflow generation is stored. Request `/gatesmith rescore`."
        )
        return "\n\n".join(lines)
    lines.append(
        f"Current base `{pr['base']['sha'][:12]}` → head `{pr['head']['sha'][:12]}`; "
        f"workflow run `{saved['run_id']}`, attempt `{saved['run_attempt']}`."
    )
    if saved.get("evaluation") == "failed":
        lines.append(
            "The current evaluation failed; no metric values or resolved findings are claimed."
        )
    elif (
        saved["score_version"] != pack["score_version"]
        or saved["engine_revision"] != pack["engine_revision"]
    ):
        lines.append(
            "Saved evidence and the committed definitions have incompatible engine versions."
        )
    else:
        matches = [
            (identity, value)
            for identity, value in sorted(saved["evidence"].items())
            if identity.startswith(evidence_prefix) and identity.endswith(":" + key)
        ]
        if matches:
            lines.append("Recorded evidence (values and statuses, without new inference):")
            lines.extend(
                f"- `{_display(identity, 150)}`: `{_display(value)}`"
                for identity, value in matches[:5]
            )
            if len(matches) > 5:
                lines.append(
                    f"Showing 5 of {len(matches)} item records; see the PR summary for more."
                )
        else:
            lines.append(
                "This metric or rule has no stored current comparison evidence. A rule's absence "
                "does not prove it was evaluated; required metrics may be unavailable "
                "or suppressed."
            )
        if saved.get("omitted_evidence_records", 0):
            lines.append("Credential-like evidence records were omitted from stored explanations.")
    lines.append("This explanation does not change the score, check, or source.")
    return "\n\n".join(lines)


async def execute_command(
    command: Command,
    payload: dict[str, Any],
    allowed: AllowedRepository,
    github: GitHub,
    token: str,
    *,
    state: State | None = None,
    definitions_path: Path | None = None,
) -> str:
    repo, number = allowed.repository, payload["issue"]["number"]
    login = payload["comment"]["user"]["login"]
    if not re.fullmatch(r"[A-Za-z0-9-]+", login):
        raise PlatformError("Invalid GitHub login")
    permission = await github.request(
        "GET", f"/repos/{repo}/collaborators/{login}/permission", token=token
    )
    if permission.get("permission") not in {"write", "maintain", "admin"}:
        return "Gatesmith commands require collaborator write access."
    pr = await github.request("GET", f"/repos/{repo}/pulls/{number}", token=token)
    if pr["state"] != "open":
        return "This pull request is closed; no work was started."
    if command.name == "rescore":
        runs = await github.request(
            "GET",
            f"/repos/{repo}/actions/workflows/"
            f"{allowed.workflow_id}/runs?event=pull_request&head_sha={pr['head']['sha']}&per_page=100",
            token=token,
        )
        eligible = [
            run
            for run in runs["workflow_runs"]
            if run["head_sha"] == pr["head"]["sha"]
            and run["event"] == "pull_request"
            and run["workflow_id"] == allowed.workflow_id
            and run["path"] == allowed.workflow_path
            and number in {p["number"] for p in run.get("pull_requests", [])}
            and run["status"] == "completed"
        ]
        if not eligible:
            return "No completed allowed qscore workflow exists for the current PR head."
        run = max(eligible, key=lambda item: item["id"])
        await github.request(
            "POST", f"/repos/{repo}/actions/runs/{run['id']}/rerun", token=token, json={}
        )
        return "Requested a rescore of the current head. Fork results remain advisory."
    if command.name == "improve":
        return (
            "Improvement runs are unavailable: the engine verifier and approved platform "
            "handoff are not connected yet. No optimization was started. HF candidates "
            "must be verified and re-scored before they can become a reviewable fix."
        )
    if command.name == "ignore":
        match = re.fullmatch(r"(D\d{2})\s+(.{1,300})", command.argument)
        if not match:
            return "Use `/gatesmith ignore D05 <reason>` to draft a manifest suppression."
        rule, reason = match.groups()
        if SECRET.search(reason):
            return "Suppression draft omitted because the reason contains credential-like content."
        # JSON quoting is valid YAML and prevents injected keys/lines.
        return (
            "Suggested manifest edit; review it before applying:\n```yaml\n"
            "diagnose:\n  ignore:\n    - rule: "
            + rule
            + "\n      reason: "
            + json.dumps(reason)
            + "\n```"
        )
    if command.name in {"explain", "why"}:
        return explain_recorded(
            command,
            allowed,
            pr,
            state,
            definitions_path or Path(__file__).parents[2] / "knowledge/engine-definitions.json",
        )
    return (
        "Full-file model review is unavailable in this pass: privacy requires a separately "
        "bounded full-file context. Changed-line review remains enabled by repository opt-in."
    )
