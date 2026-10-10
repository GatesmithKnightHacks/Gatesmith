/* The three export files, as text, so Download hands over real files. */
import { ATTEMPTS, RUN } from '../../data/demo'

export const FINAL_QASM = `OPENQASM 2.0;
include "qelib1.inc";
// sidechain_qaoa after run ${RUN.job} · 33 two-qubit gates on ${RUN.target}
qreg q[12];
creg c[12];
h q;
cx q[0], q[1];
rz(0.42) q[1];
cx q[0], q[1];
rz(0.42) q[1];
cx q[2], q[3];
rz(0.42) q[3];
cx q[2], q[3];
// layer 2
cx q[3], q[4];
rz(0.42) q[4];
cx q[3], q[4];
rz(0.42) q[4];
cx q[5], q[6];
rz(0.42) q[6];
cx q[5], q[6];
rx(1.17) q;
measure q -> c;
`

export const MANIFEST_YAML = `schema: qscore.project/v0.2
project: qaoa-packing
items:
  - id: packing_qaoa_p2
    source: circuits/sidechain_qaoa.final.qasm
    intent: expectation
    target: FakeTorino
    seeds: [11, 23, 37, 41, 53, 67, 79, 97]
    primary: two_qubit_count
    max_rounds: 4
    layers: [reference-qiskit, local]
`

export const QISKIT_CODE = `from qiskit import QuantumCircuit

def build_qaoa_final(gamma=0.42, beta=1.17):
    """sidechain_qaoa after run 7f3a·0412, 33 two-qubit gates."""
    qc = QuantumCircuit(12, 12)
    qc.h(range(12))
    for a, b in [(0, 1), (2, 3), (4, 5), (6, 7), (8, 9), (10, 11)]:
        qc.cx(a, b)
        qc.rz(gamma, b)
        qc.cx(a, b)
    for a, b in [(1, 2), (3, 4), (5, 6), (7, 8), (9, 10)]:
        qc.cx(a, b); qc.rz(gamma, b); qc.cx(a, b)
    qc.rx(beta, range(12))
    qc.measure(range(12), range(12))
    return qc

if __name__ == "__main__":
    from qiskit import transpile
    from qiskit_ibm_runtime.fake_provider import FakeTorino
    qc = transpile(build_qaoa_final(), FakeTorino(),
                   optimization_level=3, seed_transpiler=11)
    print(qc.num_nonlocal_gates())  # 33`

export const ACTION_YAML = `name: qscore
on:
  pull_request:
    paths: ["**/*.qasm", "src/**/*.py"]
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gatesmith/qscore-action@v1
        with:
          manifest: qscore.yaml
          fail-on: high
          comment: true`

export function reportJson() {
  return JSON.stringify(
    {
      schema: 'qscore.report/v0.2',
      job: RUN.job,
      item: RUN.item,
      score_version: RUN.scoreVersion,
      target: RUN.target,
      seeds: RUN.seeds,
      primary: { metric: 'two_qubit_count', before: 44, after: 33, unit: 'gates' },
      stopped: { after_round: 4, rule: 'every finding below threshold' },
      attempts: ATTEMPTS.map((a) => ({
        n: a.n,
        round: a.round,
        layer: a.layer === 'reference' ? 'reference-qiskit' : 'local',
        strategy: a.strategy,
        decision: a.final,
        ...(a.delta ? { two_qubit_delta: a.delta } : {}),
      })),
    },
    null,
    2,
  )
}
