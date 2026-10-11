# Discovery decoys (specs/05-pipeline.md §1, specs/14-testing.md §1)

`discover()` on this folder must yield exactly:

1. `circuits/ghz3.qasm` (qasm, OpenQASM 3)
2. `src/real.py::ghz` (annotation), with call-site suggestions from `src/real.py` and
   `tests/test_real.py`

Everything else is a decoy: a function returning a list of circuits, a circuit built in a class
method, a nested builder, commented-out code, strings that contain "QuantumCircuit", a
`-> list[QuantumCircuit]` annotation, a test file, and (created by the test in a copy) `.venv`,
`build`, `dist`, `node_modules` and `.git` folders.
