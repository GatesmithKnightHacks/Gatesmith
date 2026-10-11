"""resynthesis_potential: KAK minimum from synthesis (specs/06-metrics.md §2.3, ChP-0043)."""

from __future__ import annotations

import numpy as np
import pytest
from qiskit import QuantumCircuit

from qscore.metrics.opportunities.structure import block_potential


def _swap_class_block(phase_k: int) -> QuantumCircuit:
    # Found in a routed QED-C Grover compile: a SWAP-class block (Weyl π/4, π/4, π/4) that needs
    # 3 CZ. Qiskit 2.5.2 `num_basis_gates` returns 0 for it at some global phases.
    qc = QuantumCircuit(2, global_phase=np.pi / 2 * phase_k)
    qc.cz(1, 0)
    qc.sx(1)
    qc.sx(0)
    qc.cz(1, 0)
    qc.sx(1)
    qc.sx(0)
    qc.cz(1, 0)
    qc.rz(np.pi / 2, 1)
    qc.sx(1)
    qc.rz(np.pi, 1)
    qc.sx(0)
    return qc


@pytest.mark.parametrize("phase_k", [0, 1, 2, 3])
def test_swap_class_block_is_not_reducible(phase_k: int) -> None:
    assert block_potential(_swap_class_block(phase_k), "cz") == 0


def test_redundant_pair_is_reducible() -> None:
    qc = QuantumCircuit(2)
    qc.cx(0, 1)
    qc.cx(0, 1)
    assert block_potential(qc, "cx") == 2
