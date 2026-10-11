/* S-14 · Leaderboard: every improve layer on the same 12 fixtures, ranked by verified-improvement rate. */
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, Tile } from '../ui/parts'
import { accepted, BENCH, byFixture, FIXTURES, parsed, passed, PROMPT_NOTES, REFERENCE_BY_FIXTURE, REQUESTS, type BenchRow } from './team/boardData'
import { CopyButton } from './team/CopyButton'
import { FixturesView } from './team/FixturesView'
import { TeamModeLine, TeamModeTabs } from './team/TeamInspector'
import { boardStateView } from './team/S14States'
import './team/team.css'
import './team/S14Leaderboard.css'

export type SortKey = 'proposals' | 'parse' | 'verified' | 'vir' | 'latency' | 'tokens' | 'cost'
type Filter = 'all' | 'local' | 'platform'

const COLUMNS: { key: SortKey; label: string; width: number; asc?: boolean }[] = [
  { key: 'proposals', label: 'Proposals', width: 68 },
  { key: 'parse', label: 'Parse rate', width: 64 },
  { key: 'verified', label: 'Verified rate', width: 76 },
  { key: 'vir', label: 'Verified-improvement rate', width: 172 },
  { key: 'latency', label: 'Median latency', width: 96, asc: true },
  { key: 'tokens', label: 'Tokens', width: 56, asc: true },
  { key: 'cost', label: 'Cost est.', width: 56, asc: true },
]

export function S14Leaderboard() {
  const state = useHashParams().get('state')
  return <BoardScreen key={state ?? 'main'} state={state} />
}

function BoardScreen({ state }: { state: string | null }) {
  const view = state ? boardStateView(state) : null
  const [sort, setSort] = useState<SortKey>('vir')
  // Clicking the active column again flips its direction.
  const [flipped, setFlipped] = useState(false)
  const [page, setPage] = useState<'board' | 'fixtures'>('board')
  const onSort = (k: SortKey) => {
    if (k === sort) setFlipped((f) => !f)
    else {
      setSort(k)
      setFlipped(false)
    }
  }
  const [filter, setFilter] = useState<Filter>(view?.filter ?? 'all')
  const [selectedId, setSelectedId] = useState(view?.selectedId ?? 'granite-v3')
  const tabLabels = view?.tabs ?? ['All · 6', 'Local · 5', 'Platform · 1']

  // S changes the sort column · C copies the row
  const onKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.toLowerCase() === 's') {
      const i = COLUMNS.findIndex((c) => c.key === sort)
      setSort(COLUMNS[(i + 1) % COLUMNS.length].key)
      setFlipped(false)
    }
    if (e.key.toLowerCase() === 'c') {
      const r = BENCH.find((x) => x.id === selectedId)
      if (r) navigator.clipboard?.writeText(toCsv([r])).catch(() => {})
    }
  }

  const rows = sortRows(
    BENCH.filter((r) => filter === 'all' || r.where === filter),
    sort,
    flipped,
  )
  const selected = BENCH.find((r) => r.id === selectedId) ?? BENCH[2]

  return (
    <Shell
      rail="leaderboard"
      tabs={
        <TabStrip
          tabs={[
            { id: 'board', label: 'Leaderboard', active: page === 'board', onClick: () => setPage('board') },
            { id: 'fixtures', label: 'Conformance fixtures', active: page === 'fixtures', onClick: () => setPage('fixtures') },
          ]}
        />
      }
      inspector={view?.inspector ?? <BoardInspector row={selected} />}
    >
      {page === 'fixtures' ? (
        <Content>
          <FixturesView onBack={() => setPage('board')} />
          <RatesTile />
        </Content>
      ) : (
      <Content>
        <Tile
          className="s14-board"
          bodyStyle={{ flex: 'none' }}
          tabs={[
            { id: 'all', label: tabLabels[0], active: filter === 'all', onClick: () => setFilter('all') },
            { id: 'local', label: tabLabels[1], active: filter === 'local', onClick: () => setFilter('local') },
            { id: 'platform', label: tabLabels[2], active: filter === 'platform', onClick: () => setFilter('platform') },
          ]}
          meta={<span className="mono">{view?.meta ?? '12 fixtures × 20 · qscore-2026.1 · updated 11:20'}</span>}
        >
          <div onKeyDown={onKeys}>
            {view?.board ?? (
              <BoardTable rows={rows} sort={sort} flipped={flipped} onSort={onSort} selectedId={selected.id} onSelect={setSelectedId} />
            )}
          </div>
        </Tile>
        {view?.fixtures !== undefined ? view.fixtures : <FixtureTile row={selected} />}
        <RatesTile />
      </Content>
      )}
    </Shell>
  )
}

export function sortRows(rows: BenchRow[], key: SortKey, flipped = false) {
  const col = COLUMNS.find((c) => c.key === key)!
  const asc = !!col.asc !== flipped
  return [...rows].sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]))
}

/* ── Leaderboard table ───────────────────────────────────────────────── */
export function BoardTable({
  rows,
  sort,
  flipped = false,
  onSort,
  selectedId,
  onSelect,
  focusId,
  staleId,
  padding,
}: {
  rows: BenchRow[]
  sort: SortKey
  flipped?: boolean
  onSort?: (k: SortKey) => void
  selectedId: string | null
  onSelect?: (id: string) => void
  focusId?: string
  /** a cached row shown in gray until the platform answers */
  staleId?: string
  padding?: string
}) {
  // FLIP: rows keep their identity and slide to their new rank.
  const refs = useRef(new Map<string, HTMLDivElement>())
  const last = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    refs.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top
      const before = last.current.get(id)
      if (before != null && before !== top && !reduce) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 360,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        })
      }
      last.current.set(id, top)
    })
  }, [rows])

  return (
    <div className="s14-table" role="grid" aria-label="Leaderboard" style={padding ? { padding } : undefined}>
      <div className="s14-head" role="row">
        <span className="team-th s14-c-rank">#</span>
        <span className="team-th s14-c-model">Model · provider</span>
        <span className="team-th s14-c-layer">Layer</span>
        <span className="team-th s14-c-prompt">Prompt</span>
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            className={`team-th s14-sort${sort === c.key ? ' is-active' : ''}`}
            style={{ width: c.width }}
            aria-sort={sort === c.key ? (!!c.asc !== flipped ? 'ascending' : 'descending') : 'none'}
            onClick={() => onSort?.(c.key)}
          >
            {c.label}
            {sort === c.key && (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path
                  d={!!c.asc !== flipped ? 'M5 8.5v-7M2.5 4L5 1.5 7.5 4' : 'M5 1.5v7M2.5 6L5 8.5 7.5 6'}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ))}
      </div>
      {rows.map((r, i) => {
        const isSel = r.id === selectedId
        const vrank = [...BENCH].sort((a, b) => b.vir - a.vir).findIndex((x) => x.id === r.id)
        return (
          <div
            key={r.id}
            ref={(el) => {
              if (el) refs.current.set(r.id, el)
              else refs.current.delete(r.id)
            }}
            role="row"
            tabIndex={0}
            aria-selected={isSel}
            className={[
              's14-row',
              'team-row',
              isSel ? 'is-selected' : '',
              i === rows.length - 1 ? 'is-last' : '',
              r.id === focusId ? 'is-focus' : '',
              r.id === staleId ? 'is-stale' : '',
            ].join(' ')}
            onClick={() => onSelect?.(r.id)}
            onKeyDown={(e) => {
              const list = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.s14-row') ?? [])
              const at = list.indexOf(e.currentTarget)
              if (e.key === 'ArrowDown') (e.preventDefault(), list[Math.min(list.length - 1, at + 1)]?.focus())
              if (e.key === 'ArrowUp') (e.preventDefault(), list[Math.max(0, at - 1)]?.focus())
              if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), onSelect?.(r.id))
            }}
          >
            <span className="s14-c-rank mono">{i + 1}</span>
            <span className="s14-c-model">
              <span className="s14-model">{r.model}</span>
              <span className="s14-provider">
                {r.provider} · {r.where}
                {r.id === staleId ? ' · cached 11:20' : ''}
              </span>
            </span>
            <span className="s14-c-layer">{r.layer}</span>
            <span className={`s14-c-prompt${r.prompt ? '' : ' is-none'}`}>{r.prompt ?? 'none'}</span>
            <span className="s14-num" style={{ width: 68 }}>
              {r.proposals}
            </span>
            <span className="s14-num" style={{ width: 64 }}>
              {r.parse.toFixed(1)}%
            </span>
            <span className="s14-num" style={{ width: 76 }}>
              {r.verified.toFixed(1)}%
            </span>
            <span className="s14-vir">
              <svg width="64" height="6" viewBox="0 0 64 6" aria-hidden>
                <path d="M0 2h64v2H0z" fill="#354348" />
                <path
                  className="s14-bar"
                  d={`M0 1h${Math.round((r.vir / 100) * 128)}v4H0z`}
                  fill="#C2DADF"
                  style={{ animationDelay: `${vrank * 40}ms` }}
                />
              </svg>
              <span className="s14-vir-value">{r.vir.toFixed(1)}%</span>
            </span>
            <span className="s14-num" style={{ width: 96 }}>
              {r.latency.toFixed(1)} s
            </span>
            <span className="s14-num" style={{ width: 56 }}>
              {r.tokens ? `${r.tokens.toFixed(2)} M` : '0'}
            </span>
            <span className="s14-num" style={{ width: 56 }}>
              ${r.cost.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Accepted by fixture ─────────────────────────────────────────────── */
export function FixtureTile({ row }: { row: BenchRow }) {
  const counts = byFixture(row)
  const isRef = row.id === 'reference'
  const beats = FIXTURES.filter((_, i) => counts[i] > REFERENCE_BY_FIXTURE[i])
  const ties = FIXTURES.filter((_, i) => counts[i] === REFERENCE_BY_FIXTURE[i]).length
  const trails = FIXTURES.length - beats.length - ties
  const list = beats.length > 1 ? `${beats.slice(0, -1).join(', ')} and ${beats[beats.length - 1]}` : beats[0]
  const note = isRef
    ? 'The reference is the line every model is measured against. It accepts the same fixtures every run.'
    : beats.length === 0
      ? `Trails the reference on all ${trails} fixtures${ties ? `, ties it on ${ties}` : ''}.`
      : `Beats the reference on ${list}. ${ties ? `Ties it on ${ties}. ` : ''}Trails it on the other ${trails} fixtures.`

  return (
    <Tile
      className="s14-fixtures"
      tabs={[{ id: 'f', label: `Accepted by fixture · ${row.model}${row.prompt ? ` ${row.prompt}` : ''}`, active: true }]}
      meta={
        <span className="s14-legend">
          <span className="s14-legend-item">
            <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden>
              <path d="M0 0h8v10H0z" fill="#FFFFFF" />
            </svg>
            selected
          </span>
          <span className="s14-legend-item">
            <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
              <path d="M1 5h12" fill="none" stroke="#ADC5CA" strokeWidth="2" strokeLinecap="round" />
            </svg>
            reference-qiskit
          </span>
          <span className="mono">of 20 requests each</span>
        </span>
      }
    >
      <div className="s14-chart-body" key={row.id}>
        <svg width="978" height="176" viewBox="0 0 978 176" role="img" aria-label={`accepted improvements per fixture for ${row.model}`}>
          <path d="M30 8H966M30 88H966" fill="none" stroke="#0F1F23" />
          <path d="M30 168H966" fill="none" stroke="#354348" />
          <text x="20" y="171.5" textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
            0
          </text>
          <text x="20" y="91.5" textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
            10
          </text>
          <text x="20" y="11.5" textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
            20
          </text>
          {counts.map((v, i) => (
            <path
              key={i}
              className="s14-col"
              d={`M${60 + i * 78} ${168 - v * 8}h18V168h-18z`}
              fill="#FFFFFF"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
          <path
            d={REFERENCE_BY_FIXTURE.map((v, i) => `M${53 + i * 78} ${168 - v * 8}h32`).join('')}
            fill="none"
            stroke="#ADC5CA"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className="s14-xlabels">
          {FIXTURES.map((f, i) => (
            <div key={f} className="s14-xlabel">
              <span className="s14-xname">{f}</span>
              <span className="s14-xvals">
                <span className="s14-xsel">{counts[i]}</span>
                <span className="s14-xref">{REFERENCE_BY_FIXTURE[i]}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="s14-chart-note">{note}</p>
      </div>
    </Tile>
  )
}

/* ── How rates are counted ───────────────────────────────────────────── */
function RatesTile() {
  return (
    <Tile className="s14-rates" bodyStyle={{ flex: 'none' }} tabs={[{ id: 'r', label: 'How rates are counted', active: true }]}>
      <div className="s14-rates-body">
        <div className="s14-rate">
          <span className="s14-rate-name">Parse rate</span>
          <span className="s14-rate-def">proposals that parse ÷ proposals returned</span>
        </div>
        <div className="s14-rate">
          <span className="s14-rate-name">Verified rate</span>
          <span className="s14-rate-def">proposals that pass verification ÷ proposals that parse</span>
        </div>
        <div className="s14-rate is-last">
          <span className="s14-rate-name">Verified-improvement rate</span>
          <span className="s14-rate-def">accepted improvements ÷ requests attempted. The table ranks by this.</span>
        </div>
        <p className="s14-rates-note">
          Rates are reported, not thresholded. A layer that passes qscore conform is qscore-compatible. Every row here passed 12 of 12 fixtures.
        </p>
      </div>
    </Tile>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
export function BoardInspector({ row }: { row: BenchRow }) {
  const rank = [...BENCH].sort((a, b) => b.vir - a.vir).findIndex((r) => r.id === row.id) + 1
  const funnel = [
    { label: 'Requests', value: REQUESTS },
    { label: 'Proposals', value: row.proposals },
    { label: 'Parsed', value: parsed(row) },
    { label: 'Passed', value: passed(row) },
  ]
  const acc = accepted(row)
  const lostVerify = parsed(row) - passed(row)
  const lostImprove = passed(row) - acc
  const note =
    row.id === 'reference'
      ? `Every proposal parses and verifies. ${lostImprove} passed without improving the primary metric, so they were kept out.`
      : lostVerify >= lostImprove
        ? `Most losses happen at verification: ${lostVerify} parsed proposals changed what the circuit does or failed the re-score.`
        : `Most losses happen after verification: ${lostImprove} correct proposals did not improve the primary metric.`

  const sibling = BENCH.find((r) => r.model === row.model && r.id !== row.id)
  const reference = BENCH.find((r) => r.id === 'reference')!
  const compare = [
    sibling && { label: `Same model, prompt ${sibling.prompt}`, mono: false, vir: sibling.vir },
    row.id !== 'reference' ? { label: 'reference-qiskit', mono: true, vir: reference.vir } : null,
    row.id === 'reference' ? { label: 'qwen2.5-coder-32b', mono: true, vir: BENCH[0].vir } : null,
    row.id === 'reference' ? { label: 'granite-8b-qiskit v3', mono: true, vir: BENCH[2].vir } : null,
  ].filter(Boolean) as { label: string; mono: boolean; vir: number }[]
  const notes = PROMPT_NOTES[row.prompt ?? 'reference']

  return (
    <>
      <TeamModeTabs />
      <TeamModeLine>Reported, not thresholded. Read-only.</TeamModeLine>
      <div className="team-insp-body s14-insp-swap" key={row.id}>
        <div className="s14-sel">
          <div className="s12-sel-name">
            <span className="s12-sel-file">{row.model}</span>
            <span className="s12-sel-item">
              {row.layer} · {row.provider} · {row.where}
              {row.prompt ? ` · prompt ${row.prompt}` : ''}
            </span>
          </div>
          <div className="s14-hero">
            <span className="s14-hero-value">{row.vir.toFixed(1)}%</span>
            <span className="s14-hero-unit">
              verified-improvement rate · rank {rank} of {BENCH.length}
            </span>
          </div>
          <div className="s14-funnel">
            {funnel.map((f) => (
              <div key={f.label} className="s14-funnel-row">
                <span className="s14-funnel-label">{f.label}</span>
                <svg width="190" height="8" viewBox="0 0 190 8" aria-hidden>
                  <path className="s14-funnel-bar" d={`M0 1h${Math.round((f.value / REQUESTS) * 190)}v6H0z`} fill="#C2DADF59" />
                </svg>
                <span className="s14-funnel-value">{f.value}</span>
              </div>
            ))}
            <div className="s14-funnel-row is-total">
              <span className="s14-funnel-label">Accepted</span>
              <svg width="190" height="8" viewBox="0 0 190 8" aria-hidden>
                <path className="s14-funnel-bar" d={`M0 1h${Math.round((acc / REQUESTS) * 190)}v6H0z`} fill="#FFFFFF" />
              </svg>
              <span className="s14-funnel-value">{acc}</span>
            </div>
          </div>
          <p className="s14-insp-note">{note}</p>
        </div>
        <section className="team-sec">
          <div className="team-sec-head">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M4 15V8M9 15V3M14 15V10" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="team-sec-title">Compared with</span>
            <span className="team-sec-meta">verified-improvement</span>
          </div>
          {compare.map((c) => {
            const d = row.vir - c.vir
            return (
              <div key={c.label} className="s14-cmp">
                <span className={`s14-cmp-label${c.mono ? ' mono' : ''}`}>{c.label}</span>
                <span className="s14-cmp-value">{c.vir.toFixed(1)}%</span>
                <span className="s14-cmp-delta">
                  {Math.abs(d).toFixed(1)} pts {d >= 0 ? 'below' : 'above'}
                </span>
              </div>
            )
          })}
        </section>
        <section className="team-sec">
          <div className="team-sec-head">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="9" cy="9" r="6.3" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <path d="M9 5.5V9l2.4 1.6" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="team-sec-title">Bench details</span>
            <span className="team-sec-meta">12 fixtures × 20</span>
          </div>
          <div className="s14-kv">
            <span>Median latency</span>
            <span className="mono">{row.latency.toFixed(1)} s per request</span>
          </div>
          <div className="s14-kv">
            <span>Tokens</span>
            <span className="mono">{row.tokens ? `${((row.tokens * 1000) / REQUESTS).toFixed(1)} k per request` : 'none · no model'}</span>
          </div>
          <div className="s14-kv is-last">
            <span>Conform run</span>
            <span className="mono">{row.conform} · 12 of 12</span>
          </div>
          <div className="s12-actions s14-actions">
            <EditorButton onClick={() => navigate(ROUTES.bench, { transition: 'forward' })}>Open bench</EditorButton>
            <EditorButton onClick={() => (window.location.hash = `#/runs?select=${row.conform}`)}>Open conform run</EditorButton>
            <CopyButton text={() => toCsv()} label="Copy as CSV" />
          </div>
        </section>
        <section className="team-sec">
          <div className="team-sec-head">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M4.5 2.5h6l3 3v10h-9z" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M7 9.5h4M9 7.5v4M7 13h4" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="team-sec-title">{notes.title}</span>
            <span className="team-sec-meta">{notes.meta}</span>
          </div>
          {notes.lines.map((l, i) => (
            <div key={l} className={`s14-note-row${i === notes.lines.length - 1 ? ' is-last' : ''}`}>
              <span className="s14-note-n">{i + 1}</span>
              <span className="s14-note-text">{l}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}

function toCsv(rows: BenchRow[] = BENCH) {
  const head = 'model,provider,layer,prompt,proposals,parse_rate,verified_rate,verified_improvement_rate,median_latency_s,tokens_m,cost_usd'
  return [head, ...rows.map((r) => [r.model, r.provider, r.layer, r.prompt ?? '', r.proposals, r.parse, r.verified, r.vir, r.latency, r.tokens, r.cost].join(','))].join('\n')
}
