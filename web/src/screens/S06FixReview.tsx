/*
 * S-06 · Fix review (C1). One proposal, the engine's verdict, and the one decision.
 * Live: the candidate pane goes writing → verifying → verified (M3), then Accept plays M4.
 * States (?state=): verifying, rejected, inconclusive, invalid, worse-than-before, keyboard-focus, offline.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions, useRun } from '../data/run'
import { REGRESSION_MESSAGE } from '../data/demo'
import { Content, GpuStatus, Shell } from '../ui/Shell'
import { EditorButton, ModeTabs, PrimaryButton, Tile } from '../ui/parts'
import { CandidateCircuit, OriginalCircuit, type CandidateLook } from './improve/DiffCircuits'
import {
  Cell,
  Chip,
  DecisionBlock,
  FromTo,
  ISection,
  Icons,
  MarkIcon,
  Row,
  Rows,
  RunTabs,
  Word,
  type Mark,
} from './improve/common'
import './improve/improve.css'
import './improve/fix-review.css'

type Outcome = 'writing' | 'verifying' | 'accepted' | 'rejected' | 'inconclusive' | 'invalid'

const STATES = ['verifying', 'rejected', 'inconclusive', 'invalid', 'worse-than-before', 'keyboard-focus', 'offline'] as const
type StateName = (typeof STATES)[number]

export function S06FixReview() {
  const run = useRun()
  const params = useHashParams()
  const state = (STATES as readonly string[]).includes(params.get('state') ?? '') ? (params.get('state') as StateName) : null

  // What the engine has said so far.
  let outcome: Outcome = 'accepted'
  let ladderStep = 2
  if (state === 'verifying') {
    outcome = 'verifying'
    ladderStep = 1
  } else if (state === 'rejected' || state === 'worse-than-before') outcome = 'rejected'
  else if (state === 'inconclusive') outcome = 'inconclusive'
  else if (state === 'invalid') outcome = 'invalid'
  else if (state === 'offline') {
    outcome = 'writing'
    ladderStep = 0
  } else if (run.live && !state) {
    outcome = run.candidate === 'writing' ? 'writing' : run.candidate === 'verifying' ? 'verifying' : 'accepted'
    ladderStep = run.ladderStep
  }

  const live = run.live && !state
  const userAccepted = live && run.accepted
  // M4: violet dashed until the press; the Paper snapshot shows the accepted region.
  const look: CandidateLook =
    outcome === 'writing' ? 'writing' : outcome === 'accepted' && (!live || userAccepted) ? 'accepted' : 'proposed'

  // A accepts, from anywhere on the screen, once the engine has verified.
  useEffect(() => {
    if (!live || outcome !== 'accepted' || userAccepted) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'a' || e.key === 'A') && !(e.target instanceof HTMLInputElement)) actions.accept()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, outcome, userAccepted])

  const offline = state === 'offline'

  return (
    <Shell
      rail="runs"
      tabs={<RunTabs />}
      status={
        <>
          <GpuStatus online={!offline} />
          <span className="mono topbar-job">job 7f3a·0412</span>
        </>
      }
      inspector={<Inspector outcome={outcome} state={state} userAccepted={userAccepted} />}
    >
      <Content>
        <Tile
          name="finding-card"
          style={{ flexShrink: 0 }}
          tabs={[
            { id: 'circuit', label: 'Circuit', onClick: () => (actions.selectFinding('D03'), navigate(ROUTES.workspace, { transition: 'back' })) },
            { id: 'diff', label: 'Diff', active: true },
          ]}
          meta={<span className="mono">D03 commuting block · q3 to q6 · lines 13 to 18</span>}
          bodyClassName="fr-diff"
          bodyStyle={{ flex: '0 0 auto' }}
        >
          <div className="fr-side">
            <div className="fr-side-head">
              <span className="fr-side-title">Original</span>
              <span className="mono fr-side-meta">6 two-qubit ops</span>
            </div>
            <OriginalCircuit />
          </div>
          <div className="fr-side">
            <div className="fr-side-head">
              <span className="fr-side-title is-ai">Candidate · proposed by local · granite-8b</span>
              <span className="mono fr-side-meta">
                {outcome === 'writing' ? (offline ? 'waiting for the GPU' : 'writing') : outcome === 'invalid' ? 'not parsed' : '4 two-qubit ops'}
              </span>
            </div>
            {offline ? (
              <OfflinePane />
            ) : outcome === 'invalid' ? (
              <InvalidPane />
            ) : (
              <CandidateCircuit look={look} showTag={userAccepted} />
            )}
          </div>
        </Tile>

        {state === 'worse-than-before' && <RegressionBanner />}

        <div className="fr-lower">
          {/* With the regression banner up, the secondary blocks step aside so nothing clips. */}
          <Verification outcome={outcome} ladderStep={ladderStep} compact={state === 'worse-than-before'} />
          <BeforeAfter outcome={outcome} live={live} userAccepted={userAccepted} compact={state === 'worse-than-before'} />
        </div>
      </Content>
    </Shell>
  )
}

/** The regression message asks for a GitHub issue; open a new one on the project. */
const openIssue = () => window.open('https://github.com/GridGxly/Gatesmith/issues/new', '_blank', 'noopener')

/* ── Verification ─────────────────────────────────────────────────────── */

const VERDICT: Record<Outcome, { chip: ReactNode; title: string; evidence: ReactNode; decision: ReactNode; meta: string }> = {
  writing: {
    chip: <Chip tint="var(--color-text-tertiary)" kind="info">waiting</Chip>,
    title: 'Waiting for a candidate',
    evidence: <span className="im-tertiary">nothing to check yet</span>,
    decision: <span className="im-tertiary">after the ladder</span>,
    meta: 'waiting',
  },
  verifying: {
    chip: (
      <Chip tint="var(--color-signal-info)">
        <ArcIcon /> verifying
      </Chip>
    ),
    title: 'Checking the candidate',
    evidence: <span className="im-tertiary">running</span>,
    decision: <span className="im-tertiary">the candidate stays violet and dashed until the engine decides</span>,
    meta: 'running',
  },
  accepted: {
    chip: (
      <Chip tint="var(--color-signal-good)" kind="check">
        passed
      </Chip>
    ),
    title: 'Same job, checked exactly',
    evidence: '‖U − e^iφ·V‖ = 3.1e-15 · φ = 0.0',
    decision: (
      <>
        <Word kind="check">accepted</Word>
        <span className="im-tertiary">primary improved, all constraints hold</span>
      </>
    ),
    meta: '3.4 s',
  },
  rejected: {
    chip: (
      <Chip tint="var(--color-signal-bad)" kind="cross">
        rejected
      </Chip>
    ),
    title: 'Constraint broken',
    evidence: 'two_qubit_depth 27 > 24 layers baseline',
    decision: (
      <>
        <Word kind="cross">rejected</Word>
        <span className="im-tertiary">fewer gates, but a longer chain</span>
      </>
    ),
    meta: '3.4 s',
  },
  inconclusive: {
    chip: (
      <Chip tint="var(--color-signal-warn)" kind="inconclusive">
        inconclusive
      </Chip>
    ),
    title: 'Exact check timed out',
    evidence: 'stopped at 120 s · 2,048 random states agreed',
    decision: (
      <>
        <Word kind="inconclusive">inconclusive</Word>
        <span className="im-tertiary">random-state evidence never changes the status</span>
      </>
    ),
    meta: '120 s',
  },
  invalid: {
    chip: (
      <Chip tint="var(--color-text-secondary)" kind="dash">
        invalid
      </Chip>
    ),
    title: 'The model returned broken QASM',
    evidence: "Q104 · candidate line 17 · unknown gate 'cnotx'",
    decision: (
      <>
        <Word kind="dash" wordColor="var(--color-text-secondary)">
          invalid
        </Word>
        <span className="im-tertiary">nothing was scored</span>
      </>
    ),
    meta: '0.1 s',
  },
}

function ArcIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden className="fr-arc">
      <path d="M7 2.5a4.5 4.5 0 1 1-4.5 4.5" fill="none" stroke="#2EA3F8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

type Step = { label: string; mark: Mark; word: string; muted?: boolean }

function ladder(outcome: Outcome, step: number): { steps: Step[]; meta: string } {
  const label = ['Structure · same qubits, same measurements', 'Operator equivalence · exact', 'Random-state sampling']
  const notNeeded: Step = { label: label[2], mark: 'dash', word: 'not needed', muted: true }
  const queued = (i: number): Step => ({ label: label[i], mark: 'dot-grey', word: 'queued', muted: true })
  const passed = (i: number): Step => ({ label: label[i], mark: 'check', word: 'passed' })
  const running = (i: number): Step => ({ label: label[i], mark: 'dot-blue', word: 'checking' })
  switch (outcome) {
    case 'writing':
      return { steps: [queued(0), queued(1), queued(2)], meta: '0 of 3 run' }
    case 'verifying':
      return {
        steps: [step >= 1 ? passed(0) : running(0), step >= 2 ? passed(1) : step === 1 ? running(1) : queued(1), queued(2)],
        meta: `${step} of 3 run`,
      }
    case 'inconclusive':
      return {
        steps: [passed(0), { label: label[1], mark: 'inconclusive', word: 'timed out' }, { label: label[2], mark: 'check-muted', word: '2,048 agreed' }],
        meta: '3 of 3 run',
      }
    case 'invalid':
      return {
        steps: [0, 1, 2].map((i) => ({ label: label[i], mark: 'dash' as Mark, word: 'not run', muted: true })),
        meta: '0 of 3 run',
      }
    default:
      return { steps: [passed(0), passed(1), notNeeded], meta: '2 of 3 run' }
  }
}

function Verification({ outcome, ladderStep, compact = false }: { outcome: Outcome; ladderStep: number; compact?: boolean }) {
  const v = VERDICT[outcome]
  const { steps, meta } = ladder(outcome, ladderStep)
  return (
    <Tile tabs={[{ id: 'v', label: 'Verification', active: true }]} meta={<span className="mono">{v.meta}</span>} style={{ flex: '1 1 0' }}>
      <div className="fr-body">
        <div className="fr-group fr-group-12">
          <div className="fr-verdict" key={outcome}>
            {v.chip}
            <span className="fr-verdict-title">{v.title}</span>
          </div>
          <Rows>
            <Row>
              <Cell w={110} className="im-label">
                Method
              </Cell>
              <Cell className="mono">operator equivalence ≤ 12 q</Cell>
            </Row>
            <Row>
              <Cell w={110} className="im-label">
                Evidence
              </Cell>
              <Cell className="mono">{v.evidence}</Cell>
            </Row>
            <Row>
              <Cell w={110} className="im-label">
                Scope
              </Cell>
              <Cell className="mono">whole circuit, not only the block</Cell>
            </Row>
            <Row>
              <Cell w={110} className="im-label">
                Decision
              </Cell>
              <Cell style={{ gap: 8 }}>{v.decision}</Cell>
            </Row>
          </Rows>
        </div>

        <div className="fr-group">
          <div className="im-group-title">
            <span>Verification ladder</span>
            <span className="im-group-meta">{meta}</span>
          </div>
          <Rows>
            {steps.map((s, i) => (
              <Row key={i}>
                <Cell w={24} className="mono fr-step-n" style={{ color: s.muted ? 'var(--color-text-disabled)' : undefined }}>
                  {i + 1}
                </Cell>
                <Cell style={{ color: s.muted ? 'var(--color-text-disabled)' : 'var(--color-text-primary)' }}>{s.label}</Cell>
                <Cell w={96} end>
                  <span className="fr-step-word" key={s.word}>
                    <Word kind={s.mark} wordColor={s.muted ? 'var(--color-text-disabled)' : undefined}>
                      {s.word}
                    </Word>
                  </span>
                </Cell>
              </Row>
            ))}
          </Rows>
          <p className="fr-note">Random-state evidence never changes the status. It appears only when an exact check is out of reach.</p>
        </div>

        {!compact && (
        <div className="fr-group">
          <div className="im-group-title">
            <span>Check details</span>
          </div>
          <Rows>
            <Row>
              <Cell w={110} className="im-label">
                Matrix
              </Cell>
              <Cell className="mono">4096 × 4096 · complex128</Cell>
            </Row>
            <Row>
              <Cell w={110} className="im-label">
                Tolerance
              </Cell>
              <Cell className="mono">1e-9</Cell>
            </Row>
            <Row>
              <Cell w={110} className="im-label">
                Ran on
              </Cell>
              <Cell className="mono">this machine · CPU · 3.2 s</Cell>
            </Row>
          </Rows>
        </div>
        )}
      </div>
    </Tile>
  )
}

/* ── Before and after ─────────────────────────────────────────────────── */

/**
 * The count steps 36 → 35 → 34 → 33 when the engine's verdict lands, each step a little longer
 * (motion follows the data). Accept is the celebration: the chip settles with the one overshoot.
 */
function useVerdictCount(stepping: boolean) {
  const [n, setN] = useState(stepping ? 36 : 33)
  useEffect(() => {
    if (!stepping) {
      setN(33)
      return
    }
    setN(36)
    const ids = [
      window.setTimeout(() => setN(35), 140),
      window.setTimeout(() => setN(34), 320),
      window.setTimeout(() => setN(33), 560),
    ]
    return () => ids.forEach(clearTimeout)
  }, [stepping])
  return n
}

function BeforeAfter({
  outcome,
  live,
  userAccepted,
  compact = false,
}: {
  outcome: Outcome
  live: boolean
  userAccepted: boolean
  compact?: boolean
}) {
  const verified = outcome === 'accepted'
  const [stepping] = useState(() => live && !verified)
  const counted = useVerdictCount(stepping && verified)
  const after = live && !verified ? 36 : counted
  const chip = verified && after === 33
  const pending = outcome === 'writing' || outcome === 'verifying' || outcome === 'invalid' || outcome === 'inconclusive'
  const broken = outcome === 'rejected'
  const holds = <Word kind="check-muted">holds</Word>
  return (
    <Tile
      tabs={[{ id: 'ba', label: 'Before and after', active: true }]}
      meta={<span className="mono">best of 8 seeds, both sides</span>}
      style={{ flex: '1 1 0' }}
    >
      <div className={`fr-body${pending ? ' is-pending' : ''}`}>
        <div className="fr-group fr-group-12">
          <div className="fr-hero">
            <span className="mono fr-hero-from">36</span>
            <span className="mono fr-hero-arrow">→</span>
            <span className="mono fr-hero-to" key={after}>
              {after}
            </span>
            <span className="fr-hero-unit">two-qubit gates</span>
            {chip && (
              <span className={`fr-hero-chip mono${userAccepted ? ' is-settle' : ''}`} key={userAccepted ? 'settled' : 'landed'}>
                −8%
              </span>
            )}
          </div>
          <Rows>
            <Row>
              <Cell className="im-label">two_qubit_depth ≤ baseline</Cell>
              <Cell w={112} end className="mono" style={{ color: broken ? 'var(--color-signal-bad)' : undefined }}>
                {broken ? '27 > 24' : '22 ≤ 24'}
              </Cell>
              <Cell w={52} className="mono im-secondary" style={{ paddingLeft: 8 }}>
                layers
              </Cell>
              <Cell w={64} end>
                {broken ? <Word kind="cross">broken</Word> : holds}
              </Cell>
            </Row>
            <Row>
              <Cell className="im-label">reliability_heuristic ≥ baseline</Cell>
              <Cell w={112} end className="mono">
                0.762 ≥ 0.741
              </Cell>
              <Cell w={52} />
              <Cell w={64} end>
                {holds}
              </Cell>
            </Row>
            <Row>
              <Cell className="im-label">width unchanged</Cell>
              <Cell w={112} end className="mono">
                12 = 12
              </Cell>
              <Cell w={52} className="mono im-secondary" style={{ paddingLeft: 8 }}>
                q
              </Cell>
              <Cell w={64} end>
                {holds}
              </Cell>
            </Row>
            <Row>
              <Cell className="im-label">seed_spread ≤ 0.25</Cell>
              <Cell w={112} end className="mono">
                0.14
              </Cell>
              <Cell w={52} className="mono im-secondary" style={{ paddingLeft: 8 }}>
                ratio
              </Cell>
              <Cell w={64} end>
                {holds}
              </Cell>
            </Row>
          </Rows>
        </div>

        <div className="fr-group">
          <div className="im-group-title">
            <span>Also moved</span>
          </div>
          <Rows>
            {(
              [
                ['depth', '54', '51', 'layers', '−3'],
                ['swaps_inserted', '14', '11', 'ops', '−3'],
                ['routing_overhead', '0.36', '0.29', 'ratio', '−0.07'],
              ] as const
            ).map(([label, from, to, unit, d]) => (
              <Row key={label}>
                <Cell className="im-label">{label}</Cell>
                <Cell w={112} end>
                  <FromTo from={from} to={to} />
                </Cell>
                <Cell w={52} className="mono im-secondary" style={{ paddingLeft: 8 }}>
                  {unit}
                </Cell>
                <Cell w={64} end className="mono im-secondary">
                  {d}
                </Cell>
              </Row>
            ))}
          </Rows>
        </div>

        {!compact && (
        <div className="fr-group">
          <div className="im-group-title">
            <span>Every seed improved</span>
            <span className="fr-legend">
              <span className="fr-legend-item">
                <span className="fr-legend-ring" />
                current
              </span>
              <span className="fr-legend-item">
                <span className="fr-legend-dot" />
                candidate
              </span>
            </span>
          </div>
          <SeedChart />
        </div>
        )}
      </div>
    </Tile>
  )
}

const SEEDS: [number, number, number][] = [
  [11, 54, 87],
  [23, 43, 76],
  [37, 54, 87],
  [41, 32, 65],
  [53, 54, 87],
  [67, 43, 76],
  [79, 21, 65],
  [97, 54, 87],
]

function SeedChart() {
  return (
    <svg width="475" height="132" viewBox="0 0 475 132" aria-label="Two-qubit gates per seed, current against candidate">
      <path d="M28 10.5H475M28 54.5H475M28 98.5H475" fill="none" stroke="#354348" strokeDasharray="2 3" />
      {(
        [
          ['40', 13.5],
          ['36', 57.5],
          ['32', 101.5],
        ] as const
      ).map(([t, y]) => (
        <text key={t} x="0" y={y} fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          {t}
        </text>
      ))}
      <text x="0" y="124" fontFamily="JetBrains Mono" fontSize="10" fill="#667E83">
        seed
      </text>
      <path d={SEEDS.map(([, a, b], i) => `M${56 + i * 56} ${a}V${b}`).join('')} fill="none" stroke="#496166" strokeWidth="2" />
      {SEEDS.map(([seed, a, b], i) => {
        const x = 56 + i * 56
        return (
          <g key={seed}>
            <circle cx={x} cy={a} r="3.5" fill="#243237" stroke="#ADC5CA" strokeWidth="1.5" />
            <circle cx={x} cy={b} r="3.5" fill="#5FEEA3" />
            <text x={x} y="124" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
              {seed}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Candidate pane variants ─────────────────────────────────────────── */

function OfflinePane() {
  return (
    <div className="fr-pane-note">
      <span className="fr-offline-dot" />
      <span>GPU machine is offline. This proposal waits and resumes when it is back; reference-qiskit keeps going.</span>
    </div>
  )
}

function InvalidPane() {
  return (
    <div className="fr-pane-note">
      <MarkIcon kind="dash" />
      <span className="mono">Q104 · candidate line 17 · unknown gate 'cnotx'</span>
    </div>
  )
}

function RegressionBanner() {
  return (
    <div className="fr-regression" role="status">
      <svg width="14" height="18" viewBox="0 -2 14 18" aria-hidden>
        <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="fr-regression-text">
        <div className="fr-regression-title">This change made the circuit worse, so the engine kept the current one.</div>
        <div className="fr-regression-body">{REGRESSION_MESSAGE}</div>
      </div>
      <EditorButton onClick={openIssue}>Open an issue</EditorButton>
    </div>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */

function Inspector({
  outcome,
  state,
  userAccepted,
}: {
  outcome: Outcome
  state: StateName | null
  userAccepted: boolean
}) {
  const verified = outcome === 'accepted'
  const kept = outcome === 'rejected' || outcome === 'inconclusive' || outcome === 'invalid'
  // The workspace with D03 selected: its QASM lines 13–18 carry the region rail.
  const openInQasm = () => {
    actions.selectFinding('D03')
    navigate(ROUTES.workspace, { transition: 'back' })
  }

  let primary: ReactNode
  if (verified) {
    primary = (
      <PrimaryButton onClick={!userAccepted ? () => actions.accept() : undefined} name="primary-action">
        {userAccepted ? 'Accepted' : 'Accept'}
      </PrimaryButton>
    )
  } else if (kept) {
    primary = (
      <PrimaryButton onClick={() => actions.keepCurrent()} name="primary-action">
        Keep current
      </PrimaryButton>
    )
  } else {
    const label =
      state === 'offline' ? 'Waiting for the GPU' : outcome === 'verifying' ? 'Verifying (12 q)' : 'Waiting for local · granite-8b'
    primary = (
      <span className="btn-primary im-primary-busy" style={{ height: 40, viewTransitionName: 'primary-action' }} aria-live="polite">
        <span className="btn-primary-label">{label}</span>
      </span>
    )
  }

  const focus = state === 'keyboard-focus'
  const caption = focus
    ? 'Enter keeps the circuit. A accepts.'
    : kept
      ? 'The engine keeps the current circuit.'
      : 'Keep current sends D04, the next finding, to the models.'

  const events = feed(outcome)
  const r6: { mark: Mark; word: string } =
    outcome === 'accepted'
      ? { mark: 'check', word: 'accepted' }
      : outcome === 'rejected'
        ? { mark: 'cross', word: 'rejected' }
        : outcome === 'inconclusive'
          ? { mark: 'inconclusive', word: 'inconclusive' }
          : outcome === 'invalid'
            ? { mark: 'dash', word: 'invalid' }
            : { mark: 'dot-blue', word: 'verifying' }
  const r5done = outcome !== 'writing' && outcome !== 'verifying'
  const checked = (r5done ? 1 : 0) + (r6.word !== 'verifying' ? 1 : 0)

  return (
    <>
      <ModeTabs />
      <DecisionBlock line="Round 3 · proposal #6 from local · granite-8b">
        <div className="im-actions">
          {primary}
          <div className="secondary-pair">
            {kept ? (
              <>
                <EditorButton wide onClick={openInQasm}>Open in QASM</EditorButton>
                <EditorButton wide onClick={openIssue}>Open an issue</EditorButton>
              </>
            ) : (
              <>
                <EditorButton wide onClick={() => actions.keepCurrent()} style={focus ? FOCUS_RING : undefined}>
                  Keep current
                </EditorButton>
                <EditorButton wide onClick={openInQasm}>Open in QASM</EditorButton>
              </>
            )}
          </div>
          <div className="im-caption" key={caption}>
            {caption}
          </div>
        </div>
      </DecisionBlock>

      <div className="fr-insp-body">
        <ISection icon={Icons.chat} title="What happened" meta={`${events.length} event${events.length === 1 ? '' : 's'}`} border={false}>
          <div className="fr-feed">
            {events.map((e) => (
              <div className="fr-event im-arrive" key={e.key}>
                {e.who === 'model' ? (
                  <span className="fr-avatar is-ai mono">8b</span>
                ) : (
                  <span className="fr-avatar">{Icons.engine}</span>
                )}
                <div className="fr-event-body">
                  <div className={`fr-event-head mono${e.who === 'model' ? ' is-ai' : ''}`}>{e.head}</div>
                  <div className="fr-event-text">{e.text}</div>
                </div>
              </div>
            ))}
          </div>
        </ISection>

        <ISection icon={Icons.list} title="Round 3 attempts" meta={`${checked} of 2 checked`}>
          <Rows>
            <Row>
              <Cell w={28} className="mono fr-n">
                #5
              </Cell>
              <Cell style={{ gap: 8 }}>
                <span className="im-dot" style={{ background: 'var(--color-signal-info)' }} />
                <span className="mono">layout_search</span>
              </Cell>
              <Cell w={72} end className="mono im-secondary">
                +1
              </Cell>
              <Cell w={96} end>
                {r5done ? <Word kind="cross">rejected</Word> : <Word kind="dot-blue" gap={6}>verifying</Word>}
              </Cell>
            </Row>
            <Row>
              <Cell w={28} className="mono fr-n">
                #6
              </Cell>
              <Cell style={{ gap: 8 }}>
                <span className="im-dot" style={{ background: 'var(--color-signal-ai)' }} />
                <span className="mono">commuting_reorder</span>
              </Cell>
              <Cell w={72} end className="mono im-secondary">
                −3
              </Cell>
              <Cell w={96} end>
                <span key={r6.word} className="im-fade-in">
                  <Word kind={r6.mark} gap={r6.mark.startsWith('dot') ? 6 : 4} wordColor={r6.mark === 'dash' ? 'var(--color-text-secondary)' : undefined}>
                    {r6.word}
                  </Word>
                </span>
              </Cell>
            </Row>
          </Rows>
        </ISection>

        <ISection icon={Icons.queue} title="Next in queue" meta="round 4">
          <div className="im-card">
            <div className="fr-card-top">
              <span className="mono fr-n">#3</span>
              <Word kind="warning">warning</Word>
              <span style={{ flex: '1 1 0' }} />
              <span className="mono fr-card-rule">D04 resynthesis</span>
            </div>
            <div className="fr-card-title">Block is resynthesizable</div>
            <div className="mono fr-card-rule">4 gates removable · q9–q10</div>
          </div>
        </ISection>

        <ISection icon={Icons.steps} title="Run so far" meta="round 3 of 4">
          <Rows>
            <SoFar r="R1" layer="ref" strategy="routing_search" from="44" to="40" status={<Word kind="check">accepted</Word>} />
            <SoFar r="R2" layer="local" strategy="commuting_reorder" from="40" to="36" status={<Word kind="check">accepted</Word>} />
            <SoFar
              r="R3"
              layer="local"
              strategy="commuting_reorder"
              from="36"
              to={kept ? '36' : '33'}
              status={
                userAccepted ? (
                  <span className="im-fade-in">
                    <Word kind="check">accepted</Word>
                  </span>
                ) : kept ? (
                  <Word kind={r6.mark} wordColor={r6.mark === 'dash' ? 'var(--color-text-secondary)' : undefined}>
                    {r6.word}
                  </Word>
                ) : (
                  <Word kind="dot-yellow" gap={6}>
                    in review
                  </Word>
                )
              }
            />
            <Row>
              <Cell className="im-label">QPU estimate</Cell>
              <Cell w={undefined} style={{ flex: '0 0 auto' }}>
                <FromTo from="$5.60" to={kept ? '$5.60' : '$5.32'} />
              </Cell>
              <Cell w={96} end className="mono im-secondary" style={{ paddingLeft: 8 }}>
                per run
              </Cell>
            </Row>
          </Rows>
        </ISection>
      </div>
    </>
  )
}

const FOCUS_RING = { outline: '2px solid var(--color-action-primary)', outlineOffset: 2 } as const

function SoFar({ r, layer, strategy, from, to, status }: { r: string; layer: 'ref' | 'local'; strategy: string; from: string; to: string; status: ReactNode }) {
  return (
    <Row>
      <Cell w={28} className="mono fr-n">
        {r}
      </Cell>
      <Cell style={{ gap: 8 }}>
        <span className="im-dot" style={{ background: layer === 'ref' ? 'var(--color-signal-info)' : 'var(--color-signal-ai)' }} />
        <span className="mono">{strategy}</span>
      </Cell>
      <Cell w={72} end>
        <FromTo from={from} to={to} />
      </Cell>
      <Cell w={96} end>
        {status}
      </Cell>
    </Row>
  )
}

type Event = { key: string; who: 'model' | 'engine'; head: string; text: string }

function feed(outcome: Outcome): Event[] {
  const proposal: Event = {
    key: 'proposal',
    who: 'model',
    head: 'granite-8b-qiskit · local · proposal',
    text: 'The two CX gates on q4 and q5 only wrap an RZ that commutes past them. I moved the RZ and removed both CX gates.',
  }
  const verifyHead = 'engine · verify · operator equivalence ≤ 12 q'
  switch (outcome) {
    case 'writing':
      return [{ key: 'asked', who: 'model', head: 'granite-8b-qiskit · local · writing', text: 'Asked to fix D03 on lines 13 to 18. No candidate yet.' }]
    case 'verifying':
      return [proposal, { key: 'checking', who: 'engine', head: verifyHead, text: 'Checking. The candidate stays violet and dashed until the engine decides.' }]
    case 'accepted':
      return [
        proposal,
        { key: 'verdict', who: 'engine', head: verifyHead, text: 'Same job, checked exactly. Two-qubit gates 36 to 33 after routing. Every constraint holds. Accepted.' },
      ]
    case 'rejected':
      return [
        proposal,
        {
          key: 'verdict',
          who: 'engine',
          head: 'engine · score · constraints',
          text: 'Fewer gates, but the remaining ones line up in a longer chain. The engine keeps the current circuit.',
        },
      ]
    case 'inconclusive':
      return [
        proposal,
        {
          key: 'verdict',
          who: 'engine',
          head: verifyHead,
          text: 'Timed out at 120 s. 2,048 random states agreed, which never changes the status.',
        },
      ]
    case 'invalid':
      return [
        { key: 'proposal', who: 'model', head: 'granite-8b-qiskit · local · proposal', text: 'Returned a candidate for D03.' },
        { key: 'verdict', who: 'engine', head: 'engine · parse · Q104', text: "Unknown gate 'cnotx' on line 17. Nothing was scored." },
      ]
  }
}
