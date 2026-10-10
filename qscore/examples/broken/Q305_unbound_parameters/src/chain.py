from qiskit import QuantumCircuit
from qiskit.circuit import Parameter


def build(n=2):
    qc = QuantumCircuit(n, n)
    qc.rx(Parameter("theta"), 0)
    qc.ry(Parameter("phi"), 1)
    qc.cx(0, 1)
    qc.measure(range(n), range(n))
    return qc
