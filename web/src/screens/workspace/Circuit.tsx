/*
 * The circuit canvas: sidechain_qaoa's interaction graph as the engine draws it (MVN-0 canvas 20NQ-0).
 * 12 wires, 33 layers: h (0), D03 block 1 (layers 1–15, 39 rzz edges), the mixer (16), D03 block 2
 * (layers 17–31, the same 39 edges), the final mixer (32). Regions sit on the column midpoints.
 *
 * Two layouts, both measured from Paper:
 *  - plain (never run, scoring; DS-06 1TEU-0 / 1WDE-0): no regions, every edge #C2DADF, 27 px wire pitch;
 *  - regions (after the first score): block 1 accepted (edges dimmed #667E83, mint outline),
 *    block 2 open (white edges, dashed violet outline while a proposal waits), 26 px pitch under the labels.
 */
import type { CSSProperties } from 'react'
import { BLOCK_EDGES, type FindingId } from '../../data/demo'

type Geo = {
  wireY: (q: number) => number
  layerX: (layer: number) => number
  wireX: [number, number]
  labelX: number
  labelSize: number
  axisY: number
  legendY: number
}

const REGIONS_GEO: Geo = {
  wireY: (q) => 40 + 26 * q,
  layerX: (l) => 40 + 9.6 * l,
  wireX: [30, 352],
  labelX: 26,
  labelSize: 11,
  axisY: 340,
  legendY: 369,
}

const PLAIN_GEO: Geo = {
  wireY: (q) => 28 + 27 * q,
  layerX: (l) => 36 + 9.6 * l,
  wireX: [26, 352],
  labelX: 22,
  labelSize: 10,
  axisY: 339,
  legendY: 368,
}

const QUBITS = Array.from({ length: 12 }, (_, q) => q)
const WIRE = 'rgb(255 255 255 / 22%)'
const DIM = 'var(--color-text-disabled)'
const MINT = 'var(--color-signal-good)'
const VIOLET = 'var(--color-signal-ai)'

export type BlockState = 'open' | 'proposed' | 'accepted'

export type CircuitProps = {
  layout: 'plain' | 'regions'
  /** D03 block 1 and block 2: accepted in R2 / proposed in R3 at 400 s */
  block1?: BlockState
  block2?: BlockState
  /** round that accepted each block, for the labels */
  rounds?: { block1?: number; block2?: number }
  selected?: string | null
  onSelect?: (id: FindingId) => void
  zoom?: number
  style?: CSSProperties
}

export function Circuit({ layout, block1 = 'accepted', block2 = 'proposed', rounds = { block1: 2, block2: 3 }, selected, onSelect, zoom = 1, style }: CircuitProps) {
  const plain = layout === 'plain'
  const g = plain ? PLAIN_GEO : REGIONS_GEO
  const edgeColor = (block: 1 | 2) => {
    if (plain) return 'var(--color-text-secondary)'
    const s = block === 1 ? block1 : block2
    return s === 'accepted' ? DIM : 'var(--color-text-primary)'
  }
  const regionX = (from: number, to: number) => [(g.layerX(from - 1) + g.layerX(from)) / 2, (g.layerX(to) + g.layerX(to + 1)) / 2] as const

  return (
    <svg
      className="ws-circuit-svg"
      width="358"
      height="380"
      viewBox="0 0 358 380"
      role="img"
      aria-label={`sidechain_qaoa · 12 qubits · 33 layers · ${plain ? 'not scored' : 'D03 block 1 and block 2 marked'}`}
      style={{ transform: zoom === 1 ? undefined : `scale(${zoom})`, ...style }}
    >
      {QUBITS.map((q) => (
        <g key={q}>
          <line x1={g.wireX[0]} y1={g.wireY(q)} x2={g.wireX[1]} y2={g.wireY(q)} stroke={WIRE} />
          <text x={g.labelX} y={g.wireY(q) + (plain ? 3.5 : 4)} textAnchor="end" className="ws-svg-mono" fontSize={g.labelSize} fill="var(--color-text-tertiary)">
            q{q}
          </text>
        </g>
      ))}

      {!plain && (
        <>
          <Region
            x={regionX(1, 15)}
            state={block1}
            lines={['D03 block 1', block1 === 'accepted' ? `accepted R${rounds.block1 ?? 2}` : block1 === 'proposed' ? 'proposed' : 'open']}
            onClick={onSelect ? () => onSelect('D03-1') : undefined}
          />
          <Region
            x={regionX(17, 31)}
            state={block2}
            lines={['D03 block 2', block2 === 'accepted' ? `accepted R${rounds.block2 ?? 3}` : block2 === 'proposed' ? `proposed R${rounds.block2 ?? 3}` : 'open']}
            onClick={onSelect ? () => onSelect('D03-2') : undefined}
          />
        </>
      )}

      {/* h layer */}
      {QUBITS.map((q) => (
        <rect key={`h${q}`} x={g.layerX(0) - 3.5} y={g.wireY(q) - 3.5} width="7" height="7" rx="1" fill="var(--color-surface-inset)" stroke={DIM} />
      ))}

      {([1, 2] as const).map((block) =>
        BLOCK_EDGES.map(([l, a, b]) => {
          const x = g.layerX(l + (block === 2 ? 16 : 0))
          const c = edgeColor(block)
          return (
            <g key={`${block}-${l}-${a}-${b}`}>
              <line x1={x} y1={g.wireY(a)} x2={x} y2={g.wireY(b)} stroke={c} strokeWidth="2" />
              <circle cx={x} cy={g.wireY(a)} r="3" fill={c} />
              <circle cx={x} cy={g.wireY(b)} r="3" fill={c} />
            </g>
          )
        }),
      )}

      {/* mixers: rx(β) after each cost layer */}
      {[16, 32].map((l) =>
        QUBITS.map((q) =>
          plain ? (
            <rect key={`rx${l}-${q}`} x={g.layerX(l) - 3.5} y={g.wireY(q) - 3.5} width="7" height="7" rx="1" fill="var(--color-text-secondary)" />
          ) : (
            <rect key={`rx${l}-${q}`} x={g.layerX(l) - 4} y={g.wireY(q) - 4} width="8" height="8" rx="1" fill="var(--color-text-secondary)" />
          ),
        ),
      )}

      {/* where you are: the gate the selected proposal touches */}
      {!plain && (selected === 'D03-2' || selected === 'D03-1') && (
        <rect
          x={g.layerX(selected === 'D03-2' ? 18 : 2) - 5.3}
          y={g.wireY(1) - 5.5}
          width="11"
          height="37"
          rx="2"
          fill="none"
          stroke="var(--color-signal-select)"
        />
      )}

      {/* layer axis */}
      <line x1={g.wireX[0]} y1={g.axisY} x2={g.wireX[1]} y2={g.axisY} stroke="var(--color-surface-app)" />
      <text x={plain ? 2 : 6} y={g.axisY + 14} className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
        layer
      </text>
      {[0, 5, 10, 15, 20, 25, 30].map((l) => (
        <g key={`t${l}`}>
          <line x1={g.layerX(l)} y1={g.axisY} x2={g.layerX(l)} y2={g.axisY + 4} stroke="var(--color-text-tertiary)" />
          {l > 0 && (
            <text x={g.layerX(l)} y={g.axisY + 14} textAnchor="middle" className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
              {l}
            </text>
          )}
        </g>
      ))}

      {/* legend */}
      <Legend y={g.legendY} plain={plain} />
    </svg>
  )
}

function Region({ x, state, lines, onClick }: { x: readonly [number, number]; state: BlockState; lines: [string, string]; onClick?: () => void }) {
  const color = state === 'accepted' ? MINT : state === 'proposed' ? VIOLET : 'var(--color-signal-bad)'
  return (
    <g className={onClick ? 'ws-region' : undefined} onClick={onClick}>
      <rect
        x={x[0]}
        y="31"
        width={x[1] - x[0]}
        height="304"
        rx="2"
        fill={state === 'proposed' ? 'rgb(134 123 250 / 10%)' : 'transparent'}
        stroke={color}
        strokeDasharray={state === 'proposed' ? '3 2' : undefined}
      />
      <text x={x[0] + 4} y="12" className="ws-svg-mono" fontSize="11" fill={color}>
        {lines[0]}
      </text>
      <text x={x[0] + 4} y="25" className="ws-svg-mono" fontSize="11" fill={color}>
        {lines[1]}
      </text>
    </g>
  )
}

function Legend({ y, plain }: { y: number; plain: boolean }) {
  const x0 = plain ? 30 : 34
  return (
    <g>
      <circle cx={x0} cy={y} r="2.5" fill="var(--color-text-primary)" />
      <line x1={x0} y1={y} x2={x0 + 14} y2={y} stroke="var(--color-text-primary)" strokeWidth="1.5" />
      <circle cx={x0 + 14} cy={y} r="2.5" fill="var(--color-text-primary)" />
      <text x={x0 + 22} y={y + 3} className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
        rzz(γ) · 39 per cost layer
      </text>
      {plain ? (
        <>
          <rect x="244" y={y - 3.5} width="7" height="7" rx="1" fill="var(--color-surface-inset)" stroke="var(--color-text-secondary)" />
          <text x="256" y={y + 3} className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
            h
          </text>
          <rect x="276" y={y - 3.5} width="7" height="7" rx="1" fill="var(--color-text-secondary)" />
          <text x="288" y={y + 3} className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
            rx(β)
          </text>
        </>
      ) : (
        <>
          <rect x="248.5" y={y - 3.5} width="7" height="7" rx="1" fill="var(--color-surface-inset)" stroke={DIM} />
          <text x="260" y={y + 3} className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
            h
          </text>
          <rect x="280" y={y - 4} width="8" height="8" rx="1" fill="var(--color-text-secondary)" />
          <text x="292" y={y + 3} className="ws-svg-mono" fontSize="10" fill="var(--color-text-tertiary)">
            rx(β)
          </text>
        </>
      )}
    </g>
  )
}
