"""Write the sidechain_qaoa fixtures from src/packing/qaoa.py (specs/14 §3.1, ChP-0015):

- hamiltonians/packing_4.json  the Ising Hamiltonian (04 §2.4 observable format) for n_residues=4
- circuits/packing_qaoa_p2.qasm the p=2 circuit with params/qaoa_p2.json bound (MVP QASM input,
  ChP-0023; the builder path arrives with M3)

Run: uv run python examples/sidechain_qaoa/tools/make_fixtures.py
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

from qiskit import qasm2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

_qaoa = importlib.import_module("packing.qaoa")  # example code, put on the path above
build_qaoa, ising = _qaoa.build_qaoa, _qaoa.ising

N_RESIDUES, ROTAMERS, P = 4, 3, 2


def pauli(n: int, qubits: tuple[int, ...]) -> str:
    return "".join("Z" if n - 1 - pos in qubits else "I" for pos in range(n))  # qubit 0 rightmost


def main() -> None:
    n = N_RESIDUES * ROTAMERS
    h, j = ising(N_RESIDUES, ROTAMERS)
    terms = [{"pauli": pauli(n, (a,)), "coeff": c} for a, c in sorted(h.items())]
    terms += [{"pauli": pauli(n, ab), "coeff": c} for ab, c in sorted(j.items())]
    obs = {"schema": "qscore.observable/v0.1", "num_qubits": n, "terms": terms}
    (ROOT / "hamiltonians" / "packing_4.json").write_text(json.dumps(obs, indent=1) + "\n")

    values = json.loads((ROOT / "params" / "qaoa_p2.json").read_text())
    qc = build_qaoa(N_RESIDUES, ROTAMERS, P)
    bound = qc.assign_parameters({prm: values[prm.name] for prm in qc.parameters})
    out = ROOT / "circuits" / "packing_qaoa_p2.qasm"
    out.write_text(qasm2.dumps(bound) + "\n")
    print(f"wrote {out} ({bound.num_qubits} qubits, {len(terms)} Hamiltonian terms)")


if __name__ == "__main__":
    main()
