import asyncio

import httpx
import pytest
from qscore.errors import PlatformError
from test_gemini import settings

from qscore_review.github import GitHub


def test_rest_uses_bearer_api_version_and_never_retries_uncertain_write(tmp_path):
    requests = []

    def handler(request):
        requests.append(request)
        if request.method == "POST":
            raise httpx.ReadTimeout("unknown write outcome")
        return httpx.Response(200, json={"id": 1})

    github = GitHub(settings(tmp_path), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert asyncio.run(github.request("GET", "/app", token="fake")) == {"id": 1}
    assert requests[0].headers["x-github-api-version"] == "2022-11-28"
    with pytest.raises(PlatformError):
        asyncio.run(github.request("POST", "/app", token="fake", json={}))
    assert len(requests) == 2


def test_artifact_redirect_cannot_send_auth_to_foreign_host(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(302, headers={"location": "https://evil.example/steal"})

    github = GitHub(settings(tmp_path), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(PlatformError, match="host"):
        asyncio.run(github.artifact("org/demo", 10, "fake"))
    assert len(calls) == 1


def test_valid_artifact_redirect_strips_github_authorization(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(
                302, headers={"location": "https://objects.githubusercontent.com/a"}
            )
        assert "authorization" not in request.headers
        return httpx.Response(200, content=b"zip-data")

    github = GitHub(settings(tmp_path), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert asyncio.run(github.artifact("org/demo", 10, "fake")) == b"zip-data"
