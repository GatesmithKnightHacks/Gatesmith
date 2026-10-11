/*
 * S-04 · Workspace, rebuilt to the master DS-06 (MVN-0) and the S-04 board 204G-0: circuit, scorecard,
 * QASM and the rounds of the run, findings in the inspector. Deep-linked it shows the canonical snapshot
 * (run 7f3a·0412, round 3 of 4 at 400 of 900 s, D03 block 2 proposed by the local model and selected);
 * live, it plays the first score (M1), the findings landing (M2) and rounds 1 to 3.
 *
 * States (?state=…), the DS-06 state frames: never-run, loading, scoring, partial, gpu-off, focus.
 * (Older names still open: empty → never-run, seeds → the Seeds tab.)
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { ATTEMPTS, findingById, FINDINGS, GPU_OFF_MESSAGE, metric, RUN, type CanonicalFinding, type FindingId } from '../data/demo'
import { actions, SCORE_STAGES, useRun, type RunState } from '../data/run'
import { SectionIcons } from '../ui/icons'
import { EditorButton, Field, FieldRow, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section } from '../ui/parts'
import { Content, GpuStatus, Shell, TabStrip } from '../ui/Shell'
import { Sk } from '../ui/Skeleton'
import { Spinner, SpinnerRing } from '../ui/Spinner'
import { Chevron } from '../ui/icons'
import { Circuit } from './workspace/Circuit'
import { FindingPlaceholders, FindingSkeletons, NotEvaluatedRow, WsFindingCard, type CardView } from './workspace/Findings'
import { MarkIcon } from './workspace/icons'
import { TargetIcon } from './workspace/glyphs'
import { Qasm } from './workspace/Qasm'
import { Rounds, Zoom, type RoundsMode, type Shown } from './workspace/Rounds'
import { ScorecardEmpty, ScorecardLoading, ScorecardRows, ScorecardScoring, SeedsChart } from './workspace/Scorecard'
import { baselineScoreRows, lineMarks } from './workspace/data'
import './workspace/workspace.css'

type StateParam = 'never-run' | 'loading' | 'scoring' | 'partial' | 'gpu-off' | 'focus' | 'seeds'

const CIRCUIT_ZOOM = [0.8, 0.9, 1, 1.15, 1.3]
const CIRCUIT_ZOOM_POS = [0, 16, 32, 52, 72]

function readState(raw: string | null): StateParam | null {
  if (raw === 'empty') return 'never-run'
  const known: StateParam[] = ['never-run', 'loading', 'scoring', 'partial', 'gpu-off', 'focus', 'seeds']
  return known.includes(raw as StateParam) ? (raw as StateParam) : null
}

/** The frozen scoring frame: measure running at 62%, about 40 s left. */
const SCORING_FRAME = { progress: 0.62, stage: 'measure' as const }

export function S04Workspace() {
  const run = useRun()
  const state = readState(useHashParams().get('state'))

  const [mode, setMode] = useState<'laptop' | 'platform'>('laptop')
  const [circuitTab, setCircuitTab] = useState<'circuit' | 'diff'>('circuit')
  const [scTab, setScTab] = useState<'scorecard' | 'seeds'>(state === 'seeds' ? 'seeds' : 'scorecard')
  const [zoomIdx, setZoomIdx] = useState(2)
  const [targetOpen, setTargetOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [findingsOpen, setFindingsOpen] = useState(true)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [auto, setAuto] = useState<boolean>(RUN.autoMode)

  /* ── Which frame are we in ─────────────────────────────────────────── */
  const neverRun = state === 'never-run'
  const loading = state === 'loading'
  const frozenScoring = state === 'scoring'
  const scoring = frozenScoring || (!state && run.phase === 'scoring')
  const partial = state === 'partial'
  const gpuOff = state === 'gpu-off'
  const before = neverRun || loading || scoring // nothing scored on screen yet
  const scoreStage = frozenScoring ? SCORING_FRAME.stage : run.scoreStage
  const scoreProgress = frozenScoring ? SCORING_FRAME.progress : run.scoreProgress

  // The frames show the canonical snapshot; without a frame the run store drives the screen.
  const live = !state || state === 'seeds'
  const attempts: Record<number, Shown> = before ? hiddenAll() : live ? run.attempts : snapshotAttempts()
  const findingsShown = before ? 0 : live ? (run.phase === 'findings' ? run.findingsShown : 4) : 4
  const landing = live && run.phase === 'findings'
  const elapsed = before ? 0 : live ? run.elapsed : RUN.snapshotAt
  const round = live ? run.round : 3
  const twoQubit = live ? run.twoQubit : 281
  const selected = before ? null : live ? run.selectedFinding : 'D03-2'
  const roundsStarted = Object.values(attempts).some((s) => s !== 'hidden')
  const runningLoop = live ? run.phase === 'looping' || run.phase === 'review' : true
  const stopped = live && (run.phase === 'stopped' || run.phase === 'report' || run.phase === 'export')

  const block1 = attempts[4] === 'accepted' ? 'accepted' : 'open'
  const block2 = attempts[6] === 'accepted' ? 'accepted' : attempts[6] === 'proposed' ? 'proposed' : 'open'
  const afterR2 = attempts[4] === 'accepted'

  const select = (id: string) => {
    setHighlight(null)
    actions.selectFinding(id)
  }

  /* ── The one mint ──────────────────────────────────────────────────── */
  const pct = Math.round((elapsed / RUN.wallBudget) * 100)
  let primary: { label: string; progress?: number; onClick?: () => void; disabled?: boolean } = {
    label: `Run engine (${pct}%)`,
    progress: elapsed / RUN.wallBudget,
    onClick: () => navigate(ROUTES.loop, { transition: 'forward' }),
  }
  if (neverRun) primary = { label: 'Run engine', onClick: () => actions.confirmAndScore() }
  else if (loading) primary = { label: 'Open run', disabled: true }
  else if (scoring) primary = { label: `Scoring (${Math.round(scoreProgress * 100)}%)`, progress: scoreProgress }
  else if (landing) primary = { label: 'Scoring (100%)', progress: 1 }
  else if (stopped) primary = { label: 'Export final', onClick: () => actions.exportFinal() }

  const modeLine =
    mode === 'platform'
      ? 'Runs on the platform queue · GPU worker online'
      : neverRun || loading
        ? 'Runs on this machine · CPU'
        : scoring || landing
          ? 'Runs on this machine · CPU · first score'
          : `Runs on this machine · CPU · round ${round} of ${RUN.maxRounds} · ${Math.round(elapsed)} of ${RUN.wallBudget} s`

  /* ── Findings: what each card says at this point of the run ────────── */
  const cardView = (f: CanonicalFinding): CardView => {
    const baseline = !roundsStarted
    const inRound4 = (n: number) => attempts[n] === 'queued' || attempts[n] === 'verifying'
    switch (f.id) {
      case 'D01':
        return {
          kind: 'open',
          evidence: afterR2 ? f.evidenceAt400 : f.evidence,
          action: !baseline && inRound4(7) ? 'View in round 4' : 'Request fix',
          onAction: () => (inRound4(7) ? (select('D01'), setHighlight(7)) : actions.requestFix('D01')),
        }
      case 'D03-1':
        return block1 === 'accepted'
          ? { kind: 'accepted', round: 2, delta: f.delta ?? -17, onAction: () => (select('D03-1'), setCircuitTab('diff')) }
          : { kind: 'open', evidence: shortEvidence(f), action: 'Request fix', onAction: () => actions.requestFix('D03-1') }
      case 'D03-2':
        if (block2 === 'accepted') return { kind: 'accepted', round: 3, delta: f.delta ?? -11, onAction: () => (select('D03-2'), setCircuitTab('diff')) }
        if (block2 === 'proposed' && selected === 'D03-2')
          return {
            kind: 'proposal',
            evidence: f.evidenceAt400,
            attempt: 6,
            round: 3,
            layer: 'local',
            decision: 'proposed',
            step: 2,
            ladder: [
              { label: 'allowed', state: 'passed' },
              { label: 'equivalent', state: 'running' },
              { label: 're-scored', state: 'queued' },
              { label: 'decided', state: 'queued' },
            ],
            onAction: () => actions.requestFix('D03-2'),
          }
        return {
          kind: 'open',
          evidence: shortEvidence(f),
          action: block2 === 'proposed' ? 'Review proposal' : 'Request fix',
          onAction: () => actions.requestFix('D03-2'),
        }
      case 'D04':
      default:
        return {
          kind: 'open',
          evidence: f.evidenceAt400,
          action: !baseline && inRound4(8) ? 'View in round 4' : 'Request fix',
          onAction: () => (inRound4(8) ? (select('D04'), setHighlight(8)) : actions.requestFix('D04')),
        }
    }
  }
  const open = FINDINGS.filter((f) => !(f.id === 'D03-1' && block1 === 'accepted') && !(f.id === 'D03-2' && block2 === 'accepted')).length
  const accepted = 4 - open
  const findingsMeta = neverRun
    ? 'Findings appear after the first score'
    : scoring
      ? 'Findings appear after diagnose'
      : `${open} open${accepted ? ` · ${accepted} accepted` : ''} · by severity`

  /* ── Inspector ─────────────────────────────────────────────────────── */
  const inspector = (
    <>
      <ModeTabs active={mode} onChange={setMode} />
      <ModeBlock line={modeLine}>
        <PrimaryButton name="primary-action" progress={primary.progress} onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </PrimaryButton>
        {loading && (
          <Spinner
            className="ws-stage-line"
            stage={
              <>
                Loading run <span className="mono ws-stage-id">{RUN.job}</span> from your account ·
              </>
            }
            estimate="about 2 s"
          />
        )}
        <PoweredBy />
        {scoring && <StageList stage={scoreStage} />}
      </ModeBlock>
      <Section icon={<TargetIcon />} title="Target" meta={`${RUN.target} · ${RUN.targetQubits} q · ${RUN.basis}`} open={targetOpen} onToggle={() => setTargetOpen((o) => !o)}>
        <FieldRow label="Backend">
          <Field value={RUN.target} select />
        </FieldRow>
        <FieldRow label="Qubits">
          <Field value={String(RUN.targetQubits)} unit="q" />
        </FieldRow>
        <FieldRow label="Basis">
          <Field value={RUN.basis} />
        </FieldRow>
        <FieldRow label="Optimization level">
          <Field value={String(RUN.optimizationLevel)} />
        </FieldRow>
      </Section>
      <Section icon={SectionIcons.clock} title="Budget" meta={`${RUN.seeds.length} seeds · ${RUN.maxRounds} rounds · ${RUN.wallBudget} s`} open={budgetOpen} onToggle={() => setBudgetOpen((o) => !o)}>
        <FieldRow label="Seeds">
          <Field value={String(RUN.seeds.length)} unit="seeds" />
        </FieldRow>
        <FieldRow label="Max rounds">
          <Field value={String(RUN.maxRounds)} unit="rounds" />
        </FieldRow>
        <FieldRow label="Wall time">
          <Field value={String(RUN.wallBudget)} unit="s" />
        </FieldRow>
        <FieldRow label="Layers">
          <Field value="reference-qiskit · local" select />
        </FieldRow>
        <label className="ws-check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span className="ws-check-box" aria-hidden>
            {auto && (
              <svg width="10" height="10" viewBox="0 0 12 12">
                <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="#FFFFFF" strokeWidth="1.68" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span>Auto mode · never keeps a worse circuit</span>
        </label>
      </Section>
      <section className="insp-section ws-findings">
        <button className="insp-section-header" aria-expanded={findingsOpen} onClick={() => setFindingsOpen((o) => !o)}>
          {SectionIcons.list}
          <span className="insp-section-title">Findings</span>
          {loading ? (
            <span className="ws-findings-meta">
              <Sk w={124} h={12} />
            </span>
          ) : (
            <span className={`ws-findings-meta${before ? ' is-words' : ''}`}>{findingsMeta}</span>
          )}
          <Chevron open={findingsOpen} />
        </button>
        {findingsOpen &&
          (loading ? (
            <FindingSkeletons />
          ) : scoring ? (
            <FindingPlaceholders />
          ) : neverRun ? null : (
            <div className="ws-cards">
              {FINDINGS.slice(0, findingsShown).map((f) => {
                const isSel = selected === f.id
                return (
                  <WsFindingCard
                    key={f.id}
                    f={f}
                    view={cardView(f)}
                    selected={isSel}
                    focus={state === 'focus' && f.id === 'D01'}
                    name={isSel ? 'finding-card' : undefined}
                    style={landing ? { animation: 'motion-fade-in var(--motion-tile) var(--ease-motion) both' } : undefined}
                    onSelect={() => select(f.id)}
                  />
                )
              })}
              {findingsShown >= 4 && <NotEvaluatedRow />}
            </div>
          ))}
      </section>
    </>
  )

  /* ── Main column ───────────────────────────────────────────────────── */
  const roundsMode: RoundsMode = neverRun ? 'empty' : loading ? 'loading' : scoring || landing ? 'scoring' : 'live'
  const seedsTab = scTab === 'seeds'
  const scoreMeta = neverRun ? (
    'not scored yet'
  ) : loading ? (
    <Sk w={150} h={12} strip />
  ) : scoring ? (
    <span className="ws-wait" style={{ width: 150, height: 12 }} />
  ) : partial ? (
    // D16 says "best of 3 · spread pending"; at mono 11 that runs 6 px past the 350 px tile, and the
    // banner and the seed_spread row already say spread pending.
    'best of 3 · pending'
  ) : afterR2 ? (
    `best of 8 · spread ${metric('seed_spread').afterR2!.toFixed(3)}`
  ) : (
    `best of 8 · spread ${metric('seed_spread').baseline!.toFixed(3)}`
  )

  return (
    <Shell
      rail="runs"
      // The Runs chip counts runs in progress: this one, until the engine stops it (never run: none).
      railBadges={neverRun || loading || stopped ? undefined : { runs: 1 }}
      status={
        neverRun ? (
          <GpuStatus online />
        ) : gpuOff ? (
          <>
            <span className="gpu-status">
              <span className="gpu-dot" style={{ background: 'var(--color-text-disabled)' }} />
              {GPU_OFF_MESSAGE}
            </span>
            <EditorButton
              className="ws-retry"
              loadingLabel="Retrying"
              onClick={() => new Promise((done) => window.setTimeout(done, 1200))}
            >
              Retry
            </EditorButton>
            <span className="mono topbar-job">job {RUN.job}</span>
          </>
        ) : undefined
      }
      tabs={
        <TabsWithBanner
          banner={
            partial ? (
              <div className="ws-banner" role="status">
                <MarkIcon kind="warning" />
                <span className="ws-banner-word">Partial score</span>
                <span className="ws-banner-text">· round 3 re-score · 3 of 8 seeds done · seed_spread pending · about 40 s</span>
              </div>
            ) : null
          }
        >
          <TabStrip
            tabs={[
              { id: 'a', label: RUN.file, active: true },
              { id: 'b', label: RUN.other },
            ]}
          />
        </TabsWithBanner>
      }
      inspector={inspector}
    >
      <Content>
        <div className="ws-top">
          {/* Circuit */}
          <section className="tile ws-circuit-tile" aria-label="Circuit">
            <div className="tile-header">
              <div className="tile-tabs" role="tablist">
                <TileTab label="Circuit" active={circuitTab === 'circuit'} onClick={() => setCircuitTab('circuit')} />
                <TileTab label="Diff" active={circuitTab === 'diff'} onClick={() => setCircuitTab('diff')} />
              </div>
              <div className="ws-tile-meta ws-circuit-meta">
                <Zoom idx={zoomIdx} positions={CIRCUIT_ZOOM_POS} onChange={setZoomIdx} label="Circuit zoom" />
                <span className="ws-circuit-dims">{loading ? <Sk w={104} h={12} strip /> : `${RUN.qubits} q · ${RUN.layers} layers`}</span>
              </div>
            </div>
            <div className="ws-tile-pad">
              <div className="ws-canvas">
                {loading ? (
                  <div className="ws-canvas-loading">
                    <Spinner size={28} stage="Drawing the circuit" estimate="about 2 s" />
                  </div>
                ) : circuitTab === 'diff' ? (
                  <DiffNote selected={selected} block2={block2} onOpen={() => actions.requestFix('D03-2')} onBack={() => setCircuitTab('circuit')} />
                ) : (
                  <Circuit
                    layout={before || landing || !roundsStarted ? 'plain' : 'regions'}
                    block1={block1}
                    block2={block2}
                    selected={selected}
                    onSelect={(id: FindingId) => select(id)}
                    zoom={CIRCUIT_ZOOM[zoomIdx]}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Scorecard */}
          <section className="tile ws-score-tile" aria-label="Scorecard">
            <div className="tile-header">
              <div className="tile-tabs" role="tablist">
                <TileTab label="Scorecard" pad={6} active={!seedsTab} onClick={() => setScTab('scorecard')} />
                <TileTab label="Seeds" pad={6} active={seedsTab} onClick={() => !before && setScTab('seeds')} />
                <TileTab label="Hardware" pad={4} onClick={() => navigate(ROUTES.estimate, { transition: 'forward' })} />
              </div>
              <div className="ws-tile-meta">{scoreMeta}</div>
            </div>
            {neverRun ? (
              <ScorecardEmpty />
            ) : loading ? (
              <ScorecardLoading />
            ) : scoring || landing ? (
              <ScorecardScoring />
            ) : seedsTab ? (
              <SeedsChart />
            ) : afterR2 ? (
              <ScorecardRows partial={partial} />
            ) : (
              <ScorecardRows rows={baselineScoreRows(twoQubit)} />
            )}
          </section>

          {/* QASM */}
          <section className="tile ws-qasm-tile" aria-label="QASM">
            <div className="tile-header">
              <div className="tile-tabs" role="tablist">
                <TileTab label="QASM" active />
              </div>
              <div className="ws-tile-meta">{loading ? <Sk w={150} h={12} strip /> : `OpenQASM 2.0 · ${RUN.qasmLines} lines`}</div>
            </div>
            {loading ? (
              <QasmLoading />
            ) : (
              <Qasm
                marks={
                  before || !roundsStarted
                    ? {}
                    : lineMarks({
                        block1: block1 === 'accepted' ? 'accepted' : 'open',
                        block2: block2 === 'accepted' ? 'accepted' : 'open',
                        selectedLine: selected === 'D03-2' ? 48 : selected === 'D03-1' ? 6 : undefined,
                      })
                }
              />
            )}
          </section>
        </div>

        <Rounds
          key={state ?? 'live'}
          mode={roundsMode}
          attempts={attempts}
          elapsed={elapsed}
          round={round}
          twoQubit={twoQubit}
          running={runningLoop && !stopped}
          gpuOff={gpuOff}
          highlight={highlight}
          onOpenAttempt={(n) => {
            setHighlight(n)
            const a = ATTEMPTS.find((x) => x.n === n)
            if (a?.finding && findingById(a.finding)) actions.selectFinding(a.finding)
          }}
        />
      </Content>
    </Shell>
  )
}

/* ── Local parts ─────────────────────────────────────────────────────── */

/** Beside a button the D03 evidence drops the line range (it is on the QASM rail and the canvas). */
function shortEvidence(f: CanonicalFinding) {
  return f.layers ? `39 2q ops · q0–q11 · layers ${f.layers[0]}–${f.layers[1]}` : f.evidence
}

function TileTab({ label, active, onClick, pad = 10 }: { label: string; active?: boolean; onClick?: () => void; pad?: number }) {
  return (
    <button role="tab" aria-selected={!!active} className={`tile-tab${active ? ' is-active' : ''}`} style={{ paddingInline: pad }} onClick={onClick}>
      {label}
    </button>
  )
}

/** The scoring stages under the mint (DS-06 scoring frame): done · running with the spinner · queued. */
function StageList({ stage }: { stage: RunState['scoreStage'] }) {
  const at = stage === 'done' ? SCORE_STAGES.length : SCORE_STAGES.indexOf(stage)
  return (
    <div className="ws-stages" role="status" aria-label={`Scoring · ${stage}`}>
      {SCORE_STAGES.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'running' : 'queued'
        return (
          <div key={s} className={`ws-stage is-${state}`}>
            <span className="ws-stage-icon">
              {state === 'done' ? (
                <MarkIcon kind="passed" size={12} tone="var(--color-text-secondary)" />
              ) : state === 'running' ? (
                <MarkIcon kind="running" />
              ) : (
                <MarkIcon kind="queued" />
              )}
            </span>
            <span className="ws-stage-name">{s}</span>
            {state === 'running' ? (
              <>
                <span className="ws-stage-word is-running">
                  <SpinnerRing size={14} />
                  running
                </span>
                <span className="ws-grow" />
                <span className="ws-stage-est">{s === 'measure' ? 'about 40 s left' : s === 'diagnose' ? 'about 10 s left' : 'about 20 s left'}</span>
              </>
            ) : (
              <span className="ws-stage-word">{state}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The tab band with an optional banner between the tabs and undo / redo (DS-06 partial frame). */
function TabsWithBanner({ children, banner }: { children: ReactNode; banner: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [left, setLeft] = useState(0)
  useLayoutEffect(() => {
    if (!banner || !ref.current) return
    const tabs = ref.current.querySelector('.tabstrip-tabs, [role="tablist"]') as HTMLElement | null
    const measure = () => setLeft(tabs ? tabs.offsetLeft + tabs.offsetWidth : 320)
    measure()
    const ro = new ResizeObserver(measure)
    if (tabs) ro.observe(tabs)
    return () => ro.disconnect()
  }, [banner])
  return (
    <div className="ws-tabband" ref={ref}>
      {children}
      {banner && (
        <div className="ws-banner-slot" style={{ left }}>
          {banner}
        </div>
      )}
    </div>
  )
}

function DiffNote({ selected, block2, onOpen, onBack }: { selected: string | null; block2: string; onOpen: () => void; onBack: () => void }) {
  const block1 = selected === 'D03-1'
  return (
    <div className="ws-diff-note">
      <span className="ws-diff-title">{block1 ? 'D03 block 1 · accepted in round 2' : block2 === 'proposed' ? 'D03 block 2 · proposal from round 3' : 'D03 block 2'}</span>
      <span className="mono ws-diff-sub">
        {block1 ? 'commutation_aware_routing · local · −17 gates · passed' : `commutation_aware_routing · local · ${RUN.localModel}`}
      </span>
      <span className="ws-diff-actions">
        <EditorButton onClick={onOpen}>{block1 ? 'Open fix review' : 'Review proposal'}</EditorButton>
        <EditorButton onClick={onBack}>Show circuit</EditorButton>
      </span>
    </div>
  )
}

function QasmLoading() {
  const widths = [158, 158, 158, 72, 94, 108, 158, 158, 158, 158, 158, 172, 158, 158, 158, 158, 162, 158]
  return (
    <div className="ws-tile-pad">
      <div className="ws-qasm is-loading" aria-hidden>
        <div className="ws-qasm-rule" />
        {widths.map((w, i) => (
          <div key={i} className="ws-qasm-line">
            <span className="ws-qasm-num" />
            <span className="ws-qasm-code">
              <Sk w={w} h={12} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Attempts as drawn at 400 s: rounds 1–2 decided, R3 reference verifying and local proposed, R4 queued. */
function snapshotAttempts(): Record<number, Shown> {
  return Object.fromEntries(
    ATTEMPTS.map((a) => [a.n, a.round < 3 ? a.final : a.at400?.status ?? 'queued']),
  ) as Record<number, Shown>
}

function hiddenAll(): Record<number, Shown> {
  return Object.fromEntries(ATTEMPTS.map((a) => [a.n, 'hidden'])) as Record<number, Shown>
}
