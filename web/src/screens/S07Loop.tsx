/*
 * S-07 · Loop view and stop (C2/C4). Every round in its lane, the count stepping down, and the
 * engine's stop recommendation (M5). Live: round 4 reveals, the playhead glides to the stop column,
 * then the recommendation card slides in with its words already set.
 * States (?state=): running, paused, stalled, budget-hit, stopped-by-the-user, worse-than-before,
 * keyboard-focus, offline. The default is "stopped by the engine".
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions, useRun } from '../data/run'
import { ATTEMPTS, REGRESSION_MESSAGE, STOP_RECOMMENDATION } from '../data/demo'
import { Content, GpuStatus, Shell } from '../ui/Shell'
import { EditorButton, ModeTabs, PrimaryButton } from '../ui/parts'
import { AutoSwitch, Cell, ISection, Icons, Row, Rows, RunTabs, Word } from './improve/common'
import { RoundsTimeline, type BlockStatus } from './improve/RoundsTimeline'
import './improve/improve.css'
import './improve/loop.css'

const STATES = ['running', 'paused', 'stalled', 'budget-hit', 'stopped-by-the-user', 'worse-than-before', 'keyboard-focus', 'offline'] as const
type StateName = (typeof STATES)[number]

const FINAL = Object.fromEntries(ATTEMPTS.map((a) => [a.n, a.final])) as Record<number, BlockStatus>
const ROUND3_RUNNING: Record<number, BlockStatus> = { ...FINAL, 5: 'verifying', 6: 'proposed', 7: 'queued', 8: 'queued' }

type Mode = 'stopped' | 'running3' | 'running4' | 'paused' | 'user-stopped' | 'added'

export function S07Loop() {
  const run = useRun()
  const params = useHashParams()
  const state = (STATES as readonly string[]).includes(params.get('state') ?? '') ? (params.get('state') as StateName) : null
  const live = run.live && !state

  // Where the run is.
  let mode: Mode = 'stopped'
  let status: Record<number, BlockStatus> = FINAL
  if (state === 'running') {
    mode = 'running3'
    status = ROUND3_RUNNING
  } else if (state === 'paused') {
    mode = 'paused'
    status = { ...FINAL, 7: 'queued', 8: 'queued' }
  } else if (state === 'stopped-by-the-user') {
    mode = 'user-stopped'
    status = { ...FINAL, 5: 'cancelled', 6: 'cancelled', 7: 'hidden', 8: 'hidden' }
  } else if (state === 'worse-than-before') {
    status = { ...FINAL, 8: 'worse' }
  } else if (live) {
    status = { ...FINAL, ...(Object.fromEntries(Object.entries(run.attempts).filter(([n]) => Number(n) >= 7)) as Record<number, BlockStatus>) }
    mode = run.stopCard ? 'stopped' : run.phase === 'stopped' ? 'added' : 'running4'
  }

  // Transport: Play steps one round per 1.2 s through the recorded rounds.
  const [replay, setReplay] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setReplay((r) => {
        const next = (r ?? 0) + 1
        if (next >= 4) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 1200)
    return () => window.clearInterval(timer.current)
  }, [playing])

  const roundOf = (n: number) => ATTEMPTS.find((a) => a.n === n)!.round
  const shown: Record<number, BlockStatus> =
    replay == null ? status : Object.fromEntries(ATTEMPTS.map((a) => [a.n, roundOf(a.n) <= replay ? FINAL[a.n] : 'hidden']))

  const stopped = replay == null && (mode === 'stopped' || mode === 'added' || state === 'stalled' || state === 'budget-hit')
  let stepThrough = 4
  let playheadX = 808
  if (replay != null) {
    stepThrough = replay
    playheadX = 152 + replay * 164
  } else if (mode === 'running3') {
    stepThrough = 2
    playheadX = 480
  } else if (mode === 'user-stopped') {
    stepThrough = 2
    playheadX = 480
  } else if (mode === 'paused') {
    stepThrough = 3
    playheadX = 644
  } else if (mode === 'running4') {
    stepThrough = 3
    playheadX = 644
  }

  const [focusN, setFocusN] = useState<number | null>(state === 'keyboard-focus' ? 5 : null)
  const order = ATTEMPTS.map((a) => a.n)
  const onTimelineKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const i = order.indexOf(focusN ?? order[0])
      const next = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]
      setFocusN(next)
      const el = document.querySelectorAll<SVGGElement>('.tl-block')[order.indexOf(next)]
      el?.focus()
    }
  }

  const meta =
    replay != null
      ? `replay · round ${replay} of 4`
      : state === 'offline'
        ? 'auto mode · GPU offline, local · granite-8b waits'
        : mode === 'running3'
          ? 'auto mode · round 3 of 4 running'
          : mode === 'running4'
            ? 'auto mode · round 4 of 4 running'
            : mode === 'paused'
              ? 'auto mode · paused after round 3'
              : mode === 'user-stopped'
                ? 'stopped by you in round 3'
                : mode === 'added'
                  ? 'auto mode · round 5 added'
                  : 'auto mode · stopped by the engine after round 4'

  const atEnd = replay == null
  return (
    <Shell
      rail="runs"
      tabs={<RunTabs />}
      status={
        <>
          <GpuStatus online={state !== 'offline'} />
          <span className="mono topbar-job">job 7f3a·0412</span>
        </>
      }
      inspector={<Inspector mode={mode} state={state} live={live} attempts={status} />}
    >
      <Content>
        <section className="tile lp-rounds" style={{ viewTransitionName: 'circuit-canvas' }}>
          <div className="tile-header">
            <div className="tile-tabs">
              <button className="tile-tab is-active" role="tab" aria-selected>
                Rounds
              </button>
              <span className="lp-header-meta mono" key={meta}>
                {meta}
              </span>
            </div>
            <div className="lp-controls">
              <div className="lp-transport">
                <TransportButton label="First round" onClick={() => (setPlaying(false), setReplay(1))}>
                  <path d="M4 3.5v9M12 3.5v9L6 8z" strokeLinecap="round" strokeLinejoin="round" />
                </TransportButton>
                <TransportButton label="Previous round" onClick={() => (setPlaying(false), setReplay((r) => Math.max(1, (r ?? 4) - 1)))}>
                  <path d="M8 3.5v9L2.5 8zM14 3.5v9L8.5 8z" strokeLinejoin="round" />
                </TransportButton>
                <TransportButton
                  label={playing ? 'Pause replay' : 'Play rounds'}
                  bright
                  onClick={() => {
                    if (playing) return setPlaying(false)
                    setReplay((r) => (r == null || r >= 4 ? 1 : r))
                    setPlaying(true)
                  }}
                >
                  {playing ? <path d="M5.5 3.5v9M10.5 3.5v9" strokeLinecap="round" /> : <path d="M5 3.5v9l7-4.5z" strokeLinejoin="round" />}
                </TransportButton>
                <TransportButton
                  label="Next round"
                  disabled={atEnd}
                  onClick={() => (setPlaying(false), setReplay((r) => (r == null || r + 1 >= 4 ? null : r + 1)))}
                >
                  <path d="M2 3.5v9L7.5 8zM8 3.5v9L13.5 8z" strokeLinejoin="round" />
                </TransportButton>
                <TransportButton label="Last round" disabled={atEnd} onClick={() => (setPlaying(false), setReplay(null))}>
                  <path d="M12 3.5v9M4 3.5v9L10 8z" strokeLinecap="round" strokeLinejoin="round" />
                </TransportButton>
              </div>
              <span className="lp-divider" />
              <div className="lp-zoom" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 14 14">
                  <path d="M3 7h8" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span className="lp-zoom-track">
                  <span className="lp-zoom-line" />
                  <span className="lp-zoom-knob" />
                </span>
                <svg width="12" height="12" viewBox="0 0 14 14">
                  <path d="M3 7h8M7 3v8" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
          <div className="lp-timeline" onKeyDown={onTimelineKey}>
            <RoundsTimeline
              status={shown}
              stepThrough={stepThrough}
              playheadX={playheadX}
              stopped={stopped}
              worse={state === 'worse-than-before' && replay == null}
              focusAttempt={focusN}
              onFocusAttempt={setFocusN}
              onOpenAttempt={() => navigate(ROUTES.fixReview, { transition: 'request-fix' })}
            />
          </div>
        </section>

        {state === 'worse-than-before' && (
          <div className="lp-regression" role="status">
            <svg width="14" height="18" viewBox="0 -2 14 18" aria-hidden>
              <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div className="lp-regression-text">
              <div className="lp-regression-title">Attempt #8 made the circuit worse, so the engine kept the current one.</div>
              <div className="lp-regression-body">{REGRESSION_MESSAGE}</div>
            </div>
            <div className="lp-regression-actions">
              <EditorButton>Open attempt #8</EditorButton>
              <EditorButton>Open an issue</EditorButton>
            </div>
          </div>
        )}

        <Scorecard />
      </Content>
    </Shell>
  )
}

function TransportButton({
  label,
  children,
  onClick,
  disabled,
  bright,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  bright?: boolean
}) {
  return (
    <button className="lp-tbtn" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={bright ? '#FFFFFF' : '#C2DADF'} strokeWidth="1.4">
        {children}
      </svg>
    </button>
  )
}

/* ── Scorecard ────────────────────────────────────────────────────────── */

const SEED_FINAL: [number, number][] = [
  [11, 33],
  [23, 34],
  [37, 33],
  [41, 35],
  [53, 33],
  [67, 34],
  [79, 35],
  [97, 33],
]

function Scorecard() {
  const [tab, setTab] = useState<'scorecard' | 'seeds'>('scorecard')
  return (
    <section className="tile lp-scorecard">
      <div className="tile-header">
        <div className="tile-tabs" role="tablist">
          <button className={`tile-tab${tab === 'scorecard' ? ' is-active' : ''}`} role="tab" aria-selected={tab === 'scorecard'} onClick={() => setTab('scorecard')}>
            Scorecard
          </button>
          <button className={`tile-tab${tab === 'seeds' ? ' is-active' : ''}`} role="tab" aria-selected={tab === 'seeds'} onClick={() => setTab('seeds')}>
            Seeds
          </button>
        </div>
        <div className="tile-meta mono">
          {tab === 'scorecard' ? 're-diagnosed after round 3 · 2 open, both below threshold' : 'two_qubit_count per seed · after round 3'}
        </div>
      </div>
      {tab === 'scorecard' ? (
        <div className="lp-sc-body im-fade-in" key="sc">
          <div className="im-rows">
            <div className="lp-sc-head">
              <Cell w={56}>id</Cell>
              <Cell>finding</Cell>
              <Cell w={64} end>
                now
              </Cell>
              <Cell w={64} />
              <Cell w={80} end>
                at start
              </Cell>
              <Cell w={80} end>
                limit
              </Cell>
              <Cell w={128} end>
                status
              </Cell>
            </div>
            <Row>
              <Cell w={56} className="mono im-secondary">
                D01
              </Cell>
              <Cell>routing_overhead</Cell>
              <Cell w={64} end className="mono">
                0.29
              </Cell>
              <Cell w={64} className="mono im-secondary" style={{ paddingLeft: 8 }}>
                ratio
              </Cell>
              <Cell w={80} end className="mono im-secondary">
                0.41
              </Cell>
              <Cell w={80} end className="mono im-secondary">
                0.30
              </Cell>
              <Cell w={128} end>
                <Word kind="info">info</Word>
              </Cell>
            </Row>
            <Row className="lp-resolved">
              <Cell w={56} className="mono">
                D03
              </Cell>
              <Cell>commuting block</Cell>
              <Cell w={64} end className="mono">
                0
              </Cell>
              <Cell w={64} className="mono" style={{ paddingLeft: 8 }}>
                2q ops
              </Cell>
              <Cell w={80} end className="mono">
                6
              </Cell>
              <Cell w={80} end />
              <Cell w={128} end>
                <Word kind="check-muted">resolved in R3</Word>
              </Cell>
            </Row>
            <Row>
              <Cell w={56} className="mono im-secondary">
                D04
              </Cell>
              <Cell>resynthesis_potential</Cell>
              <Cell w={64} end className="mono">
                2
              </Cell>
              <Cell w={64} className="mono im-secondary" style={{ paddingLeft: 8 }}>
                gates
              </Cell>
              <Cell w={80} end className="mono im-secondary">
                4
              </Cell>
              <Cell w={80} end className="mono im-secondary">
                3
              </Cell>
              <Cell w={128} end>
                <Word kind="info">info</Word>
              </Cell>
            </Row>
          </div>
          <p className="im-secondary">What changed: D03 left the list in round 3. D01 dropped from high to info. Nothing new appeared.</p>
        </div>
      ) : (
        <div className="lp-sc-body im-fade-in" key="seeds">
          <div className="lp-seeds">
            {SEED_FINAL.map(([seed, n]) => (
              <div className="lp-seed" key={seed}>
                <span className="mono im-tertiary">seed {seed}</span>
                <span className="mono lp-seed-n">
                  {n}
                  <span className="im-secondary"> gates</span>
                </span>
                {n === 33 ? <Word kind="check">best</Word> : <span className="mono im-tertiary">+{n - 33}</span>}
              </div>
            ))}
          </div>
          <p className="im-secondary">The report keeps the best of 8 seeds. Four seeds land on 33 two-qubit gates.</p>
        </div>
      )}
    </section>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */

type Card = { chip: ReactNode; title: string; right: string; detail: ReactNode }

function Inspector({ mode, state, live, attempts }: { mode: Mode; state: StateName | null; live: boolean; attempts: Record<number, BlockStatus> }) {
  const [paused, setPaused] = useState(false)
  const [auto, setAuto] = useState(true)
  const effective: Mode = live && mode === 'running4' && paused ? 'paused' : mode

  const counts = { accepted: 0, rejected: 0, inconclusive: 0 }
  Object.values(attempts).forEach((s) => {
    if (s === 'accepted' || s === 'rejected' || s === 'inconclusive') counts[s]++
  })
  const roundDone = !['verifying', 'queued', 'proposed'].includes(String(attempts[7])) && !['verifying', 'queued', 'proposed'].includes(String(attempts[8]))
  const fired = effective === 'stopped' || state === 'stalled' || state === 'budget-hit'
  const wall =
    effective === 'running4' || effective === 'paused'
      ? live
        ? '460 of 900'
        : '416 of 900'
      : effective === 'running3' || effective === 'user-stopped'
        ? '400 of 900'
        : state === 'budget-hit'
          ? '900 of 900'
          : '490 of 900'
  const inRound3 = effective === 'running3' || effective === 'user-stopped' || (effective === 'paused' && !live)
  const best = effective === 'running3' || effective === 'user-stopped' ? 36 : 33

  let card: Card | null = null
  let primary: ReactNode = null
  let pair: [ReactNode, ReactNode] = [null, null]
  let caption = ''
  let line = 'Runs on this machine · auto mode · 4 of 4 rounds'

  const exportFinal = (
    <PrimaryButton onClick={() => actions.exportFinal()} name="primary-action">
      Export final
    </PrimaryButton>
  )
  const openReport = (
    <EditorButton wide onClick={() => navigate(ROUTES.report, { transition: 'export-final' })}>
      Open report
    </EditorButton>
  )

  if (state === 'stalled') {
    card = {
      chip: <StateChip tint="var(--color-signal-warn)" icon={<path d="M1 5h8" stroke="#FF986E" strokeWidth="1.6" strokeLinecap="round" />} label="stalled" />,
      title: 'Stopped after round 5',
      right: 'stop rule · no gain',
      detail: (
        <MiniRows
          rows={[
            ['R4', '2 attempts · 1 rejected, 1 inconclusive', '33 gates'],
            ['R5', '2 attempts · 2 rejected', '33 gates'],
          ]}
        />
      ),
    }
    primary = exportFinal
    pair = [<EditorButton wide key="c">Continue anyway</EditorButton>, openReport]
    caption = 'The engine keeps 33 gates. Another round is unlikely to help.'
    line = 'Runs on this machine · auto mode · 5 of 5 rounds'
  } else if (state === 'budget-hit') {
    card = {
      chip: (
        <StateChip
          tint="var(--color-signal-warn)"
          icon={
            <>
              <circle cx="5" cy="5" r="3.8" fill="none" stroke="#FF986E" strokeWidth="1.3" />
              <path d="M5 3v2.2l1.4 1" fill="none" stroke="#FF986E" strokeWidth="1.3" strokeLinecap="round" />
            </>
          }
          label="budget hit"
        />
      ),
      title: 'Stopped in round 7',
      right: '900 of 900 s',
      detail: (
        <MiniRows
          rows={[
            ['#13', 'block_resynthesis, cancelled', 'not scored', true],
            ['best', 'last verified circuit, kept', '44 → 31 gates'],
          ]}
        />
      ),
    }
    primary = exportFinal
    pair = [<EditorButton wide key="a">Add 300 s</EditorButton>, openReport]
    caption = 'Adding time restarts round 7 from the kept circuit.'
    line = 'Runs on this machine · auto mode · 7 rounds'
  } else if (effective === 'user-stopped') {
    card = {
      chip: <StateChip tint="var(--color-text-primary)" icon={<rect x="2" y="2" width="6" height="6" rx="1" fill="#FFFFFF" />} label="stopped by you" />,
      title: 'Stopped in round 3',
      right: '400 of 900 s',
      detail: (
        <MiniRows
          rows={[
            ['#6', 'commuting_reorder, cancelled', 'not scored', true],
            ['best', 'last verified circuit, kept', '44 → 36 gates'],
          ]}
        />
      ),
    }
    primary = exportFinal
    pair = [<EditorButton wide key="r">Resume</EditorButton>, openReport]
    caption = 'Resume starts round 3 again from 36 gates.'
    line = 'Runs on this machine · auto mode · 3 of 4 rounds'
  } else if (effective === 'running3' || effective === 'running4' || effective === 'added') {
    const r4 = effective !== 'running3'
    card = {
      chip: <StateChip tint="var(--color-signal-info)" icon={<path className="lp-arc" d="M5 1a4 4 0 1 1-4 4" fill="none" stroke="#2EA3F8" strokeWidth="1.5" strokeLinecap="round" />} label="running" />,
      title: effective === 'added' ? 'Round 5 of 5 · added by you' : r4 ? 'Round 4 of 4 · attempts #7 and #8' : 'Round 3 of 4 · attempt #6 on local · granite-8b',
      right: r4 ? '460 of 900 s' : '400 of 900 s',
      detail: (
        <div className="lp-card-detail">
          <span className="mono">{effective === 'added' ? 'routing_search' : r4 ? 'block_resynthesis' : 'commuting_reorder'}</span>
          <span className="im-tertiary">proposed, the engine is verifying on 12 q</span>
        </div>
      ),
    }
    primary = (
      <PrimaryButton onClick={() => setPaused(true)} name="primary-action">
        Pause
      </PrimaryButton>
    )
    pair = [<EditorButton wide key="s">Stop now</EditorButton>, openReport]
    caption = r4
      ? 'Pause lets round 4 finish, then holds. Stop now cancels it and keeps 33 gates.'
      : 'Pause lets attempt #6 finish, then holds. Stop now cancels it and keeps 36 gates.'
    line = `Runs on this machine · auto mode · round ${effective === 'added' ? '5 of 5' : r4 ? '4 of 4' : '3 of 4'}`
  } else if (effective === 'paused') {
    card = {
      chip: <StateChip tint="var(--color-text-secondary)" icon={<path d="M3 2v6M7 2v6" stroke="#C2DADF" strokeWidth="1.6" strokeLinecap="round" />} label="paused" />,
      title: live ? 'Paused after round 4 · 4 of 4' : 'Paused after attempt #6 · round 3 of 4',
      right: '416 of 900 s',
      detail: (
        <div className="lp-card-detail">
          <span className="mono">commuting_reorder</span>
          <Word kind="check">accepted</Word>
          <span className="mono im-secondary">36 → 33 gates</span>
        </div>
      ),
    }
    primary = (
      <PrimaryButton onClick={() => setPaused(false)} name="primary-action">
        Resume
      </PrimaryButton>
    )
    pair = [<EditorButton wide key="e" onClick={() => actions.exportFinal()}>Export what we have</EditorButton>, openReport]
    caption = 'Nothing runs while paused. The best circuit so far is 33 gates.'
  } else {
    primary = exportFinal
    pair = [
      <EditorButton wide key="c" onClick={() => actions.continueAnyway()}>
        Continue anyway
      </EditorButton>,
      openReport,
    ]
    caption = state === 'keyboard-focus' ? 'Left and right move between attempts. Enter opens one in Fix review. Space pauses or resumes auto mode.' : 'Continue anyway adds one round and keeps the budget.'
  }

  const showStop = effective === 'stopped' && card == null

  return (
    <>
      <ModeTabs />
      <div className="im-decision">
        <div className="im-decision-line" key={line}>
          {line}
        </div>
        {state === 'offline' && (
          <div className="lp-offline">
            <span className="lp-offline-dot" />
            GPU machine is offline. local · granite-8b waits; reference-qiskit and the wall clock keep going.
          </div>
        )}
        {/* M5: the stop card slides down 8px and fades in, its words set before it moves. */}
        <div className="lp-stop-slot" data-open={showStop}>
          <div className="lp-stop-inner">
            <div className="im-card lp-stop-card">
              <div className="lp-stop-head">
                {Icons.stop}
                <span className="lp-stop-title">Engine recommendation</span>
                <span className="mono im-tertiary lp-stop-meta">stop rule</span>
              </div>
              <div className="lp-stop-text">{STOP_RECOMMENDATION}</div>
            </div>
          </div>
        </div>
        {card && (
          <div className="im-card lp-state-card im-arrive" key={card.title}>
            <div className="lp-state-head">
              {card.chip}
              <span className="mono im-secondary">{card.right}</span>
            </div>
            <div className="lp-state-title">{card.title}</div>
            {card.detail}
          </div>
        )}
        <div className="im-actions">
          {primary}
          <div className="secondary-pair">
            {pair[0]}
            {pair[1]}
          </div>
          <div className="im-caption" key={caption}>
            {caption}
          </div>
        </div>
      </div>

      <div className="lp-insp-body">
        <ISection icon={Icons.list} title="Run summary" meta="job 7f3a·0412" border={false}>
          <Rows>
            <SumRow label="Rounds" value={inRound3 ? '3 of 4' : state === 'stalled' ? '5 of 5' : state === 'budget-hit' ? '7 of 7' : '4 of 4'} />
            <SumRow label={<Word kind="check" wordColor="var(--color-text-secondary)" gap={6}>accepted</Word>} value={String(counts.accepted)} />
            <SumRow label={<Word kind="cross" wordColor="var(--color-text-secondary)" gap={6}>rejected</Word>} value={String(counts.rejected)} />
            <SumRow
              label={
                <Word kind="inconclusive" wordColor="var(--color-text-secondary)" gap={6}>
                  inconclusive
                </Word>
              }
              value={String(counts.inconclusive)}
            />
            <SumRow label={<span className="mono">two_qubit_count</span>} value={<FromToMono from="44" to={state === 'budget-hit' ? '31' : String(best)} />} unit="gates" />
            <SumRow label="QPU estimate" value={<FromToMono from="$6.72" to={best === 36 ? '$5.60' : '$5.32'} />} unit="per run" />
            <SumRow label="Wall time" value={wall} unit="s" />
          </Rows>
          <div className="lp-auto">
            <AutoSwitch on={auto} onChange={setAuto} />
            <span className="im-primary">Auto mode</span>
            <span className="im-tertiary">{auto ? 'on · never keeps a worse circuit' : 'off · you accept each fix'}</span>
          </div>
        </ISection>

        <ISection icon={Icons.shield} title="Stop rules" meta={`${fired ? 1 : 0} of 4 fired`}>
          <Rows>
            <SumRow
              label="Every finding below its threshold"
              value={
                fired ? (
                  <span className="im-fade-in" style={{ display: 'inline-flex' }}>
                    <Word kind="fired">fired</Word>
                  </span>
                ) : (
                  <span className="im-tertiary">watching</span>
                )
              }
            />
            <SumRow label="Budget runs out" value={wall} unit="s" />
            <SumRow label="No accepted gain in 2 rounds" value={roundDone || !live ? '1 of 2' : '0 of 2'} />
            <SumRow label="Most attempts inconclusive" value={roundDone || !live ? '1 of 2' : '0 of 2'} unit="in R4" />
          </Rows>
        </ISection>
      </div>
    </>
  )
}

function SumRow({ label, value, unit }: { label: ReactNode; value: ReactNode; unit?: string }) {
  return (
    <Row>
      <Cell className="im-label">{label}</Cell>
      <Cell w={104} end className="mono">
        {value}
      </Cell>
      <Cell w={64} className="mono im-secondary" style={{ paddingLeft: 8 }}>
        {unit}
      </Cell>
    </Row>
  )
}

function FromToMono({ from, to }: { from: string; to: string }) {
  return (
    <>
      <span className="im-tertiary">{from} →</span>
      <span key={to} className="im-fade-in">
        {to}
      </span>
    </>
  )
}

function StateChip({ tint, icon, label }: { tint: string; icon: ReactNode; label: string }) {
  return (
    <span className="im-chip" style={{ background: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        {icon}
      </svg>
      <span>{label}</span>
    </span>
  )
}

function MiniRows({ rows }: { rows: [string, string, string, boolean?][] }) {
  return (
    <div className="lp-mini">
      {rows.map(([k, text, v, muted]) => (
        <div className="lp-mini-row" key={k}>
          <span className="mono im-tertiary lp-mini-k">{k}</span>
          <span className="im-secondary lp-mini-text">{text}</span>
          <span className={`mono ${muted ? 'im-tertiary' : 'im-primary'}`}>{v}</span>
        </div>
      ))}
    </div>
  )
}
