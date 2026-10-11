import asyncio
import json
from types import SimpleNamespace

import pytest
from qscore.errors import LayerError
from test_bundle import allowed

from qscore_review.gemini import GENERATION_COMMENT_LIMIT, MODEL, Gemini
from qscore_review.settings import Settings
from qscore_review.state import State


def settings(tmp_path):
    return Settings(
        app_id=42,
        private_key_path=tmp_path / "app.pem",
        webhook_secret="x" * 32,
        repositories=[allowed()],
        state_path=tmp_path / "state.db",
        gemini_api_key="test-not-a-real-key",
    )


class FakeModels:
    def __init__(self, text=None):
        self.calls = []
        self.text = text or json.dumps(
            {"schema": "qscore.review/v0.1", "summary_note": "", "comments": []}
        )

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            text=self.text,
            usage_metadata=SimpleNamespace(
                prompt_token_count=100, candidates_token_count=50, thoughts_token_count=200
            ),
        )


def test_exact_high_thinking_schema_no_tools_accounting_and_one_call(tmp_path):
    models = FakeModels()
    state = State(tmp_path / "state.db")
    client = Gemini(settings(tmp_path), state, SimpleNamespace(aio=SimpleNamespace(models=models)))
    asyncio.run(client.draft("head", "comparison", {"numbers": [1, 2]}))
    asyncio.run(client.draft("head", "comparison", {"numbers": [1, 2]}))
    assert len(models.calls) == 1
    call = models.calls[0]
    assert call["model"] == MODEL
    assert call["config"].thinking_config.thinking_level == "HIGH"
    assert call["config"].automatic_function_calling.disable is True
    record = state.model("head")
    assert record["cost"] == pytest.approx((100 * 2 + 250 * 12) / 1_000_000)
    assert json.loads(record["usage"])["thinking_tokens"] == 200


def test_schema_failure_cannot_trigger_second_call(tmp_path):
    models = FakeModels("invalid json")
    state = State(tmp_path / "state.db")
    client = Gemini(settings(tmp_path), state, SimpleNamespace(aio=SimpleNamespace(models=models)))
    with pytest.raises(LayerError, match="structured-output"):
        asyncio.run(client.draft("head", "comparison", {}))
    with pytest.raises(LayerError, match="already attempted"):
        asyncio.run(client.draft("head", "comparison", {}))
    assert len(models.calls) == 1


def test_quota_retries_same_model_only_and_keeps_budget_reserved(tmp_path, monkeypatch):
    from google.genai import errors

    class QuotaModels:
        def __init__(self):
            self.calls = []

        async def generate_content(self, **kwargs):
            self.calls.append(kwargs)
            raise errors.ClientError(429, {"error": {"message": "quota"}})

    async def no_wait(_):
        return None

    monkeypatch.setattr("qscore_review.gemini.asyncio.sleep", no_wait)
    models = QuotaModels()
    state = State(tmp_path / "state.db")
    client = Gemini(settings(tmp_path), state, SimpleNamespace(aio=SimpleNamespace(models=models)))
    with pytest.raises(LayerError, match="ClientError"):
        asyncio.run(client.draft("head", "comparison", {}))
    assert len(models.calls) == 3
    assert {call["model"] for call in models.calls} == {MODEL}
    assert state.model("head")["cost"] > 0


@pytest.mark.parametrize(
    "field,value",
    [
        ("prompt_token_count", None),
        ("candidates_token_count", None),
        ("thoughts_token_count", None),
        ("thoughts_token_count", -1),
        ("candidates_token_count", True),
        ("prompt_token_count", 1.5),
        ("candidates_token_count", 100_000),
        ("prompt_token_count", 1_000_000),
        ("total_token_count", 999),
    ],
)
def test_missing_invalid_or_excess_usage_keeps_entire_reservation(tmp_path, field, value):
    class InvalidUsageModels(FakeModels):
        async def generate_content(self, **kwargs):
            result = await super().generate_content(**kwargs)
            setattr(result.usage_metadata, field, value)
            return result

    models = InvalidUsageModels()
    state = State(tmp_path / "state.db")
    client = Gemini(settings(tmp_path), state, SimpleNamespace(aio=SimpleNamespace(models=models)))
    with pytest.raises(LayerError, match="billed usage"):
        asyncio.run(client.draft("head", "comparison", {}))
    record = state.model("head")
    usage = json.loads(record["usage"])
    assert usage["usage_status"] == "unknown_or_invalid"
    assert record["cost"] == usage["reserved_cost_usd"] > 0
    assert "output_tokens" not in usage and record["draft"] is None
    with pytest.raises(LayerError, match="already attempted"):
        asyncio.run(client.draft("head", "comparison", {}))
    assert len(models.calls) == 1


def test_actual_developer_api_sdk_serializes_strict_json_schema_without_repair(tmp_path):
    import httpx
    from google import genai
    from google.genai import types

    from qscore_review.contracts import ReviewDraft

    captured = []

    def transport(request):
        assert request.url.host == "generativelanguage.googleapis.com"
        captured.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "schema": "qscore.review/v0.1",
                                            "summary_note": "",
                                            "comments": [],
                                        }
                                    )
                                }
                            ],
                        },
                        "finishReason": "STOP",
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 100,
                    "candidatesTokenCount": 50,
                    "thoughtsTokenCount": 200,
                    "totalTokenCount": 350,
                },
            },
        )

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as http:
            sdk = genai.Client(
                api_key="test-not-a-real-key",
                http_options=types.HttpOptions(
                    httpx_async_client=http, retry_options=types.HttpRetryOptions(attempts=1)
                ),
            )
            layer = Gemini(settings(tmp_path), State(tmp_path / "state.db"), sdk)
            draft = await layer.draft("sdk-head", "comparison", {})
            assert draft.schema_id == "qscore.review/v0.1"
            await sdk.aio.aclose()

    asyncio.run(exercise())
    config = captured[0]["generationConfig"]
    assert "responseSchema" not in config
    expected = ReviewDraft.model_json_schema(by_alias=True)
    assert expected["properties"]["comments"]["maxItems"] == 100
    expected["properties"]["comments"]["maxItems"] = GENERATION_COMMENT_LIMIT
    # Exact deep equality proves no other schema field/constraint/reference changed.
    assert GENERATION_COMMENT_LIMIT == 10
    assert config["responseJsonSchema"] == expected
    assert ReviewDraft.model_json_schema(by_alias=True)["properties"]["comments"]["maxItems"] == 100
    assert config["responseJsonSchema"]["additionalProperties"] is False
    # SDK 2.29 copies this nested configuration with its original snake_case keys.
    assert config["thinkingConfig"]["thinking_level"] == "HIGH"
    assert "tools" not in captured[0]


def test_actual_sdk_provider_schema_rejection_never_retries_or_changes_schema(tmp_path):
    import httpx
    from google import genai
    from google.genai import types

    captured = []
    state = State(tmp_path / "state.db")

    def transport(request):
        captured.append(json.loads(request.content))
        return httpx.Response(
            400,
            json={
                "error": {
                    "code": 400,
                    "status": "INVALID_ARGUMENT",
                    "message": "Synthetic provider schema rejection",
                }
            },
        )

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as http:
            sdk = genai.Client(
                api_key="test-not-a-real-key",
                http_options=types.HttpOptions(
                    httpx_async_client=http, retry_options=types.HttpRetryOptions(attempts=1)
                ),
            )
            layer = Gemini(settings(tmp_path), state, sdk)
            with pytest.raises(LayerError, match="ClientError"):
                await layer.draft("rejected-head", "comparison", {})
            with pytest.raises(LayerError, match="already attempted"):
                await layer.draft("rejected-head", "comparison", {})
            await sdk.aio.aclose()

    asyncio.run(exercise())
    assert len(captured) == 1
    assert (
        captured[0]["generationConfig"]["responseJsonSchema"]["properties"]["comments"]["maxItems"]
        == 10
    )
    assert state.model("rejected-head")["cost"] > 0
    assert state.model("rejected-head")["draft"] is None


@pytest.mark.parametrize(
    "mutation",
    [
        lambda draft: draft.update(extra="not allowed"),
        lambda draft: draft.update(schema="unknown"),
        lambda draft: draft.update(summary_note="x" * 601),
        lambda draft: draft["comments"][0].update(extra="not allowed"),
        lambda draft: draft["comments"][0].pop("assumes_versions"),
        lambda draft: draft["comments"][0].update(line=0),
        lambda draft: draft["comments"][0].update(side="LEFT"),
        lambda draft: draft["comments"][0].update(category="unknown"),
        lambda draft: draft["comments"][0].update(severity="fatal"),
        lambda draft: draft["comments"][0].update(body=""),
        lambda draft: draft["comments"][0].update(body="x" * 6001),
        lambda draft: draft["comments"][0].update(evidence=[]),
        lambda draft: draft["comments"][0].update(assumes_versions={"qiskit": 25}),
        lambda draft: draft.update(comments=draft["comments"] * 101),
    ],
)
def test_all_public_constraints_still_reject_invalid_provider_output(tmp_path, mutation):
    from test_validation import comment

    draft = {"schema": "qscore.review/v0.1", "summary_note": "", "comments": [comment()]}
    mutation(draft)
    models = FakeModels(json.dumps(draft))
    state = State(tmp_path / "state.db")
    layer = Gemini(settings(tmp_path), state, SimpleNamespace(aio=SimpleNamespace(models=models)))
    with pytest.raises(LayerError, match="structured-output"):
        asyncio.run(layer.draft("invalid-head", "comparison", {}))
    with pytest.raises(LayerError, match="already attempted"):
        asyncio.run(layer.draft("invalid-head", "comparison", {}))
    assert len(models.calls) == 1
    assert state.model("invalid-head")["draft"] is None


def test_public_contract_keeps_original_hundred_comment_limit():
    from test_validation import comment

    from qscore_review.contracts import ReviewDraft

    draft = ReviewDraft.model_validate(
        {"schema": "qscore.review/v0.1", "summary_note": "", "comments": [comment()] * 100}
    )
    assert len(draft.comments) == 100
