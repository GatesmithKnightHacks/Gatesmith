import asyncio
import json
from types import SimpleNamespace

import pytest
from qscore.errors import LayerError
from test_bundle import allowed

from qscore_review.gemini import MODEL, Gemini
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
