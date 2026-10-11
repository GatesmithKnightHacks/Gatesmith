/*
 * The two canvases of S-09, drawn exactly as Paper draws them.
 * Original = the master's canonical canvas (fix-round-2 D24): 12 wires on a 26 px pitch, the 33 layers of one
 * QAOA p = 2 run (h, 15 cost layers, rx, 15 cost layers, rx), both D03 blocks in solid #C2DADF outlines.
 * Final = the circuit after rounds 2 and 3, with the swaps the router still needs and both accepted blocks.
 */

/* SVG paint has no CSS variable on every engine path we export, so the canvas keeps the token values inline:
   #FFFFFF38 wire, #ADC5CA tertiary, #C2DADF secondary, #667E83 disabled, #0F1F23 inset, #061419 ground, #5FEEA3 mint. */
const WIRE = '#FFFFFF38'

/** Cost-layer pattern of one block: x of the layer (block 1) and the qubit pairs of each rzz. */
const BLOCK: [number, [number, number][]][] = [
  [49.6, [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]]],
  [59.2, [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]],
  [68.8, [[0, 2], [3, 5], [6, 8], [9, 11]]],
  [78.4, [[1, 3], [4, 6], [7, 9]]],
  [88, [[2, 4], [5, 7], [8, 10]]],
  [97.6, [[0, 3], [4, 7], [8, 11]]],
  [107.2, [[1, 4], [5, 8]]],
  [116.8, [[2, 5], [6, 9]]],
  [126.4, [[3, 6], [7, 10]]],
  [136, [[0, 4], [5, 9]]],
  [145.6, [[1, 5], [6, 10]]],
  [155.2, [[2, 6], [7, 11]]],
  [164.8, [[3, 7]]],
  [174.4, [[4, 8]]],
  [184, [[3, 8]]],
]
const BLOCK2_DX = 153.6
const qy = (q: number) => 40 + q * 26
const QUBITS = Array.from({ length: 12 }, (_, q) => q)
const TICKS: [number, string | null][] = [
  [40, null],
  [88, '5'],
  [136, '10'],
  [184, '15'],
  [232, '20'],
  [280, '25'],
  [328, '30'],
]

function Rzz({ x, a, b, color }: { x: number; a: number; b: number; color: string }) {
  return (
    <>
      <line x1={x} y1={qy(a)} x2={x} y2={qy(b)} stroke={color} strokeWidth="2" />
      <circle cx={x} cy={qy(a)} r="3" fill={color} />
      <circle cx={x} cy={qy(b)} r="3" fill={color} />
    </>
  )
}

/** `block2` names what happened to the second commuting block: fixed in R3, or still open (partial, one round). */
export function OriginalCircuit({ block1 = 'fixed R2', block2 = 'fixed R3' }: { block1?: string; block2?: string }) {
  return (
    <svg className="rp-svg" width="358" height="380" viewBox="0 0 358 380" role="img" aria-label="Original circuit, 12 qubits, 33 layers, D03 blocks 1 and 2 outlined">
      {(
        [
          [47.8, 'D03 block 1', block1],
          [201.4, 'D03 block 2', block2],
        ] as const
      ).map(([x, a, b]) => (
        <text key={a} x={x} fontFamily="JetBrains Mono" fontSize="11" fill="#C2DADF">
          <tspan x={x} y="12.5">
            {a}
          </tspan>
          <tspan x={x} y="25.5">
            {b}
          </tspan>
        </text>
      ))}
        {QUBITS.map((q) => (
          <g key={q}>
            <line x1="30" y1={qy(q)} x2="352" y2={qy(q)} stroke={WIRE} />
            <text x="26" y={qy(q) + 4} textAnchor="end" fontFamily="JetBrains Mono" fontSize="11" fill="#ADC5CA">
              q{q}
            </text>
          </g>
        ))}
        <rect x="44.8" y="31" width="144" height="304" rx="2" fill="none" stroke="#C2DADF" />
        <rect x="198.4" y="31" width="144" height="304" rx="2" fill="none" stroke="#C2DADF" />
        {QUBITS.map((q) => (
          <rect key={q} x="36.5" y={qy(q) - 3.5} width="7" height="7" rx="1" fill="#0F1F23" stroke="#667E83" />
        ))}
        {BLOCK.map(([x, pairs]) => pairs.map(([a, b]) => <Rzz key={`a${x}-${a}`} x={x} a={a} b={b} color="#667E83" />))}
        {QUBITS.map((q) => (
          <rect key={q} x="190" y={qy(q) - 4} width="8" height="8" rx="1" fill="#C2DADF" />
        ))}
        {BLOCK.map(([x, pairs]) =>
          pairs.map(([a, b]) => <Rzz key={`b${x}-${a}`} x={Math.round((x + BLOCK2_DX) * 10) / 10} a={a} b={b} color="#FFFFFF" />),
        )}
        {QUBITS.map((q) => (
          <rect key={q} x="343" y={qy(q) - 4} width="8" height="8" rx="1" fill="#C2DADF" />
        ))}
        <line x1="30" y1="340" x2="352" y2="340" stroke="#061419" />
        <text x="6" y="354" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          layer
        </text>
        {TICKS.map(([x, label]) => (
          <g key={x}>
            <line x1={x} y1="340" x2={x} y2="344" stroke="#ADC5CA" />
            {label && (
              <text x={x} y="354" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
                {label}
              </text>
            )}
          </g>
        ))}
        <circle cx="34" cy="369" r="2.5" fill="#FFFFFF" />
        <line x1="34" y1="369" x2="48" y2="369" stroke="#FFFFFF" strokeWidth="1.5" />
        <circle cx="48" cy="369" r="2.5" fill="#FFFFFF" />
        <text x="56" y="372" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          rzz(γ) · 39 per cost layer
        </text>
        <rect x="248.5" y="365.5" width="7" height="7" rx="1" fill="#0F1F23" stroke="#667E83" />
        <text x="260" y="372" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          h
        </text>
        <rect x="280" y="365" width="8" height="8" rx="1" fill="#C2DADF" />
        <text x="292" y="372" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          rx(β)
        </text>
    </svg>
  )
}

const FINAL_GATES =
  'M46.8 28V55M46.8 82V109M46.8 136V163M46.8 190V217M46.8 244V271M46.8 298V325M57.5 55V82M57.5 109V136M57.5 163V190M57.5 217V244M57.5 271V298M68.2 28V82M68.2 109V163M68.2 190V244M68.2 271V325M79 55V109M79 136V190M79 217V271M89.8 82V136M89.8 163V217M89.8 244V298M100.5 28V109M100.5 136V217M100.5 244V325M111.2 55V136M111.2 163V244M132.8 82V163M132.8 190V271M143.5 109V190M143.5 217V298M154.2 28V136M154.2 163V271M165 55V163M165 190V298M175.8 82V190M175.8 217V325M186.5 109V217M197.2 136V244M208 109V244M229.5 28V55M229.5 82V109M229.5 136V163M229.5 190V217M229.5 244V271M229.5 298V325M240.2 55V82M240.2 109V136M240.2 163V190M240.2 217V244M240.2 271V298M251 28V82M251 109V163M251 190V244M251 271V325M261.8 55V109M261.8 136V190M261.8 217V271M272.5 82V136M272.5 163V217M272.5 244V298M283.2 28V109M283.2 136V217M283.2 244V325M294 55V136M294 163V244M304.8 82V163M304.8 190V271M326.2 109V190M326.2 217V298M337 28V136M337 163V271M347.8 55V163M347.8 190V298M358.5 82V190M358.5 217V325M369.2 109V217M380 136V244M390.8 109V244'

/** The control dots are the ends of every gate segment, drawn as zero-length round caps (as Paper exports them). */
const FINAL_DOTS = FINAL_GATES.replace(/M([\d.]+) ([\d.]+)V([\d.]+)/g, 'M$1 $2h0M$1 $3h0')

const SWAP_WIRES = 'M122 55V82M122 136V163M122 217V244M122 298V325M315.5 28V55M315.5 109V136M315.5 190V217M315.5 271V298'
const SWAP_X =
  'M119 52l6 6M125 52l-6 6M119 79l6 6M125 79l-6 6M119 133l6 6M125 133l-6 6M119 160l6 6M125 160l-6 6M119 214l6 6M125 214l-6 6M119 241l6 6M125 241l-6 6M119 295l6 6M125 295l-6 6M119 322l6 6M125 322l-6 6M312.5 25l6 6M318.5 25l-6 6M312.5 52l6 6M318.5 52l-6 6M312.5 106l6 6M318.5 106l-6 6M312.5 133l6 6M318.5 133l-6 6M312.5 187l6 6M318.5 187l-6 6M312.5 214l6 6M318.5 214l-6 6M312.5 268l6 6M318.5 268l-6 6M312.5 295l6 6M318.5 295l-6 6'
const H_BOXES = QUBITS.map((q) => `M32.5 ${24.5 + q * 27}h7v7h-7z`).join('')
const RX_BOXES = [215.2, 398].flatMap((x) => QUBITS.map((q) => `M${x} ${24.5 + q * 27}h7v7h-7z`)).join('')

/** `accepted` counts the D03 blocks drawn as accepted: 2 after R3, 1 when the run stopped after R2, 0 after R1. */
export function FinalCircuit({ accepted = 2 }: { accepted?: 0 | 1 | 2 }) {
  const block1 = accepted >= 1
  const block2 = accepted >= 2
  return (
    <svg className="rp-svg" width="474" height="382" viewBox="0 0 474 382" role="img" aria-label="Final circuit, 12 qubits">
      <path d={QUBITS.map((q) => `M26 ${28 + q * 27}H466`).join('')} fill="none" stroke={WIRE} />
      {QUBITS.map((q) => (
        <text key={q} x="22" y={31.5 + q * 27} textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          q{q}
        </text>
      ))}
      {block1 && (
        <>
          <rect x="40.8" y="19" width="173.2" height="315" rx="2" fill="#5FEEA30A" stroke="#5FEEA3" />
          <path d="M44.8 10.2l2.2 2.2 4.3-4.6" fill="none" stroke="#5FEEA3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <text x="55.8" y="14" fontFamily="JetBrains Mono" fontSize="10" fill="#5FEEA3">
            D03 block 1 · accepted R2
          </text>
        </>
      )}
      {block2 && (
        <>
          <rect x="223.5" y="19" width="173.2" height="315" rx="2" fill="#5FEEA30A" stroke="#5FEEA3" />
          <path d="M227.5 10.2l2.2 2.2 4.3-4.6" fill="none" stroke="#5FEEA3" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <text x="238.5" y="14" fontFamily="JetBrains Mono" fontSize="10" fill="#5FEEA3">
            D03 block 2 · accepted R3
          </text>
        </>
      )}
      <path d={H_BOXES} fill="#0F1F23" stroke="#C2DADF" />
      <path d={SWAP_WIRES} fill="none" stroke="#ADC5CA" strokeWidth="1.2" />
      <path d={SWAP_X} fill="none" stroke="#ADC5CA" strokeWidth="1.4" strokeLinecap="round" />
      <path d={FINAL_GATES} fill="none" stroke="#FFFFFF" strokeWidth="2" />
      <path d={FINAL_DOTS} fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
      <path d={RX_BOXES} fill="#C2DADF" />
      <path d="M26 339H466" stroke="#061419" />
      <text x="2" y="353" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
        layer
      </text>
      <path d="M36 339v4M89.8 339v4M143.5 339v4M197.2 339v4M251 339v4M304.8 339v4M358.5 339v4" stroke="#ADC5CA" />
      {(
        [
          [89.8, '5'],
          [143.5, '10'],
          [197.2, '15'],
          [251, '20'],
          [304.8, '25'],
          [358.5, '30'],
        ] as const
      ).map(([x, t]) => (
        <text key={t} x={x} y="353" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          {t}
        </text>
      ))}
      <path d="M30 368H44" stroke="#FFFFFF" strokeWidth="1.5" />
      <path d="M27.5 368a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M41.5 368a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" fill="#FFFFFF" />
      <text x="52" y="371" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
        rzz(γ) · 39 per cost layer
      </text>
      <path d="M223 365l6 6M229 365l-6 6" fill="none" stroke="#ADC5CA" strokeWidth="1.4" strokeLinecap="round" />
      <text x="234" y="371" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
        swap · 8 in view
      </text>
      <path d="M352.5 364.5h7v7h-7z" fill="#0F1F23" stroke="#C2DADF" />
      <text x="364" y="371" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
        h
      </text>
      <path d="M382 364.5h7v7h-7z" fill="#C2DADF" />
      <text x="393" y="371" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
        rx(β)
      </text>
    </svg>
  )
}
