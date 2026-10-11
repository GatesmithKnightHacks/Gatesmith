"""Write-collaborator commands; no command writes source or accepts candidates."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from qscore.errors import PlatformError

from qscore_review.github import GitHub
from qscore_review.settings import AllowedRepository


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


async def execute_command(
    command: Command,
    payload: dict[str, Any],
    allowed: AllowedRepository,
    github: GitHub,
    token: str,
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
        # JSON quoting is valid YAML and prevents injected keys/lines.
        import json

        return (
            "Suggested manifest edit; review it before applying:\n```yaml\n"
            "diagnose:\n  ignore:\n    - rule: "
            + rule
            + "\n      reason: "
            + json.dumps(reason)
            + "\n```"
        )
    if command.name == "explain":
        if not re.fullmatch(r"D0[1-9]|D10", command.argument):
            return "Use `/gatesmith explain D03` with a rule from D01-D10."
        return (
            f"Rule `{command.argument}`: see the [engine diagnostic definition]"
            "(https://github.com/GatesmithKnightHacks/Gatesmith/blob/github-app/"
            "specs/07-diagnostics.md) and this PR's recorded finding evidence above. "
            "The explanation does not change the score or check."
        )
    if command.name == "why":
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,60}", command.argument):
            return "Use `/gatesmith why two_qubit_count` with a metric id."
        return (
            f"Metric `{command.argument}`: see the [engine metric definition]"
            "(https://github.com/GatesmithKnightHacks/Gatesmith/blob/github-app/"
            "specs/06-metrics.md). Values in the PR summary come from its saved scorecards."
        )
    return (
        "Full-file model review is unavailable in this pass: privacy requires a separately "
        "bounded full-file context. Changed-line review remains enabled by repository opt-in."
    )
