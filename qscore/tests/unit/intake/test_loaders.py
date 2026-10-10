"""parse_qasm reports QASM3 syntax errors as Q304 (05 §4.1, ChP-0027)."""

from pathlib import Path

from qscore.intake.loaders import LoadedCircuit, QasmProblem, parse_qasm


def test_qasm3_syntax_error_is_q304(tmp_path: Path) -> None:
    path = tmp_path / "typo.qasm"
    path.write_text("OPENQASM 3.0;\nqubit[2] q;\nh q[0]\n", encoding="utf-8")
    problem = parse_qasm(path)
    assert isinstance(problem, QasmProblem)
    assert problem.code == "Q304"
    assert problem.message.startswith("typo.qasm: ")


def test_valid_qasm3_loads(tmp_path: Path) -> None:
    path = tmp_path / "ok.qasm"
    path.write_text(
        ('OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nh q[0];\ncx q[0], q[1];\n'),
        encoding="utf-8",
    )
    loaded = parse_qasm(path)
    assert isinstance(loaded, LoadedCircuit)
    assert loaded.qasm_version == 3
    assert loaded.circuit.num_qubits == 2
