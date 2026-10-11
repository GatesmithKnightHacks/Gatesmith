/*
 * Interpretation canvases for S-03, drawn as on the Paper board (S-03 · 203C-0): what the engine
 * understood of the circuit. sidechain_qaoa: 12 qubits, 33 layers, the two commuting rzz blocks
 * (D03 block 1 and 2) outlined. sbox_oracle (impractical state): 20 qubits of Toffoli network.
 */
import type { ReactNode } from 'react'

const ROWS = [30, 54, 78, 102, 126, 150, 174, 198, 222, 246, 270, 294]

const RZZ =
  'M51.3 150V198M220.9 150V198M51.3 54V126M220.9 54V126M51.3 246V270M220.9 246V270M61.9 222V270M231.5 222V270M61.9 30V54M231.5 30V54M72.5 174V270M242.1 174V270M72.5 54V102M242.1 54V102M72.5 126V150M242.1 126V150M83.1 78V102M252.7 78V102M83.1 150V222M252.7 150V222M83.1 270V294M252.7 270V294M93.7 126V246M263.3 126V246M93.7 270V294M263.3 270V294M104.3 246V294M273.9 246V294M104.3 102V198M273.9 102V198M104.3 30V78M273.9 30V78M114.9 246V294M284.5 246V294M114.9 78V198M284.5 78V198M125.5 222V270M295.1 222V270M125.5 30V54M295.1 30V54M125.5 102V126M295.1 102V126M136.1 126V174M305.7 126V174M136.1 222V294M305.7 222V294M146.7 78V102M316.3 78V102M146.7 150V246M316.3 150V246M157.3 270V294M326.9 270V294M157.3 30V126M326.9 30V126M157.3 198V222M326.9 198V222M167.9 222V246M337.5 222V246M167.9 102V150M337.5 102V150M167.9 30V54M337.5 30V54M178.5 198V270M348.1 198V270M178.5 102V174M348.1 102V174M189.1 198V294M358.7 198V294M189.1 150V174M358.7 150V174M189.1 54V102M358.7 54V102M199.7 270V294M369.3 270V294M199.7 78V150M369.3 78V150M199.7 222V246M369.3 222V246'

/** Endpoint dots: every "M x y" of the rzz path, drawn as a zero-length round-capped stroke. */
const DOTS = RZZ.replace(/M([\d.]+) ([\d.]+)V([\d.]+)/g, 'M$1 $2h0M$1 $3h0')

const H_GATES = ROWS.map((y) => `M34.5 ${y - 3.5}h7v7h-7z`).join('')
const RX_GATES = ROWS.map((y) => `M206.8 ${y - 3.5}h7v7h-7zM376.4 ${y - 3.5}h7v7h-7z`).join('')

export function SidechainCanvas() {
  return (
    <svg className="pf-canvas-svg" width="400" height="356" viewBox="0 0 400 356" role="img" aria-label="sidechain_qaoa: 12 qubits, 33 layers, D03 block 1 at layers 1 to 15 and D03 block 2 at layers 17 to 31">
      <rect className="pf-block" x="46" y="18" width="159" height="288" rx="2" />
      <text className="pf-t2" x="49" y="13">
        D03 block 1 · 39 rzz
      </text>
      <rect className="pf-block" x="215.6" y="18" width="159" height="288" rx="2" />
      <text className="pf-t2" x="218.6" y="13">
        D03 block 2 · 39 rzz
      </text>
      <path className="pf-wire" d={ROWS.map((y) => `M32 ${y}H390`).join('')} />
      {ROWS.map((y, i) => (
        <text key={y} className="pf-t2" x="27" y={y + 3.5} textAnchor="end">
          q{i}
        </text>
      ))}
      <path className="pf-gate" d={RZZ} strokeWidth="1.2" />
      <path className="pf-gate" d={DOTS} strokeWidth="4.8" strokeLinecap="round" />
      <path className="pf-h" d={H_GATES} />
      <path className="pf-rx" d={RX_GATES} />
      <Axis ticks={[[93.7, '5'], [146.7, '10'], [199.7, '15'], [252.7, '20'], [305.7, '25'], [358.7, '30']]} />
      <Legend>
        <path className="pf-gate" d="M40 341.5H52" strokeWidth="1.2" />
        <path className="pf-gate" d="M40 341.5h0M52 341.5h0" strokeWidth="4.8" strokeLinecap="round" />
        <text className="pf-t2" x="58" y="345">
          rzz(γ) · 39 per cost layer
        </text>
        <rect className="pf-h" x="232" y="338" width="7" height="7" />
        <text className="pf-t2" x="244" y="345">
          h
        </text>
        <rect className="pf-rx" x="264" y="338" width="7" height="7" />
        <text className="pf-t2" x="276" y="345">
          rx(β)
        </text>
      </Legend>
    </svg>
  )
}

function Axis({ ticks }: { ticks: [number, string][] }) {
  return (
    <>
      <path className="pf-wire" d="M32 316H390" />
      <path className="pf-tick" d={ticks.map(([x]) => `M${x} 316v3`).join('')} />
      <text className="pf-t3" x="4" y="328">
        layer
      </text>
      {ticks.map(([x, label]) => (
        <text key={label} className="pf-t3" x={x} y="328" textAnchor="middle">
          {label}
        </text>
      ))}
    </>
  )
}

function Legend({ children }: { children: ReactNode }) {
  return <g>{children}</g>
}

/* sbox_oracle: 20 wires, Toffoli columns (two controls, one target), drawn from a fixed pattern. */
const SBOX_ROWS = Array.from({ length: 20 }, (_, i) => 26 + i * 14.4)
const SBOX_GATES: [number, number, number][] = Array.from({ length: 26 }, (_, k) => {
  const a = (k * 7) % 20
  const b = (k * 7 + 3 + (k % 4)) % 20
  const t = (k * 11 + 9) % 20
  const uniq = [a, b, t].every((v, i, arr) => arr.indexOf(v) === i)
  return uniq ? [a, b, t] : [a, (a + 2) % 20, (a + 5) % 20]
})

export function SboxCanvas() {
  return (
    <svg className="pf-canvas-svg" width="400" height="356" viewBox="0 0 400 356" role="img" aria-label="sbox_oracle: 20 qubits, a reversible network of 100 Toffoli gates">
      <path className="pf-wire" d={SBOX_ROWS.map((y) => `M32 ${y}H390`).join('')} />
      {SBOX_ROWS.map((y, i) =>
        i % 2 === 0 ? (
          <text key={y} className="pf-t2" x="27" y={y + 3.5} textAnchor="end">
            q{i}
          </text>
        ) : null,
      )}
      {SBOX_GATES.map(([a, b, t], k) => {
        const x = 46 + k * 13.2
        const ys = [SBOX_ROWS[a], SBOX_ROWS[b], SBOX_ROWS[t]]
        const top = Math.min(...ys)
        const bottom = Math.max(...ys)
        const yt = SBOX_ROWS[t]
        return (
          <g key={k}>
            <path className="pf-gate" d={`M${x} ${top}V${bottom}`} strokeWidth="1.2" />
            <path className="pf-gate" d={`M${x} ${SBOX_ROWS[a]}h0M${x} ${SBOX_ROWS[b]}h0`} strokeWidth="4.8" strokeLinecap="round" />
            <circle className="pf-target" cx={x} cy={yt} r="3.6" />
            <path className="pf-gate" d={`M${x - 3.6} ${yt}h7.2M${x} ${yt - 3.6}v7.2`} strokeWidth="1" />
          </g>
        )
      })}
      <Axis ticks={[[112, '5'], [178, '10'], [244, '15'], [310, '20'], [376, '25']]} />
      <Legend>
        <path className="pf-gate" d="M44 335.5V347.5" strokeWidth="1.2" />
        <path className="pf-gate" d="M44 335.5h0M44 341.5h0" strokeWidth="4.8" strokeLinecap="round" />
        <circle className="pf-target" cx="44" cy="347.5" r="3" />
        <text className="pf-t2" x="58" y="345">
          ccx · 2 controls, 1 target · 100 in the oracle
        </text>
      </Legend>
    </svg>
  )
}
