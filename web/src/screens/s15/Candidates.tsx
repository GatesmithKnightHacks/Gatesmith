/*
 * S-15 Candidates tile (Paper 1DH9-0) and the variants from its states board (1LVA-0). Columns hold
 * on every variant: Rank 37 · Strategy 178 · Source layer 133 · Predicted 122 · Verify probability 108
 * · Status 76 inside 8 px row padding.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { EditorButton, TileHeader } from '../../ui/parts'
import { Banner, Block, LayerDot, ProbBar, Stage, StatusWord, type Word } from '../stretch/parts'
import { CANDIDATES, IN_VERIFICATION, LAYER_KIND, NOW_GATES, SCREENED_ON_BOARD, type Candidate } from './data'

export type CandidatesView =
  | 'board'
  | 'no-predictor'
  | 'screening'
  | 'all-screened'
  | 'verified-wrong'
  | 'loading'
  | 'keyboard-focus'
  | 'gpu-off'
  | 'offline'
  | 'empty'

type Props = {
  view: CandidatesView
  selected: number
  onSelect: (rank: number) => void
  /** ranks the user sent to the engine with Verify top 2 */
  sent: number[]
  onRequestFix?: () => void
  onInstall?: () => void
  onRetry?: () => void
}

const META: Partial<Record<CandidatesView, string>> = {
  'no-predictor': 'finding #3 · D03 block 2 · proposal order',
  loading: 'finding #3 · D03 block 2',
  'gpu-off': 'finding #3 · screened 11:42',
  empty: 'finding #3 · D03 block 2 · 0 candidates',
}

export function CandidatesTile(props: Props) {
  const { view } = props
  return (
    <section className="tile s15-candidates">
      <TileHeader tabs={[{ id: 'c', label: 'Candidates', active: true }]} meta={<span className="mono">{META[view] ?? 'finding #3 · D03 block 2 · round 4'}</span>} />
      <div className={`s15-cand-body${view === 'board' || view === 'keyboard-focus' ? '' : ' is-state'}`}>
        <Body {...props} />
      </div>
    </section>
  )
}

function Body(props: Props) {
  const { view } = props
  switch (view) {
    case 'no-predictor':
      return <NoPredictor onInstall={props.onInstall} />
    case 'screening':
      return <Screening />
    case 'loading':
      return <Loading />
    case 'empty':
      return <Empty onRequestFix={props.onRequestFix} />
    case 'verified-wrong':
      return <VerifiedWrong {...props} />
    case 'all-screened':
      return <AllScreened {...props} />
    case 'gpu-off':
    case 'offline':
      return <Offline {...props} />
    default:
      return <Board {...props} />
  }
}

/* ── Shared rows ─────────────────────────────────────────────────────── */
function Head({ first = 'Rank', prediction }: { first?: string; prediction?: boolean }) {
  return (
    <div className="s15-row s15-head" role="row">
      <span className="c-rank">{first}</span>
      <span className="c-strategy">Strategy</span>
      <span className="c-layer">Source layer</span>
      {prediction ? (
        <span className="c-prediction">Prediction</span>
      ) : (
        <>
          <span className="c-pred">Predicted</span>
          <span className="c-prob">Verify probability</span>
        </>
      )}
      <span className="c-status">Status</span>
    </div>
  )
}

function Layer({ c }: { c: Pick<Candidate, 'layer'> }) {
  return (
    <span className="c-layer">
      <LayerDot layer={LAYER_KIND[c.layer]} />
      <span className="mono">{c.layer}</span>
    </span>
  )
}

function Predicted({ c }: { c: Candidate }) {
  return (
    <span className="c-pred">
      <span className="mono s15-val">{c.predicted}</span>
      <span className="mono s15-unit">
        ±{c.ci} gates · n={c.n}
      </span>
    </span>
  )
}

function Prob({ c }: { c: Candidate }) {
  return (
    <span className="c-prob">
      <ProbBar value={c.verify} />
      <span className="mono s15-val">{c.verify.toFixed(2)}</span>
    </span>
  )
}

/** A ranked row; focusable, Enter or Space selects, ↑ ↓ move between rows. */
function RankRow({
  c,
  status = 'queued',
  selected,
  focus,
  onSelect,
  height,
  children,
  rank = `#${c.rank}`,
}: {
  c: Candidate
  status?: Word
  selected?: boolean
  focus?: boolean
  onSelect?: (rank: number) => void
  height?: number
  children?: ReactNode
  rank?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(c.rank)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const rows = Array.from(ref.current?.closest('.s15-table')?.querySelectorAll<HTMLElement>('[data-rank]') ?? [])
      const i = rows.indexOf(ref.current as HTMLElement)
      rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
    }
  }
  return (
    <div
      ref={ref}
      role="row"
      data-rank={c.rank}
      tabIndex={onSelect ? 0 : -1}
      aria-selected={selected}
      className={`s15-row s15-cand st-focusable${selected && !focus ? ' is-selected' : ''}${focus ? ' is-focus' : ''}`}
      style={height ? { height } : undefined}
      onClick={() => onSelect?.(c.rank)}
      onKeyDown={onKey}
    >
      <span className={`c-rank mono${selected ? ' is-on' : ''}`}>{rank}</span>
      <span className="c-strategy mono">{c.strategy}</span>
      <Layer c={c} />
      {children ?? (
        <>
          <Predicted c={c} />
          <Prob c={c} />
        </>
      )}
      <span className="c-status">
        <StatusWord word={status} gap={status === 'screening' ? 5 : 5} />
      </span>
    </div>
  )
}

function ScreeningCells() {
  return (
    <>
      <span className="c-pred">
        <Block w={92} />
      </span>
      <span className="c-prob">
        <span className="st-prob" style={{ width: 56 }} />
        <Block w={28} />
      </span>
    </>
  )
}

function Legend({ right }: { right: ReactNode }) {
  return (
    <div className="s15-foot">
      <span className="s15-legend">
        <span>
          <span className="st-layer-dot is-engine" />
          engine
        </span>
        <span>
          <span className="st-layer-dot is-model" />
          model, proposes
        </span>
        <span>
          <span className="s15-legend-bar" />
          predicted, not verified
        </span>
      </span>
      <span>{right}</span>
    </div>
  )
}

function statusFor(rank: number, sent: number[]): Word {
  return sent.includes(rank) ? 'verifying' : 'queued'
}

/* ── Main board ──────────────────────────────────────────────────────── */
function Board({ view, selected, onSelect, sent }: Props) {
  const focusFirst = view === 'keyboard-focus'
  return (
    <>
      <div className="s15-summary">
        <span>
          8 candidates · {SCREENED_ON_BOARD} screened · {8 - SCREENED_ON_BOARD} screening · 1 already verifying
        </span>
        <span className="mono s15-summary-meta">now {NOW_GATES} gates · lower is better</span>
      </div>
      <div className="s15-table" role="table" aria-label="Candidates for finding #3">
        <Head />
        <div className="s15-group" style={{ height: 20 }}>
          <span className="s15-group-label">in verification</span>
          <span className="mono s15-group-meta">round 3 · sent before screening</span>
        </div>
        <div className="s15-row s15-cand has-rule" role="row">
          <span className="c-rank mono">{IN_VERIFICATION.label}</span>
          <span className="c-strategy mono">{IN_VERIFICATION.strategy}</span>
          <Layer c={IN_VERIFICATION} />
          <span className="c-wide mono s15-dim">{IN_VERIFICATION.note}</span>
          <span className="c-status">
            <StatusWord word="verifying" />
          </span>
        </div>
        <div className="s15-group" style={{ height: 22 }}>
          <span className="s15-group-label">screened for round 4</span>
          <span className="mono s15-group-meta">ranked by predicted two_qubit_count · ±CI95 · n seeds</span>
        </div>
        {CANDIDATES.map((c, i) =>
          c.rank <= SCREENED_ON_BOARD ? (
            <RankRow key={c.rank} c={c} status={statusFor(c.rank, sent)} selected={c.rank === selected} focus={focusFirst && i === 0} onSelect={onSelect} />
          ) : (
            <RankRow key={c.rank} c={c} status="screening">
              <ScreeningCells />
            </RankRow>
          ),
        )}
        <span className="s15-grow" />
        <Legend right="top 2 go to the engine" />
      </div>
    </>
  )
}

/* ── States ──────────────────────────────────────────────────────────── */
function NoPredictor({ onInstall }: { onInstall?: () => void }) {
  const inOrder = [...CANDIDATES].sort((a, b) => a.proposed - b.proposed)
  return (
    <>
      <Banner word="unavailable" label="unavailable" action="Install predictor" onAction={onInstall}>
        Predictor not installed. Candidates run in proposal order.
      </Banner>
      <div className="s15-table" role="table" aria-label="Candidates in proposal order">
        <Head first="Order" prediction />
        {inOrder.map((c) => (
          <RankRow key={c.rank} c={c} rank={String(c.proposed)} height={32}>
            <span className="c-prediction">
              <StatusWord word="unavailable" gap={4} className="is-tertiary" />
            </span>
          </RankRow>
        ))}
        <span className="s15-grow" />
        <Legend right="every candidate goes to the engine in turn" />
      </div>
    </>
  )
}

function Screening() {
  const inOrder = [...CANDIDATES].sort((a, b) => a.proposed - b.proposed)
  return (
    <>
      <div className="s15-summary">
        <Stage>Screening 8 candidates · about 6 s</Stage>
        <span className="mono s15-summary-meta">0 of 8 screened · GPU</span>
      </div>
      <div className="s15-table" role="table" aria-label="Candidates being screened">
        <Head />
        {inOrder.map((c, i) => (
          <RankRow key={c.rank} c={c} status={i < 2 ? 'screening' : 'queued'} rank="" height={32}>
            <ScreeningCells />
          </RankRow>
        ))}
        <span className="s15-grow" />
        <div className="s15-foot">
          <span>6 more queued for screening</span>
          <span>0.2 s per candidate · ranks appear when all are screened</span>
        </div>
      </div>
    </>
  )
}

function AllScreened({ selected, onSelect, sent }: Props) {
  return (
    <>
      <div className="s15-summary">
        <span>8 of 8 screened in 6 s</span>
        <span className="mono s15-summary-meta">two_qubit_count now {NOW_GATES} gates · lower is better</span>
      </div>
      <div className="s15-table" role="table" aria-label="Candidates, all screened">
        <Head />
        {CANDIDATES.map((c) => (
          <RankRow key={c.rank} c={c} status={statusFor(c.rank, sent)} selected={c.rank === selected} onSelect={onSelect} height={30} />
        ))}
        <span className="s15-grow" />
        <div className="s15-foot">
          <span>#4 to #8 predict no gain on {NOW_GATES} gates · kept in the record</span>
          <span>top 2 go to the engine</span>
        </div>
      </div>
    </>
  )
}

function VerifiedWrong({ selected, onSelect }: Props) {
  const [first, second, ...rest] = CANDIDATES
  return (
    <>
      <div className="s15-compare">
        <div className="s15-compare-side">
          <span className="s15-group-label">predicted · gatesmith-predictor-0.3</span>
          <span className="s15-inline">
            <span className="mono s15-val">264</span>
            <span className="mono s15-unit">±6 gates · n=5 · two_qubit_count</span>
          </span>
          <span className="s15-inline is-center">
            <ProbBar value={0.81} />
            <span className="mono s15-val">0.81</span>
            <span className="mono s15-unit">probability it verifies</span>
          </span>
        </div>
        <div className="s15-compare-side is-result">
          <span className="s15-group-label">result · engine qscore-2026.1</span>
          <span className="s15-inline is-center">
            <StatusWord word="failed" />
            <span className="mono s15-id">at equivalent · QCEC: not equivalent</span>
          </span>
          <span className="mono s15-id is-dim">lines 48 to 86 · kept current, {NOW_GATES} gates</span>
        </div>
      </div>
      <div className="s15-table" role="table" aria-label="Candidates after verification">
        <Head />
        <div className="s15-failed-row">
          <RankRow c={first} status="failed" selected={selected === 1} onSelect={onSelect} height={28} />
          <div className="s15-failed-note mono">equivalent · QCEC: not equivalent on lines 48 to 86 · rejected, {NOW_GATES} gates kept</div>
        </div>
        <RankRow c={second} status="verifying" selected={selected === 2} onSelect={onSelect} height={28} />
        {rest.map((c) => (
          <RankRow key={c.rank} c={c} selected={selected === c.rank} onSelect={onSelect} height={28} />
        ))}
      </div>
      <div className="s15-note">A prediction, not a score: the engine still verifies every accepted change</div>
    </>
  )
}

function Loading() {
  const widths = [132, 152, 96, 84]
  return (
    <>
      <div className="s15-summary">
        <Stage>Loading candidates for finding #3 · about 1 s</Stage>
      </div>
      <div className="s15-table" role="table" aria-label="Loading candidates" aria-busy="true">
        <Head />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="s15-row s15-cand" style={{ height: 30 }} aria-hidden>
            <span className="c-rank">
              <Block w={16} />
            </span>
            <span className="c-strategy">
              <Block w={widths[i % 4]} />
            </span>
            <span className="c-layer">
              <Block w={i % 3 === 1 ? 44 : 96} />
            </span>
            <span className="c-pred">
              <Block w={92} />
            </span>
            <span className="c-prob">
              <Block w={84} />
            </span>
            <span className="c-status">
              <Block w={52} />
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function Offline({ view, selected, onSelect, onRetry }: Props) {
  const gpu = view === 'gpu-off'
  return (
    <>
      {gpu ? (
        <Banner word="offline" label="GPU off" action="Retry" onAction={onRetry}>
          GPU machine is off · model proposals wait · the engine keeps running on CPU
        </Banner>
      ) : (
        <Banner word="offline" action="Retry" onAction={onRetry}>
          You are offline · runs stay on this machine · syncs when the network is back
        </Banner>
      )}
      <div className="s15-table" role="table" aria-label="Candidates">
        <Head />
        {CANDIDATES.map((c) =>
          c.rank <= SCREENED_ON_BOARD ? (
            <RankRow key={c.rank} c={c} selected={c.rank === selected} onSelect={onSelect} height={30} />
          ) : (
            <RankRow key={c.rank} c={c} height={30}>
              <span className="c-wide">
                <StatusWord word="unavailable" gap={4} className="is-tertiary" label={gpu ? 'unavailable · waits for the GPU' : 'unavailable · waits for the network'} />
              </span>
            </RankRow>
          ),
        )}
        <span className="s15-grow" />
        <div className="s15-foot">
          <span>{gpu ? "verification runs on this machine's CPU · Verify top 2 still works" : 'screened ranks stay on this machine · Verify top 2 still works'}</span>
        </div>
      </div>
    </>
  )
}

function Empty({ onRequestFix }: { onRequestFix?: () => void }) {
  return (
    <div className="s15-table is-compact" role="table" aria-label="No candidates">
      <Head />
      <div className="s15-empty">
        <span>No candidates for finding #3 yet. The model proposes in round 4.</span>
        <EditorButton onClick={onRequestFix}>Request fix</EditorButton>
      </div>
    </div>
  )
}
