"""Root-only live invocation helper. This file contains no credentials.

Default invocation only validates/previews the request. --live permits HfLayer to
read the root process's HF_TOKEN and call its exact pinned HF model/provider.
Delegated agents must never invoke --live.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from qscore.improve.hf_layer import HfJobContext, HfLayer, load_model_entries
from qscore.schemas.improvement import ImprovementRequest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument(
        "--request", type=Path, default=Path(__file__).with_name("request.json")
    )
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).with_name("hf-result.json")
    )
    args = parser.parse_args()
    request = ImprovementRequest.model_validate_json(args.request.read_text())
    entry = load_model_entries()[0]
    if not args.live:
        print(
            json.dumps(
                {
                    "mode": "preview; no network or credential access",
                    "request_id": request.request_id,
                    "finding": request.finding.rule,
                    "model": entry.routed_id,
                    "scope": request.circuit.scope,
                    "qubits": request.circuit.num_qubits,
                    "permitted_strategies": request.permitted_strategies,
                },
                indent=2,
            )
        )
        return
    layer = HfLayer(entry, job=HfJobContext(max_calls=3, max_cost_usd=0.10))
    proposals = layer.propose(request)
    result = {
        "request_id": request.request_id,
        "proposals": [proposal.model_dump(mode="json") for proposal in proposals],
        "call_records": [
            record.model_dump(mode="json") for record in layer.call_records
        ],
        "verified": False,
        "accepted": False,
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Saved {len(proposals)} unverified proposal(s) to {args.output}")


if __name__ == "__main__":
    main()
