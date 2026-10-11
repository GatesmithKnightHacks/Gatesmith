"""The `hf` model layer: pinned open-weight models through Hugging Face Inference Providers
(specs/10 §5, ChP-0048; downscaled by ChP-0049).

One call per request, strict JSON (`CandidateSet`), no repair, no re-asking, no model or
provider switching. Infrastructure failures raise `LayerError`; "no idea" returns [].
Downscaled (ChP-0049): no catalog check and no `qscore models check` yet.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from importlib.resources import files
from typing import Any, Literal

from openqasm3.parser import QASM3ParsingError
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from qiskit import qasm2, qasm3
from qiskit.circuit import QuantumCircuit
from ruamel.yaml import YAML

from qscore.errors import ConfigError, LayerError
from qscore.improve.prompts import PROMPT_VERSION, candidate_schema, render
from qscore.schemas.improvement import (
    PROPOSAL_SCHEMA,
    Candidate,
    Claims,
    ImprovementRequest,
    LayerInfo,
    Proposal,
)

MAX_TOKENS = 8192  # ChP-0051: reasoning models use 4-6k tokens before the JSON
MAX_ATTEMPTS = 3  # R3.5: bounded retries for transient errors only
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})


class Pricing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input: float = Field(ge=0)
    output: float = Field(ge=0)


class ModelEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    provider: str
    license: str
    default: bool = False
    strategies: list[str]
    pricing_usd_per_mtok: Pricing
    checked_at: str

    @property
    def model(self) -> str:
        return f"{self.id}:{self.provider}"


def load_models() -> list[ModelEntry]:
    raw = YAML(typ="safe").load(files("qscore.improve").joinpath("models.yaml").read_text())
    entries = [ModelEntry.model_validate(e) for e in raw]
    if sum(e.default for e in entries) != 1:
        raise ConfigError("improve/models.yaml must mark exactly one default (★) model")
    return entries


def default_model() -> ModelEntry:
    return next(e for e in load_models() if e.default)


class _RawCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["openqasm3", "openqasm2"]
    qasm: str
    rationale: str = Field(max_length=600)
    estimate: float
    equivalent: bool


class _CandidateSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidates: list[_RawCandidate]


def _provider_code(body: object) -> str:
    """The provider's machine-readable error code (e.g. groq `json_validate_failed`), if any;
    only the short code is kept, never the body (ChP-0051)."""
    code = body.get("code") if isinstance(body, dict) else None
    return f" ({code})" if isinstance(code, str) and len(code) <= 64 else ""


@dataclass
class CallRecord:
    """Logged per call (10 §5); never holds the token."""

    model: str
    provider: str
    prompt_version: str
    latency_ms: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd_estimate: float = 0.0
    retries: int = 0
    reply_parsed: bool = False
    proposals: int = 0
    invalid: list[dict[str, Any]] = field(default_factory=list)
    reply_excerpt: str = ""  # first 1500 characters of the reply, for evaluation
    finish_reason: str | None = None  # "length" = cut at MAX_TOKENS (ChP-0051)


class HfBudgetExhausted(LayerError):
    """`hf_max_calls` or `hf_max_cost_usd` reached; the loop stops (`budget: hf calls|cost`)."""


def parse_qasm(fmt: str, text: str) -> QuantumCircuit:
    """The upload parsers (05 §3): OpenQASM 2 with legacy instructions, or OpenQASM 3."""
    if fmt == "openqasm2":
        return qasm2.loads(text, custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS)
    return qasm3.loads(text)


class HfLayer:
    name = "hf"
    version = f"hf-{PROMPT_VERSION}"

    def __init__(
        self,
        entry: ModelEntry,
        client: Any,
        *,
        external_inference: bool,
        timeout_s: float,
        max_calls: int,
        max_cost_usd: float,
        sleep: Any = time.sleep,
    ) -> None:
        self.entry = entry
        self.client = client  # an `openai.OpenAI` pointed at the router (or a recorded stub)
        self.external_inference = external_inference
        self.timeout_s = timeout_s
        self.max_calls = max_calls
        self.max_cost_usd = max_cost_usd
        self.sleep = sleep
        self.calls: list[CallRecord] = []

    def capabilities(self) -> list[str]:
        return list(self.entry.strategies)

    @property
    def spent_usd(self) -> float:
        return sum(c.cost_usd_estimate for c in self.calls)

    def _info(self) -> LayerInfo:
        return LayerInfo(
            name=self.name,
            version=self.version,
            model=self.entry.id,
            provider=self.entry.provider,
            prompt_version=PROMPT_VERSION,
        )

    def _call(self, request: ImprovementRequest, record: CallRecord) -> Any:
        import openai  # extra [hf]

        kwargs = {
            "model": self.entry.model,
            "messages": render(request),
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "qscore_candidates",
                    "schema": candidate_schema(request.budget.max_proposals),
                    "strict": True,
                },
            },
            "temperature": 0,
            "max_tokens": MAX_TOKENS,
            "timeout": self.timeout_s,
        }
        for attempt in range(MAX_ATTEMPTS):
            try:
                return self.client.chat.completions.create(**kwargs)
            except openai.APIStatusError as exc:
                if exc.status_code not in RETRY_STATUS:
                    raise LayerError(
                        f"{self.entry.model}: HTTP {exc.status_code}{_provider_code(exc.body)}"
                    ) from exc
                last: Exception = exc
            except (openai.APITimeoutError, openai.APIConnectionError) as exc:
                last = exc
            record.retries = attempt + 1
            if attempt + 1 < MAX_ATTEMPTS:
                self.sleep(2**attempt)
        raise LayerError(
            f"{self.entry.model}: {type(last).__name__} after {MAX_ATTEMPTS} attempts"
        ) from last

    def propose(self, request: ImprovementRequest) -> list[Proposal]:
        if not self.external_inference:
            raise LayerError("external inference disabled (privacy.external_inference)")
        if request.circuit.scope != "region":
            raise LayerError("external inference sends regions only; this request is whole-circuit")
        if len(self.calls) >= self.max_calls:
            raise HfBudgetExhausted("budget: hf calls")
        if self.spent_usd >= self.max_cost_usd:
            raise HfBudgetExhausted("budget: hf cost")
        record = CallRecord(self.entry.id, self.entry.provider, PROMPT_VERSION)
        self.calls.append(record)
        started = time.monotonic()
        response = self._call(request, record)
        record.latency_ms = (time.monotonic() - started) * 1000
        usage = getattr(response, "usage", None)
        if usage is not None:
            record.prompt_tokens = int(usage.prompt_tokens or 0)
            record.completion_tokens = int(usage.completion_tokens or 0)
            price = self.entry.pricing_usd_per_mtok
            record.cost_usd_estimate = (
                record.prompt_tokens * price.input + record.completion_tokens * price.output
            ) / 1e6
        content = response.choices[0].message.content or ""
        record.reply_excerpt = content[:1500]
        record.finish_reason = getattr(response.choices[0], "finish_reason", None)
        try:
            reply = _CandidateSet.model_validate(json.loads(content))
        except (json.JSONDecodeError, ValidationError) as exc:
            reason = f"finish_reason={record.finish_reason}: {exc}"
            record.invalid.append({"reply": "unparsable", "reason": reason[:300]})
            return []
        record.reply_parsed = True
        candidates = reply.candidates
        limit = request.budget.max_proposals
        for extra in candidates[limit:]:
            record.invalid.append({"candidate": extra.rationale[:80], "reason": "over limit"})
        proposals = []
        width = request.circuit.num_qubits
        direction = "decrease" if request.objective.direction == "minimize" else "increase"
        for n, cand in enumerate(candidates[:limit]):
            try:
                circuit = parse_qasm(cand.format, cand.qasm)
            except (qasm2.QASM2ParseError, qasm3.QASM3ImporterError, QASM3ParsingError) as exc:
                record.invalid.append(
                    {"candidate": n, "reason": f"bad QASM: {type(exc).__name__}: {exc}"[:300]}
                )
                continue
            if circuit.num_qubits != width:
                record.invalid.append(
                    {"candidate": n, "reason": f"{circuit.num_qubits} qubits, region has {width}"}
                )
                continue
            proposals.append(
                Proposal.model_validate(
                    {
                        "schema": PROPOSAL_SCHEMA,
                        "request_id": request.request_id,
                        "layer": self._info(),
                        "candidate": Candidate(format=cand.format, scope="region", qasm=cand.qasm),
                        "claims": Claims(
                            metric=request.objective.primary,
                            direction=direction,
                            estimate=cand.estimate,
                            equivalent=cand.equivalent,
                        ),
                        "rationale": cand.rationale,
                    }
                )
            )
        record.proposals = len(proposals)
        return proposals
