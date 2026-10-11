"""Durable GitHub webhook service: authenticated data → evidence → advisory review."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import re
import sqlite3
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from pydantic import ValidationError
from qscore.errors import LayerError, QscoreError, RecordError

from qscore_review.bundle import load_bundle, validate_provenance
from qscore_review.commands import execute_command, parse_command
from qscore_review.gemini import MODEL, PROMPT_VERSION, Gemini
from qscore_review.github import GitHub
from qscore_review.settings import Settings, parse_repo_config
from qscore_review.state import State
from qscore_review.summary import build_summary
from qscore_review.validation import SECRET, prepare_diff, validate_review

LOGGER = logging.getLogger(__name__)


def verify_signature(raw: bytes, signature: str | None, secret: str) -> bool:
    if signature is None or not re.fullmatch(r"sha256=[0-9a-f]{64}", signature):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


class Service:
    def __init__(self, settings: Settings, state: State, github: GitHub, gemini: Gemini) -> None:
        self.settings, self.state, self.github, self.gemini = settings, state, github, gemini
        self.wake = asyncio.Event()
        self.stopping = False

    async def run(self) -> None:
        self.state.recover()
        while not self.stopping:
            job = self.state.claim()
            if job is None:
                self.wake.clear()
                try:
                    await asyncio.wait_for(self.wake.wait(), timeout=2)
                except TimeoutError:
                    continue
                continue
            try:
                await self.process(job["kind"], job["payload"])
            except (
                QscoreError,
                ValidationError,
                KeyError,
                ValueError,
                TypeError,
                httpx.HTTPError,
                sqlite3.Error,
            ) as exc:
                # Persist only the exception type, not URLs, payloads, credentials or private code.
                LOGGER.error("Bot job failed: %s", type(exc).__name__)
                self.state.finish(job["delivery"], type(exc).__name__)
            else:
                self.state.finish(job["delivery"])

    async def current(self, repo: str, pr: int, head: str, token: str) -> bool:
        latest = await self.github.request("GET", f"/repos/{repo}/pulls/{pr}", token=token)
        return latest["state"] == "open" and latest["head"]["sha"] == head

    async def process(self, kind: str, payload: dict[str, Any]) -> None:
        allowed = self.settings.allowed(payload["repository"]["id"], payload["installation"]["id"])
        if payload["repository"]["full_name"] != allowed.repository:
            raise RecordError("Repository name does not match allowlist")
        token = await self.github.token(allowed.installation_id)
        if kind == "issue_comment":
            command = parse_command(payload["comment"]["body"])
            if command is None:
                return
            marker = "<!-- gatesmith:command:" + str(payload["comment"]["id"]) + " -->"
            comments = await self.github.pages(
                f"/repos/{allowed.repository}/issues/{payload['issue']['number']}/comments", token
            )
            if any(
                marker in c.get("body", "")
                and (c.get("performed_via_github_app") or {}).get("id") == self.settings.app_id
                for c in comments
            ):
                return
            if not self.state.claim_command(f"{allowed.repository_id}:{payload['comment']['id']}"):
                return
            result = await execute_command(command, payload, allowed, self.github, token)
            await self.github.request(
                "POST",
                f"/repos/{allowed.repository}/issues/{payload['issue']['number']}/comments",
                token=token,
                json={"body": marker + "\n" + result},
            )
            return
        run_id = payload["workflow_run"]["id"]
        run = await self.github.request(
            "GET", f"/repos/{allowed.repository}/actions/runs/{run_id}", token=token
        )
        if (
            run["workflow_id"] != allowed.workflow_id
            or run["path"] != allowed.workflow_path
            or run["event"] != "pull_request"
            or run["status"] != "completed"
        ):
            raise RecordError("Completed workflow is not allowed")
        artifact_listing = await self.github.request(
            "GET",
            f"/repos/{allowed.repository}/actions/runs/{run_id}/artifacts?per_page=100",
            token=token,
        )
        if artifact_listing["total_count"] > 100:
            raise RecordError("Workflow artifact inventory exceeds limit")
        artifacts = [
            a
            for a in artifact_listing["artifacts"]
            if a["name"] == "qscore-review-bundle" and not a["expired"]
        ]
        if len(artifacts) != 1:
            await self.workflow_failure(
                allowed.repository,
                run,
                token,
                "Workflow did not produce exactly one valid qscore bundle.",
            )
            raise RecordError("Missing or ambiguous qscore artifact")
        try:
            raw = await self.github.artifact(allowed.repository, artifacts[0]["id"], token)
            loaded = load_bundle(
                raw,
                compressed_limit=self.settings.archive_max_bytes,
                uncompressed_limit=self.settings.archive_max_uncompressed,
            )
            p = loaded.envelope.provenance
            pr = await self.github.request(
                "GET", f"/repos/{allowed.repository}/pulls/{p.pull_request}", token=token
            )
            if pr["head"]["sha"] != p.head_sha or pr["state"] != "open":
                LOGGER.info("Ignored a completed workflow for an older or closed PR head")
                return
            validate_provenance(loaded, allowed, run, pr)
            config = parse_repo_config(
                await self.github.config(allowed.repository, p.base_sha, token)
            )
            if config != loaded.envelope.config:
                raise RecordError("Bundle configuration differs from trusted base configuration")
            comparison = f"{p.repository_id}:{p.pull_request}:{p.base_sha}:{p.head_sha}"
            identity = f"{comparison}:run:{p.run_id}:attempt:{p.run_attempt}"
            previous = self.state.review(identity)
            if previous and previous["status"] == "complete":
                return
            summary = build_summary(
                loaded, config, run_url=run["html_url"], docs_url=self.settings.docs_url
            )
        except (QscoreError, ValidationError, KeyError, ValueError) as exc:
            await self.workflow_failure(
                allowed.repository, run, token, "Evaluation data rejected: " + type(exc).__name__
            )
            raise
        body = summary.body
        if config.gemini and payload["repository"].get("private"):
            body += (
                "\n\nExternal inference notice: opted-in changed diff hunks (up to 40 context "
                "lines), recorded metrics/findings/issues and relevant API facts are sent to "
                "Google Gemini. Excluded and credential-like files are filtered."
            )
        if not await self.current(allowed.repository, p.pull_request, p.head_sha, token):
            return
        comment_id = await self.github.sticky(allowed.repository, p.pull_request, token, body)
        self.state.save_review(identity, summary_id=comment_id)
        check_id = await self.github.check(
            allowed.repository,
            p.head_sha,
            token,
            summary.conclusion,
            body,
            comparison,
            previous.get("check_id") if previous else None,
        )
        self.state.save_review(identity, check_id=check_id)
        if not config.gemini:
            self.state.save_review(identity, status="complete")
            return
        try:
            files = await self.github.pages(
                f"/repos/{allowed.repository}/pulls/{p.pull_request}/files", token
            )
            diff = prepare_diff(files, config)
            evidence = {
                key: value
                for key, value in summary.evidence.items()
                if not SECRET.search(json.dumps(value))
            }
            evidence.update(diff.code_evidence)
            knowledge = self.knowledge(loaded.envelope.detected_versions, diff.hunks)
            for entry in knowledge["entries"]:
                evidence["knowledge:" + entry["id"]] = {"numbers": [], "error": False}
            context = {
                "detected_versions": [v.model_dump() for v in loaded.envelope.detected_versions],
                "evidence": evidence,
                "changed_hunks": diff.hunks,
                "knowledge": knowledge,
                "general_comments": config.general_comments,
            }
            if not await self.current(allowed.repository, p.pull_request, p.head_sha, token):
                return
            draft = await self.gemini.draft(
                f"{p.repository_id}:{p.pull_request}:{p.head_sha}", comparison, context
            )
            validated = validate_review(
                draft, diff, evidence, config, loaded.envelope.detected_versions
            )
            if validated.summary_note:
                body += "\n\nGemini: " + validated.summary_note
            reasons = validated.dropped + diff.skipped
            body += f"\n\nReview model `{MODEL}` · thinking `HIGH` · `{PROMPT_VERSION}` · "
            body += f"knowledge `{knowledge['version']}`."
            billed = self.state.model(f"{p.repository_id}:{p.pull_request}:{p.head_sha}")
            if billed and billed["usage"]:
                usage = json.loads(billed["usage"])
                body += (
                    f" Input tokens `{usage['input_tokens']}`; billed output tokens "
                    f"`{usage['output_tokens']}` (thinking `{usage['thinking_tokens']}`); "
                    f"estimated cost `${billed['cost']:.4f}`."
                )
            if reasons:
                body += "\n\nReview filtering:\n" + "\n".join("- " + reason for reason in reasons)
            if not await self.current(allowed.repository, p.pull_request, p.head_sha, token):
                return
            if validated.comments:
                marker = (
                    "<!-- gatesmith:review:"
                    + hashlib.sha256(comparison.encode()).hexdigest()
                    + " -->"
                )
                reviews = await self.github.pages(
                    f"/repos/{allowed.repository}/pulls/{p.pull_request}/reviews", token
                )
                app_info = await self.github.request("GET", "/app", token=self.github.app_jwt())
                own = [
                    review
                    for review in reviews
                    if marker in (review.get("body") or "")
                    and review["user"]["login"] == app_info["slug"] + "[bot]"
                    and review["commit_id"] == p.head_sha
                ]
                if own:
                    review_id = own[0]["id"]
                else:
                    comments = []
                    for comment in validated.comments:
                        text = comment.body
                        if comment.suggestion is not None:
                            text += "\n\n```suggestion\n" + comment.suggestion + "\n```"
                        comments.append(
                            {
                                "path": comment.path,
                                "line": comment.line,
                                "side": "RIGHT",
                                "body": text,
                            }
                        )
                    posted = await self.github.request(
                        "POST",
                        f"/repos/{allowed.repository}/pulls/{p.pull_request}/reviews",
                        token=token,
                        json={
                            "commit_id": p.head_sha,
                            "event": "COMMENT",
                            "body": marker + "\nEvidence-backed circuit review.",
                            "comments": comments,
                        },
                    )
                    review_id = posted["id"]
                self.state.save_review(identity, review_id=review_id)
            conclusion = summary.conclusion
        except (LayerError, ValidationError, httpx.HTTPError) as exc:
            # The deterministic engine/policy failure always takes precedence.
            conclusion = "failure" if summary.conclusion == "failure" else "neutral"
            body += (
                "\n\nGemini review failed: " + type(exc).__name__ + ". No other model was tried."
            )
        if not await self.current(allowed.repository, p.pull_request, p.head_sha, token):
            return
        await self.github.sticky(allowed.repository, p.pull_request, token, body)
        await self.github.check(
            allowed.repository, p.head_sha, token, conclusion, body, comparison, check_id
        )
        self.state.save_review(
            identity,
            status="complete",
            result=json.dumps({"conclusion": conclusion, "model": MODEL, "prompt": PROMPT_VERSION}),
        )

    def knowledge(self, versions: list[Any], hunks: list[dict[str, str]]) -> dict[str, Any]:
        from packaging.specifiers import SpecifierSet
        from packaging.version import InvalidVersion, Version

        try:
            data = json.loads(self.settings.knowledge_path.read_text())
        except (OSError, ValueError) as exc:
            raise LayerError("Versioned Qiskit knowledge pack is missing or invalid") from exc
        detected = {v.package: v.value for v in versions}
        selected = []
        text = "\n".join(h["patch"] for h in hunks)
        for entry in data["entries"]:
            value = detected.get(entry["package"])
            if value is None:
                continue
            try:
                version = Version(value)
            except InvalidVersion:
                continue
            if version in SpecifierSet(entry["versions"]) and any(
                keyword in text for keyword in entry["keywords"]
            ):
                selected.append(entry)
        return {"version": data["version"], "entries": selected}

    async def workflow_failure(
        self, repo: str, run: dict[str, Any], token: str, reason: str
    ) -> None:
        for linked in run.get("pull_requests", []):
            if not await self.current(repo, linked["number"], run["head_sha"], token):
                continue
            body = (
                "<!-- gatesmith:qscore-summary -->\n## Gatesmith could not evaluate this PR\n"
                + reason
                + f"\n\n[Workflow logs]({run['html_url']})"
            )
            await self.github.sticky(repo, linked["number"], token, body)
            await self.github.check(
                repo,
                run["head_sha"],
                token,
                "failure",
                body,
                f"workflow-failure:{run['id']}:{run['run_attempt']}",
            )


def create_app(
    settings: Settings | None = None,
    *,
    state: State | None = None,
    github: GitHub | None = None,
    gemini: Gemini | None = None,
    start_worker: bool = True,
) -> FastAPI:
    settings = settings or Settings.from_environment()
    state = state or State(settings.state_path)
    github = github or GitHub(settings)
    gemini = gemini or Gemini(settings, state)
    service = Service(settings, state, github, gemini)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        task = asyncio.create_task(service.run()) if start_worker else None
        yield
        service.stopping = True
        service.wake.set()
        if task:
            await task
        await github.close()
        state.close()

    app = FastAPI(lifespan=lifespan)
    app.state.service = service

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/webhooks/github", status_code=202)
    async def webhook(request: Request) -> dict[str, str]:
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 2_000_000:
                raise HTTPException(413, "Webhook exceeds size limit")
        if not verify_signature(
            bytes(raw), request.headers.get("x-hub-signature-256"), settings.webhook_secret
        ):
            raise HTTPException(401, "Invalid webhook signature")
        delivery = request.headers.get("x-github-delivery", "")
        if not re.fullmatch(r"[A-Za-z0-9-]{1,100}", delivery):
            raise HTTPException(400, "Missing or invalid delivery id")
        kind = request.headers.get("x-github-event", "")
        try:
            payload = json.loads(raw)
            if kind == "ping":
                return {"status": "pong"}
            if kind not in {"workflow_run", "issue_comment", "pull_request"}:
                raise HTTPException(400, "Unsupported event")
            allowed = settings.allowed(payload["repository"]["id"], payload["installation"]["id"])
            if payload["repository"]["full_name"] != allowed.repository:
                raise RecordError("Repository name mismatch")
            if kind == "pull_request":
                return {"status": "awaiting-workflow"}
            if kind == "workflow_run" and payload.get("action") != "completed":
                return {"status": "ignored"}
            if kind == "issue_comment" and (
                payload.get("action") != "created"
                or "pull_request" not in payload["issue"]
                or parse_command(payload["comment"]["body"]) is None
            ):
                return {"status": "ignored"}
        except (QscoreError, ValueError, KeyError, TypeError) as exc:
            raise HTTPException(400, "Invalid or disallowed webhook payload") from exc
        inserted = state.enqueue(delivery, kind, payload)
        service.wake.set()
        return {"status": "queued" if inserted else "duplicate"}

    return app


def main() -> None:
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=8080, log_level="info")
