/*
 * Circuit canvas (S-04 Circuit tile). Gate boxes are HTML on top of an SVG of wires, regions and CX gates,
 * in the same paint order as Paper. During scoring a blue line sweeps once per engine stage (M1); on the
 * first sweep the gates it passes light up. Finding regions draw in as their cards land (M2).
 */
import type { CSSProperties } from 'react'
import { BOXES, CANVAS_H, CANVAS_W, CXS, GATE_TOP, REGIONS, SELECTED_GATE, WIRE_Y } from './data'

export type CircuitProps = {
  /** which regions are drawn */
  regions: { accepted: boolean; D03: boolean; D04: boolean }
  selected: string | null
  onSelect?: (rule: string) => void
  /** 'first' lights gates as the line passes; 'pass' only sweeps; null = no scan */
  scan: { stage: string; mode: 'first' | 'pass'; frozenAt?: number } | null
  zoom: number
}

const x = (px: number) => ({ '--x': (px / CANVAS_W).toFixed(3) }) as CSSProperties

export function Circuit({ regions, selected, onSelect, scan, zoom }: CircuitProps) {
  const selectedGate = selected ? SELECTED_GATE[selected] : undefined
  const scanning = scan?.mode === 'first' ? ' is-first-sweep' : ''
  return (
    <div className="ws-canvas" style={{ viewTransitionName: 'circuit-canvas' }}>
      <div className={`ws-stage${scanning}`} style={{ transform: zoom === 1 ? undefined : `scale(${zoom})` }}>
        {BOXES.map((b) => {
          const isSel = selectedGate && selectedGate.q === b.q && selectedGate.x === b.x
          return (
            <div
              key={`${b.label}-${b.q}-${b.x}`}
              className={`ws-gate${b.label === 'M' ? ' is-measure' : ''}${isSel ? ' is-selected' : ''}`}
              style={{ left: b.x, top: GATE_TOP(b.q), width: b.w, ...x(b.x) }}
            >
              {b.label}
            </div>
          )
        })}
        <svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="ws-svg" aria-hidden>
          {regions.accepted && (
            <rect
              className="ws-region"
              x={REGIONS.accepted.x}
              y={REGIONS.accepted.y}
              width={REGIONS.accepted.w}
              height={REGIONS.accepted.h}
              rx="2"
              fill="#5FEEA314"
              stroke="#5FEEA3"
              strokeWidth="1.5"
            />
          )}
          {regions.D03 && (
            <rect
              className="ws-region"
              x={REGIONS.D03.x}
              y={REGIONS.D03.y}
              width={REGIONS.D03.w}
              height={REGIONS.D03.h}
              rx="2"
              fill="#FF34781A"
              stroke="#FF3478"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}
          {regions.D04 && (
            <rect
              className="ws-region"
              x={REGIONS.D04.x}
              y={REGIONS.D04.y}
              width={REGIONS.D04.w}
              height={REGIONS.D04.h}
              rx="2"
              fill="#FF986E1A"
              stroke="#FF986E"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}
          <path
            d={Array.from({ length: 12 }, (_, q) => `M28 ${WIRE_Y(q)}H306`).join('')}
            fill="none"
            stroke="#6ED2B94D"
            strokeWidth="2"
          />
          {CXS.map((c) => {
            const yc = WIRE_Y(c.control)
            const yt = WIRE_Y(c.target)
            return (
              <g key={`${c.x}-${c.control}`} className="ws-cx" style={x(c.x)}>
                <path d={`M${c.x} ${yc}V${yt}`} fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
                <circle cx={c.x} cy={yc} r="4" fill="#FFFFFF" />
                <circle cx={c.x} cy={yt} r="7" fill="#2C3456" stroke="#FFFFFF" strokeWidth="1.3" />
                <path d={`M${c.x} ${yt - 7}V${yt + 7}M${c.x - 7} ${yt}H${c.x + 7}`} fill="none" stroke="#FFFFFF" strokeWidth="1.3" />
              </g>
            )
          })}
        </svg>
        <div className="ws-qubits">
          {Array.from({ length: 12 }, (_, q) => (
            <div key={q}>q{q}</div>
          ))}
        </div>
        {regions.accepted && <Chip {...REGIONS.accepted.chip} color="#5FEEA3" />}
        {regions.D03 && <Chip {...REGIONS.D03.chip} color="#FF3478" />}
        {regions.D04 && <Chip {...REGIONS.D04.chip} color="#FF986E" />}
        {regions.D03 && (
          <button
            className="ws-hit"
            aria-label="Select D03 commuting_block"
            style={{ left: REGIONS.D03.x, top: REGIONS.D03.y, width: REGIONS.D03.w, height: REGIONS.D03.h }}
            onClick={() => onSelect?.('D03')}
          />
        )}
        {regions.D04 && (
          <button
            className="ws-hit"
            aria-label="Select D04 resynthesis"
            style={{ left: REGIONS.D04.x, top: REGIONS.D04.y, width: REGIONS.D04.w, height: REGIONS.D04.h }}
            onClick={() => onSelect?.('D04')}
          />
        )}
      </div>
      {scan && (
        <div
          key={scan.stage}
          className={`ws-scan${scan.frozenAt != null ? ' is-frozen' : ''}`}
          style={scan.frozenAt != null ? { transform: `translateX(${Math.round(scan.frozenAt * CANVAS_W)}px)` } : undefined}
        />
      )}
    </div>
  )
}

function Chip({ left, top, text, color }: { left: number; top: number; text: string; color: string }) {
  return (
    <div className="ws-chip" style={{ left, top, color }}>
      {text}
    </div>
  )
}

export function CircuitAxis() {
  return (
    <div className="ws-axis">
      <span className="ws-axis-name">layer</span>
      {[0, 2, 4, 6, 8].map((n, i) => (
        <span key={n} className="ws-axis-tick" style={{ left: 40 + i * 60 }}>
          {n}
        </span>
      ))}
    </div>
  )
}
