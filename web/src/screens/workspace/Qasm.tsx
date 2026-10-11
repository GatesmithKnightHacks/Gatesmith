/*
 * QASM tile body: one color, a 36px gutter, finding regions get a pink rail plus the rule id,
 * the selected gate's line gets the yellow rail (DS-04 · Code block).
 */
import { useEffect, useRef } from 'react'
import { FINDING_LINES, QASM } from './data'

export function Qasm({ regions, selected }: { regions: string[]; selected: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const marked = new Map<number, 'region' | 'selected'>()
  const tags = new Map<number, string>()
  for (const r of regions) {
    const f = FINDING_LINES[r]
    if (!f) continue
    f.lines.forEach((l) => marked.set(l, 'region'))
    tags.set(f.lines[0], r)
    if (selected === r) marked.set(f.gateLine, 'selected')
  }

  // Selecting a finding scrolls its lines into view.
  useEffect(() => {
    const f = selected ? FINDING_LINES[selected] : undefined
    if (!f || !ref.current) return
    const line = ref.current.querySelector<HTMLElement>(`[data-line="${f.lines[0]}"]`)
    line?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <div className="qasm" ref={ref}>
      {QASM.map((text, i) => {
        const n = i + 1
        const m = marked.get(n)
        return (
          <div key={n} data-line={n} className={`qasm-line${m ? ` is-${m}` : ''}`}>
            <span className="qasm-num">{n}</span>
            <span className={`qasm-code${text.startsWith('//') ? ' is-comment' : ''}`}>{text}</span>
            {tags.has(n) && (
              <>
                <span className="qasm-spacer" />
                <span className="qasm-tag">{tags.get(n)}</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
