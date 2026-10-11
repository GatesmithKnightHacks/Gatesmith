"""Least-privilege GitHub App REST transport with bounded same-operation retries."""

from __future__ import annotations

import asyncio
import base64
import time
from typing import Any
from urllib.parse import urlparse

import httpx
import jwt
from qscore.errors import PlatformError

from qscore_review.settings import Settings


class GitHub:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=30, follow_redirects=False)
        self._tokens: dict[int, tuple[str, float]] = {}

    async def close(self) -> None:
        await self.client.aclose()

    def app_jwt(self) -> str:
        now = int(time.time())
        try:
            return jwt.encode(
                {"iat": now - 60, "exp": now + 540, "iss": str(self.settings.app_id)},
                self.settings.private_key_path.read_text(),
                algorithm="RS256",
            )
        except (OSError, jwt.PyJWTError, ValueError, TypeError) as exc:
            raise PlatformError(
                "GitHub App JWT could not be signed with the configured key"
            ) from exc

    async def token(self, installation: int) -> str:
        cached = self._tokens.get(installation)
        if cached and cached[1] > time.time():
            return cached[0]
        data = await self.request(
            "POST",
            f"/app/installations/{installation}/access_tokens",
            token=self.app_jwt(),
            json={},
        )
        token = data["token"]
        self._tokens[installation] = token, time.time() + 3000
        return token

    async def request(
        self, method: str, path: str, *, token: str, json: dict[str, Any] | None = None
    ) -> Any:
        if not path.startswith("/") or path.startswith("//"):
            raise PlatformError("Invalid GitHub API path")
        headers = {
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        for attempt in range(3):
            try:
                response = await self.client.request(
                    method, "https://api.github.com" + path, headers=headers, json=json
                )
            except httpx.TransportError as exc:
                if attempt == 2 or method not in {"GET", "HEAD"}:
                    raise PlatformError("GitHub transport failed after 3 attempts") from exc
                await asyncio.sleep(2**attempt)
                continue
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < 2 and method in {"GET", "HEAD"}:
                    await asyncio.sleep(2**attempt)
                    continue
            if response.is_error:
                raise PlatformError(f"GitHub API status {response.status_code}")
            if response.status_code == 204:
                return None
            try:
                return response.json()
            except ValueError as exc:
                raise PlatformError("GitHub returned invalid JSON") from exc
        raise PlatformError("GitHub retry limit reached")

    async def pages(self, path: str, token: str) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        separator = "&" if "?" in path else "?"
        for page in range(1, 11):
            data = await self.request(
                "GET", f"{path}{separator}per_page=100&page={page}", token=token
            )
            if not isinstance(data, list):
                raise PlatformError("Expected a GitHub list response")
            result.extend(data)
            if len(data) < 100:
                return result
        raise PlatformError("GitHub pagination limit exceeded")

    async def config(self, repository: str, base_sha: str, token: str) -> bytes | None:
        path = f"/repos/{repository}/contents/.github/qscore-review.yml?ref={base_sha}"
        # Absence is an explicit default, distinguished from all other API failures.
        response = await self.client.get(
            "https://api.github.com" + path,
            headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"},
        )
        if response.status_code == 404:
            return None
        if response.is_error:
            raise PlatformError(f"GitHub configuration status {response.status_code}")
        data = response.json()
        if data.get("encoding") != "base64" or data.get("size", 0) > 64_000:
            raise PlatformError("Unsupported or oversized repository configuration")
        try:
            return base64.b64decode(data["content"], validate=False)
        except (ValueError, KeyError) as exc:
            raise PlatformError("Malformed repository configuration") from exc

    async def artifact(self, repository: str, artifact_id: int, token: str) -> bytes:
        url = f"https://api.github.com/repos/{repository}/actions/artifacts/{artifact_id}/zip"
        headers = {"Authorization": "Bearer " + token}
        for _redirect in range(4):
            async with self.client.stream("GET", url, headers=headers) as response:
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("location", "")
                    parsed = urlparse(location)
                    host = parsed.hostname or ""
                    if (
                        parsed.scheme != "https"
                        or parsed.username
                        or parsed.password
                        or not any(
                            host == suffix or host.endswith("." + suffix)
                            for suffix in (
                                "github.com",
                                "githubusercontent.com",
                                "blob.core.windows.net",
                            )
                        )
                    ):
                        raise PlatformError("Artifact redirect host is not allowed")
                    url, headers = location, {}
                    continue
                if response.status_code != 200:
                    raise PlatformError(f"Artifact download status {response.status_code}")
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > self.settings.archive_max_bytes:
                        raise PlatformError("Artifact download exceeds size limit")
                    chunks.append(chunk)
                return b"".join(chunks)
        raise PlatformError("Artifact redirect limit exceeded")

    async def sticky(self, repo: str, pr: int, token: str, body: str) -> int:
        comments = await self.pages(f"/repos/{repo}/issues/{pr}/comments", token)
        own = [
            c
            for c in comments
            if "<!-- gatesmith:qscore-summary -->" in c.get("body", "")
            and (c.get("performed_via_github_app") or {}).get("id") == self.settings.app_id
        ]
        if own:
            result = await self.request(
                "PATCH",
                f"/repos/{repo}/issues/comments/{own[0]['id']}",
                token=token,
                json={"body": body[:65000]},
            )
        else:
            result = await self.request(
                "POST",
                f"/repos/{repo}/issues/{pr}/comments",
                token=token,
                json={"body": body[:65000]},
            )
        return result["id"]

    async def check(
        self,
        repo: str,
        head: str,
        token: str,
        conclusion: str,
        summary: str,
        external_id: str,
        check_id: int | None = None,
    ) -> int:
        payload: dict[str, Any] = {
            "name": "qscore",
            "head_sha": head,
            "status": "completed",
            "conclusion": conclusion,
            "external_id": external_id,
            "output": {"title": "Gatesmith circuit evaluation", "summary": summary[:65000]},
        }
        if check_id is not None:
            payload.pop("head_sha")
            result = await self.request(
                "PATCH", f"/repos/{repo}/check-runs/{check_id}", token=token, json=payload
            )
        else:
            existing = await self.request(
                "GET", f"/repos/{repo}/commits/{head}/check-runs", token=token
            )
            found = [
                c
                for c in existing["check_runs"]
                if c.get("external_id") == external_id
                and c.get("app", {}).get("id") == self.settings.app_id
            ]
            if found:
                return await self.check(
                    repo, head, token, conclusion, summary, external_id, found[0]["id"]
                )
            result = await self.request(
                "POST", f"/repos/{repo}/check-runs", token=token, json=payload
            )
        return result["id"]
