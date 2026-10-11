import asyncio
import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from qscore.errors import PlatformError
from test_gemini import settings

from qscore_review.github import GitHub


@pytest.fixture
def test_signing_key(tmp_path):
    # Ephemeral test material only; never loads an account credential.
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    cfg = settings(tmp_path)
    cfg.private_key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    cfg.private_key_path.chmod(0o600)
    return cfg, key


def test_real_rs256_signing_has_string_app_issuer_and_bounded_claims(test_signing_key):
    cfg, key = test_signing_key
    github = GitHub(cfg)
    before = int(time.time())
    token = github.app_jwt()
    after = int(time.time())
    claims = jwt.decode(
        token,
        key.public_key(),
        algorithms=["RS256"],
        issuer=str(cfg.app_id),
        options={"require": ["iat", "exp", "iss"]},
    )
    assert claims["iss"] == str(cfg.app_id)
    assert before - 60 <= claims["iat"] <= after - 60
    assert claims["exp"] - claims["iat"] == 600
    assert jwt.get_unverified_header(token)["alg"] == "RS256"
    asyncio.run(github.close())


@pytest.mark.parametrize("invalid", ["missing", "malformed", "encrypted"])
def test_expected_key_encoding_failures_are_typed_and_sanitized(test_signing_key, invalid):
    cfg, key = test_signing_key
    if invalid == "missing":
        cfg.private_key_path.unlink()
    elif invalid == "malformed":
        cfg.private_key_path.write_text("synthetic-invalid-private-key-material")
    else:
        cfg.private_key_path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.BestAvailableEncryption(b"test-only-passphrase"),
            )
        )
    github = GitHub(cfg)
    with pytest.raises(PlatformError, match="JWT could not be signed") as exc:
        github.app_jwt()
    assert "synthetic-invalid-private-key-material" not in str(exc.value)
    assert "test-only-passphrase" not in str(exc.value)
    asyncio.run(github.close())


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
