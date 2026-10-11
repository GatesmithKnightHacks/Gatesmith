"""Reference measurements alongside scoring metrics (ChP-0038)."""

from __future__ import annotations

import logging
import math
from bisect import bisect_left, bisect_right

from qiskit.circuit import QuantumCircuit
from qiskit.transpiler import generate_preset_pass_manager

from qscore.errors import RecordError
from qscore.record.reference import width_band
from qscore.schemas.common import Status
from qscore.schemas.reference import ReferenceCorpus
from qscore.schemas.scorecard import Scorecard
from qscore.targets.registry import TargetBundle

log = logging.getLogger(__name__)


def benchpress_block(logical: QuantumCircuit, target: TargetBundle, seed: int) -> dict[str, object]:
    """Compile at level 2 and record the basis-gate count and depth in layers.

    Follow Benchpress's device_transpile convention, fixing its otherwise unset
    transpiler seed for reproducibility. An unsupported basis returns an empty
    block for the caller to omit. This is the reference measurement's failure
    boundary: errors are logged and recorded, and the caller must mark the card
    partial when the returned block contains ``error``.
    """
    if not {"cx", "cz", "ecr"}.intersection(target.basis):
        return {}
    try:
        two_q_gate = target.two_qubit_gate
        manager = generate_preset_pass_manager(
            optimization_level=2, target=target.target, seed_transpiler=seed
        )
        compiled = manager.run(logical)
        return {
            "convention": "benchpress@b695f30e83a32bac05b9b4d8e98d37ba9aae5236 device_transpile",
            "optimization_level": 2,
            "seed": seed,
            "gate_count_2q": compiled.count_ops().get(two_q_gate, 0),
            "depth_2q": compiled.depth(
                filter_function=lambda instruction: instruction.operation.name == two_q_gate
            ),
            "two_q_gate": two_q_gate,
        }
    except Exception as exc:
        log.exception(
            "Benchpress reference compile failed for target %s, seed %s", target.name, seed
        )
        return {"error": {"type": type(exc).__name__, "message": str(exc)}}


def place(
    card: Scorecard, corpus: ReferenceCorpus, *, width: int | None = None
) -> dict[str, dict[str, object]]:
    """Empirical percentile (midrank for ties) among circuits of similar active width.

    Percentiles describe the numeric distribution, never whether an algorithm is better.
    Explicit width lets resource-excluded runs use the representative circuit's width.
    """
    if corpus.score_version != card.item.score_version:
        raise RecordError("reference corpus and scorecard score versions differ")
    if card.target is None or card.target.name not in corpus.targets:
        return {}
    if width is None:
        metric = next((m for m in card.metrics if m.id == "width"), None)
        if metric is None or metric.status != Status.COMPUTED:
            return {}
        value = metric.value
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or not float(value).is_integer()
        ):
            raise RecordError("reference placement requires a finite integer active width")
        width = int(value)
    band = width_band(width)
    if band is None:
        return {}
    distributions = corpus.targets[card.target.name]
    result: dict[str, dict[str, object]] = {}
    for metric in card.metrics:
        value = metric.value
        if (
            metric.status != Status.COMPUTED
            or isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            continue
        distribution = distributions.get(metric.id, {}).get(band)
        n = distribution.n if distribution else 0
        entry: dict[str, object] = {"band": band, "n": n}
        if distribution is None or n < 5:
            entry["reason"] = "too few reference circuits"
        else:
            lo = bisect_left(distribution.values, value)
            hi = bisect_right(distribution.values, value)
            entry.update(percentile=100 * (lo + hi) / (2 * n), median=distribution.quantiles["50"])
        result[metric.id] = entry
    return result
