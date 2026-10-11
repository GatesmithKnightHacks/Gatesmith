"""Prompts for model layers (specs/10 §6). Prompt text is data in code; any change bumps
`PROMPT_VERSION` (class B), which is recorded on every attempt.

p-2026.3 (ChP-0052): two verified few-shot rewrites (10 §6): minimal synthetic blocks whose
rewrite the reference layer reproduces (`synth_cnot_count_full_pmh`; fixed-seed level 3).
`tests/unit/improve/test_prompts.py` checks equality, the lower 2q count and the reproduction.
"""

from __future__ import annotations

import json
import re

from qscore.schemas.improvement import ImprovementRequest

PROMPT_VERSION = "p-2026.3"

_LINE_COMMENT = re.compile(r"//[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)

SYSTEM = (
    "You are a quantum circuit optimiser. You rewrite one region of a circuit so that it is "
    "exactly equivalent (same unitary; global phase may differ unless invariants say exact) "
    "and better on the objective metric. Techniques: cancel inverse pairs, merge rotations, "
    "commute gates to cancel, resynthesise CNOT networks, use cheaper decompositions. "
    "Rules: reply ONLY with JSON matching the schema; each qasm is a complete OpenQASM 3 program "
    '(OPENQASM 3.0; include "stdgates.inc"; one register `qubit[N] q;`) or OpenQASM 2 '
    "(qelib1.inc, `qreg q[N];`) with exactly the region's qubit count; only gates from the target "
    "basis plus standard gates; no measurements, resets or classical bits. Return 1 to "
    "max_candidates candidates, your best first; `estimate` is your predicted value of the "
    "objective metric for the rewritten region. Return an empty list only if the region cannot "
    "be written with fewer two-qubit gates or lower depth.\n"
    "Every candidate is checked by exact unitary comparison; a wrong one is discarded. Before "
    "replying, track each qubit through your rewrite: every basis change you add (e.g. H to turn "
    "CX into CZ) must be undone; a gate commutes past a CX only on the control (Z-type: rz, s, t, "
    "z) or on the target (X-type: rx, x, sx). If you cannot find a rewrite you are sure is "
    "equivalent and strictly better, return an empty list.\n"
)

_H = 'OPENQASM 3.0;\ninclude "stdgates.inc";\n'

# (region before, rewrite after, rationale): verified Operator-equal (test_prompts.py).
FEW_SHOT: tuple[tuple[str, str, str], ...] = (
    (
        _H + "qubit[3] q;\ncx q[0], q[1];\ncx q[1], q[2];\ncx q[0], q[1];\ncx q[1], q[2];\n",
        _H + "qubit[3] q;\ncx q[0], q[2];\n",
        "Linear (CNOT-only) block: its parity matrix equals a single CX(0,2); 4 -> 1 CX.",
    ),
    (
        _H + "qubit[2] q;\ncx q[0], q[1];\nrz(0.4) q[0];\ncx q[0], q[1];\n",
        _H + "qubit[2] q;\nrz(0.4) q[0];\n",
        "rz on the control commutes with CX, so the two CX cancel; 2 -> 0 CX.",
    ),
)


def _few_shot_messages() -> list[dict[str, str]]:
    """One user/assistant pair per example: abbreviated request payload (region, counts,
    objective, max_candidates), full reply shape (ChP-0052)."""
    messages: list[dict[str, str]] = []
    for before, after, why in FEW_SHOT:
        counts = _counts(before)
        user = {
            "region_qasm": before,
            "region_counts": counts,
            "objective": {"primary": "two_qubit_count", "direction": "minimize"},
            "max_candidates": 1,
        }
        reply = {
            "candidates": [
                {
                    "format": "openqasm3",
                    "qasm": after,
                    "rationale": why,
                    "estimate": _counts(after)["two_qubit_gates"],
                    "equivalent": True,
                }
            ]
        }
        messages.append({"role": "user", "content": json.dumps(user, indent=1)})
        messages.append({"role": "assistant", "content": json.dumps(reply)})
    return messages


def strip_comments(qasm: str) -> str:
    """Remove OpenQASM comments: circuit text could carry instructions (10 §6)."""
    return _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", qasm))


def candidate_schema(max_proposals: int) -> dict[str, object]:
    """`CandidateSet` (10 §5): the only shape a model may reply with."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["candidates"],
        "properties": {
            "candidates": {
                "type": "array",
                "maxItems": max_proposals,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["format", "qasm", "rationale", "estimate", "equivalent"],
                    "properties": {
                        "format": {"type": "string", "enum": ["openqasm3", "openqasm2"]},
                        "qasm": {"type": "string"},
                        "rationale": {"type": "string", "maxLength": 600},
                        "estimate": {"type": "number"},
                        "equivalent": {"type": "boolean"},
                    },
                },
            }
        },
    }


def _counts(qasm: str) -> dict[str, int]:
    """Gate counts of the region, so the model knows the number to beat."""
    from qiskit import qasm3

    qc = qasm3.loads(qasm)
    two_q = sum(1 for i in qc.data if i.operation.num_qubits == 2)
    return {"two_qubit_gates": two_q, "gates": qc.size(), "depth": qc.depth()}


def render(request: ImprovementRequest) -> list[dict[str, str]]:
    """System + user messages for one request; the region QASM has its comments stripped."""
    payload = {
        "finding": {
            "rule": request.finding.rule,
            "severity": request.finding.severity,
            "evidence": request.finding.evidence,
        },
        "region_qasm": strip_comments(request.circuit.qasm),
        "region_num_qubits": request.circuit.num_qubits,
        "region_counts": _counts(request.circuit.qasm),
        "qubit_map": request.circuit.qubit_map,
        "target": {
            "basis": request.target.basis,
            "coupling_map_region_local": request.target.coupling_map,
        },
        "objective": request.objective.model_dump(mode="json"),
        "permitted_changes": request.permitted.changes,
        "invariants": request.invariants.model_dump(mode="json"),
        "max_candidates": request.budget.max_proposals,
        "estimate_means": f"your predicted {request.objective.primary} of the rewritten region",
    }
    return [
        {"role": "system", "content": SYSTEM},
        *_few_shot_messages(),
        {"role": "user", "content": json.dumps(payload, indent=1, default=str)},
    ]
