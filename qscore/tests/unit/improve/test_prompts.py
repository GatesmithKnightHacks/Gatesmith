"""Few-shot rewrites in the prompt must be verified examples (specs/10 §6)."""

from __future__ import annotations

import json

import pytest
from qiskit import qasm3
from qiskit.quantum_info import Operator

from qscore.improve import prompts


@pytest.mark.parametrize(("before", "after", "why"), prompts.FEW_SHOT)
def test_few_shot_rewrite_is_exactly_equivalent_and_cheaper(
    before: str, after: str, why: str
) -> None:
    a, b = qasm3.loads(before), qasm3.loads(after)
    assert a.num_qubits == b.num_qubits
    assert Operator(a) == Operator(b)
    two_q = [sum(1 for i in c.data if i.operation.num_qubits == 2) for c in (a, b)]
    assert two_q[1] < two_q[0]


def test_few_shot_messages_precede_the_request_and_parse() -> None:
    msgs = prompts._few_shot_messages()
    assert [m["role"] for m in msgs] == ["user", "assistant"] * len(prompts.FEW_SHOT)
    for m in msgs[1::2]:
        reply = json.loads(m["content"])
        assert len(reply["candidates"]) == 1
        assert set(reply["candidates"][0]) == {
            "format",
            "qasm",
            "rationale",
            "estimate",
            "equivalent",
        }


def test_few_shot_rewrites_are_reproduced_by_the_reference_methods() -> None:
    from qiskit import transpile
    from qiskit.circuit.library import LinearFunction
    from qiskit.synthesis import synth_cnot_count_full_pmh

    (linear_before, linear_after, _), (comm_before, comm_after, _) = prompts.FEW_SHOT
    pmh = synth_cnot_count_full_pmh(LinearFunction(qasm3.loads(linear_before)).linear)
    assert pmh.count_ops() == qasm3.loads(linear_after).count_ops()
    assert Operator(pmh) == Operator(qasm3.loads(linear_after))
    level3 = transpile(
        qasm3.loads(comm_before),
        basis_gates=["cx", "rz", "sx", "x"],
        optimization_level=3,
        seed_transpiler=7,
    )
    assert level3.count_ops() == qasm3.loads(comm_after).count_ops()
