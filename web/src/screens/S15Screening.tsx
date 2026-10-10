/*
 * S-15 · Candidate screening (stretch). Paper: DCF-0, states EI6-0, motion M6 row S-15.
 * The predictor ranks candidates; only the top few go to the exact verifier. The engine still decides.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, GpuStatus, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeBlock, ModeTabs, PrimaryButton, SecondaryPair, TileHeader } from '../ui/parts'
import {
  GlyphAccepted,
  GlyphInconclusive,
  GlyphRejected,
  GlyphSent,
  GlyphWarning,
  IconHistory,
  InspSection,
  KV,
  NumberField,
  SelectField,
  StretchStatus,
  useTimers,
} from './stretch/parts'
import { fmtGates, fmtRange, LAYER_DOT, ROUND3, ROUND4, WORDS, xOf, type Candidate } from './s15/data'
import { CalibrationPanel } from './s15/Calibration'
import './s15/s15.css'

type Verdict = 'queued' | 'verifying' | 'done'
type StateName = 'loading' | 'empty' | 'unsupported' | 'disagree' | 'focus' | 'offline' | null
const STATES = ['loading', 'empty', 'unsupported', 'disagree', 'focus', 'offline'] as const

export function S15Screening() {
  const params = useHashParams()
  const raw = params.get('state')
  const state: StateName = (STATES as readonly string[]).includes(raw ?? '') ? (raw as StateName) : null

  const [round, setRound] = useState<3 | 4>(3)
  const [landKey, setLandKey] = useState(0)
  const [sendTop, setSendTop] = useState<'1' | '2' | '3'>('2')
  const [spot, setSpot] = useState(1)
  const [coverage, setCoverage] = useState(80)
  const [screening, setScreening] = useState(true)
  const [sent, setSent] = useState<Set<number>>(new Set([1, 2]))
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({ 1: 'done', 2: 'done' })
  const [batchRanks, setBatchRanks] = useState<number[]>([])
  /** whether this round's batch went out with screening on (null until something is sent) */
  const [roundScreened, setRoundScreened] = useState<boolean | null>(null)
  const [selected, setSelected] = useState(1)
  const [paused, setPaused] = useState(false)
  // Candidates | Calibration: the tile keeps its height so the page never jumps.
  const [view, setView] = useState<'candidates' | 'calibration'>('candidates')
  const [lockHeight, setLockHeight] = useState<number | null>(null)
  const candidatesRef = useRef<HTMLElement>(null)
  const timers = useTimers()

  // states that turn screening off on their own
  const screeningOn = screening && state !== 'unsupported' && state !== 'offline' && !(state === 'disagree' && !paused)
  useEffect(() => {
    if (state === 'disagree') setPaused(false)
  }, [state])

  const rows = round === 3 ? ROUND3 : ROUND4
  const n = Number(sendTop)
  const batch = batchRanks.length
  const doneInBatch = batchRanks.filter((r) => verdicts[r] === 'done').length
  const verifying = batch > 0 && doneInBatch < batch
  const roundDone = round === 4 && batch > 0 && !verifying

  /** Send `ranks` to the verifier. Round 4 lands first, then the Screen word flips, then verdicts return in rank order. */
  function send(requested: number[]) {
    timers.clear()
    const landing = round === 3
    const ranks = landing ? requested : requested.filter((r) => !sent.has(r) || verdicts[r] !== 'done')
    if (!ranks.length) return
    if (landing) {
      setRound(4)
      setLandKey((k) => k + 1)
      setSent(new Set())
      setVerdicts({})
      setSelected(1)
    }
    setBatchRanks((b) => (landing ? ranks : [...b.filter((r) => !ranks.includes(r)), ...ranks]))
    if (landing || roundScreened === null) setRoundScreened(screeningOn)
    const flip = landing ? 6 * 40 + 220 : 0
    timers.after(flip, () => {
      setSent((s) => new Set([...(landing ? [] : s), ...ranks]))
      setVerdicts((v) => ({ ...(landing ? {} : v), ...Object.fromEntries(ranks.map((r) => [r, 'verifying' as Verdict])) }))
    })
    ranks.forEach((r, i) => timers.after(flip + 900 * (i + 1), () => setVerdicts((v) => ({ ...v, [r]: 'done' }))))
  }

  const verifyTop = () => send(screeningOn ? rows.slice(0, n).map((c) => c.rank) : rows.map((c) => c.rank))
  const verifyAll = () => send(rows.map((c) => c.rank))
  /** V on a screened-out row sends just that one, by hand. */
  const sendOne = (rank: number) => {
    if (sent.has(rank)) return
    setSent((s) => new Set([...s, rank]))
    setVerdicts((v) => ({ ...v, [rank]: 'verifying' }))
    setBatchRanks((b) => [...b, rank])
    timers.after(900, () => setVerdicts((v) => ({ ...v, [rank]: 'done' })))
  }

  // ?state=focus: the screened-out #3 holds keyboard focus
  const focusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state === 'focus') focusRef.current?.focus()
  }, [state])

  /* ── Copy that follows the run ─────────────────────────────────────── */
  const allSix = !screeningOn || sent.size === 6
  const screenedRows = roundScreened ?? screeningOn
  const heading = !screeningOn
    ? batch > 0 && screenedRows
      ? 'Screening is off. From the next round, every candidate goes to the exact verifier.'
      : 'Screening is off. Every candidate goes to the exact verifier.'
    : allSix
      ? 'The predictor ranks six candidates. All six go to the exact verifier.'
      : `The predictor ranks six candidates. Only the top ${WORDS[n]} go to the exact verifier.`
  const modeLine =
    state === 'loading'
      ? 'Round 4 · ranking candidates'
      : state === 'offline'
        ? 'GPU off · this round verifies every candidate on the CPU'
        : verifying
          ? `Round ${round} · verifying ${batch === 6 ? 'all 6' : batch === 1 ? 'one by hand' : `the top ${batch}`}`
          : round === 3
            ? 'Round 3 verified · round 4 ranked and waiting'
            : 'Round 4 verified · the engine recommends stopping'
  const actionText =
    round === 3 || state === 'loading'
      ? 'Round 4 has 6 candidates ranked. The top two are block_resynthesis on D04 and routing_search on D01. The predictor picks what to verify first; the engine decides.'
      : verifying
        ? batch === 6
          ? 'All six candidates are with the exact verifier, about 7 s each. Verdicts land in rank order as the engine returns them.'
          : 'Sent the top of the ranking to the exact verifier. Screened-out candidates stay in the record; any of them can be sent by hand.'
        : 'Round 4 is verified. Nothing improved two_qubit_count, so the engine recommends stopping at 33 gates.'

  const primary =
    state === 'loading'
      ? { label: 'Ranking (4 of 6)', onClick: undefined, progress: 0.66 }
      : roundDone
        ? { label: 'Open loop view', onClick: () => navigate(ROUTES.loop, { transition: 'forward' }), progress: undefined }
        : verifying
          ? { label: `Verifying (${doneInBatch} of ${batch})`, onClick: undefined, progress: doneInBatch / batch }
          : { label: screeningOn ? `Verify top ${n}` : 'Verify all 6', onClick: verifyTop, progress: undefined }

  return (
    <Shell
      rail="runs"
      status={state === 'offline' ? <OfflineStatus /> : <StretchStatus />}
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: state !== 'unsupported', onClick: () => state && navigate(ROUTES.screening) },
            {
              id: 'b',
              label: 'sbox_oracle.qasm',
              active: state === 'unsupported',
              // the predictor was not trained on 20-qubit oracles: that tab shows the fallback
              onClick: () => state !== 'unsupported' && (window.location.hash = '#/screening?state=unsupported'),
            },
          ]}
        />
      }
      inspector={
        <>
          <ModeTabs />
          <ModeBlock line={modeLine} />
          <div className="st-action">
            <p className="st-note">{actionText}</p>
            <PrimaryButton onClick={primary.onClick} progress={primary.progress} disabled={state === 'loading'}>
              {primary.label}
            </PrimaryButton>
            <SecondaryPair>
              <EditorButton wide onClick={verifyAll} disabled={verifying || state === 'loading' || sent.size === 6}>
                Verify all 6
              </EditorButton>
              <EditorButton wide onClick={() => setScreening((s) => !s)} disabled={state === 'unsupported' || state === 'offline'}>
                {screening ? 'Turn screening off' : 'Turn screening on'}
              </EditorButton>
            </SecondaryPair>
          </div>
          <InspSection icon={<IconFunnel />} title="Screening">
            <div className="field-row">
              <span className="field-label">Send to verifier</span>
              <SelectField
                label="Send to verifier"
                value={sendTop}
                onChange={setSendTop}
                options={[
                  { value: '1', label: 'top 1' },
                  { value: '2', label: 'top 2' },
                  { value: '3', label: 'top 3' },
                ]}
              />
            </div>
            <div className="field-row">
              <span className="field-label">Spot-check screened out</span>
              <NumberField label="Spot-check screened out" value={spot} unit="per round" min={0} max={4} onChange={setSpot} />
            </div>
            <div className="field-row">
              <span className="field-label">Pause below coverage</span>
              <NumberField label="Pause below coverage" value={coverage} unit="%" min={50} max={95} onChange={setCoverage} />
            </div>
          </InspSection>
          <InspSection icon={<IconGraph />} title="Score predictor" meta="stretch" inset bodyStyle={{ gap: 0 }}>
            <KV
              rows={[
                ['Model', 'graph transformer · QuEst-style'],
                ['Predicts', 'two_qubit_count change'],
                ['Training set', '18,400 verified attempts'],
                ['Mean absolute error', '0.6 gates'],
                ['Interval coverage', state === 'disagree' && !paused ? '62% of 90% target' : '88% of 90% target'],
                ['Last calibrated', paused ? 'just now' : 'after round 2 · 11:02'],
                ['Runs on', state === 'offline' ? 'CPU · GPU is off' : 'GPU · 0.2 s for 6'],
              ]}
            />
            <p className="st-note" style={{ paddingTop: 12 }}>
              Trained on the attempts dataset. It never sees the verifier's answer for the round it ranks.
            </p>
          </InspSection>
          <InspSection icon={<IconHistory />} title="Screening history" meta="3 rounds" defaultOpen={false} bodyStyle={{ gap: 0 }}>
            <KV
              rows={[
                ['Round 1', 'best was #1 · 2 of 6 sent'],
                ['Round 2', 'best was #2 · 2 of 5 sent'],
                ['Round 3', 'best was #1 · 2 of 6 sent'],
              ]}
            />
          </InspSection>
        </>
      }
    >
      <Content>
        <section className="tile s15-candidates" ref={candidatesRef} style={lockHeight ? { height: lockHeight } : undefined}>
          <TileHeader
            tabs={[
              {
                id: 'c',
                label: 'Candidates',
                active: view === 'candidates',
                onClick: () => {
                  setView('candidates')
                  setLockHeight(null)
                },
              },
              {
                id: 'k',
                label: 'Calibration',
                active: view === 'calibration',
                onClick: () => {
                  if (view === 'calibration') return
                  setLockHeight(candidatesRef.current?.offsetHeight ?? null)
                  setView('calibration')
                },
              },
            ]}
            meta={
              <span className="mono">
                {state === 'loading'
                  ? 'round 4 · ranking · 4 of 6 proposals in'
                  : `round ${round} · two_qubit_count ${round === 3 ? 36 : 33} gates · ranked by predicted change`}
              </span>
            }
          />
          {view === 'calibration' ? (
            <CalibrationPanel recalibrated={paused} onRecalibrate={() => setPaused(true)} />
          ) : state === 'disagree' && !paused ? (
            <DisagreeBanner onRecalibrate={() => setPaused(true)} />
          ) : state === 'offline' ? (
            <OfflineBanner />
          ) : (
            <div className="s15-intro">
              <h2 className="s15-heading">{heading}</h2>
              <p className="st-note">
                Predictions come from circuit structure alone, in milliseconds. The engine still verifies, scores and decides every candidate it
                is sent.
              </p>
            </div>
          )}
          {view === 'calibration' ? null : state === 'loading' ? (
            <LoadingPanel />
          ) : state === 'empty' ? (
            <EmptyPanel />
          ) : state === 'unsupported' ? (
            <UnsupportedPanel />
          ) : (
            <div className="s15-table">
              <TableHead />
              <div key={landKey}>
                {rows.map((c, i) => {
                  const verdict = verdicts[c.rank]
                  return (
                    <CandidateRow
                      key={c.rank}
                      c={c}
                      i={i}
                      selected={selected === c.rank}
                      dim={screenedRows && !sent.has(c.rank)}
                      screen={sent.has(c.rank) ? 'sent' : screenedRows ? 'screened-out' : 'not-screened'}
                      verdict={sent.has(c.rank) ? (verdict ?? 'queued') : null}
                      focusRef={state === 'focus' && c.rank === 3 ? focusRef : undefined}
                      focusRing={state === 'focus' && c.rank === 3}
                      onSelect={() => setSelected(c.rank)}
                      onSend={() => sendOne(c.rank)}
                    />
                  )
                })}
              </div>
              <Legend />
            </div>
          )}
        </section>
        <div className="s15-lower">
          <section className="tile s15-calibration">
            <TileHeader tabs={[{ id: 'p', label: 'Predictor against the verifier', active: true }]} meta={<span className="mono">last 40 verified candidates</span>} />
            <div className="s15-calibration-body">
              <Scatter rows={rows} round={round} verdicts={verdicts} />
              <div className="s15-scatter-side">
                <div className="s15-scatter-top">
                  <div className="s15-scatter-legend">
                    <LegendLine icon={<Dot />}>earlier verified candidates</LegendLine>
                    <LegendLine icon={<Diamond />}>{round === 3 ? 'this round, #1 and #2' : 'this round, as verified'}</LegendLine>
                    <LegendLine icon={<DashLine />}>perfect prediction</LegendLine>
                    <LegendLine icon={<span className="s15-band-swatch" />}>within 0.8 gates of perfect</LegendLine>
                  </div>
                  <p className="st-note">Above the dashed line, a fix did worse than predicted.</p>
                </div>
                <ThisRoundTable rows={rows} round={round} verdicts={verdicts} sent={sent} />
              </div>
            </div>
          </section>
          <section className="tile s15-why">
            <TileHeader tabs={[{ id: 'w', label: 'Why screen', active: true }]} meta={<span className="mono">this round</span>} />
            <div className="s15-why-body">
              <div className="s15-cards">
                <StatCard label="Verify all 6" value="41" note="about 7 s per candidate" active={allSix} />
                <StatCard label={`Verify top ${n}`} value={String(n * 7)} note="plus 0.2 s to predict" active={!allSix} />
              </div>
              <KV
                rows={[
                  ['Screened out this round', screenedRows ? `${6 - (sent.size || n)} of 6` : '0 of 6'],
                  ['Best candidate in top 2, last 20 rounds', '17 of 20'],
                  ['Gates missed when it was wrong', '1.3 gates mean'],
                  ['Verifier time saved per run', screeningOn ? 'about 2 min' : 'none, screening is off'],
                ]}
              />
              <p className="st-note">Screened-out candidates stay in the record. Any of them can be sent to the verifier by hand.</p>
            </div>
          </section>
        </div>
      </Content>
    </Shell>
  )
}

/* ── Table ───────────────────────────────────────────────────────────── */

function TableHead() {
  return (
    <div className="s15-row s15-head">
      <span className="s15-c-rank">Rank</span>
      <span className="s15-c-name">Candidate · layer</span>
      <span className="s15-c-plot s15-axis mono">
        <span style={{ left: 12 }}>−5</span>
        <span style={{ left: 158 }}>0</span>
        <span style={{ left: 212 }}>+2</span>
      </span>
      <span className="s15-c-pred">Predicted change</span>
      <span className="s15-c-screen">Screen</span>
      <span className="s15-c-verified s15-head-verified">Verified by the engine</span>
    </div>
  )
}

function CandidateRow({
  c,
  i,
  selected,
  dim,
  screen,
  verdict,
  focusRef,
  focusRing,
  onSelect,
  onSend,
}: {
  c: Candidate
  i: number
  selected: boolean
  dim: boolean
  screen: 'sent' | 'screened-out' | 'not-screened'
  verdict: Verdict | null
  focusRef?: React.Ref<HTMLDivElement>
  focusRing: boolean
  onSelect: () => void
  onSend: () => void
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'v' || e.key === 'V') onSend()
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
    if (e.key === 'ArrowDown') (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus()
    if (e.key === 'ArrowUp') (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus()
  }
  const shown = verdict === 'done'
  return (
    <div
      ref={focusRef}
      className={`s15-row s15-cand st-land${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${focusRing ? ' is-focus' : ''}`}
      style={{ '--i': i } as React.CSSProperties}
      tabIndex={0}
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={onKey}
    >
      <span className="s15-c-rank mono s15-rank">#{c.rank}</span>
      <span className="s15-c-name s15-name">
        <span className="mono s15-strategy">{c.name}</span>
        <span className="s15-layer">
          <span className="s15-dot" style={{ background: LAYER_DOT[c.layer] }} />
          <span className="mono">
            {c.layer} · {c.ref}
          </span>
        </span>
      </span>
      <span className="s15-c-plot">
        <IntervalPlot c={c} i={i} verified={shown && c.verifiedAt != null} />
      </span>
      <span className="s15-c-pred s15-pred">
        <span className="mono s15-pred-value">{fmtGates(c.predicted)}</span>
        <span className="mono s15-pred-range">{fmtRange(c.lo, c.hi)}</span>
      </span>
      <span className="s15-c-screen">
        {screen === 'sent' ? (
          <span className="s15-sent st-swap">
            <GlyphSent />
            sent
          </span>
        ) : (
          <span className="s15-muted">{screen === 'not-screened' ? 'not screened' : 'screened out'}</span>
        )}
      </span>
      <span className="s15-c-verified">
        <span className="s15-verdict">
          {verdict == null ? (
            <span className="s15-verdict-line">
              <span className="s15-not-verified">not verified</span>
            </span>
          ) : verdict === 'done' ? (
            <span className="st-swap" key="done">
              <span className="s15-verdict-line">
                <span className={`s15-word is-${c.verdict.status}`}>
                  {c.verdict.status === 'accepted' ? <GlyphAccepted /> : c.verdict.status === 'rejected' ? <GlyphRejected /> : <GlyphInconclusive />}
                  {c.verdict.status}
                </span>
                <span className="mono s15-verdict-value">{c.verdict.value}</span>
              </span>
              <span className="mono s15-verdict-sub">{c.verdict.sub}</span>
            </span>
          ) : (
            <span className="s15-verdict-line st-swap" key="wait">
              <span className={`s15-word is-${verdict}`}>
                <span className="s15-wait-dot" />
                {verdict === 'verifying' ? 'verifying' : 'queued'}
              </span>
            </span>
          )}
        </span>
      </span>
    </div>
  )
}

/** Interval whiskers draw out from the dot; the verified diamond lands once the engine returns. */
function IntervalPlot({ c, i, verified }: { c: Candidate; i: number; verified: boolean }) {
  const x0 = xOf(c.lo)
  const x1 = xOf(c.hi)
  const dot = xOf(c.predicted)
  const v = c.verifiedAt != null ? xOf(c.verifiedAt) : 0
  return (
    <svg width="220" height="22" viewBox="0 0 220 22" aria-hidden>
      <path d="M152.9 2V20" fill="none" stroke="#496166" strokeDasharray="2 2" />
      <path
        className="s15-whisker"
        style={{ transformOrigin: `${dot}px 11px`, '--i': i } as React.CSSProperties}
        d={`M${x0} 11H${x1}M${x0} 7V15M${x1} 7V15`}
        fill="none"
        stroke="#C2DADF"
        strokeWidth="1.2"
      />
      <circle cx={dot} cy="11" r="3.5" fill="#FFFFFF" />
      {verified && <path className="s15-diamond" d={`M${v} 5l5 6-5 6-5-6z`} fill="#0F1F23" stroke="#FFFFFF" strokeWidth="1.2" />}
    </svg>
  )
}

function Legend() {
  return (
    <div className="s15-legend">
      <span className="s15-legend-item">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="3.5" fill="#FFFFFF" />
        </svg>
        predicted change
      </span>
      <span className="s15-legend-item">
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
          <path d="M1 6H21M1 2V10M21 2V10" fill="none" stroke="#C2DADF" strokeWidth="1.2" />
        </svg>
        90% interval
      </span>
      <span className="s15-legend-item">
        <Diamond />
        verified change, after routing
      </span>
      <span style={{ flex: '1 1 0' }} />
      <span className="mono s15-legend-unit">change in two_qubit_count, gates</span>
    </div>
  )
}

/* ── Calibration scatter (copied from the board; 28 px per gate) ──────── */

const EARLIER =
  'M47.1 246.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M41.5 246.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M61.1 246.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M63.9 218.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M86.3 218.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M77.9 218.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M97.5 218.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M72.3 218.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M103.1 218.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M72.3 190.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M131.1 190.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M91.9 190.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M125.5 190.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M117.1 190.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M86.3 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M170.3 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M133.9 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M142.3 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M119.9 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M125.5 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M147.9 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M153.5 162.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M122.7 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M209.5 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M175.9 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M156.3 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M170.3 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M184.3 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M150.7 134.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M192.7 106.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M206.7 106.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M181.5 106.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M175.9 106.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M198.3 106.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M212.3 106.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M215.1 78.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M231.9 78.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M254.3 50.0a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0'

const sx = (pred: number) => Math.round((198 + 28 * pred) * 10) / 10
const sy = (ver: number) => Math.round((106 - 28 * ver) * 10) / 10

function Scatter({ rows, round, verdicts }: { rows: Candidate[]; round: 3 | 4; verdicts: Record<number, Verdict> }) {
  const marks = useMemo(
    () => rows.filter((c) => c.verifiedAt != null && (round === 3 ? c.rank <= 2 : verdicts[c.rank] === 'done')),
    [rows, round, verdicts],
  )
  return (
    <svg className="s15-scatter" width="292" height="316" viewBox="0 0 292 316" role="img" aria-label="Predicted against verified change, last 40 verified candidates">
      <path d="M30.0 251.6L259.6 22.0L282.0 22.0L282.0 44.4L52.4 274.0L30.0 274.0Z" fill="#2A383D" />
      <path
        d="M30 22.0H282M30 106.0H282M30 190.0H282M30 274.0H282M30.0 22V274M114.0 22V274M198.0 22V274M282.0 22V274"
        fill="none"
        stroke="#0F1F23"
      />
      <path d="M30.0 274.0L282.0 22.0" fill="none" stroke="#667E83" strokeDasharray="3 3" />
      <path d={EARLIER} fill="#C2DADFBF" />
      {marks.map((c) => {
        const x = sx(c.predicted)
        const y = sy(c.verifiedAt!)
        return <path key={`${round}-${c.rank}`} className="s15-diamond" d={`M${x} ${y - 5}l5 5-5 5-5-5z`} fill="#0F1F23" stroke="#FFFFFF" strokeWidth="1.2" />
      })}
      <g fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
        <text x="24" y="25.5" textAnchor="end">
          +3
        </text>
        <text x="24" y="109.5" textAnchor="end">
          0
        </text>
        <text x="24" y="193.5" textAnchor="end">
          −3
        </text>
        <text x="24" y="277.5" textAnchor="end">
          −6
        </text>
        <text x="30.0" y="290" textAnchor="middle">
          −6
        </text>
        <text x="114.0" y="290" textAnchor="middle">
          −3
        </text>
        <text x="198.0" y="290" textAnchor="middle">
          0
        </text>
        <text x="282.0" y="290" textAnchor="middle">
          +3
        </text>
      </g>
      <text x="0" y="10" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        verified change, gates
      </text>
      <text x="156.0" y="314" textAnchor="middle" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        predicted change, gates
      </text>
    </svg>
  )
}

function ThisRoundTable({
  rows,
  round,
  verdicts,
  sent,
}: {
  rows: Candidate[]
  round: 3 | 4
  verdicts: Record<number, Verdict>
  sent: Set<number>
}) {
  const top = rows.slice(0, 2)
  const verifiedText = (c: Candidate) => {
    if (round === 3) return c.verdict.value
    if (!sent.has(c.rank)) return 'not sent'
    if (verdicts[c.rank] !== 'done') return 'verifying'
    return c.verdict.status === 'inconclusive' ? 'timed out' : c.verdict.value
  }
  return (
    <div className="s15-round-table">
      <div className="s15-rt-row s15-rt-head">
        <span className="s15-rt-rank">Rank</span>
        <span className="s15-rt-pred">Predicted</span>
        <span className="s15-rt-ver">Verified</span>
      </div>
      {top.map((c) => (
        <div key={`${round}-${c.rank}`} className="s15-rt-row">
          <span className="s15-rt-rank mono">#{c.rank}</span>
          <span className="s15-rt-pred mono">{fmtGates(c.predicted)}</span>
          <span className="s15-rt-ver mono">{verifiedText(c)}</span>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, note, active }: { label: string; value: string; note: string; active: boolean }) {
  return (
    <div className={`s15-card${active ? ' is-active' : ''}`}>
      <span className="s15-card-label">{label}</span>
      <span className="s15-card-figure">
        <span className="s15-card-number">
          <span className="mono s15-card-value">{value}</span>
          <span className="mono s15-card-unit">s</span>
        </span>
        <span className="s15-card-note">{note}</span>
      </span>
    </div>
  )
}

/* ── States (EI6-0) ──────────────────────────────────────────────────── */

function LoadingPanel() {
  return (
    <div className="s15-panel">
      <div className="s15-panel-head">
        <span className="s15-panel-title">Candidates</span>
        <span className="mono s15-panel-meta">4 of 6 proposals in</span>
      </div>
      <div className="s15-progress">
        <span style={{ width: '66%' }} />
      </div>
      <div className="s15-layers mono">
        <span className="is-done">✓ reference-qiskit</span>
        <span className="is-running">● local</span>
        <span className="is-pending">○ hf</span>
        <span style={{ flex: '1 1 0' }} />
        <span className="s15-panel-meta">about 9 s left</span>
      </div>
      <p className="st-note">Ranking starts when every layer has answered or timed out. Nothing is verified yet.</p>
    </div>
  )
}

function EmptyPanel() {
  return (
    <div className="s15-panel" style={{ gap: 8 }}>
      <span className="s15-panel-title">One candidate this round</span>
      <p className="st-note">Only reference-qiskit answered for D04. With one candidate there is nothing to rank; it goes straight to the verifier.</p>
      <div className="s15-one">
        <span className="mono s15-strategy">block_resynthesis</span>
        <span className="mono s15-panel-meta">reference-qiskit · D04#1</span>
        <span style={{ flex: '1 1 0' }} />
        <span className="s15-sent">
          <GlyphSent />
          sent
        </span>
      </div>
    </div>
  )
}

function UnsupportedPanel() {
  return (
    <div className="s15-panel" style={{ gap: 8 }}>
      <div className="s15-panel-line">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" />
          <path d="M4 10l6-6" fill="none" stroke="#C2DADF" strokeWidth="1.4" />
        </svg>
        <span className="s15-word-strong" style={{ color: 'var(--color-text-secondary)' }}>
          unsupported
        </span>
        <span className="s15-panel-text">The predictor was not trained on 20-qubit oracles</span>
      </div>
      <p className="st-note">
        sbox_oracle is outside its training range, so its rank would mean little. Every candidate goes to the verifier in proposal order, as without
        screening.
      </p>
      <span className="mono s15-panel-meta" style={{ height: 24, display: 'flex', alignItems: 'center' }}>
        trained range 4 to 16 q · sbox_oracle 20 q
      </span>
    </div>
  )
}

function DisagreeBanner({ onRecalibrate }: { onRecalibrate: () => void }) {
  return (
    <div className="s15-intro s15-banner" role="alert">
      <div className="s15-panel-line">
        <GlyphWarning size={14} />
        <span className="s15-word-strong" style={{ color: 'var(--color-signal-warn)' }}>
          warning
        </span>
        <span className="s15-panel-text">Interval missed 3 times in 5 rounds</span>
        <span style={{ flex: '1 1 0' }} />
        <span className="mono s15-panel-meta">Q610</span>
        <EditorButton onClick={onRecalibrate} style={{ marginBlock: -4 }}>
          Recalibrate
        </EditorButton>
      </div>
      <p className="st-note">Coverage fell to 62% against a 90% target. Screening is paused, so every candidate goes to the verifier until the predictor is recalibrated.</p>
    </div>
  )
}

function OfflineBanner() {
  return (
    <div className="s15-intro s15-banner" role="status">
      <div className="s15-panel-line">
        <span className="s15-offline-dot-box">
          <span className="s15-offline-dot" />
        </span>
        <span className="s15-word-strong" style={{ color: 'var(--color-text-secondary)' }}>
          offline
        </span>
        <span className="s15-panel-text">GPU machine is off, GPU jobs will wait</span>
      </div>
      <p className="st-note">The predictor runs on the GPU, so this round verifies every candidate on the CPU instead.</p>
    </div>
  )
}

function OfflineStatus() {
  return (
    <>
      <GpuStatus online={false} />
      <span className="mono">job 7f3a·0412</span>
      <span className="mono stretch-marker">stretch</span>
    </>
  )
}

/* ── Small marks ─────────────────────────────────────────────────────── */

function LegendLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="s15-legend-line">
      <span className="s15-legend-icon">{icon}</span>
      <span>{children}</span>
    </span>
  )
}
function Dot() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden>
      <circle cx="3" cy="3" r="2.5" fill="#C2DADFBF" />
    </svg>
  )
}
function Diamond() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 1l5 5-5 5-5-5z" fill="#0F1F23" stroke="#FFFFFF" strokeWidth="1.2" />
    </svg>
  )
}
function DashLine() {
  return (
    <svg width="20" height="2" viewBox="0 0 20 2" aria-hidden>
      <path d="M0 1H20" stroke="#667E83" strokeDasharray="3 3" />
    </svg>
  )
}
function IconFunnel() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4h12l-4.5 5.5V14l-3 1.5V9.5z" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
function IconGraph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M4 4m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0M14 4m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0M9 14m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0M5.5 5.2l2.6 7.1M12.5 5.2l-2.6 7.1M5.8 4h6.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.3"
      />
    </svg>
  )
}
