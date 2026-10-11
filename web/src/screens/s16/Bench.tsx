/*
 * S-16 Model bench tile (Paper 1G5D-0) and its variants from 1LWU-0: evaluating, keyboard focus,
 * loading and empty. Columns: Model · layer 160 · Fixtures 160 · Proposals 50 · Parse rate 64 ·
 * Verified rate 70 · Verified-improvement rate 182 · Median latency 74 · Tokens 44 · Cost est. 46, gap 12.
 */
import { useRef, type KeyboardEvent } from 'react'
import { EditorButton, TileHeader } from '../../ui/parts'
import { Block, LayerDot, Stage } from '../stretch/parts'
import { BENCH, RATE_DEFINITIONS, type BenchRow } from './data'

export type BenchView = 'board' | 'evaluating' | 'keyboard-focus' | 'loading' | 'empty'

const META: Record<BenchView, string> = {
  board: 'in-house gate-group layers · 9 of 12 fixtures · qscore-2026.1 · updated 11:20',
  'keyboard-focus': 'in-house gate-group layers · 9 of 12 fixtures · qscore-2026.1 · updated 11:20',
  evaluating: '2 of 3 layers benched · job 7f3d·2a10',
  loading: 'qscore-2026.1',
  empty: '0 in-house layers · qscore-2026.1',
}

export function BenchTile({ view, selected, onSelect, onChooseSubset }: { view: BenchView; selected?: string; onSelect?: (id: string) => void; onChooseSubset?: () => void }) {
  return (
    <section className="tile s16-bench">
      <TileHeader tabs={[{ id: 'b', label: 'Model bench', active: true }]} meta={<span className="mono">{META[view]}</span>} />
      <div className="s16-bench-body">
        {view === 'empty' ? (
          <div className="s16-empty">
            <span className="s16-empty-title">No in-house models on this machine.</span>
            <span>Train one from a fixture subset. The bench fills in once it has 20 proposals per fixture.</span>
            <EditorButton onClick={onChooseSubset} style={{ background: 'var(--color-surface-panel)' }}>
              Choose a subset
            </EditorButton>
          </div>
        ) : (
          <>
            {view === 'evaluating' && <Stage>Evaluating on 3 fixtures · 34 of 60 proposals · about 30 s</Stage>}
            {view === 'loading' && <Stage>Loading bench results · about 1 s</Stage>}
            <div className="s16-table" role="table" aria-label="Model bench" aria-busy={view === 'loading' || undefined}>
              <div className="s16-row s16-head" role="row">
                <span className="b-model">Model · layer</span>
                <span className="b-fixtures">Fixtures</span>
                <span className="b-num b-proposals">Proposals</span>
                <span className="b-num b-parse">Parse rate</span>
                <span className="b-num b-verified">Verified rate</span>
                <span className="b-vir">Verified-improvement rate</span>
                <span className="b-num b-latency">Median latency</span>
                <span className="b-num b-tokens">Tokens</span>
                <span className="b-num b-cost">Cost est.</span>
              </div>
              {view === 'loading'
                ? BENCH.map((r) => <LoadingRow key={r.id} />)
                : BENCH.map((r, i) => (
                    <Row
                      key={r.id}
                      r={r}
                      evaluating={view === 'evaluating' && r.id === 'reversible'}
                      focus={view === 'keyboard-focus' && i === 0}
                      selected={view !== 'keyboard-focus' && selected === r.id}
                      onSelect={onSelect}
                      last={i === BENCH.length - 1}
                    />
                  ))}
            </div>
          </>
        )}
        <div className="s16-defs">
          <div className="s16-defs-list">
            {RATE_DEFINITIONS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {view !== 'empty' && (
            <span className="s16-tick-note mono">
              <span className="s16-tick-key" />
              white tick: reference-qiskit on the same fixtures
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

function Rate({ rate, ci, n }: { rate: string; ci: string; n: number }) {
  return (
    <>
      <span className="s16-rate">
        <span className="mono s16-val">{rate}</span>
        <span className="mono s16-unit">{ci}</span>
      </span>
      <span className="mono s16-unit">n={n}</span>
    </>
  )
}

function Row({ r, evaluating, focus, selected, onSelect, last }: { r: BenchRow; evaluating?: boolean; focus?: boolean; selected?: boolean; onSelect?: (id: string) => void; last?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(r.id)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const rows = Array.from(ref.current?.parentElement?.querySelectorAll<HTMLElement>('[data-layer]') ?? [])
      const i = rows.indexOf(ref.current as HTMLElement)
      rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
    }
  }
  return (
    <div
      ref={ref}
      role="row"
      data-layer={r.id}
      tabIndex={0}
      aria-selected={selected}
      className={`s16-row s16-layer st-focusable${focus ? ' is-focus' : ''}${selected ? ' is-selected' : ''}${last ? ' is-last' : ''}`}
      onClick={() => onSelect?.(r.id)}
      onKeyDown={onKey}
    >
      <span className="b-model b-stack">
        <span className="mono s16-name">{r.model}</span>
        <span className="s16-layer-kind">
          <LayerDot layer="model" />
          <span className="mono">in-house · {r.size}</span>
        </span>
      </span>
      <span className="b-fixtures b-stack">
        {r.fixtures.map((f) => (
          <span key={f} className="mono s16-fixture">
            {f}
          </span>
        ))}
      </span>
      <span className="b-num b-proposals b-stack is-end">
        <span className="mono s16-val">{evaluating ? '34 of 60' : r.proposals}</span>
        <span className="mono s16-unit">{r.subsets} × 20</span>
      </span>
      {evaluating ? (
        <>
          <span className="b-num b-parse b-stack is-end">
            <Block w={44} h={12} />
            <Block w={30} h={8} />
          </span>
          <span className="b-num b-verified b-stack is-end">
            <Block w={44} h={12} />
            <Block w={30} h={8} />
          </span>
          <span className="b-vir">
            <Block w={60} h={6} />
            <span className="b-stack">
              <Block w={64} h={12} />
              <Block w={96} h={8} />
            </span>
          </span>
          <span className="b-num b-latency">
            <Block w={34} />
          </span>
          <span className="b-num b-tokens">
            <Block w={40} />
          </span>
          <span className="b-num b-cost">
            <Block w={40} />
          </span>
        </>
      ) : (
        <>
          <span className="b-num b-parse b-stack is-end">
            <Rate {...r.parse} />
          </span>
          <span className="b-num b-verified b-stack is-end">
            <Rate {...r.verified} />
          </span>
          <span className="b-vir">
            <span className="s16-vir-bar" aria-hidden>
              <span className="s16-vir-track" />
              <span className="s16-vir-fill" style={{ width: r.vir.bar }} />
              <span className="s16-vir-tick" style={{ left: r.vir.tick }} />
            </span>
            <span className="b-stack is-tight">
              <span className="s16-rate">
                <span className="mono s16-val">{r.vir.rate}</span>
                <span className="mono s16-unit">{r.vir.ci}</span>
              </span>
              <span className="mono s16-unit is-13">
                n={r.vir.n} · ref {r.vir.ref}
              </span>
              <span className="mono s16-unit is-13">within the interval</span>
            </span>
          </span>
          <span className="b-num b-latency mono s16-val">{r.latency}</span>
          <span className="b-num b-tokens mono s16-val">{r.tokens}</span>
          <span className="b-num b-cost mono s16-val">{r.cost}</span>
        </>
      )}
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="s16-row s16-layer" aria-hidden>
      <span className="b-model b-stack">
        <Block w={136} />
        <Block w={96} h={8} />
      </span>
      <span className="b-fixtures b-stack">
        <Block w={110} h={8} />
      </span>
      <span className="b-num b-proposals b-stack is-end">
        <Block w={20} />
        <Block w={36} h={8} />
      </span>
      <span className="b-num b-parse b-stack is-end">
        <Block w={56} />
        <Block w={28} h={8} />
      </span>
      <span className="b-num b-verified b-stack is-end">
        <Block w={56} />
        <Block w={28} h={8} />
      </span>
      <span className="b-vir">
        <Block w={60} h={6} />
        <span className="b-stack">
          <Block w={70} />
          <Block w={96} h={8} />
          <Block w={110} h={8} />
        </span>
      </span>
      <span className="b-num b-latency">
        <Block w={34} />
      </span>
      <span className="b-num b-tokens">
        <Block w={40} />
      </span>
      <span className="b-num b-cost">
        <Block w={40} />
      </span>
    </div>
  )
}
