/*
 * S-09 · QASM diff tab. One row per accepted fix on the left, its hunk on the right in the code
 * block style from DS-04 (mono 12/20, 36px gutter, pink rail for removed lines, mint for added).
 */
import { useState } from 'react'

type Line = { kind: ' ' | '-' | '+'; old?: number; new?: number; text: string }

type Fix = {
  n: number
  round: number
  strategy: string
  layer: string
  where: string
  delta: string
  note: string
  lines: Line[]
}

const ctx = (n: number, text: string, shift = 0): Line => ({ kind: ' ', old: n, new: n - shift, text })

const FIXES: Fix[] = [
  {
    n: 1,
    round: 1,
    strategy: 'routing_search',
    layer: 'reference-qiskit',
    where: 'layout',
    delta: '−4',
    note: 'Layout only. The QASM is unchanged; the engine chose a better initial layout on FakeTorino, so routing inserts fewer SWAPs.',
    lines: [],
  },
  {
    n: 4,
    round: 2,
    strategy: 'commuting_reorder',
    layer: 'local · granite-8b',
    where: 'lines 9–11',
    delta: '−4',
    note: 'The RZ sits on the control of both CX gates, so it commutes past them and the pair cancels.',
    lines: [
      ctx(6, 'cx q[0], q[1];'),
      ctx(7, 'rz(0.42) q[1];'),
      ctx(8, 'cx q[0], q[1];'),
      { kind: '-', old: 9, text: 'cx q[1], q[2];' },
      { kind: '-', old: 10, text: 'rz(0.42) q[1];' },
      { kind: '-', old: 11, text: 'cx q[1], q[2];' },
      { kind: '+', new: 9, text: 'rz(0.42) q[1];' },
      ctx(12, '// layer 2', 2),
    ],
  },
  {
    n: 6,
    round: 3,
    strategy: 'commuting_reorder',
    layer: 'local · granite-8b',
    where: 'lines 16–18',
    delta: '−3',
    note: 'Same move on the D03 block: the RZ commutes past the CX pair on q4 and q5, which then cancels.',
    lines: [
      ctx(12, '// layer 2'),
      ctx(13, 'cx q[3], q[4];'),
      ctx(14, 'rz(0.42) q[4];'),
      ctx(15, 'cx q[3], q[4];'),
      { kind: '-', old: 16, text: 'cx q[4], q[5];' },
      { kind: '-', old: 17, text: 'rz(0.42) q[4];' },
      { kind: '-', old: 18, text: 'cx q[4], q[5];' },
      { kind: '+', new: 16, text: 'rz(0.42) q[4];' },
      ctx(19, 'rx(1.17) q;', 2),
      ctx(20, 'measure q -> c;', 2),
    ],
  },
]

export function QasmDiff() {
  const [selected, setSelected] = useState(6)
  const fix = FIXES.find((f) => f.n === selected)!
  return (
    <div className="qd">
      <div className="qd-list" role="listbox" aria-label="Accepted fixes">
        <div className="qd-list-head">3 accepted fixes · two_qubit_count 44 → 33</div>
        {FIXES.map((f) => (
          <button
            key={f.n}
            role="option"
            aria-selected={f.n === selected}
            className={`qd-fix${f.n === selected ? ' is-selected' : ''}`}
            onClick={() => setSelected(f.n)}
          >
            <span className="qd-fix-top">
              <span className="mono qd-fix-n">#{f.n}</span>
              <span className="mono qd-fix-strategy">{f.strategy}</span>
              <span className="mono qd-fix-delta">{f.delta}</span>
            </span>
            <span className="qd-fix-meta">
              R{f.round} · {f.layer} · {f.where}
            </span>
          </button>
        ))}
      </div>
      <div className="qd-code">
        <div className="qd-code-head">
          <span className="mono">sidechain_qaoa.qasm → sidechain_qaoa.final.qasm</span>
          <span className="mono qd-code-meta">
            #{fix.n} · {fix.where}
          </span>
        </div>
        <p className="qd-note">{fix.note}</p>
        {fix.lines.length > 0 && (
          <pre className="qd-lines">
            {fix.lines.map((l, i) => (
              <span key={i} className={`qd-line is-${l.kind === '-' ? 'del' : l.kind === '+' ? 'add' : 'ctx'}`}>
                <span className="qd-gutter">{l.kind === '+' ? l.new : l.old}</span>
                <span className="qd-sign">{l.kind === ' ' ? '' : l.kind === '-' ? '−' : '+'}</span>
                <span className="qd-text">{l.text}</span>
              </span>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}
