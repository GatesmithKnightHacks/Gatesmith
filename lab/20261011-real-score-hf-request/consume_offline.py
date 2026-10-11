"""Real engine-generated request -> HF adapter using a fake transport, offline.

The response repeats the region unchanged. This checks the boundary contract;
it provides no model-quality, verification, or improvement evidence.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
from openai import OpenAI
from qscore.config import Settings
from qscore.improve.hf_layer import HfJobContext, HfLayer, load_model_entries
from qscore.schemas.improvement import ImprovementRequest, Proposal


def main() -> None:
    folder = Path(__file__).resolve().parent
    request = ImprovementRequest.model_validate_json(
        (folder / "request.json").read_text()
    )
    entry = load_model_entries()[0]
    operations: list[str] = []

    def transport(wire: httpx2.Request) -> httpx2.Response:
        operations.append(f"{wire.method} {wire.url.path}")
        if wire.method == "GET" and wire.url.path == "/v1/models":
            return httpx2.Response(
                200,
                json={
                    "data": [
                        {
                            "id": entry.id,
                            "providers": [
                                {
                                    "provider": entry.provider,
                                    "status": "live",
                                    "supports_structured_output": True,
                                }
                            ],
                        }
                    ]
                },
            )
        if wire.method != "POST" or wire.url.path != "/v1/chat/completions":
            raise RuntimeError("unexpected mock operation")
        payload = json.loads(wire.content)
        user = next(
            message for message in payload["messages"] if message["role"] == "user"
        )
        prompt = json.loads(user["content"])
        if (
            payload["model"] != entry.routed_id
            or prompt["finding"]["rule"] != request.finding.rule
            or prompt["circuit"]["qasm"] != request.circuit.qasm
            or prompt["circuit"]["qubit_map"] != request.circuit.qubit_map
        ):
            raise RuntimeError(
                "adapter did not send the generated request to the pinned model"
            )
        content = {
            "candidates": [
                {
                    "format": request.circuit.format,
                    "qasm": request.circuit.qasm,
                    "rationale": "Offline identity fixture; no improvement claimed.",
                    "estimate": 0.0,
                    "equivalent": True,
                }
            ]
        }
        return httpx2.Response(
            200,
            json={
                "id": "offline-contract-smoke",
                "object": "chat.completion",
                "created": 1,
                "model": entry.routed_id,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(content),
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150,
                },
            },
        )

    client = OpenAI(
        api_key="offline-test-value",
        base_url="https://router.invalid/v1",
        max_retries=0,
        http_client=httpx2.Client(
            transport=httpx2.MockTransport(transport), trust_env=False
        ),
    )
    layer = HfLayer(
        entry,
        client=client,
        job=HfJobContext(max_calls=1, max_cost_usd=0.10),
        settings=Settings(
            profile="dev", hf_router_base_url="https://router.invalid/v1"
        ),
    )
    try:
        proposals = layer.propose(request)
    finally:
        client.close()
    if len(proposals) != 1:
        raise RuntimeError(
            f"expected one parsed identity fixture; calls={layer.call_records}"
        )
    proposal = Proposal.model_validate(proposals[0].model_dump(mode="json"))
    if proposal.request_id != request.request_id:
        raise RuntimeError("proposal lost the originating request identity")
    summary = {
        "transport": "fake; zero network and credential access",
        "request_id": request.request_id,
        "finding": request.finding.rule,
        "scope": request.circuit.scope,
        "qubits": request.circuit.num_qubits,
        "strategy": proposal.strategy,
        "operations": operations,
        "parsed_proposals": len(proposals),
        "response": "synthetic identity fixture; no improvement claimed",
        "verification": "not_run",
        "acceptance": "not_run",
    }
    (folder / "offline-smoke.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
