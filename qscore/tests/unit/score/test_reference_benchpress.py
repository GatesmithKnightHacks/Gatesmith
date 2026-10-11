"""Benchpress device-transpile measurements (ChP-0038 §2.1, §2.2 R2)."""

import logging
from unittest.mock import Mock

import pytest
from qiskit import QuantumCircuit
from qiskit.transpiler import TranspilerError, generate_preset_pass_manager

from qscore.schemas.manifest import TargetSpec
from qscore.score import reference
from qscore.targets.registry import get_target


@pytest.fixture
def ghz5():
    circuit = QuantumCircuit(5)
    circuit.h(0)
    for qubit in range(4):
        circuit.cx(qubit, qubit + 1)
    return circuit


@pytest.fixture
def torino():
    return get_target(TargetSpec(backend="FakeTorino"))


def test_ghz5_matches_benchpress_count_and_depth(ghz5, torino):
    seed = 11
    compiled = generate_preset_pass_manager(
        optimization_level=2, target=torino.target, seed_transpiler=seed
    ).run(ghz5)

    block = reference.benchpress_block(ghz5, torino, seed)

    assert block["convention"] == (
        "benchpress@b695f30e83a32bac05b9b4d8e98d37ba9aae5236 device_transpile"
    )
    assert block["optimization_level"] == 2
    assert block["seed"] == seed
    assert block["two_q_gate"] == "cz"
    assert block["gate_count_2q"] == compiled.count_ops()["cz"]
    assert block["depth_2q"] == compiled.depth(
        filter_function=lambda instruction: instruction.operation.name == "cz"
    )


def test_fixed_seed_is_deterministic(ghz5, torino):
    first = reference.benchpress_block(ghz5, torino, 37)
    assert "error" not in first
    assert reference.benchpress_block(ghz5, torino, 37) == first


@pytest.mark.parametrize("gate", ["cx", "cz", "ecr"])
def test_supported_two_qubit_basis(gate):
    target = get_target(
        TargetSpec(coupling_map=[(0, 1), (1, 0)], basis_gates=[gate, "rz", "sx", "x"])
    )
    circuit = QuantumCircuit(2)
    circuit.cx(0, 1)
    compiled = generate_preset_pass_manager(
        optimization_level=2, target=target.target, seed_transpiler=23
    ).run(circuit)

    block = reference.benchpress_block(circuit, target, 23)

    assert block["two_q_gate"] == gate
    assert block["gate_count_2q"] == compiled.count_ops()[gate]
    assert block["depth_2q"] == compiled.depth(
        filter_function=lambda instruction: instruction.operation.name == gate
    )


def test_circuit_without_two_qubit_gates_has_zero_counts(torino):
    circuit = QuantumCircuit(2)
    circuit.x(0)
    circuit.barrier(0, 1)
    circuit.x(1)

    block = reference.benchpress_block(circuit, torino, 11)

    assert block["gate_count_2q"] == 0
    assert block["depth_2q"] == 0


@pytest.mark.parametrize("basis", [["iswap", "rz", "sx", "x"], ["rz", "sx", "x"]])
def test_unsupported_target_does_not_compile(basis, monkeypatch):
    target = get_target(TargetSpec(coupling_map=[(0, 1), (1, 0)], basis_gates=basis))
    compile_manager = Mock(side_effect=AssertionError("unsupported target must not compile"))
    monkeypatch.setattr(reference, "generate_preset_pass_manager", compile_manager)

    assert reference.benchpress_block(QuantumCircuit(2), target, 11) == {}
    compile_manager.assert_not_called()


def test_ambiguous_two_qubit_basis_is_an_error(monkeypatch, caplog):
    target = get_target(
        TargetSpec(coupling_map=[(0, 1), (1, 0)], basis_gates=["cx", "cz", "rz", "sx", "x"])
    )
    compile_manager = Mock(side_effect=AssertionError("ambiguous target must not compile"))
    monkeypatch.setattr(reference, "generate_preset_pass_manager", compile_manager)

    with caplog.at_level(logging.ERROR, logger="qscore.score.reference"):
        block = reference.benchpress_block(QuantumCircuit(2), target, 11)

    assert block["error"]["type"] == "CompileError"
    assert "expected one 2-qubit basis gate" in block["error"]["message"]
    assert "expected one 2-qubit basis gate" in caplog.text
    compile_manager.assert_not_called()


@pytest.mark.parametrize("stage", ["construct", "run"])
@pytest.mark.parametrize("error_type", [TranspilerError, RuntimeError])
def test_compile_failure_is_recorded_and_logged(
    stage, error_type, ghz5, torino, monkeypatch, caplog
):
    error = error_type("deliberate reference compile failure")
    compile_manager = Mock()
    if stage == "construct":
        compile_manager.side_effect = error
    else:
        compile_manager.return_value.run.side_effect = error
    monkeypatch.setattr(reference, "generate_preset_pass_manager", compile_manager)

    with caplog.at_level(logging.ERROR, logger="qscore.score.reference"):
        block = reference.benchpress_block(ghz5, torino, 11)

    assert block == {"error": {"type": error_type.__name__, "message": str(error)}}
    compile_manager.assert_called_once_with(
        optimization_level=2, target=torino.target, seed_transpiler=11
    )
    assert "Benchpress" in caplog.text
    assert "FakeTorino" in caplog.text
    assert "deliberate reference compile failure" in caplog.text
