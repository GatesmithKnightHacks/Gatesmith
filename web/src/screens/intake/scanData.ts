/*
 * What the repo scan of qlab/sidechain-packing found (S-02), local to the intake screens.
 * The canonical repo: 1,280 files, 7 circuits (5 OpenQASM, 2 Qiskit sources), 2 skipped.
 */

export type ScanFile = {
  path: string
  format: string
  size: string
  qubits: number
  /** item id the manifest would use */
  item: string
  lines: number
  task: 'expectation' | 'sampling' | 'reversible'
  preview: string
}

export const REPO = {
  url: 'github.com/qlab/sidechain-packing',
  branch: 'main',
  commit: '4e1c2a9 · Oct 9, 18:42',
  fetched: '2.4 MB in 3.1 s · shallow',
  qiskit: '1.3.1',
}

const SIDECHAIN = `OPENQASM 2.0;
include "qelib1.inc";
// side-chain packing · QAOA p = 2 · 12 rotamers
qreg q[12];
creg c[12];
h q;
// cost layer 1
rzz(0.7854) q[0],q[1];
rzz(0.7854) q[2],q[3];
rzz(0.7854) q[4],q[5];
rzz(0.7854) q[6],q[7];
rzz(0.7854) q[8],q[9];
rzz(0.7854) q[10],q[11];
rzz(0.7854) q[1],q[2];
rzz(0.7854) q[3],q[4];
rzz(0.7854) q[5],q[6];`

const SBOX = `OPENQASM 2.0;
include "qelib1.inc";
// 4-bit S-box lookup · reversible · 100 Toffoli gates
qreg x[4];
qreg y[4];
qreg anc[12];
creg out[4];
ccx x[0],x[1],anc[0];
ccx x[2],anc[0],anc[1];
cx anc[1],y[0];
ccx x[2],anc[0],anc[1];
ccx x[0],x[1],anc[0];
ccx x[1],x[3],anc[2];
ccx x[0],anc[2],anc[3];
cx anc[3],y[1];
ccx x[0],anc[2],anc[3];`

const QAOA_P1 = `OPENQASM 2.0;
include "qelib1.inc";
// side-chain packing · QAOA p = 1 · archived
qreg q[12];
creg c[12];
h q;
// cost layer 1
rzz(0.6283) q[0],q[1];
rzz(0.6283) q[2],q[3];
rzz(0.6283) q[4],q[5];
rzz(0.6283) q[6],q[7];
rzz(0.6283) q[8],q[9];
rzz(0.6283) q[10],q[11];
// mixer
rx(1.1781) q;
measure q -> c;`

const GROVER = `OPENQASM 3.0;
include "stdgates.inc";
// Grover search · 32 items · 1 marked
qubit[5] q;
bit[5] c;
h q;
// oracle · marks 10110
x q[0];
x q[3];
h q[4];
ctrl(4) @ x q[0], q[1], q[2], q[3], q[4];
h q[4];
x q[0];
x q[3];
// diffuser
h q;`

const BELL = `OPENQASM 2.0;
include "qelib1.inc";
// Bell pair · conformance fixture
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;`

export const QASM_FILES: ScanFile[] = [
  { path: 'circuits/sidechain_qaoa.qasm', format: 'OpenQASM 2.0', size: '18.4 kB', qubits: 12, item: 'packing_qaoa_p2', lines: 88, task: 'expectation', preview: SIDECHAIN },
  { path: 'circuits/sbox_oracle.qasm', format: 'OpenQASM 2.0', size: '41.7 kB', qubits: 20, item: 'sbox_oracle', lines: 214, task: 'reversible', preview: SBOX },
  { path: 'circuits/archive/qaoa_p1.qasm', format: 'OpenQASM 2.0', size: '9.6 kB', qubits: 12, item: 'packing_qaoa_p1', lines: 52, task: 'expectation', preview: QAOA_P1 },
  { path: 'benchmarks/grover_5q.qasm', format: 'OpenQASM 3.0', size: '2.1 kB', qubits: 5, item: 'grover_5q', lines: 41, task: 'sampling', preview: GROVER },
  { path: 'tests/fixtures/bell.qasm', format: 'OpenQASM 2.0', size: '0.2 kB', qubits: 2, item: 'bell_pair', lines: 8, task: 'sampling', preview: BELL },
]

export const QISKIT_SOURCES = [
  { path: 'src/packing/build_circuit.py', format: 'Qiskit 1.3', size: '6.3 kB', qubits: '12 q' },
  { path: 'src/oracle/sbox.py', format: 'Qiskit 1.3', size: '11.0 kB', qubits: '20 q' },
]

export const SKIPPED = [
  { path: 'notebooks/explore.ipynb', format: 'notebook', size: '220 kB' },
  { path: 'data/instances.json', format: 'JSON', size: '3.4 kB' },
]

/** The manifest Gatesmith writes when the repo has none (24 lines). */
export function draftManifest(f: ScanFile): string {
  const task =
    f.task === 'expectation'
      ? ['  task: expectation', '  observable: cost_hamiltonian']
      : f.task === 'reversible'
        ? ['  task: reversible', '  check: all_inputs']
        : ['  task: sampling', '  shots: 4000']
  return [
    '# written by Gatesmith from the circuit',
    'version: qscore-2026.1',
    'item:',
    `  id: ${f.item}`,
    `  circuit: ${f.path}`,
    ...task,
    'target:',
    '  device: FakeTorino',
    '  basis: [cz, rz, sx, x]',
    'compile:',
    '  optimization_level: 3',
    '  seeds: 8',
    '  report: best_seed, seed_spread',
    'metrics:',
    '  primary: two_qubit_count',
    '  skip: [simulated_task_score, mirror_score]',
    'rules:',
    '  run: D01 to D08',
    '  not_evaluated: [D09, D10]',
    'budget:',
    '  max_rounds: 4',
    '  wall_time_s: 900',
    '  auto: false',
  ].join('\n')
}

/** The repo's own qscore.yaml in the "found" state (31 lines). */
export const FOUND_MANIFEST = `# packing study · kept by qlab
version: qscore-2026.1
item:
  id: packing_qaoa_p2
  circuit: circuits/sidechain_qaoa.qasm
  task: expectation
  observable: cost_hamiltonian
  instances: data/instances.json
target:
  device: FakeTorino
  basis: [cz, rz, sx, x]
  coupling: heavy_hex
compile:
  optimization_level: 3
  seeds: [11, 23, 37, 41, 53, 67, 79, 97]
  report: best_seed, seed_spread
metrics:
  primary: two_qubit_count
  also: [two_qubit_depth, routing_overhead]
  skip: [simulated_task_score, mirror_score]
rules:
  run: D01 to D08
  not_evaluated: [D09, D10]
  suppress: []
budget:
  max_rounds: 4
  wall_time_s: 900
  auto: false
owners:
  - qlab-dev
# last edited Oct 9 · commit 4e1c2a9`

export const NOT_CHECKED = [
  { name: 'simulated_task_score', status: 'unavailable', why: 'not in MVP build' },
  { name: 'mirror_score', status: 'skipped', why: 'not selected' },
  { name: 'D09 D10', status: 'skipped', why: 'no size_sweep' },
] as const
