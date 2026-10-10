/*
 * The S-09 circuit drawing (483×340), generated from a compact gate list so Original and Final
 * share one renderer. Geometry, colors and draw order match the Paper SVG exactly.
 */
import type { CSSProperties } from 'react'

const W = 483
const H = 340
const WIRES = Array.from({ length: 12 }, (_, i) => 30 + 26 * i)

/** [x, control y, target y] */
export type Cx = [number, number, number]
/** [x, y1, y2] */
export type Swap = [number, number, number]
type Box = { x: number; w: number; ys: readonly number[]; label: string }

const odd = WIRES.filter((_, i) => i % 2 === 1)
const evenFromQ2 = [82, 134, 186, 238, 290]

const BOXES: Box[] = [
  { x: 34.5, w: 19, ys: WIRES, label: 'H' },
  { x: 93.5, w: 21, ys: odd, label: 'RZ' },
  { x: 181.5, w: 21, ys: evenFromQ2, label: 'RZ' },
  { x: 427.5, w: 21, ys: WIRES, label: 'RX' },
  { x: 454.5, w: 19, ys: WIRES, label: 'M' },
]

const ladder = (x: number, start: 30 | 56): Cx[] => {
  const out: Cx[] = []
  for (let y = start; y + 26 <= 316; y += 52) out.push([x, y, y + 26])
  return out
}

/** The layer every version shares: two CX ladders on each side of the RZ layer. */
const SHARED_CX: Cx[] = [...ladder(76, 30), ...ladder(132, 30), ...ladder(164, 56), ...ladder(220, 56)]

export type Region = {
  x: number
  width: number
  tone: 'bad' | 'good'
  tag: string
}

export const ORIGINAL = {
  cx: [
    ...SHARED_CX,
    [296, 82, 108],
    [296, 186, 212],
    [296, 290, 316],
    [362, 108, 134],
    [362, 212, 238],
    [406, 56, 82],
    [406, 160, 186],
  ] as Cx[],
  swaps: [
    [252, 30, 56],
    [252, 134, 160],
    [252, 238, 264],
    [274, 56, 82],
    [274, 160, 186],
    [274, 264, 290],
    [318, 56, 82],
    [318, 160, 186],
    [318, 264, 290],
    [340, 30, 56],
    [340, 134, 160],
    [340, 238, 264],
    [384, 82, 108],
    [384, 186, 212],
    [384, 290, 316],
  ] as Swap[],
  region: { x: 240, width: 178, tone: 'bad', tag: 'D01 high' } as Region,
}

export const FINAL = {
  cx: [
    ...SHARED_CX,
    [274, 82, 108],
    [274, 186, 212],
    [274, 290, 316],
    [318, 108, 134],
    [318, 212, 238],
    [340, 56, 82],
    [340, 160, 186],
  ] as Cx[],
  swaps: [
    [252, 56, 82],
    [252, 264, 290],
    [296, 82, 108],
    [296, 186, 212],
  ] as Swap[],
  region: { x: 240, width: 112, tone: 'good', tag: 'accepted' } as Region,
}

const TONE = {
  bad: { fill: '#FF347814', stroke: '#FF3478', dash: '4 3', text: '#FF3478', tagW: 56 },
  good: { fill: '#5FEEA314', stroke: '#5FEEA3', dash: undefined, text: '#5FEEA3', tagW: 56 },
} as const

export function CircuitDrawing({
  cx,
  swaps,
  region,
  className,
  style,
  regionStyle,
}: {
  cx: Cx[]
  swaps: Swap[]
  region?: Region | null
  className?: string
  style?: CSSProperties
  /** applied to the region outline group, for the M5 draw-in */
  regionStyle?: CSSProperties
}) {
  const tone = region ? TONE[region.tone] : null
  const lines = [...cx.map(([x, a, b]) => `M${x} ${a}V${b}`), ...swaps.map(([x, a, b]) => `M${x} ${a}V${b}`)].join('')
  const dots = cx.map(([x, c]) => `M${x - 5} ${c}a5 5 0 1010 0a5 5 0 10-10 0`).join('')
  const rings = cx.map(([x, , t]) => `M${x - 7} ${t}a7 7 0 1014 0a7 7 0 10-14 0`).join('')
  const plus = cx.map(([x, , t]) => `M${x - 7} ${t}H${x + 7}M${x} ${t - 7}V${t + 7}`).join('')
  const xs = swaps
    .flatMap(([x, a, b]) => [a, b].map((y) => `M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8`))
    .join('')
  const boxes = BOXES.flatMap((b) => b.ys.map((y) => `M${b.x} ${y - 9.5}h${b.w}v19h-${b.w}z`)).join('')

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={style}
      role="img"
      aria-label="Circuit drawing"
    >
      <rect width={W} height={H} fill="#2C3456" />
      <path d={WIRES.map((y) => `M28 ${y}H477`).join('')} fill="none" stroke="#6ED2B94D" strokeWidth="2" />
      {WIRES.map((y, i) => (
        <text key={y} x="6" y={y + 3.5} fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
          q{i}
        </text>
      ))}
      {region && tone && (
        <rect
          x={region.x}
          y="17"
          width={region.width}
          height="312"
          rx="2"
          fill={tone.fill}
          stroke={tone.stroke}
          strokeWidth="1.5"
          strokeDasharray={tone.dash}
          style={regionStyle}
          className="circuit-region"
        />
      )}
      <path d={lines} fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
      <path d={dots} fill="#FFFFFF" />
      <path d={rings} fill="#2C3456" stroke="#FFFFFF" strokeWidth="1.3" />
      <path d={plus} fill="none" stroke="#FFFFFF" strokeWidth="1.3" />
      <path d={xs} fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
      <path d={boxes} fill="#0F1F23" stroke="#C2DADF" />
      {BOXES.flatMap((b) =>
        b.ys.map((y) => (
          <text
            key={`${b.label}-${b.x}-${y}`}
            x={b.x + b.w / 2}
            y={y + 3}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize="9"
            fill="#FFFFFF"
          >
            {b.label}
          </text>
        )),
      )}
      {region && tone && (
        <g className="circuit-region-tag" style={regionStyle}>
          <rect x="243" y="10" width={tone.tagW} height="14" rx="2" fill="#0F1F23" />
          <text x="247" y="20.5" fontFamily="JetBrains Mono" fontSize="10" fill={tone.text}>
            {region.tag}
          </text>
        </g>
      )}
    </svg>
  )
}
