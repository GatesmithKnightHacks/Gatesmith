"""Pinned HF Inference Providers proposer (10 §5; ChP-0048).

Only validated region data crosses this boundary. Proposals are unverified data;
this adapter never executes code, accepts a candidate, or selects another model.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from threading import RLock
from typing import Any, TypeVar, cast
from uuid import uuid4

from openai import APIConnectionError, APIStatusError, OpenAI
from openai.types.chat import ChatCompletionMessageParam
from openqasm3.parser import QASM3ParsingError
from pydantic import TypeAdapter, ValidationError
from qiskit import QuantumCircuit, qasm2, qasm3
from qiskit.circuit import Gate
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

from qscore.config import Settings, get_settings
from qscore.errors import ConfigError, HfBudgetExhausted, LayerError
from qscore.improve.hf_types import CallRecord, CandidateSet, HfCandidate, ModelEntry
from qscore.improve.prompts import PROMPT_VERSION, candidate_schema, render
from qscore.improve.requests import CHANGE_STRATEGIES
from qscore.schemas.improvement import PROPOSAL_SCHEMA, ImprovementRequest, Proposal

log = logging.getLogger(__name__)
MAX_OUTPUT_TOKENS = 2048
_T = TypeVar("_T")


def load_model_entries(path: Path | None = None) -> list[ModelEntry]:
    """Read the explicit panel; unknown fields and duplicate routed ids are errors."""
    source = path if path is not None else Path(__file__).with_name("models.yaml")
    try:
        entries = TypeAdapter(list[ModelEntry]).validate_python(YAML(typ="safe").load(source))
    except (OSError, ValidationError, YAMLError) as exc:
        raise ConfigError(f"invalid HF panel {source}: {type(exc).__name__}") from exc
    if not entries or len({e.routed_id for e in entries}) != len(entries):
        raise ConfigError(f"HF panel {source} must be non-empty with unique model:provider ids")
    for entry in entries:
        _validate_entry(entry)
    return entries


def _validate_entry(entry: ModelEntry) -> None:
    if (
        "/" not in entry.id
        or ":" in entry.id
        or entry.provider in {"", "auto", "fastest", "cheapest"}
        or ":" in entry.provider
    ):
        raise ConfigError(f"HF panel requires a pinned org/model:provider: {entry.routed_id}")
    if not entry.strategies:
        raise ConfigError(f"HF panel {entry.routed_id} has no declared strategies")
    if not all(
        math.isfinite(p)
        for p in (
            entry.pricing_usd_per_mtok.input,
            entry.pricing_usd_per_mtok.output,
        )
    ):
        raise ConfigError(f"HF panel {entry.routed_id} requires finite pricing estimates")


class HfJobContext:
    """One job's shared budget and catalog; pass the same object to all its layers.

    Each HTTP generation attempt consumes a call and reserves its worst-case token
    estimate. Known usage releases the excess. Failed requests with unknown usage
    retain the reservation, so a timeout cannot create free budget. Catalog GETs
    are not generation calls. This object is process-local, not a billing ledger.
    """

    def __init__(self, *, max_calls: int = 30, max_cost_usd: float = 1.0) -> None:
        if max_calls < 1 or not 0 < max_cost_usd < float("inf"):
            raise ConfigError("HF job budgets require max_calls >= 1 and finite max_cost_usd > 0")
        self.max_calls = max_calls
        self.max_cost_usd = Decimal(str(max_cost_usd))
        self.calls = 0
        self._committed = Decimal(0)
        self._catalog: dict[str, Any] | None = None
        self._lock = RLock()

    @property
    def cost_reserved_usd(self) -> float:
        with self._lock:
            return float(self._committed)

    def check_capacity(self, reservation: Decimal) -> None:
        with self._lock:
            if not reservation.is_finite() or reservation < 0:
                raise ConfigError("HF cost reservation must be finite and non-negative")
            if self.calls >= self.max_calls:
                raise HfBudgetExhausted("budget: hf calls")
            if self._committed + reservation > self.max_cost_usd:
                raise HfBudgetExhausted("budget: hf cost")

    def reserve(self, reservation: Decimal) -> None:
        with self._lock:
            self.check_capacity(reservation)
            self.calls += 1
            self._committed += reservation

    def settle(self, reservation: Decimal, actual: Decimal) -> None:
        with self._lock:
            if not actual.is_finite() or actual < 0:
                raise LayerError("HF usage cost must be finite and non-negative")
            self._committed += actual - reservation

    def catalog(self, fetch: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        with self._lock:
            if self._catalog is None:
                self._catalog = fetch()
            return self._catalog


def validate_catalog(entry: ModelEntry, catalog: dict[str, Any]) -> None:
    """Require the exact pinned provider's live structured-output capability."""
    if not isinstance(catalog, dict):
        raise LayerError("HF /models catalog must be an object")
    data = catalog.get("data")
    if not isinstance(data, list):
        raise LayerError("HF /models catalog has invalid data (expected array)")
    model = next((row for row in data if isinstance(row, dict) and row.get("id") == entry.id), None)
    reason = "model absent"
    if model is not None:
        providers = model.get("providers")
        if not isinstance(providers, list):
            raise LayerError(f"HF catalog {entry.id} has invalid providers (expected array)")
        provider = next(
            (p for p in providers if isinstance(p, dict) and p.get("provider") == entry.provider),
            None,
        )
        reason = "provider absent"
        if provider is not None:
            if provider.get("status") != "live":
                reason = "provider not live"
            elif provider.get("supports_structured_output") is not True:
                reason = "structured output unsupported"
            else:
                return
    raise LayerError(f"{entry.routed_id} not available: {reason}")


def _parse_qasm(format_: str, text: str) -> QuantumCircuit:
    if format_ == "openqasm2":
        # Same upload parser and legacy gate definitions. Never resolve a model's
        # include against the bot/worker filesystem; qelib1.inc is built in.
        return qasm2.loads(
            text, custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS, include_path=()
        )
    return qasm3.loads(text)


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


class HfLayer:
    """One pinned model/provider. Credentials and SDK creation are lazy."""

    name = "hf"
    version = f"hf-{PROMPT_VERSION}"

    def __init__(
        self,
        entry: ModelEntry,
        *,
        job: HfJobContext | None = None,
        client: OpenAI | None = None,
        settings: Settings | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        _validate_entry(entry)
        self.entry = entry
        self.settings = settings if settings is not None else get_settings()
        self.job = (
            job
            if job is not None
            else HfJobContext(
                max_calls=self.settings.hf_max_calls,
                max_cost_usd=self.settings.hf_max_cost_usd,
            )
        )
        self._client = client.with_options(max_retries=0) if client is not None else None
        self._sleep = sleep
        self._clock = clock
        self.call_records: list[CallRecord] = []

    def capabilities(self) -> list[str]:
        return list(self.entry.strategies)

    def _sdk(self) -> OpenAI:
        if self._client is None:
            token = os.environ.get("HF_TOKEN")
            if not token:
                raise ConfigError("HF_TOKEN is required for Hugging Face Inference Providers")
            self._client = OpenAI(
                base_url=self.settings.hf_router_base_url,
                api_key=token,
                max_retries=0,
            )
        return self._client

    def _remaining(self, deadline: float) -> float:
        remaining = deadline - self._clock()
        if remaining <= 0:
            raise LayerError(f"HF {self.entry.routed_id} layer timeout exceeded")
        return remaining

    def _retry(self, operation: Callable[[], _T], *, deadline: float) -> _T:
        for attempt in range(3):
            self._remaining(deadline)
            try:
                return operation()
            except (APIConnectionError, APIStatusError) as exc:
                transient = isinstance(exc, APIConnectionError) or (
                    exc.status_code == 429 or exc.status_code >= 500
                )
                if not transient or attempt == 2:
                    raise LayerError(
                        f"HF {self.entry.routed_id} request failed: {type(exc).__name__}"
                    ) from exc
                log.warning(
                    "HF retry model=%s attempt=%d error=%s",
                    self.entry.routed_id,
                    attempt + 1,
                    type(exc).__name__,
                )
                delay = 2**attempt
                if delay >= self._remaining(deadline):
                    raise LayerError(
                        f"HF {self.entry.routed_id} retry exceeds layer timeout"
                    ) from exc
                self._sleep(delay)
        raise AssertionError("bounded retry loop exhausted without result/error")

    def check_catalog(self, *, deadline: float | None = None) -> None:
        """Explicit maintainer operation; propose calls it only after privacy guards."""
        stop = deadline if deadline is not None else self._clock() + 60.0
        payload = self.job.catalog(
            lambda: self._retry(
                lambda: self._sdk().get(
                    "/models",
                    cast_to=dict,
                    options={"timeout": self._remaining(stop)},
                ),
                deadline=stop,
            )
        )
        validate_catalog(self.entry, payload)

    def _record(self, record: CallRecord) -> None:
        self.call_records.append(record)
        log.info("HF call %s", record.model_dump_json())

    def propose(self, request: ImprovementRequest) -> list[Proposal]:
        if not request.privacy.external_inference or not request.privacy.send_region_only:
            raise LayerError(f"external inference disabled for request {request.request_id}")
        if request.circuit.scope != "region":
            raise LayerError(f"external inference requires region scope: {request.request_id}")
        n_qubits = request.circuit.num_qubits
        qubit_map = request.circuit.qubit_map
        if (
            set(qubit_map) != {str(i) for i in range(n_qubits)}
            or len(set(qubit_map.values())) != n_qubits
            or any(q < 0 for q in qubit_map.values())
        ):
            raise LayerError("input region qubit_map must map each local index to a unique qubit")
        if any(not 0 <= q < n_qubits for edge in request.target.coupling_map for q in edge):
            raise LayerError("input target coupling map is not restricted to region-local qubits")
        allowed_changes = {
            strategy
            for change in request.permitted.changes
            for strategy in CHANGE_STRATEGIES[change]
        }
        strategies = [
            strategy
            for strategy in request.permitted_strategies
            if strategy in self.entry.strategies and strategy in allowed_changes
        ]
        if not strategies:
            return []
        strategy = strategies[0]
        messages = render(request, strategy=strategy)
        try:
            region = _parse_qasm(
                request.circuit.format, json.loads(messages[1]["content"])["circuit"]["qasm"]
            )
        except (qasm2.QASM2ParseError, qasm3.QASM3ImporterError, QASM3ParsingError) as exc:
            raise LayerError(f"invalid input region QASM: {type(exc).__name__}") from exc
        if region.num_qubits != request.circuit.num_qubits:
            raise LayerError("input region QASM qubit count disagrees with request")
        if region.num_clbits or any(
            inst.clbits or not isinstance(inst.operation, Gate) for inst in region.data
        ):
            raise LayerError("input region must contain unitary gates without classical bits")
        # A byte per token is conservative for byte-level BPE, with additional
        # room for chat framing and the response schema sent separately.
        prompt_bound = (
            len(json.dumps(messages, ensure_ascii=False).encode("utf-8"))
            + len(json.dumps(candidate_schema(request.budget.max_proposals)).encode("utf-8"))
            + 1024
        )
        pricing = self.entry.pricing_usd_per_mtok
        reservation = (
            Decimal(prompt_bound) * Decimal(str(pricing.input))
            + Decimal(MAX_OUTPUT_TOKENS) * Decimal(str(pricing.output))
        ) / Decimal(1_000_000)
        self.job.check_capacity(reservation)
        started = self._clock()
        deadline = started + request.budget.timeout_s
        call_id = str(uuid4())
        retries = 0
        last_status: int | None = None
        failed_wire_records = 0
        attempt_started = started

        def generation() -> Any:
            nonlocal retries, last_status, failed_wire_records, attempt_started
            client = self._sdk()
            timeout = self._remaining(deadline)
            self.job.reserve(reservation)
            record_args["call_id"] = str(uuid4())
            attempt_started = self._clock()
            try:
                return client.chat.completions.create(
                    model=self.entry.routed_id,
                    messages=cast(list[ChatCompletionMessageParam], messages),
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": "qscore_candidates",
                            "schema": candidate_schema(request.budget.max_proposals),
                            "strict": True,
                        },
                    },
                    temperature=0,
                    max_tokens=MAX_OUTPUT_TOKENS,
                    timeout=timeout,
                )
            except (APIConnectionError, APIStatusError) as exc:
                last_status = exc.status_code if isinstance(exc, APIStatusError) else None
                self._record(
                    CallRecord(
                        **record_args,
                        latency_ms=(self._clock() - attempt_started) * 1000,
                        retries=min(retries, 2),
                        http_status=last_status,
                        outcome="layer_error",
                        reply_parsed=False,
                        n_proposals=0,
                        error_type=type(exc).__name__,
                    )
                )
                retries += 1
                failed_wire_records += 1
                raise

        record_args: dict[str, Any] = {
            "call_id": call_id,
            "request_id": request.request_id,
            "model": self.entry.id,
            "provider": self.entry.provider,
            "prompt_version": PROMPT_VERSION,
        }
        try:
            self.check_catalog(deadline=deadline)
            response = self._retry(generation, deadline=deadline)
        except LayerError as exc:
            if not failed_wire_records:
                self._record(
                    CallRecord(
                        **record_args,
                        latency_ms=(self._clock() - started) * 1000,
                        retries=min(retries, 2),
                        http_status=last_status,
                        outcome="layer_error",
                        reply_parsed=False,
                        n_proposals=0,
                        error_type=type(exc).__name__,
                    )
                )
            raise
        usage = response.usage
        if (
            usage is None
            or not isinstance(usage.prompt_tokens, int)
            or not isinstance(usage.completion_tokens, int)
            or usage.prompt_tokens < 0
            or usage.completion_tokens < 0
        ):
            self._record(
                CallRecord(
                    **record_args,
                    latency_ms=(self._clock() - attempt_started) * 1000,
                    retries=min(retries, 2),
                    http_status=200,
                    outcome="layer_error",
                    reply_parsed=False,
                    n_proposals=0,
                    error_type="MissingUsage",
                )
            )
            raise LayerError("HF response missing valid token usage; accounting unknown")
        cost = (
            Decimal(usage.prompt_tokens) * Decimal(str(pricing.input))
            + Decimal(usage.completion_tokens) * Decimal(str(pricing.output))
        ) / Decimal(1_000_000)
        self.job.settle(reservation, cost)
        record_args.update(
            latency_ms=(self._clock() - attempt_started) * 1000,
            retries=min(retries, 2),
            http_status=200,
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            cost_usd_estimate=float(cost),
            accounting_known=True,
        )

        def require_timely_result() -> None:
            now = self._clock()
            if now >= deadline:
                record_args["latency_ms"] = (now - attempt_started) * 1000
                self._record(
                    CallRecord(
                        **record_args,
                        outcome="layer_error",
                        reply_parsed=False,
                        n_proposals=0,
                        error_type="LayerTimeout",
                    )
                )
                raise LayerError("HF response processing exceeded the layer timeout")

        # SDK timeouts bound socket operations rather than total wall time. The
        # overall layer deadline still applies after a successful HTTP response.
        require_timely_result()
        if usage.prompt_tokens > prompt_bound or usage.completion_tokens > MAX_OUTPUT_TOKENS:
            self._record(
                CallRecord(
                    **record_args,
                    outcome="layer_error",
                    reply_parsed=False,
                    n_proposals=0,
                    error_type="UnexpectedUsage",
                )
            )
            raise LayerError("HF response usage exceeds the reserved token bound")
        content = response.choices[0].message.content if response.choices else None
        try:
            parsed = CandidateSet.model_validate(
                json.loads(content, object_pairs_hook=_unique_object)
                if content is not None
                else None,
                strict=True,
            )
        except (ValueError, ValidationError) as exc:
            require_timely_result()
            self._record(
                CallRecord(
                    **record_args,
                    outcome="parse_failure",
                    reply_parsed=False,
                    n_proposals=0,
                    invalid_candidates=[f"reply: {type(exc).__name__}"],
                )
            )
            return []
        invalid: list[str] = []
        proposals: list[Proposal] = []
        for index, candidate in enumerate(parsed.candidates):
            require_timely_result()
            if index >= request.budget.max_proposals:
                invalid.append(f"candidate {index}: exceeds max_proposals")
                continue
            reason = self._candidate_problem(candidate, request, region)
            if reason is not None:
                invalid.append(f"candidate {index}: {reason}")
                continue
            proposals.append(
                Proposal.model_validate(
                    {
                        "schema": PROPOSAL_SCHEMA,
                        "request_id": request.request_id,
                        "layer": {
                            "name": self.name,
                            "version": self.version,
                            "model": self.entry.id,
                            "provider": self.entry.provider,
                            "prompt_version": PROMPT_VERSION,
                        },
                        "candidate": {
                            "format": candidate.format,
                            "scope": "region",
                            "qasm": candidate.qasm,
                        },
                        "claims": {
                            "metric": request.objective.primary,
                            "direction": "decrease"
                            if request.objective.direction == "minimize"
                            else "increase",
                            "estimate": candidate.estimate,
                            "equivalent": candidate.equivalent,
                        },
                        "rationale": candidate.rationale,
                        "strategy": strategy,
                    }
                )
            )
        outcome = "proposals" if proposals else "parse_failure" if invalid else "empty"
        require_timely_result()
        self._record(
            CallRecord(
                **record_args,
                outcome=outcome,
                reply_parsed=True,
                n_proposals=len(proposals),
                invalid_candidates=invalid,
            )
        )
        return proposals

    @staticmethod
    def _candidate_problem(
        candidate: HfCandidate,
        request: ImprovementRequest,
        region: QuantumCircuit,
    ) -> str | None:
        try:
            circuit = _parse_qasm(candidate.format, candidate.qasm)
        except (qasm2.QASM2ParseError, qasm3.QASM3ImporterError, QASM3ParsingError) as exc:
            return f"QASM parse failed ({type(exc).__name__})"
        if circuit.num_qubits != request.circuit.num_qubits:
            return "qubit count outside requested region"
        # Region extraction currently permits unitary gates only. Check classical
        # declarations/instructions too, so a model cannot introduce measurements.
        if circuit.num_clbits != region.num_clbits or any(
            inst.clbits or not isinstance(inst.operation, Gate) for inst in circuit.data
        ):
            return "classical bits or measurements changed"
        if request.finding.region is not None and request.finding.region.scope == "compiled":
            outside = set(circuit.count_ops()) - set(request.target.basis)
            if outside:
                return f"compiled region gates outside target basis: {sorted(outside)}"
        return None
