/*
 * QASM tile body (PXG-0): 20 px lines, mono 12, a 44 px gutter with a 2 px panel rule, and a 2 px rail
 * per line: pink = a line in an open finding, #C2DADF = accepted, yellow = the selected line.
 * The whole 88-line file scrolls; it opens at line 42 so the selected line sits in view.
 */
import { useLayoutEffect, useRef } from 'react'
import { QASM } from '../../data/demo'
import type { LineMark } from './data'

export function Qasm({ marks, firstLine = 42 }: { marks: Record<number, LineMark>; firstLine?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = (firstLine - 1) * 20
  }, [firstLine])
  return (
    <div className="ws-tile-pad">
      <div className="ws-qasm-inset">
        <div className="ws-qasm-rule" />
        <div className="ws-qasm" ref={ref} role="region" aria-label="sidechain_qaoa.qasm" tabIndex={0}>
        {QASM.map((text, i) => {
          const n = i + 1
          const m = marks[n]
          return (
            <div key={n} className={`ws-qasm-line${m ? ` is-${m}` : ''}`}>
              <span className="ws-qasm-num">{n}</span>
              <span className={`ws-qasm-code${text.startsWith('//') ? ' is-comment' : ''}`}>{text}</span>
            </div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
