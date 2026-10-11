/*
 * S-07 · Loop view and stop. Every round in its lane, the primary metric stepping down, and the engine's
 * stop recommendation with the one mint, Export final. Auto mode is off: the user accepted R1 to R3.
 * States (?state=): running, paused, stalled, budget-hit, stopped-by-the-user, loading, empty, error,
 * offline, keyboard-focus. The default is "stopped by the engine" at 490 s of 900 s.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams, type RoutePath } from '../app/router'
import { actions, useRun } from '../data/run'
import { Content, GpuStatus, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { SectionIcons } from '../ui/icons'
import { FinalCanvas } from './improve/FinalCanvas'
import { RoundsTile, Banner, GpuOffBanner, type TransportState } from './improve/Rounds'
import { ScorecardTile } from './improve/Scorecard'
import { MOMENTS, type Moment, type MomentData } from './improve/loopData'
import { ActionRow, Block, FindingCard, NotEvaluated, StopCard, type FindingCardData } from './improve/parts'
import { FOCUS_RING } from './improve/style'
import { Word, ZoomIn, ZoomOut, ZoomSlider } from './improve/marks'
import { BUDGET_COPY, RUN_7F3A, STOP_COPY } from './improve/data'
import './improve/improve.css'
import './improve/loop.css'

const STATES = [
  'running',
  'paused',
  'stalled',
  'budget-hit',
  'stopped-by-the-user',
  'loading',
  'empty',
  'error',
  'offline',
  'keyboard-focus',
  'focus',
] as const
type StateName = (typeof STATES)[number]

/** The Runs chip "1" shows while this run is in progress, never once it has stopped. */
const IN_PROGRESS = new Set<string>(['running', 'paused', 'stalled', 'loading', 'error', 'offline'])

const goState = (s: StateName | null) => navigate((s ? `${ROUTES.loop}?state=${s}` : ROUTES.loop) as RoutePath, { replace: true })

const MOMENT_OF: Record<StateName | 'stopped', Moment> = {
  stopped: 'stop',
  running: 'run400',
  paused: 'run400',
  stalled: 'stalled',
  'budget-hit': 'budget',
  'stopped-by-the-user': 'user-stop',
  loading: 'after-r3',
  empty: 'empty',
  error: 'error',
  offline: 'offline',
  'keyboard-focus': 'stop',
  focus: 'stop',
}

export function S07Loop() {
  const run = useRun()
  const params = useHashParams()
  const raw = params.get('state') ?? ''
  const state: StateName | 'stopped' = (STATES as readonly string[]).includes(raw) ? (raw as StateName) : 'stopped'
  const live = run.live && state === 'stopped'
  // The live flow after Accept: the engine re-diagnoses after R3, round 4 runs, then the stop card lands.
  const view: StateName | 'stopped' = live && !run.stopCard && (run.phase === 'looping' || run.phase === 'accepting') ? 'loading' : state
  const m: MomentData = MOMENTS[MOMENT_OF[view]]

  // Transport replay: Play steps one recorded round per 1.2 s, then returns to the stop.
  const [replay, setReplay] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])
  const canReplay = view === 'stopped' || view === 'keyboard-focus' || view === 'focus' || view === 'stalled'
  const play = () => {
    if (!canReplay) return
    window.clearInterval(timer.current)
    setReplay(1)
    timer.current = window.setInterval(() => {
      setReplay((r) => {
        if (r == null || r >= 4) {
          window.clearInterval(timer.current)
          return null
        }
        return r + 1
      })
    }, 1200)
  }
  const shown = replayed(m, replay)

  const transport: TransportState =
    view === 'empty' ? 'empty' : view === 'running' || view === 'offline' || view === 'loading' ? 'running' : replay != null ? 'running' : view === 'paused' ? 'paused' : 'stopped'
  const offline = view === 'offline'
  const [budgetOpen, setBudgetOpen] = useState(false)

  return (
    <Shell
      rail="runs"
      railBadges={IN_PROGRESS.has(view) ? { runs: 1 } : undefined}
      tabs={
        <TabStrip
          tabs={[
            { id: 'qaoa', label: RUN_7F3A.file, active: true },
            { id: 'sbox', label: RUN_7F3A.other },
          ]}
        />
      }
      status={
        <>
          {offline ? <GpuOffBanner onRetry={() => goState(null)} /> : <GpuStatus online />}
          <span className="mono topbar-job">job {RUN_7F3A.job}</span>
        </>
      }
      inspector={
        <Inspector
          view={view}
          budgetOpen={budgetOpen}
          onBudget={() => setBudgetOpen((v) => !v)}
          onContinue={() => setBudgetOpen(true)}
        />
      }
    >
      <Content className="lp-content">
        <div className="lp-top">
          <Tile
            className="lp-circuit"
            tabs={[
              { id: 'circuit', label: 'Circuit', active: true },
              { id: 'diff', label: 'Diff', onClick: () => navigate(ROUTES.fixReview) },
            ]}
            meta={
              <span className="im-tile-tools">
                <ZoomOut />
                <ZoomSlider knob={32} />
                <ZoomIn />
                <span className="mono im-tile-meta-text">{m.circuitMeta}</span>
              </span>
            }
            bodyClassName="lp-circuit-body"
          >
            <FinalCanvas block2={m.block2} label={m.block2Label} />
          </Tile>
          <ScorecardTile data={m.scorecard} />
        </div>
        <RoundsTile
          compact={view === 'error'}
          transport={transport}
          readout={replay != null ? `R${replay} of 4 · replay` : m.readout}
          axis={shown.axis}
          lanes={shown.lanes}
          primary={shown.primary}
          onPlay={play}
          onStart={() => (canReplay ? setReplay(1) : undefined)}
          onRewind={() => (canReplay ? setReplay((r) => Math.max(1, (r ?? 5) - 1)) : undefined)}
          banner={
            view === 'error' ? (
              <Banner kind="failed" word="failed" action={<EditorButton onClick={() => goState('running')}>Retry round</EditorButton>}>
                <span>Transpile failed</span> <span className="mono">(Q301)</span>
                <span> · R3, seed 5 of 8, routing stage · retry the round without seed 5</span>
              </Banner>
            ) : undefined
          }
          empty={view === 'empty' ? <span>No rounds yet. Run engine to start round 1.</span> : undefined}
        />
      </Content>
    </Shell>
  )
}

/** While replaying, only rounds up to `r` show and the needle sits at the end of round r. */
function replayed(m: MomentData, r: number | null): MomentData {
  if (r == null) return m
  const ends = [143, 374, 586, 761]
  const x = ends[r - 1]
  return {
    ...m,
    axis: { ...m.axis, fill: x, needle: { x } },
    lanes: m.lanes.map((l) => ({ ...l, cards: l.cards.filter((c) => c.round <= r), tail: undefined })),
    primary: m.primary && {
      ...m.primary,
      steps: m.primary.steps.slice(0, Math.min(r, 3) + 1),
      end: x,
      tail: undefined,
      pending: undefined,
      legend: m.primary.legend.slice(0, r),
    },
  }
}

/* ── Inspector ───────────────────────────────────────────────────────── */
const mode = (round: string, t: string) => `Runs on this machine · CPU · round ${round} of 4 · ${t} of 900 s`

const F_STOP: FindingCardData[] = [
  { rank: 1, rule: 'D01 · routing_overhead', title: 'Routing-dominated', evidence: '0.421 ≥ 0.30 ratio · after R4', button: 'Request fix' },
  { rank: 4, rule: 'D04 · resynthesis_potential', title: 'Resynthesizable blocks', evidence: '6 gates removable · q25 q26', button: 'Request fix' },
  { rank: 2, rule: 'D03 · structure · block 1', title: 'Commuting block', accepted: 'R2 · −17 gates · passed', button: 'View diff' },
  { rank: 3, rule: 'D03 · structure · block 2', title: 'Commuting block', accepted: 'R3 · −11 gates · passed', button: 'View diff' },
]
const F_RUN: FindingCardData[] = [
  { rank: 1, rule: 'D01 · routing_overhead', title: 'Routing-dominated', evidence: '0.446 ≥ 0.30 ratio · 49 swaps', button: 'View in round 4' },
  { rank: 3, rule: 'D03 · structure · block 2', title: 'Commuting block', evidence: '39 2q ops · layers 17–31', button: 'Review proposal' },
  { rank: 4, rule: 'D04 · resynthesis_potential', title: 'Resynthesizable blocks', evidence: '6 gates removable · q25 q26', button: 'View in round 4' },
  { rank: 2, rule: 'D03 · structure · block 1', title: 'Commuting block', accepted: 'R2 · −17 gates · passed', button: 'View diff' },
]
const F_HELD: FindingCardData[] = [
  { rank: 1, rule: 'D01 · routing_overhead', title: 'Routing-dominated', evidence: '0.446 ≥ 0.30 ratio · 49 swaps', button: 'Request fix' },
  { rank: 3, rule: 'D03 · structure · block 2', title: 'Commuting block', evidence: '39 2q ops · layers 17–31', button: 'Request fix' },
  { rank: 4, rule: 'D04 · resynthesis_potential', title: 'Resynthesizable blocks', evidence: '6 gates removable · q25 q26', button: 'Request fix' },
  { rank: 2, rule: 'D03 · structure · block 1', title: 'Commuting block', accepted: 'R2 · −17 gates · passed', button: 'View diff' },
]
const F_BASE: FindingCardData[] = [
  { rank: 1, rule: 'D01 · routing_overhead', title: 'Routing-dominated', evidence: '0.514 ≥ 0.30 ratio · 65 swaps', button: 'Request fix' },
  { rank: 2, rule: 'D03 · structure · block 1', title: 'Commuting block', evidence: '39 2q ops · layers 1–15', button: 'Request fix' },
  { rank: 3, rule: 'D03 · structure · block 2', title: 'Commuting block', evidence: '39 2q ops · layers 17–31', button: 'Request fix' },
  { rank: 4, rule: 'D04 · resynthesis_potential', title: 'Resynthesizable blocks', evidence: '6 gates removable · q25 q26', button: 'Request fix' },
]

function Inspector({
  view,
  budgetOpen,
  onBudget,
  onContinue,
}: {
  view: StateName | 'stopped'
  budgetOpen: boolean
  onBudget: () => void
  onContinue: () => void
}) {
  const focus = view === 'keyboard-focus' || view === 'focus'
  const exportFinal = (
    <PrimaryButton name="primary-action" onClick={() => actions.exportFinal()} style={focus ? FOCUS_RING : undefined}>
      Export final
    </PrimaryButton>
  )
  const openFix = () => actions.requestFix('D03')
  const viewDiff = () => navigate(ROUTES.fixReview)

  let block: ReactNode
  let findings: FindingCardData[] = F_STOP
  let findingsMeta = '2 open · 2 accepted · by severity'
  let loadingFindings = false

  switch (view) {
    case 'running':
    case 'offline':
      findings = F_RUN
      findingsMeta = '3 open · 1 accepted · by severity'
      block = (
        <RunBlock line={mode('3', '400')}>
          <div className="im-status-row">
            <Word kind="running" />
            <span className="im-grow" />
            <span className="mono im-caption">{view === 'offline' ? 'R3 · engine on CPU' : 'R3 · 400 of 900 s'}</span>
          </div>
          <PrimaryButton name="primary-action" progress={0.44} onClick={() => goState('paused')}>
            Run engine (44%)
          </PrimaryButton>
          <ActionRow
            button="Pause"
            onClick={() => goState('paused')}
            caption={view === 'offline' ? 'R3 · local proposal waits for the GPU' : 'R3 · local proposal verifying'}
            mono
          />
        </RunBlock>
      )
      break
    case 'paused':
      findings = F_RUN
      findingsMeta = '3 open · 1 accepted · by severity'
      block = (
        <RunBlock line={mode('3', '400')}>
          <div className="im-status-row">
            <Word kind="paused">queued</Word>
            <span className="im-grow" />
            <span className="mono im-caption">R3 waits for you</span>
          </div>
          <PrimaryButton name="primary-action" progress={0.44} onClick={() => goState('running')}>
            Resume (44%)
          </PrimaryButton>
          <ActionRow
            button="Stop loop"
            onClick={() => goState('stopped-by-the-user')}
            caption="nothing runs while paused"
            mono
          />
        </RunBlock>
      )
      break
    case 'loading':
      loadingFindings = true
      findingsMeta = 're-diagnosing'
      block = (
        <RunBlock line={mode('3', '381')}>
          <div className="im-status-row">
            <Word kind="running" />
            <span className="im-grow" />
            <span className="mono im-caption">R3 · 381 of 900 s</span>
          </div>
          <PrimaryButton name="primary-action" progress={0.42}>
            Run engine (42%)
          </PrimaryButton>
          <ActionRow button="Pause" caption="re-diagnosing after R3" mono />
        </RunBlock>
      )
      break
    case 'error':
      findings = F_HELD
      findingsMeta = '3 open · 1 accepted · by severity'
      block = (
        <RunBlock line={mode('3', '400')}>
          <div className="im-status-row">
            <Word kind="failed" />
            <span className="im-grow" />
            <span className="mono im-caption">R3 · seed 5 of 8</span>
          </div>
          <PrimaryButton name="primary-action" onClick={() => goState('running')}>
            Retry round
          </PrimaryButton>
          <ActionRow button="Stop loop" caption="R4 waits for retry" mono />
        </RunBlock>
      )
      break
    case 'empty':
      findings = F_BASE
      findingsMeta = '4 open · by severity'
      block = (
        <RunBlock line="Runs on this machine · CPU · round 1 of 4 · 0 of 900 s">
          <div className="im-status-row">
            <Word kind="queued" />
            <span className="im-grow" />
            <span className="mono im-caption">baseline scored · R1 starts on Run engine</span>
          </div>
          <PrimaryButton name="primary-action" onClick={() => goState('running')}>
            Run engine
          </PrimaryButton>
        </RunBlock>
      )
      break
    case 'stalled':
      findings = F_HELD
      findingsMeta = '3 open · 1 accepted · by severity'
      block = (
        <RunBlock line={mode('4', '490')} stop>
          <StopCard
            warn
            kind="warning"
            word="warning"
            who="stalled"
            at="R3, R4 · 490 s"
            title="No gain for two rounds."
            text="R3 and R4 were not accepted. Still 281 gates."
            rows={[
              ['two_qubit_count', '321 → 281 gates · −12.5%'],
              ['accepted', '2 of 8 attempts'],
            ]}
            primary={exportFinal}
            action={<ActionRow button="Continue anyway" onClick={onContinue} caption="410 s of budget left" mono />}
          />
        </RunBlock>
      )
      break
    case 'budget-hit':
      block = (
        <RunBlock line={mode('4', '900')} stop>
          <StopCard
            kind="done"
            word="done"
            who="stopped by the budget"
            at="900 s"
            title="Wall time 900 s reached"
            text={BUDGET_COPY}
            rows={[
              ['two_qubit_count', '321 → 270 gates · −15.9%'],
              ['accepted', '3 of 8 attempts'],
            ]}
            primary={exportFinal}
            action={<ActionRow button="Raise budget" onClick={onContinue} caption="0 s of budget left" mono />}
          />
        </RunBlock>
      )
      break
    case 'stopped-by-the-user':
      findings = F_HELD
      findingsMeta = '3 open · 1 accepted · by severity'
      block = (
        <RunBlock line={mode('3', '400')} stop>
          <StopCard
            kind="cancelled"
            word="cancelled"
            who="stopped by you"
            at="R3 · 400 s"
            title="Stopped at 400 s."
            text="The R3 proposal that was still verifying is discarded. Accepted rounds stay."
            rows={[
              ['two_qubit_count', '321 → 281 gates · −12.5%'],
              ['accepted', '2 of 6 attempts'],
            ]}
            primary={exportFinal}
            action={<ActionRow button="Resume" onClick={() => goState('running')} caption="500 s of budget left" mono />}
          />
        </RunBlock>
      )
      break
    default:
      block = (
        <RunBlock line={mode('4', '490')} stop>
          <StopCard
            kind="done"
            word="done"
            who="stopped by the engine"
            at="R4 · 490 s"
            title="Stop here."
            text={STOP_COPY}
            rows={[
              ['two_qubit_count', '321 → 270 gates · −15.9%'],
              ['accepted', '3 of 8 attempts'],
            ]}
            primary={exportFinal}
            action={<ActionRow button="Continue anyway" onClick={onContinue} caption="410 s of budget left" mono />}
          />
        </RunBlock>
      )
  }

  return (
    <>
      <ModeTabs />
      {block}
      <Section icon={SectionIcons.clock} title="Budget" meta={RUN_7F3A.budget} open={budgetOpen} onToggle={onBudget} bodyClassName="lp-budget-body">
        <div className="lp-budget-row">
          <span>seeds</span>
          <span className="mono">8 · 11 23 37 41 53 67 79 97</span>
        </div>
        <div className="lp-budget-row">
          <span>rounds</span>
          <span className="mono">4 · no round 5 inside this budget</span>
        </div>
        <div className="lp-budget-row">
          <span>wall time</span>
          <span className="mono">900 s</span>
        </div>
        <div className="lp-budget-row">
          <span>auto mode</span>
          <span className="mono">off · you accept each verified fix</span>
        </div>
      </Section>
      <div className="lp-findings">
        <Section icon={SectionIcons.list} title="Findings" meta={findingsMeta} bodyClassName="lp-findings-body">
          {loadingFindings ? (
            <div className="lp-findings-loading" role="status" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="im-finding is-loading">
                  <div className="im-finding-top">
                    <Block w={20} />
                    <Block w={36} />
                    <span className="im-grow" />
                    <Block w={140} />
                  </div>
                  <Block w={150} h={14} />
                  <div className="im-finding-bottom">
                    <Block w={170} />
                    <Block w={76} h={24} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            findings.map((f) => (
              <FindingCard key={f.rank} f={f} onClick={f.button === 'View diff' ? viewDiff : f.rank === 3 ? openFix : undefined} />
            ))
          )}
          <NotEvaluated />
        </Section>
      </div>
    </>
  )
}

function RunBlock({ line, stop = false, children }: { line: string; stop?: boolean; children: ReactNode }) {
  return (
    <div className={`im-run${stop ? ' is-stop' : ''}`}>
      <div className="im-mode-line">{line}</div>
      {children}
      <PoweredBy />
    </div>
  )
}
