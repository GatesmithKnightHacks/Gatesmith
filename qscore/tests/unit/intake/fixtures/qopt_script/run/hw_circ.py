import json

from qiskit import QuantumCircuit

with open("data/x.json") as fh:
    n = json.load(fh)["num_qubits"]
qc = QuantumCircuit(n)
qc.h(0)
qc.cx(0, 1)


def scaled(width):
    out = QuantumCircuit(width)
    out.h(range(width))
    return out


if __name__ == "__main__":
    raise RuntimeError("main block ran")

raise RuntimeError("cloud login")
