"""GPU differential checks on the W7900 with the ROCm Aer build (09 §9; 13 §3.2 smoke)."""

from __future__ import annotations

import numpy as np
import pytest
from qiskit import QuantumCircuit

from qscore.bench.suite import random_layered, time_circuit
from qscore.sim.backends import aer_build, make_simulator

pytestmark = pytest.mark.gpu


def test_rocm_build_exposes_gpu() -> None:
    assert aer_build()[1] == "rocm"
    assert "GPU" in make_simulator("gpu").available_devices()


def test_ghz20_statevector_matches_cpu() -> None:
    qc = QuantumCircuit(20)
    qc.h(0)
    for i in range(19):
        qc.cx(i, i + 1)
    qc.save_statevector()
    sv = {
        d: np.asarray(make_simulator(d).run(qc).result().get_statevector())  # type: ignore[arg-type]
        for d in ("cpu", "gpu")
    }
    assert np.max(np.abs(sv["cpu"] - sv["gpu"])) < 1e-12


@pytest.mark.parametrize("n", [12, 20])
def test_random_layered_expectation_matches_cpu(n: int) -> None:
    qc = random_layered(n, 20, 7)
    cpu = time_circuit(qc, "cpu", "double", reps=1, warmup=0).value
    gpu = time_circuit(qc, "gpu", "double", reps=1, warmup=0).value
    assert abs(cpu - gpu) < 1e-9
