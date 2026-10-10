"""Side-chain packing QAOA (specs/14 §3.1, recipe pinned by CP-0015).

One-hot encoding: qubit q(i, r) = i*R + r is 1 when residue i takes rotamer r. Energies come from
numpy.random.default_rng(20261009): self energies E_i(r) ~ U(-1, 1) in order (i, r), then pair
energies E_ij(r, s) ~ U(-0.5, 0.5) for adjacent residues j = i+1 only, in order (i, r, s).
QUBO = energies + lambda * sum_i (1 - sum_r x_ir)^2 with lambda = 2 * max|E|, mapped to Ising with
x = (1 - z) / 2 (constant dropped).
"""

from __future__ import annotations

import numpy as np
from qiskit.circuit import ParameterVector, QuantumCircuit

SEED = 20261009


def ising(n_residues: int, rotamers: int) -> tuple[dict[int, float], dict[tuple[int, int], float]]:
    """Return (h, J): H = sum_q h[q] Z_q + sum_{q<q'} J[q, q'] Z_q Z_q'."""
    rng = np.random.default_rng(SEED)
    n_q = n_residues * rotamers

    def q(i: int, r: int) -> int:
        return i * rotamers + r

    self_e = {(i, r): float(rng.uniform(-1, 1)) for i in range(n_residues) for r in range(rotamers)}
    pair_e = {
        (i, r, s): float(rng.uniform(-0.5, 0.5))
        for i in range(n_residues - 1)
        for r in range(rotamers)
        for s in range(rotamers)
    }
    lam = 2 * max(abs(e) for e in [*self_e.values(), *pair_e.values()])

    lin = dict.fromkeys(range(n_q), 0.0)
    quad: dict[tuple[int, int], float] = {}
    for (i, r), e in self_e.items():
        lin[q(i, r)] += e
    for (i, r, s), e in pair_e.items():
        key = (q(i, r), q(i + 1, s))
        quad[key] = quad.get(key, 0.0) + e
    # lambda (1 - sum x)^2 = lambda (1 - sum x + 2 sum_{r<s} x_r x_s), using x^2 = x
    for i in range(n_residues):
        for r in range(rotamers):
            lin[q(i, r)] -= lam
            for s in range(r + 1, rotamers):
                key = (q(i, r), q(i, s))
                quad[key] = quad.get(key, 0.0) + 2 * lam

    h = {a: -c / 2 for a, c in lin.items()}
    j: dict[tuple[int, int], float] = {}
    for (a, b), c in sorted(quad.items()):
        h[a] -= c / 4
        h[b] -= c / 4
        j[(a, b)] = c / 4
    return h, j


def build_qaoa(n_residues: int, rotamers: int, p: int) -> QuantumCircuit:
    h, j = ising(n_residues, rotamers)
    n_q = n_residues * rotamers
    gamma, beta = ParameterVector("gamma", p), ParameterVector("beta", p)
    qc = QuantumCircuit(n_q, name=f"qaoa_packing_{n_residues}x{rotamers}_p{p}")
    qc.h(range(n_q))
    for k in range(p):
        for a in range(n_q):
            qc.rz(2 * gamma[k] * h[a], a)
        for (a, b), coeff in sorted(j.items()):
            qc.rzz(2 * gamma[k] * coeff, a, b)
        for a in range(n_q):
            qc.rx(2 * beta[k], a)
    return qc
