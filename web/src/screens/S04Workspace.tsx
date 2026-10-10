/*
 * S-04 · Workspace (B1). The hero screen: circuit, scorecard, QASM and the rounds of the improvement
 * loop, with the findings in the inspector. Live, it plays M1 (the scan), M2 (findings land) and the
 * rounds filling in; deep-linked, it is the Paper snapshot (running round 3 of 4, D03 selected).
 *
 * States (?state=…): empty, scoring, partial, seeds, focus, gpu-off.
 */
import { useState } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { FINDINGS, RUN, SUPPRESSED } from '../data/demo'
import { actions, useRun } from '../data/run'
import { SectionIcons } from '../ui/icons'
import {
  Field,
  FieldRow,
  FindingCard,
  ModeBlock,
  ModeTabs,
  PoweredBy,
  PrimaryButton,
  Section,
  SuppressedRow,
  Switch,
  TileHeader,
  EditorButton,
} from '../ui/parts'
import { Content, GpuStatus, Shell, TabStrip } from '../ui/Shell'
import { SBOX_QASM, SboxCircuit } from './workspace/SboxCircuit'
import { Chevron } from '../ui/icons'
import { Circuit, CircuitAxis } from './workspace/Circuit'
import { Qasm } from './workspace/Qasm'
import { Rounds, Zoom } from './workspace/Rounds'
import { ScorecardEmpty, ScorecardPartial, ScorecardRows, ScorecardScoring, SeedsChart } from './workspace/Scorecard'
import './workspace/workspace.css'

type StateParam = 'empty' | 'scoring' | 'partial' | 'seeds' | 'focus' | 'gpu-off' | null

const CIRCUIT_ZOOMS = [0.8, 0.9, 1, 1.15, 1.3]

/* The partial scorecard belongs to sbox_oracle (run 7f37·a2e4: 118 gates, 4 findings, 2 metrics skipped). */
/* Restoring the suppressed D08 brings it back as an open finding. */
const D08: (typeof FINDINGS)[number] = {
  rank: 4,
  severity: 'info',
  rule: 'D08',
  ruleName: 'measurement_order',
  title: 'Measurement order differs from the register',
  evidence: '12 measures · c[0..11]',
}

const SBOX_FINDINGS: typeof FINDINGS = [
  { rank: 1, severity: 'high', rule: 'D01', ruleName: 'routing_overhead', title: 'Routing dominates the transpiled circuit', evidence: '0.52 ratio ≥ 0.30 · 61 swaps' },
  { rank: 2, severity: 'warning', rule: 'D04', ruleName: 'resynthesis', title: 'Blocks are resynthesizable', evidence: '38 gates removable · 4 S-boxes' },
  { rank: 3, severity: 'warning', rule: 'D05', ruleName: 'linear_block', title: 'Linear block can be rewritten', evidence: '6 cx · q0–q3' },
  { rank: 4, severity: 'info', rule: 'D07', ruleName: 'decoherence', title: 'Ancillas idle for long stretches', evidence: 'q16–q19 · 40% idle' },
]

export function S04Workspace() {
  const run = useRun()
  const params = useHashParams()
  const state = (params.get('state') as StateParam) ?? null

  const [mode, setMode] = useState<'laptop' | 'platform'>('laptop')
  const [circuitTab, setCircuitTab] = useState<'circuit' | 'diff'>('circuit')
  const [scTab, setScTab] = useState<'scorecard' | 'seeds'>(state === 'seeds' ? 'seeds' : 'scorecard')
  const [zoomIdx, setZoomIdx] = useState(2)
  const [auto, setAuto] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(true)
  const [findingsOpen, setFindingsOpen] = useState(true)
  const [sboxRequested, setSboxRequested] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  const empty = state === 'empty'
  const sbox = state === 'partial'
  const frozenScoring = state === 'scoring'
  const scoring = frozenScoring || run.phase === 'scoring'
  const progress = frozenScoring ? 0.62 : run.scoreProgress
  const stage = frozenScoring ? 'measure' : run.scoreStage
  const gpuOff = state === 'gpu-off'
  const seedsTab = scTab === 'seeds' || state === 'seeds'

  const findingsShown = empty || scoring ? 0 : sbox ? 4 : run.phase === 'findings' ? run.findingsShown : 3
  const landing = run.phase === 'findings'
  const started = !empty && !scoring && !sbox && run.phase !== 'findings'
  const attempts = empty || scoring || sbox ? hiddenAll() : run.attempts
  const selected = sbox ? sboxRequested : findingsShown >= 2 ? run.selectedFinding : null

  const regions = {
    accepted: started && attempts[4] === 'accepted',
    D03: findingsShown >= 2,
    D04: findingsShown >= 3,
  }

  /* ── Primary action ─────────────────────────────────────────────────── */
  // While a run is in progress the primary opens the loop view.
  let primary = {
    label: `Running round ${run.round} of 4 (${Math.round(run.loopProgress * 100)}%)`,
    progress: run.loopProgress as number | undefined,
    onClick: (() => navigate(ROUTES.loop, { transition: 'forward' })) as undefined | (() => void),
  }
  if (empty) primary = { label: 'Run engine', progress: undefined, onClick: () => actions.confirmAndScore() }
  else if (sbox)
    primary = { label: `Queued · GPU position 1${sboxRequested ? ` · ${sboxRequested} first` : ''}`, progress: undefined, onClick: undefined }
  else if (scoring) primary = { label: `Scoring (${Math.round(progress * 100)}%)`, progress, onClick: undefined }
  else if (run.phase === 'findings') primary = { label: 'Scoring (100%)', progress: 1, onClick: undefined }
  else if (run.phase === 'stopped' || run.phase === 'report' || run.phase === 'export')
    primary = { label: 'Export final', progress: undefined, onClick: () => actions.exportFinal() }

  const scan = scoring
    ? frozenScoring
      ? { stage: 'measure', mode: 'pass' as const, frozenAt: 0.6 }
      : stage === 'done'
        ? null
        : { stage, mode: stage === 'compile' ? ('first' as const) : ('pass' as const) }
    : null

  const inspector = (
    <>
      <ModeTabs active={mode} onChange={setMode} />
      <ModeBlock
        line={
          mode === 'platform'
            ? 'Runs on the platform queue · GPU worker online'
            : sbox
              ? 'Runs on this machine · CPU, 20 q fits · improve waits for the GPU'
              : 'Runs on this machine · CPU, 12 q fits'
        }
      >
        <PrimaryButton name="primary-action" progress={primary.progress} onClick={primary.onClick}>
          {primary.label}
        </PrimaryButton>
        {empty ? <div className="ws-empty-hint">Findings appear here, ranked</div> : <PoweredBy />}
      </ModeBlock>
      {gpuOff && (
        <div className="ws-notice">
          <div className="ws-notice-row">
            <span className="ws-notice-dot" style={{ background: '#667E83' }} />
            <span>GPU machine is off, GPU jobs will wait</span>
          </div>
          <div className="ws-notice-body">
            reference-qiskit still proposes fixes. The local lane shows "waiting for GPU" and resumes on its own.
          </div>
          <div className="ws-notice-row is-strong">
            <span className="ws-notice-dot" style={{ background: '#FF986E' }} />
            <span>Platform offline · results are kept on this machine and sync later</span>
          </div>
        </div>
      )}
      <Section icon={SectionIcons.clock} title="Budget" open={budgetOpen} onToggle={() => setBudgetOpen((o) => !o)}>
        <FieldRow label="Target">
          <Field value={RUN.target} select />
        </FieldRow>
        <FieldRow label="Seeds">
          <Field value="8" unit="seeds" />
        </FieldRow>
        <FieldRow label="Max rounds">
          <Field value="4" unit="rounds" />
        </FieldRow>
        <FieldRow label="Wall time">
          <Field value="900" unit="s" />
        </FieldRow>
        <FieldRow label="Layers">
          <Field value="reference · local" select />
        </FieldRow>
        <div className="ws-auto">
          <Switch on={auto} onChange={setAuto} label="Auto mode" />
          <span className="ws-auto-label">Auto mode</span>
          <span className="ws-auto-note">{auto ? 'on' : 'off'} · never keeps a worse circuit</span>
        </div>
      </Section>
      <section className="insp-section ws-findings">
        <button className="insp-section-header" aria-expanded={findingsOpen} onClick={() => setFindingsOpen((o) => !o)}>
          {SectionIcons.list}
          <span className="insp-section-title">Findings</span>
          <span className="insp-section-meta">
            {scoring || empty ? (empty ? 'not scored' : 'scoring') : sbox ? '4 open' : restored ? '4 open' : '3 open · 1 suppressed'}
          </span>
          <Chevron open={findingsOpen} />
        </button>
        <div className={`insp-section-collapse${findingsOpen ? '' : ' is-closed'}`} aria-hidden={!findingsOpen}>
          <div className="insp-section-clip">
          <div className="ws-cards">
            {findingsShown === 0 && <div className="ws-cards-empty">Findings appear here, ranked</div>}
            {(sbox ? SBOX_FINDINGS : restored && findingsShown >= 3 ? [...FINDINGS, D08] : FINDINGS).slice(0, findingsShown + (restored ? 1 : 0)).map((f) => {
              const isSel = selected === f.rule
              return (
                <FindingCard
                  key={f.rule}
                  finding={f}
                  selected={isSel}
                  name={isSel ? 'finding-card' : undefined}
                  style={{
                    ...(landing || f.rule === 'D08' ? { animation: 'ws-land var(--motion-base) var(--ease-enter) both' } : {}),
                    ...(state === 'focus' && f.rule === 'D01'
                      ? { outline: '2px solid var(--color-action-primary)', outlineOffset: 2 }
                      : {}),
                  }}
                  onSelect={() => (sbox ? setSboxRequested(f.rule) : actions.selectFinding(f.rule))}
                  onRequest={() => (sbox ? setSboxRequested(f.rule) : actions.requestFix(f.rule))}
                />
              )
            })}
            {findingsShown >= 3 && !sbox && !restored && (
              <div style={landing ? { animation: 'ws-land var(--motion-base) var(--ease-enter) both' } : undefined}>
                <SuppressedRow rule={SUPPRESSED.rule} label={SUPPRESSED.label} onRestore={() => setRestored(true)} />
              </div>
            )}
          </div>
          </div>
        </div>
      </section>
    </>
  )

  return (
    <Shell
      rail="runs"
      status={
        gpuOff ? (
          <>
            <GpuStatus online={false} />
            <span className="mono topbar-job">job {RUN.job}</span>
          </>
        ) : undefined
      }
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: RUN.file, active: !sbox },
            { id: 'b', label: RUN.other, active: sbox },
          ]}
        />
      }
      inspector={inspector}
    >
      <Content>
        <div className="ws-top">
          {/* Circuit */}
          <section className="tile ws-circuit-tile">
            <TileHeader
              tabs={[
                { id: 'circuit', label: 'Circuit', active: circuitTab === 'circuit', onClick: () => setCircuitTab('circuit') },
                { id: 'diff', label: 'Diff', active: circuitTab === 'diff', onClick: () => setCircuitTab('diff') },
              ]}
              meta={<Zoom idx={zoomIdx} count={CIRCUIT_ZOOMS.length} width={44} step={7} onChange={setZoomIdx} />}
            />
            <div className="ws-circuit-body">
              {sbox ? (
                <SboxCircuit />
              ) : circuitTab === 'circuit' ? (
                <>
                  <Circuit
                    regions={empty ? { accepted: false, D03: false, D04: false } : regions}
                    selected={selected}
                    onSelect={(r) => actions.selectFinding(r)}
                    scan={scan}
                    zoom={CIRCUIT_ZOOMS[zoomIdx]}
                  />
                  <CircuitAxis />
                </>
              ) : (
                <div className="ws-diff-empty">
                  <div>Proposal #6 for D03 is waiting in round 3.</div>
                  <div className="mono ws-diff-sub">commuting_reorder · local · granite-8b</div>
                  <EditorButton onClick={() => actions.requestFix('D03')}>Open fix review</EditorButton>
                </div>
              )}
            </div>
          </section>

          {/* Scorecard */}
          <section className="tile ws-score-tile">
            <TileHeader
              tabs={[
                { id: 'scorecard', label: 'Scorecard', active: !seedsTab, onClick: () => setScTab('scorecard') },
                { id: 'seeds', label: 'Seeds', active: seedsTab, onClick: () => setScTab('seeds') },
                { id: 'hardware', label: 'Hardware', onClick: () => navigate(ROUTES.estimate, { transition: 'forward' }) },
              ]}
              meta={seedsTab ? <span className="mono">spread 0.18</span> : 'baseline · best of 8'}
            />
            {empty ? (
              <ScorecardEmpty />
            ) : scoring ? (
              <ScorecardScoring progress={progress} stage={stage} />
            ) : state === 'partial' ? (
              <ScorecardPartial />
            ) : seedsTab ? (
              <SeedsChart />
            ) : (
              <ScorecardRows />
            )}
          </section>

          {/* QASM */}
          <section className="tile ws-qasm-tile">
            <TileHeader tabs={[{ id: 'qasm', label: 'QASM', active: true }]} meta={sbox ? 'OpenQASM 2.0 · 20 q' : 'OpenQASM 2.0 · 12 q'} />
            {sbox ? (
              <div className="qasm">
                {SBOX_QASM.map((text, i) => (
                  <div key={i} className="qasm-line">
                    <span className="qasm-num">{i + 1}</span>
                    <span className={`qasm-code${text.startsWith('//') ? ' is-comment' : ''}`}>{text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Qasm regions={regions.D03 ? ['D03'] : []} selected={selected} />
            )}
          </section>
        </div>

        <Rounds
          attempts={attempts}
          liveRound={run.round}
          started={started}
          selected={selected}
          gpuOff={gpuOff}
          emptyNote={
            sbox
              ? 'Not improved yet · round 1 starts when the GPU frees up'
              : empty
                ? 'Rounds appear here once the engine has scored the circuit'
                : scoring
                  ? 'Round 1 starts when scoring finishes'
                  : undefined
          }
        />
      </Content>
    </Shell>
  )
}

function hiddenAll() {
  return Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, 'hidden'])) as ReturnType<typeof useRun>['attempts']
}
