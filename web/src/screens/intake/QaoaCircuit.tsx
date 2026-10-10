/*
 * The sidechain_qaoa circuit as drawn in Paper on S-02 and S-03:
 * 12 wires on a 28 px pitch, H column, two CX–RZ–CX layers, RX column, measurements.
 * Geometry is copied from the Paper nodes (absolute positions inside a 352 px block).
 */
import type { CSSProperties } from 'react'

const PITCH = 28
const Q = 12

function Box({ x, q, label, w = 22, muted }: { x: number; q: number; label: string; w?: number; muted?: boolean }) {
  return (
    <div className={`qc-box${muted ? ' is-muted' : ''}`} style={{ left: x, top: 12 + PITCH * q, width: w }}>
      {label}
    </div>
  )
}

/** CX between wire c (control) and wire c+1 (target), drawn at x. */
function Cx({ x, c }: { x: number; c: number }) {
  return (
    <>
      <div className="qc-line" style={{ left: x + 0.25, top: 22 + PITCH * c }} />
      <div className="qc-dot" style={{ left: x - 4, top: 17 + PITCH * c }} />
      <svg className="qc-target" width="16" height="16" viewBox="0 0 16 16" style={{ left: x - 7, top: 42 + PITCH * c }} aria-hidden>
        <circle cx="8" cy="8" r="7" fill="#2C3456" stroke="#FFFFFF" strokeWidth="1.3" />
        <path d="M8 1v14M1 8h14" fill="none" stroke="#FFFFFF" strokeWidth="1.3" />
      </svg>
    </>
  )
}

export function QaoaCircuit({ style, className = '' }: { style?: CSSProperties; className?: string }) {
  const wires = Array.from({ length: Q }, (_, i) => i)
  const layer1 = [0, 2, 4, 6, 8, 10]
  const layer2 = [1, 3, 5, 7, 9]
  return (
    <div className={`qc ${className}`} style={style} role="img" aria-label="sidechain_qaoa, 12 qubits, two QAOA layers">
      {wires.map((i) => (
        <div key={`w${i}`} className="qc-wire" style={{ top: 21 + PITCH * i }} />
      ))}
      {wires.map((i) => (
        <div key={`l${i}`} className="qc-label" style={{ top: 15 + PITCH * i }}>
          q{i}
        </div>
      ))}
      {wires.map((i) => (
        <Box key={`h${i}`} x={36} q={i} label="H" w={20} />
      ))}
      {layer1.map((c) => (
        <div key={`a${c}`}>
          <Cx x={79} c={c} />
          <Box x={93} q={c + 1} label="RZ" />
          <Cx x={127} c={c} />
        </div>
      ))}
      {layer2.map((c) => (
        <div key={`b${c}`}>
          <Cx x={159} c={c} />
          <Box x={173} q={c + 1} label="RZ" />
          <Cx x={207} c={c} />
        </div>
      ))}
      {wires.map((i) => (
        <Box key={`x${i}`} x={233} q={i} label="RX" />
      ))}
      {wires.map((i) => (
        <Box key={`m${i}`} x={274} q={i} label="M" w={20} muted />
      ))}
    </div>
  )
}
