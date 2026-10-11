/*
 * S-14 · Leaderboard: every improve layer on the same qscore conform kit (12 fixtures × 20 attempts =
 * 240 requests per row), ranked by verified-improvement rate. Every rate carries its 95% interval.
 * Board 1DHZ-0, states 1LPB-0. States: #/leaderboard?state=<name> (see team/S14States.tsx).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeBlock, ModeTabs, PrimaryButton, Section } from '../ui/parts'
import {
  ATTEMPTS,
  byFixture,
  CONFORM_COMMAND,
  CURRENT_LAYER_ID,
  FIXTURE_COUNT,
  FIXTURES,
  LAYERS,
  PROMPT_NOTES,
  RATE_DEFINITIONS,
  REFERENCE_BY_FIXTURE,
  REQUESTS,
  type LayerRow,
  type Rate,
} from './team/boardData'
import { FixturesView } from './team/FixturesView'
import { boardState, type BoardState, type Filter, type SortKey } from './team/S14States'
import './team/S14Leaderboard.css'

const DONE_MS = 1200
/** the inspector's run block, as the board pads it */
const BLOCK_PAD = { paddingTop: 18, paddingBottom: 14 }

export function S14Leaderboard() {
  const state = useHashParams().get('state')
  return <BoardScreen key={state ?? 'main'} cfg={boardState(state)} />
}

/* ── Screen ──────────────────────────────────────────────────────────── */
function BoardScreen({ cfg }: { cfg: BoardState }) {
  const [page, setPage] = useState<'board' | 'fixtures'>('board')
  const [filter, setFilter] = useState<Filter>(cfg.filter)
  const [sort, setSort] = useState<SortKey>(cfg.sort)
  const [flipped, setFlipped] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(cfg.selectedId)
  const [focusId, setFocusId] = useState<string | undefined>(cfg.focusId)
  const [current, setCurrent] = useState<string[]>([CURRENT_LAYER_ID])

  const onSort = (k: SortKey) => {
    if (k === sort) setFlipped((f) => !f)
    else {
      setSort(k)
      setFlipped(false)
    }
  }

  const visible = sortRows(
    cfg.rows.filter((r) => matches(r, filter)),
    sort,
    flipped,
  )
  // # is the verified-improvement rank among the layers on this board, whatever the sort
  const ranks = new Map(
    cfg.rows
      .filter((r) => r.rank != null)
      .sort((a, b) => b.vir.value - a.vir.value)
      .map((r, i) => [r.id, i + 1]),
  )
  const selected = cfg.rows.find((r) => r.id === selectedId) ?? null
  // With nothing selected the chart previews the focused row.
  const charted = selected ?? cfg.rows.find((r) => r.id === focusId) ?? null

  return (
    <Shell
      context="Leaderboard"
      rail="leaderboard"
      status={<TopStatus gpuOn={!cfg.gpuOff} />}
      tabs={
        <TabStrip
          tabs={[
            { id: 'board', label: 'Leaderboard', active: page === 'board', onClick: () => setPage('board') },
            { id: 'fixtures', label: 'Conformance fixtures', active: page === 'fixtures', onClick: () => setPage('fixtures') },
            { id: 'bench', label: 'Model bench', onClick: () => navigate(ROUTES.bench) },
          ]}
        />
      }
      inspector={
        <BoardInspector
          cfg={cfg}
          row={selected}
          current={!!selected && current.includes(selected.id)}
          onUse={(id) => setCurrent((c) => [...c, id])}
          rows={cfg.rows}
        />
      }
    >
      {page === 'fixtures' ? (
        <Content className="s14-content">
          <FixturesView onBack={() => setPage('board')} />
        </Content>
      ) : (
        <Content className="s14-content">
          <LayersTile
            cfg={cfg}
            filter={filter}
            onFilter={setFilter}
            header={<TableHead sort={sort} flipped={flipped} onSort={onSort} />}
          >
            {cfg.body === 'table' &&
              (visible.length ? (
                <LayerRows
                  rows={visible}
                  ranks={ranks}
                  sort={sort}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setFocusId(undefined)
                  }}
                  focusId={focusId}
                  onBlurFocus={() => setFocusId(undefined)}
                />
              ) : (
                <div className="s14-nomatch">
                  <span>{filter === 'all' ? 'No layers match' : `No ${filterWord(filter)} layers match`}</span>
                  <EditorButton onClick={() => setFilter('all')}>Show all layers</EditorButton>
                </div>
              ))}
            {cfg.body === 'table' && cfg.note && <div className="s14-table-note">{cfg.note}</div>}
          </LayersTile>
          <div className="s14-bottom">
            <FixtureTile row={charted} body={cfg.body} />
            <RatesTile />
          </div>
        </Content>
      )}
    </Shell>
  )
}

function TopStatus({ gpuOn }: { gpuOn: boolean }) {
  return (
    <>
      <span className="gpu-status">
        <span className="gpu-dot" style={{ background: gpuOn ? 'var(--color-text-primary)' : 'var(--color-text-disabled)' }} />
        {gpuOn ? 'GPU online' : 'GPU off'}
      </span>
      <span className="s14-account">
        <span className="s14-account-disc" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 14 14">
            <path
              d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1"
              fill="none"
              stroke="var(--color-text-secondary)"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="mono">qlab-dev</span>
      </span>
    </>
  )
}

/* ── Sorting and filters ─────────────────────────────────────────────── */
const SORT_VALUE: Record<SortKey, (r: LayerRow) => number> = {
  proposals: (r) => r.proposals,
  parse: (r) => r.parse.value,
  verified: (r) => r.verified.value,
  vir: (r) => r.vir.value,
  latency: (r) => r.latency,
  tokens: (r) => r.tokens ?? 0,
  cost: (r) => r.cost,
}
/** Ascending by default for the costs (latency, tokens, cost); descending for counts and rates. */
const ASC: Record<SortKey, boolean> = { proposals: false, parse: false, verified: false, vir: false, latency: true, tokens: true, cost: true }

function sortRows(rows: LayerRow[], key: SortKey, flipped = false) {
  const asc = ASC[key] !== flipped
  const ranked = rows.filter((r) => r.rank != null)
  const unranked = rows.filter((r) => r.rank == null)
  const by = SORT_VALUE[key]
  // A layer that failed the kit is listed last whatever the sort.
  return [...ranked.sort((a, b) => (asc ? by(a) - by(b) : by(b) - by(a)) || (a.rank ?? 0) - (b.rank ?? 0)), ...unranked]
}

function matches(r: LayerRow, f: Filter) {
  if (f === 'all') return true
  if (f === 'local') return r.layer === 'local'
  if (f === 'platform') return r.layer === 'hf'
  return r.layer === 'engine'
}
const filterWord = (f: Filter) => (f === 'all' ? '' : f === 'local' ? 'local' : f === 'platform' ? 'platform' : 'engine')

/* ── Layers tile ─────────────────────────────────────────────────────── */
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'local', label: 'Local' },
  { id: 'platform', label: 'Platform' },
  { id: 'engine', label: 'Engine' },
]

function LayersTile({
  cfg,
  filter,
  onFilter,
  header,
  children,
}: {
  cfg: BoardState
  filter: Filter
  onFilter: (f: Filter) => void
  header: ReactNode
  children?: ReactNode
}) {
  const showHead = cfg.body === 'table' || cfg.body === 'loading'
  return (
    <section className={`tile s14-layers${cfg.body === 'table' || cfg.body === 'loading' ? ' is-table' : ''}`}>
      <div className="tile-header">
        <div className="tile-tabs" role="tablist" aria-label="Layer filter">
          <span className="s14-tile-title">Layers</span>
          <span className="s14-tile-rule" aria-hidden />
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`tile-tab${filter === f.id ? ' is-active' : ''}`}
              onClick={() => onFilter(f.id)}
            >
              {f.label}
              {cfg.counts ? ` · ${cfg.rows.filter((r) => matches(r, f.id)).length}` : ''}
            </button>
          ))}
        </div>
        <LayersMeta meta={cfg.meta} />
      </div>
      <div className="s14-layers-body">
        {cfg.banner === 'stale' && (
          <Banner
            tone="warn"
            word="warning"
            message="Last refresh Oct 7, 11:20. Conform runs since then are not in this table."
            action="Reload"
          />
        )}
        {cfg.banner === 'offline' && (
          <Banner tone="offline" word="offline" message="You are offline · runs stay on this machine · syncs when the network is back" action="Retry" />
        )}
        {cfg.body === 'error' && (
          <>
            <Banner
              tone="bad"
              word="failed"
              message={
                <>
                  Could not reach the database <span className="mono">(Q901)</span> · leaderboard did not load
                </>
              }
              action="Retry"
            />
            <p className="s14-words">The leaderboard Space qscore/leaderboard reads from the database. Nothing is cached here yet.</p>
          </>
        )}
        {cfg.body === 'empty' && <EmptyKit />}
        {showHead && (
          <div className="s14-inset" role="grid" aria-label="Layers ranked by verified-improvement rate" aria-busy={cfg.body === 'loading'}>
            {header}
            {cfg.body === 'loading' ? <LoadingRows /> : <Definitions />}
            {children}
          </div>
        )}
      </div>
    </section>
  )
}

function LayersMeta({ meta }: { meta: BoardState['meta'] }) {
  if (meta === 'stale')
    return (
      <div className="tile-meta s14-meta is-warn">
        <WarnIcon />
        <span className="mono">Updated 3 days ago</span>
      </div>
    )
  const text =
    meta === 'short'
      ? '12 fixtures × 20 · qscore-2026.1'
      : `12 fixtures × 20 = 240 requests per row · ± is the 95% interval · qscore-2026.1 · ${meta === 'offline' ? 'cached' : 'updated'} 11:20`
  return (
    <div className="tile-meta s14-meta">
      <span className="mono">{text}</span>
    </div>
  )
}

function Banner({ tone, word, message, action }: { tone: 'warn' | 'bad' | 'offline'; word: string; message: ReactNode; action: string }) {
  return (
    <div className={`s14-banner is-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {tone === 'warn' ? <WarnIcon /> : tone === 'bad' ? <CrossIcon /> : <OfflineIcon />}
      <span className="s14-banner-word">{word}</span>
      <span className="s14-banner-msg">{message}</span>
      <span className="s14-grow" />
      <EditorButton onClick={() => navigate(ROUTES.leaderboard, { replace: true })}>{action}</EditorButton>
    </div>
  )
}

function EmptyKit() {
  return (
    <div className="s14-empty">
      <p className="s14-empty-line">No layers have run the kit yet. Run qscore conform to join the leaderboard.</p>
      <div className="s14-code" aria-label="Command">
        <div className="s14-code-line">
          <span className="s14-code-n">1</span>
          <span className="s14-code-text is-comment"># 12 fixture requests × 20 attempts, prompt and budget held equal</span>
        </div>
        <div className="s14-code-line">
          <span className="s14-code-n">2</span>
          <span className="s14-code-text">{CONFORM_COMMAND}</span>
        </div>
      </div>
      <div>
        <CopyButton text={CONFORM_COMMAND} label="Copy command" done="Copied command" />
      </div>
    </div>
  )
}

/* ── Table ───────────────────────────────────────────────────────────── */
type Col = { key: string; label: string; width: number; align: 'left' | 'right'; sort?: SortKey }
const COLS: Col[] = [
  { key: 'rank', label: '#', width: 18, align: 'left' },
  { key: 'layer', label: 'layer · model · provider', width: 242, align: 'left' },
  { key: 'prompt', label: 'prompt', width: 62, align: 'left' },
  { key: 'requests', label: 'requests', width: 52, align: 'right' },
  { key: 'proposals', label: 'proposals', width: 56, align: 'right', sort: 'proposals' },
  { key: 'parse', label: 'parse rate', width: 82, align: 'right', sort: 'parse' },
  { key: 'verified', label: 'verified rate', width: 80, align: 'right', sort: 'verified' },
  { key: 'vir', label: 'verified-improvement rate', width: 188, align: 'left', sort: 'vir' },
  { key: 'latency', label: 'median latency', width: 76, align: 'right', sort: 'latency' },
  { key: 'tokens', label: 'tokens', width: 50, align: 'right', sort: 'tokens' },
  { key: 'cost', label: 'cost', width: 50, align: 'right', sort: 'cost' },
]

function TableHead({ sort, flipped, onSort }: { sort: SortKey; flipped: boolean; onSort: (k: SortKey) => void }) {
  return (
    <div className="s14-head" role="row">
      {COLS.map((c) => {
        const on = c.sort === sort
        const asc = ASC[sort] !== flipped
        const cls = `s14-th${c.align === 'right' ? ' is-right' : ''}${c.key === 'vir' ? ' is-vir' : ''}${on ? ' is-sorted' : ''}`
        if (!c.sort)
          return (
            <span key={c.key} role="columnheader" className={cls} style={{ width: c.width }}>
              {c.label}
            </span>
          )
        return (
          <button
            key={c.key}
            role="columnheader"
            aria-sort={on ? (asc ? 'ascending' : 'descending') : 'none'}
            className={cls}
            style={{ width: c.width }}
            onClick={() => onSort(c.sort!)}
          >
            {c.label}
            {on && (
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                <path d={asc ? 'M1 6h6L4 1.5z' : 'M1 2h6L4 6.5z'} fill="var(--color-text-primary)" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** The three rate definitions, short form, directly under the header. */
function Definitions() {
  return (
    <div className="s14-defs">
      <span className="s14-def-name">parse rate</span>
      <span className="mono">parsed ÷ proposals</span>
      <span className="mono s14-def-dot">·</span>
      <span className="s14-def-name">verified rate</span>
      <span className="mono">passed ÷ parsed</span>
      <span className="mono s14-def-dot">·</span>
      <span className="s14-def-name">verified-improvement rate</span>
      <span className="mono">accepted ÷ requests</span>
      <span className="s14-grow" />
      <span className="mono">requests = 12 fixtures × 20 attempts</span>
    </div>
  )
}

function LayerRows({
  rows,
  ranks,
  sort,
  selectedId,
  onSelect,
  focusId,
  onBlurFocus,
}: {
  rows: LayerRow[]
  ranks: Map<string, number>
  sort: SortKey
  selectedId: string | null
  onSelect: (id: string) => void
  focusId?: string
  onBlurFocus: () => void
}) {
  const focusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true })
  }, [])
  const move = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    const list = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.s14-row') ?? [])
    const at = list.indexOf(e.currentTarget)
    const next = e.key === 'ArrowDown' ? list[at + 1] : e.key === 'ArrowUp' ? list[at - 1] : null
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      next?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }
  return (
    <>
      {rows.map((r, i) => (
        <div
          key={r.id}
          ref={r.id === focusId ? focusRef : undefined}
          role="row"
          tabIndex={0}
          aria-selected={r.id === selectedId}
          className={[
            's14-row',
            r.id === selectedId ? 'is-selected' : '',
            r.id === focusId ? 'is-focus' : '',
            r.failed ? 'is-failed' : '',
            i === rows.length - 1 ? 'is-last' : '',
          ].join(' ')}
          onClick={() => onSelect(r.id)}
          onKeyDown={(e) => move(e, r.id)}
          onBlur={r.id === focusId ? onBlurFocus : undefined}
        >
          <LayerCells row={r} rank={ranks.get(r.id)} sort={sort} />
        </div>
      ))}
    </>
  )
}

function LayerCells({ row: r, rank, sort }: { row: LayerRow; rank?: number; sort: SortKey }) {
  return (
    <>
      <span className="s14-td mono s14-rank" style={{ width: 18 }}>
        {rank ?? '–'}
      </span>
      <span className="s14-td s14-layer" style={{ width: 242 }}>
        <span className="mono s14-model">{r.model}</span>
        <span className="s14-sub">
          <span>{r.where}</span>
          {r.failed ? (
            <span className="s14-compat is-bad">
              <CrossIcon />
              <span>not compatible · {r.failed.word}</span>
              <span className="mono">{r.failed.code}</span>
            </span>
          ) : (
            <span className="s14-compat">
              <CheckIcon />
              <span>qscore-compatible</span>
            </span>
          )}
        </span>
      </span>
      <span className={`s14-td mono${r.prompt ? '' : ' is-dim'}`} style={{ width: 62 }}>
        {r.prompt ?? 'none'}
      </span>
      <span className="s14-td is-right mono" style={{ width: 52 }}>
        {REQUESTS}
      </span>
      <span className="s14-td is-right mono" style={{ width: 56 }}>
        {r.proposals}
      </span>
      <RateCell rate={r.parse} width={82} />
      <RateCell rate={r.verified} width={80} />
      <span className="s14-td s14-vir" style={{ width: 188 }}>
        <span className="s14-track" aria-hidden>
          <span className="s14-fill" style={{ width: r.vir.value }} />
        </span>
        <RateCell rate={r.vir} width={68} strong={sort === 'vir'} />
      </span>
      <Num value={r.latency.toFixed(1)} unit="s" width={76} strong={sort === 'latency'} />
      {r.tokens == null ? (
        <span className="s14-td is-right mono is-dim" style={{ width: 50 }}>
          none
        </span>
      ) : (
        <Num value={r.tokens.toFixed(2)} unit="M" width={50} strong={sort === 'tokens'} />
      )}
      <Num value={r.cost.toFixed(2)} unit="$" width={50} strong={sort === 'cost'} />
    </>
  )
}

/** "28.3% ±5.7": value 12, unit 10, interval 11 tertiary. */
function RateCell({ rate, width, strong }: { rate: Rate; width: number; strong?: boolean }) {
  return (
    <span className="s14-td is-right s14-num" style={{ width }}>
      <span className={`mono s14-v${strong ? ' is-strong' : ''}`}>{rate.value.toFixed(1)}</span>
      <span className="mono s14-unit">%</span>
      <span className="s14-gap2" />
      <span className="mono s14-ci">±{rate.ci === 0 ? '0' : rate.ci.toFixed(1)}</span>
    </span>
  )
}

function Num({ value, unit, width, strong }: { value: string; unit: string; width: number; strong?: boolean }) {
  return (
    <span className="s14-td is-right s14-num" style={{ width }}>
      <span className={`mono s14-v${strong ? ' is-strong' : ''}`}>{value}</span>
      <span className="mono s14-unit">{unit}</span>
    </span>
  )
}

function LoadingRows() {
  const name = [200, 120, 180, 160, 140, 190]
  const sub = [120, 140, 110, 130, 120, 100]
  return (
    <>
      <div className="s14-stage" role="status">
        <Spinner />
        <span>Loading leaderboard.parquet from the Hub</span>
        <span className="s14-grow" />
        <span className="mono s14-stage-meta">about 3 s · 48 kB</span>
      </div>
      {name.map((w, i) => (
        <div key={i} className={`s14-row is-skeleton${i === name.length - 1 ? ' is-last' : ''}`} aria-hidden>
          <span className="s14-td" style={{ width: 18 }}>
            <Block w={8} h={12} />
          </span>
          <span className="s14-td s14-layer is-sk" style={{ width: 242 }}>
            <Block w={w} h={12} />
            <Block w={sub[i]} h={10} />
          </span>
          <span className="s14-td" style={{ width: 62 }}>
            <Block w={52} h={12} />
          </span>
          <span className="s14-td is-right" style={{ width: 52 }}>
            <Block w={24} h={12} />
          </span>
          <span className="s14-td is-right" style={{ width: 56 }}>
            <Block w={24} h={12} />
          </span>
          <span className="s14-td is-right" style={{ width: 82 }}>
            <Block w={60} h={12} />
          </span>
          <span className="s14-td is-right" style={{ width: 80 }}>
            <Block w={60} h={12} />
          </span>
          <span className="s14-td s14-vir" style={{ width: 188 }}>
            <Block w={100} h={6} />
            <span className="s14-td is-right" style={{ width: 68 }}>
              <Block w={60} h={12} />
            </span>
          </span>
          <span className="s14-td is-right" style={{ width: 76 }}>
            <Block w={32} h={12} />
          </span>
          <span className="s14-td is-right" style={{ width: 50 }}>
            <Block w={34} h={12} />
          </span>
          <span className="s14-td is-right" style={{ width: 50 }}>
            <Block w={34} h={12} />
          </span>
        </div>
      ))}
    </>
  )
}

/* ── Accepted by fixture ─────────────────────────────────────────────── */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0])

function chartNote(row: LayerRow, counts: number[]) {
  if (row.id === 'reference') return `The reference is the line every layer is measured against: ${row.accepted} of ${REQUESTS} accepted.`
  const beats = FIXTURES.filter((_, i) => counts[i] > REFERENCE_BY_FIXTURE[i])
  const ties = FIXTURES.filter((_, i) => counts[i] === REFERENCE_BY_FIXTURE[i]).length
  const trails = FIXTURES.length - beats.length - ties
  const tie = ties ? `; ties it on ${WORDS[ties]}` : ''
  if (!beats.length) return `Trails the reference on ${WORDS[trails]} fixtures${tie}.`
  // name up to three fixtures, count the rest, so the line stays one line
  const named = beats.length <= 3 ? list(beats) : `${WORDS[beats.length]} fixtures`
  return `Beats the reference on ${named}${tie}; trails it on the other ${WORDS[trails]}.`
}

function FixtureTile({ row, body }: { row: LayerRow | null; body: BoardState['body'] }) {
  const title = row && body === 'table' ? `Accepted by fixture · ${row.model}${row.prompt ? ` ${row.prompt}` : ''}` : 'Accepted by fixture'
  return (
    <section className="tile s14-chart-tile">
      <div className="tile-header">
        <div className="tile-tabs">
          <span className="tile-tab is-active">{title}</span>
        </div>
        <div className="tile-meta">
          <span className="mono">12 fixtures · 20 attempts each</span>
        </div>
      </div>
      <div className="s14-chart-body">
        {body === 'loading' ? (
          <ChartSkeleton />
        ) : row && body === 'table' ? (
          <FixtureChart key={row.id} row={row} />
        ) : (
          // the kit's axes stand, with the words where the bars will be
          <ChartFrame
            legend={
              <span className="s14-legend-words">
                {body === 'error' ? (
                  <>
                    Nothing to chart · the leaderboard did not load <span className="mono">(Q901)</span>
                  </>
                ) : body === 'empty' ? (
                  'No accepted counts yet · they appear after the first qscore conform run'
                ) : (
                  'Select a layer to chart its accepted count per fixture'
                )}
              </span>
            }
          />
        )}
      </div>
    </section>
  )
}

function FixtureChart({ row }: { row: LayerRow }) {
  const counts = byFixture(row)
  const isRef = row.id === 'reference'
  return (
    <>
      <ChartFrame
        className="s14-fade"
        label={`accepted of 20 per fixture for ${row.model}`}
        counts={counts}
        ticks={isRef ? undefined : REFERENCE_BY_FIXTURE}
        legend={
          <span className="s14-legend-items">
            <span className="s14-legend-item">
              <span className="s14-swatch" />
              <span className="mono">
                {row.model}
                {row.prompt ? ` ${row.prompt}` : ''}
              </span>
            </span>
            {!isRef && (
              <span className="s14-legend-item">
                <span className="s14-tick-key" />
                <span className="mono">reference-qiskit</span>
              </span>
            )}
          </span>
        }
      />
      <p className="s14-chart-note s14-fade">{chartNote(row, counts)}</p>
    </>
  )
}

/** Accepted of 20 per fixture: 12 px per request, a bar per fixture, the reference as a white tick, labels centred under their bars. */
function ChartFrame({ counts, ticks, legend, label, className = '' }: { counts?: number[]; ticks?: number[]; legend: ReactNode; label?: string; className?: string }) {
  return (
    <div className={`s14-chart-inset ${className}`} role={counts ? 'img' : undefined} aria-label={label}>
      <div className="s14-legend">
        <span className="mono">accepted of {ATTEMPTS}</span>
        {legend}
      </div>
      <div className="s14-plot">
        <div className="s14-yaxis" aria-hidden>
          <span className="mono" style={{ top: -7 }}>
            20
          </span>
          <span className="mono" style={{ top: 'calc(50% - 7px)' }}>
            10
          </span>
          <span className="mono" style={{ top: 'calc(100% - 7px)' }}>
            0
          </span>
        </div>
        <div className="s14-area">
          {[0, 25, 50, 75].map((y) => (
            <span key={y} className="s14-grid" style={{ top: `${y}%` }} />
          ))}
          <span className="s14-grid is-base" style={{ bottom: 0 }} />
          {counts && (
            <div className="s14-cols">
              {counts.map((v, i) => (
                <div key={FIXTURES[i]} className="s14-col">
                  <div className="s14-slot">
                    <span className="s14-bar" style={{ height: `${(100 * v) / ATTEMPTS}%` }} title={`${FIXTURES[i]} · ${v} of ${ATTEMPTS}`} />
                    {ticks && <span className="s14-tick" style={{ bottom: `${(100 * ticks[i]) / ATTEMPTS}%` }} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="s14-xlabels" aria-hidden>
        {[0, 1].map((line) => (
          <div key={line} className="s14-xline">
            {FIXTURES.map((f, i) => (
              <span key={f} className="s14-xcell">
                {i % 2 === line && <span className={`mono${counts && ticks && counts[i] > ticks[i] ? ' is-beat' : ''}`}>{f}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  const heights = [60, 48, 108, 60, 120, 132, 72, 24, 72, 36, 48, 36]
  return (
    <div className="s14-chart-inset" aria-hidden>
      <div className="s14-legend">
        <span className="mono">accepted of {ATTEMPTS}</span>
        <Block w={220} h={10} />
      </div>
      <div className="s14-plot">
        <div className="s14-yaxis" />
        <div className="s14-area">
          <span className="s14-grid is-base" style={{ bottom: 0 }} />
          <div className="s14-cols">
            {heights.map((h, i) => (
              <div key={i} className="s14-col">
                <div className="s14-slot">
                  <Block w={18} h={h} className="s14-bar-sk" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── How rates are counted ───────────────────────────────────────────── */
function RatesTile() {
  return (
    <section className="tile s14-rates">
      <div className="tile-header">
        <div className="tile-tabs">
          <span className="tile-tab is-active">How rates are counted</span>
        </div>
      </div>
      <div className="s14-rates-body">
        {RATE_DEFINITIONS.map((d) => (
          <div key={d.name} className="s14-rate">
            <span className="s14-rate-name">{d.name}</span>
            <span className="s14-rate-def">{d.def}</span>
          </div>
        ))}
        <p className="s14-rates-note">Rates are reported, not thresholded. A layer that passes qscore conform is qscore-compatible.</p>
        <div className="s14-kit">
          <div className="s14-kit-head">
            <span className="s14-kit-label">the kit</span>
            <span className="mono s14-kit-meta">qscore conform · qscore-2026.1</span>
          </div>
          <div className="s14-kit-row mono">
            {FIXTURE_COUNT} fixtures × {ATTEMPTS} attempts = {REQUESTS} requests
          </div>
          <div className="s14-kit-row is-text">Held equal within a row: prompt version, budget</div>
        </div>
      </div>
    </section>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
const shortName = (m: string) => m.replace(/^Qiskit\//, '').replace(/-qiskit$/i, '')
const describe = (r: LayerRow) => `${r.model} · ${r.layer === 'engine' ? 'engine' : r.layer} · ${r.prompt ?? 'no prompt'}`

function BoardInspector({
  cfg,
  row,
  current,
  onUse,
  rows,
}: {
  cfg: BoardState
  row: LayerRow | null
  current: boolean
  onUse: (id: string) => void
  rows: LayerRow[]
}) {
  if (cfg.inspector === 'loading') return <InspectorLoading />
  if (!row || cfg.inspector === 'none') return <InspectorNone body={cfg.body} />
  return (
    <>
      <ModeTabs />
      <div className="s14-insp s14-fade" key={row.id}>
        {row.failed ? <FailedBlock row={row} /> : <UseBlock row={row} current={current} onUse={onUse} gpuOff={cfg.gpuOff} />}
        <FunnelSection row={row} />
        <CompareSection row={row} rows={rows} />
        <BenchSection row={row} />
        <ChangesSection row={row} />
      </div>
    </>
  )
}

function UseBlock({ row, current, onUse, gpuOff }: { row: LayerRow; current: boolean; onUse: (id: string) => void; gpuOff?: boolean }) {
  const [done, setDone] = useState(false)
  const use = useRef(onUse)
  useEffect(() => {
    use.current = onUse
  })
  useEffect(() => {
    if (!done) return
    // the past verb holds for 1200 ms, then the layer is in the list and the button says so
    const t = window.setTimeout(() => {
      setDone(false)
      use.current(row.id)
    }, DONE_MS)
    return () => clearTimeout(t)
  }, [done, row.id])
  return (
    <ModeBlock line={<span className="s14-selected">Selected · {describe(row)}</span>} style={BLOCK_PAD}>
      {gpuOff && (
        <div className="s14-banner is-gpu" role="status">
          <span className="s14-gpu-dot" />
          <span className="s14-banner-word">GPU off</span>
          <span className="s14-banner-msg">GPU machine is off · model proposals wait</span>
        </div>
      )}
      {current && !done ? (
        <PrimaryButton disabled>Current layer</PrimaryButton>
      ) : (
        <PrimaryButton onClick={() => setDone(true)}>{done ? 'Used this layer ✓' : 'Use this layer'}</PrimaryButton>
      )}
      <div className="s14-use-note">
        <span>{current && !done ? 'Already in the' : 'Adds it to the'}</span>
        <span className="s14-use-strong">Layers</span>
        <span>list of your next run · qscore-2026.1</span>
      </div>
    </ModeBlock>
  )
}

function FailedBlock({ row }: { row: LayerRow }) {
  const f = row.failed!
  return (
    <ModeBlock line={<span className="s14-selected">Selected · {describe(row)}</span>} style={{ paddingTop: 18, paddingBottom: 16 }}>
      <div className="s14-banner is-bad" role="alert">
        <CrossIcon />
        <span className="s14-banner-word">not compatible</span>
        <span className="s14-banner-msg">
          {f.edits} edits outside allowed region <span className="mono">({f.code})</span>
        </span>
      </div>
      <p className="s14-insp-text">
        {f.edits} attempts edited outside the allowed region, on {list(f.on)} · Fix the layer's region handling, then run qscore conform again.
      </p>
      <div className="s14-actions">
        <EditorButton onClick={() => navigate(ROUTES.runs)}>Open conform run</EditorButton>
        <CopyButton text={`qscore conform --layer local --model ${row.model} --prompt ${row.prompt ?? 'p-2026.1'}`} label="Copy command" done="Copied command" />
      </div>
    </ModeBlock>
  )
}

const FunnelIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M2.5 3.5h13l-5 6v4.5l-3 1.5v-6z" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
)
const CompareIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M3 15h12M5 15V9M9 15V4M13 15v-7" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
const ClockIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" />
    <path d="M9 5.5V9l2.5 1.5" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
const DocIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M4.5 2.5h6l3 3v10h-9z" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M7 9h4M7 12h4" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

function FunnelSection({ row }: { row: LayerRow }) {
  const steps = [
    { label: 'requests', value: REQUESTS },
    { label: 'proposals', value: row.proposals },
    { label: 'parsed', value: row.parsed },
    { label: 'passed', value: row.passed },
    { label: 'accepted', value: row.accepted },
  ]
  const deltas = steps.map((s, i) => (i ? steps[i - 1].value - s.value : 0))
  const biggest = Math.max(...deltas)
  const lostVerify = row.parsed - row.passed
  const lostImprove = row.passed - row.accepted
  const reading =
    lostVerify === 0
      ? `Every proposal parses and verifies; ${lostImprove} passed without lowering two_qubit_count, so they were not accepted.`
      : lostVerify >= lostImprove
        ? `Most losses happen at verification: ${lostVerify} parsed proposals changed what the circuit does or failed the re-score.`
        : `Most losses happen after verification: ${lostImprove} passed proposals did not lower two_qubit_count.`
  const rateLine = (name: string, r: Rate, num: number, den: number) => (
    <div className="s14-funnel-rate">
      <span>{name}</span>
      <span className="mono s14-white">
        {r.value.toFixed(1)}% ±{r.ci === 0 ? '0' : r.ci.toFixed(1)}
      </span>
      <span className="mono">
        {num} ÷ {den}
      </span>
    </div>
  )
  return (
    <Section icon={FunnelIcon} title="Funnel" meta={`${REQUESTS} requests to ${row.accepted} accepted`} bodyClassName="s14-sec-body is-gap">
      <div className="s14-funnel">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className="s14-funnel-row">
              <span className="mono s14-funnel-label">{s.label}</span>
              <span className="s14-funnel-track" aria-hidden>
                <span style={{ width: (150 * s.value) / REQUESTS }} />
              </span>
              <span className="s14-grow s14-funnel-delta">
                {i > 0 && <span className={`mono${deltas[i] === biggest && biggest > 0 ? ' s14-white' : ''}`}>{deltas[i] ? `−${deltas[i]}` : '0'}</span>}
              </span>
              <span className="mono s14-funnel-value">{s.value}</span>
            </div>
            {s.label === 'proposals' && rateLine('parse rate', row.parse, row.parsed, row.proposals)}
            {s.label === 'parsed' && rateLine('verified rate', row.verified, row.passed, row.parsed)}
          </div>
        ))}
        <div className="s14-funnel-total">
          <span>verified-improvement rate</span>
          <span className="mono s14-white is-strong">
            {row.vir.value.toFixed(1)}% ±{row.vir.ci.toFixed(1)}
          </span>
          <span className="s14-grow" />
          <span className="mono">
            {row.accepted} ÷ {REQUESTS}
          </span>
        </div>
      </div>
      <p className="s14-insp-text">{reading}</p>
    </Section>
  )
}

type Comparison = { key: string; label: ReactNode; rate: Rate; verdict: string; gap: number }

function comparisons(row: LayerRow, rows: LayerRow[]): Comparison[] {
  const others = rows.filter((r) => r.rank != null && r.id !== row.id)
  const sibling = others.find((r) => r.model === row.model)
  const ref = others.find((r) => r.id === 'reference')
  const at = row.rank ?? others.length + 1
  // nearest by rank, the better-ranked first on a tie
  const neighbours = others
    .filter((r) => r !== sibling && r !== ref)
    .sort((a, b) => Math.abs(a.rank! - at) - Math.abs(b.rank! - at) || a.rank! - b.rank!)
  const first = sibling ?? neighbours.shift()
  const second = ref ?? neighbours.shift()
  const label = (r: LayerRow): ReactNode =>
    r === sibling ? (
      <>
        <span>Same model,</span>
        <span className="mono s14-cmp-mono">{r.prompt}</span>
      </>
    ) : (
      <span className="mono s14-cmp-mono">{r === ref ? 'reference-qiskit' : shortName(r.model)}</span>
    )
  return [first, second]
    .filter((r): r is LayerRow => !!r)
    .map((r) => {
      const gap = r.vir.value - row.vir.value
      // the 95% interval of the difference
      const reach = Math.sqrt(r.vir.ci ** 2 + row.vir.ci ** 2)
      const verdict = Math.abs(gap) <= reach ? 'within the interval' : `${Math.abs(gap).toFixed(1)} pts ${gap < 0 ? 'below' : 'above'}`
      return { key: r.id, label: label(r), rate: r.vir, verdict, gap }
    })
}

function CompareSection({ row, rows }: { row: LayerRow; rows: LayerRow[] }) {
  const items = comparisons(row, rows)
  return (
    <Section icon={CompareIcon} title="Compared with" meta="verified-improvement rate" bodyClassName="s14-sec-body">
      {items.length ? (
        items.map((c) => (
          <div key={c.key} className="s14-kv" title={`gap ${c.gap >= 0 ? '+' : '−'}${Math.abs(c.gap).toFixed(1)} pts`}>
            <span className="s14-cmp-label">{c.label}</span>
            <span className="s14-num s14-cmp-rate">
              <span className="mono s14-v">{c.rate.value.toFixed(1)}</span>
              <span className="mono s14-unit">%</span>
              <span className="s14-gap2" />
              <span className="mono s14-ci">±{c.rate.ci.toFixed(1)}</span>
            </span>
            <span className="mono s14-cmp-verdict">{c.verdict}</span>
          </div>
        ))
      ) : (
        <div className="s14-kv">
          <span className="s14-kv-label">Nothing to compare yet · 1 layer has run the kit</span>
        </div>
      )}
    </Section>
  )
}

function BenchSection({ row }: { row: LayerRow }) {
  const kitOk = row.kit === FIXTURE_COUNT
  return (
    <Section icon={ClockIcon} title="Bench details" meta={`${FIXTURE_COUNT} fixtures × ${ATTEMPTS}`} bodyClassName="s14-sec-body">
      <div className="s14-kv">
        <span className="s14-kv-label">Median latency</span>
        <span className="s14-kv-value">
          <span className="mono">{row.latency.toFixed(1)} s</span>
          <span className="mono s14-kv-unit">per request</span>
        </span>
      </div>
      <div className="s14-kv">
        <span className="s14-kv-label">Tokens</span>
        <span className="s14-kv-value">
          {row.tokens == null ? (
            <span className="mono s14-dim">none · no model</span>
          ) : (
            <>
              <span className="mono">{((row.tokens * 1000) / REQUESTS).toFixed(1)} k</span>
              <span className="mono s14-kv-unit">per request</span>
            </>
          )}
        </span>
      </div>
      <div className="s14-kv is-last">
        <span className="s14-kv-label">Conform run</span>
        <span className="s14-kv-value is-gap6">
          <span className="mono">{row.conform}</span>
          <span className="mono s14-dim">·</span>
          <span className={`s14-compat${kitOk ? '' : ' is-bad'}`}>
            {kitOk ? <CheckIcon /> : <CrossIcon />}
            <span className="mono">
              {row.kit} of {FIXTURE_COUNT} passed
            </span>
          </span>
        </span>
      </div>
      <div className="s14-actions is-pad">
        <EditorButton onClick={() => navigate(ROUTES.bench)}>Open bench</EditorButton>
        <EditorButton onClick={() => navigate(ROUTES.runs)}>Open conform run</EditorButton>
        <CopyButton text={toCsv} label="Copy as CSV" done="Copied as CSV" />
      </div>
    </Section>
  )
}

function ChangesSection({ row }: { row: LayerRow }) {
  const notes = PROMPT_NOTES[row.prompt ?? 'engine']
  return (
    <Section icon={DocIcon} title={notes.title} meta={notes.meta} bodyClassName="s14-sec-body is-tight">
      {notes.lines.map((l, i) => (
        <div key={l} className={`s14-kv${i === notes.lines.length - 1 ? ' is-last' : ''}`}>
          <span className="mono s14-note-n">{i + 1}</span>
          <span className="s14-note-text">{l}</span>
        </div>
      ))}
    </Section>
  )
}

function InspectorNone({ body }: { body: BoardState['body'] }) {
  const line =
    body === 'empty'
      ? 'No layers on the board yet'
      : body === 'error'
        ? 'Leaderboard did not load · nothing to select'
        : 'No layer selected · arrow keys move, Enter selects'
  return (
    <>
      <ModeTabs />
      <ModeBlock line={<span className="s14-selected">{line}</span>} style={BLOCK_PAD}>
        <PrimaryButton disabled>Use this layer</PrimaryButton>
        <div className="s14-use-note">
          <span>Adds it to the</span>
          <span className="s14-use-strong">Layers</span>
          <span>list of your next run · qscore-2026.1</span>
        </div>
      </ModeBlock>
      <KitSection />
    </>
  )
}

function KitSection() {
  return (
    <Section icon={ClockIcon} title="The kit" meta="qscore conform · qscore-2026.1" bodyClassName="s14-sec-body">
      <div className="s14-kv">
        <span className="s14-kv-label">Fixtures</span>
        <span className="mono s14-kv-value">{FIXTURE_COUNT}</span>
      </div>
      <div className="s14-kv">
        <span className="s14-kv-label">Attempts</span>
        <span className="s14-kv-value">
          <span className="mono">{ATTEMPTS}</span>
          <span className="mono s14-kv-unit">per fixture</span>
        </span>
      </div>
      <div className="s14-kv is-last">
        <span className="s14-kv-label">Requests</span>
        <span className="s14-kv-value">
          <span className="mono">{REQUESTS}</span>
          <span className="mono s14-kv-unit">per row</span>
        </span>
      </div>
      <div className="s14-actions is-pad">
        <CopyButton text={CONFORM_COMMAND} label="Copy command" done="Copied command" />
      </div>
    </Section>
  )
}

function InspectorLoading() {
  return (
    <>
      <ModeTabs />
      <ModeBlock line={<Block w={300} h={12} onPanel />} style={BLOCK_PAD}>
        <PrimaryButton disabled>Use this layer</PrimaryButton>
        <div className="s14-use-note">
          <span>Adds it to the</span>
          <span className="s14-use-strong">Layers</span>
          <span>list of your next run · qscore-2026.1</span>
        </div>
      </ModeBlock>
      <Section icon={FunnelIcon} title="Funnel" meta={<Block w={150} h={10} onPanel />} bodyClassName="s14-sec-body is-gap">
        <div className="s14-funnel" aria-hidden>
          {[150, 144, 139, 85, 43].map((w, i) => (
            <div key={i} className="s14-funnel-row">
              <Block w={56} h={10} />
              <Block w={w} h={8} />
              <span className="s14-grow" />
              <Block w={24} h={12} />
            </div>
          ))}
        </div>
      </Section>
      <Section icon={CompareIcon} title="Compared with" meta="verified-improvement rate" bodyClassName="s14-sec-body">
        {[150, 120].map((w) => (
          <div key={w} className="s14-kv" aria-hidden>
            <Block w={w} h={12} onPanel />
            <span className="s14-grow" />
            <Block w={96} h={12} onPanel />
          </div>
        ))}
      </Section>
    </>
  )
}

/* ── Small pieces ────────────────────────────────────────────────────── */
/** Skeleton block sized to the content: shimmer band 1200 ms linear, pulse under reduced motion. */
function Block({ w, h, onPanel, className = '' }: { w: number; h: number; onPanel?: boolean; className?: string }) {
  return <span aria-hidden className={`s14-sk${onPanel ? ' on-panel' : ''} ${className}`} style={{ width: w, height: h }} />
}

/** 14 px ring, 2 px, 270°, one turn per 1000 ms; a whole static ring under reduced motion. */
function Spinner() {
  return (
    <svg className="s14-spin" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--color-spinner-track, var(--color-teal-700))" strokeWidth="2" />
      <circle className="s14-spin-arc" cx="7" cy="7" r="5.5" fill="none" stroke="var(--color-spinner-arc, var(--color-teal-200))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Copies; the label becomes the past verb with ✓ for 1200 ms. Same width either way (min-width set on mount). */
function CopyButton({ text, label, done }: { text: string | (() => string); label: string; done: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), DONE_MS)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <EditorButton
      onClick={() => {
        void navigator.clipboard?.writeText(typeof text === 'function' ? text() : text).catch(() => {})
        setCopied(true)
      }}
    >
      {copied ? `${done} ✓` : label}
    </EditorButton>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CrossIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className="s14-cross">
      <path d="M3 3l6 6M9 3L3 9" fill="none" stroke="var(--color-signal-bad)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function WarnIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 1.5l5 9H1z" fill="none" stroke="var(--color-signal-warn)" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 5v2.5M6 9v.2" fill="none" stroke="var(--color-signal-warn)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
function OfflineIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d="M1.5 4.5a6.5 6.5 0 019 0M3.3 6.6a4 4 0 015.4 0M6 9.2v.1M2 2l8 8" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function toCsv() {
  const head = 'rank,model,layer,prompt,requests,proposals,parse_rate,parse_ci95,verified_rate,verified_ci95,verified_improvement_rate,vir_ci95,median_latency_s,tokens_m,cost_usd'
  return [
    head,
    ...LAYERS.map((r) =>
      [r.rank ?? '', r.model, r.layer, r.prompt ?? '', REQUESTS, r.proposals, r.parse.value, r.parse.ci, r.verified.value, r.verified.ci, r.vir.value, r.vir.ci, r.latency, r.tokens ?? '', r.cost].join(','),
    ),
  ].join('\n')
}
