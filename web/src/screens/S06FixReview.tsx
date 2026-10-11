/*
 * S-06 · Fix review. One proposal for D03 block 2, what the engine checked, and the one decision.
 * Auto mode is off: the engine accepts, nothing is applied until you press Accept.
 * Opens as a second tab beside the file tab ("Fix · D03 block 2"); the file tab is the way back.
 * States (?state=): rejected, inconclusive, invalid, verifying, worse-than-before, loading, empty,
 * offline, keyboard-focus. The default is "accepted by the engine".
 */
import { useEffect, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams, type RoutePath } from '../app/router'
import { actions, useRun } from '../data/run'
import { Content, GpuStatus, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { SectionIcons } from '../ui/icons'
import { FixCanvas, type CandidateLook } from './improve/FixCanvas'
import { BeforeAfterTile, RegressionLanes, VerificationTile } from './improve/FixTiles'
import { ladderFor, type Outcome } from './improve/ladders'
import { Banner, GpuOffBanner } from './improve/Rounds'
import { ActionRow, ErrorBlock, FeedCard, Ladder, StatusLine } from './improve/parts'
import { FOCUS_RING, wordColor } from './improve/style'
import { AttemptsIcon, Mark, Word, ZoomIn, ZoomOut, ZoomSlider, type MarkKind } from './improve/marks'
import { ISSUE_URL, REGRESSION_COPY, RUN_7F3A } from './improve/data'
import './improve/improve.css'
import './improve/fix-review.css'

const STATES = ['rejected', 'inconclusive', 'invalid', 'verifying', 'worse-than-before', 'loading', 'empty', 'offline', 'keyboard-focus', 'focus'] as const
type StateName = (typeof STATES)[number]
type View = StateName | 'accepted'

const goState = (s: StateName | null) => navigate((s ? `${ROUTES.fixReview}?state=${s}` : ROUTES.fixReview) as RoutePath, { replace: true })
const openIssue = () => {
  window.open(ISSUE_URL, '_blank', 'noopener')
}

export function S06FixReview() {
  const run = useRun()
  const params = useHashParams()
  const raw = params.get('state') ?? ''
  const state: View = (STATES as readonly string[]).includes(raw) ? (raw as StateName) : 'accepted'
  const live = run.live && state === 'accepted'

  // The live flow: local writes the candidate, the engine walks the ladder, then the decision lands.
  let view: View = state
  let step = 2
  if (live && run.candidate !== 'verified') {
    view = 'verifying'
    step = run.candidate === 'writing' ? 1 : Math.max(1, run.ladderStep + 1)
  }
  const accepted = live && run.accepted

  const outcome: Outcome =
    view === 'rejected' || view === 'worse-than-before'
      ? 'rejected'
      : view === 'inconclusive' || view === 'invalid' || view === 'verifying' || view === 'loading'
        ? view
        : view === 'offline' || view === 'empty'
          ? 'waiting'
          : 'accepted'
  const look: CandidateLook =
    outcome === 'waiting' ? 'waiting' : outcome === 'verifying' || outcome === 'loading' ? 'proposed' : outcome

  // Enter accepts once the engine has accepted (keyboard-focus shows the ring on Accept).
  useEffect(() => {
    if (outcome !== 'accepted' || accepted) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'a' || e.key === 'A') && !(e.target instanceof HTMLInputElement)) actions.accept()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [outcome, accepted])

  const offline = view === 'offline'
  const worse = view === 'worse-than-before'

  return (
    <Shell
      rail="runs"
      railBadges={{ runs: 1 }}
      tabs={
        <TabStrip
          tabs={[
            { id: 'qaoa', label: RUN_7F3A.file, onClick: () => navigate(ROUTES.workspace, { transition: 'back' }) },
            { id: 'fix', label: 'Fix · D03 block 2', active: true },
          ]}
        />
      }
      status={
        <>
          {offline ? <GpuOffBanner onRetry={() => goState(null)} /> : <GpuStatus online />}
          <span className="mono topbar-job">job {RUN_7F3A.job}</span>
        </>
      }
      inspector={<Inspector view={view} step={step} accepted={accepted} />}
    >
      <Content className={`fr-content${worse ? ' is-worse' : ''}`}>
        {worse && (
          <Banner kind="rejected" word="rejected" tall action={<EditorButton onClick={openIssue}>Open issue</EditorButton>}>
            <div className="mono im-banner-title">two_qubit_depth 184 → 214 layers · original R2 kept</div>
            <div>{REGRESSION_COPY}</div>
          </Banner>
        )}
        <Tile
          name="finding-card"
          className="fr-circuit"
          tabs={[
            { id: 'circuit', label: 'Circuit', onClick: () => (actions.selectFinding('D03'), navigate(ROUTES.workspace, { transition: 'back' })) },
            { id: 'diff', label: 'Diff', active: true },
          ]}
          meta={
            <span className="im-tile-tools">
              <ZoomOut />
              <ZoomSlider knob={32} />
              <ZoomIn />
              <span className="mono im-tile-meta-text">finding #3 · layers 17 to 31</span>
            </span>
          }
          bodyClassName="fr-circuit-body"
        >
          {view === 'empty' ? (
            <div className="fr-canvas is-empty">
              <span>No proposal for finding #3 yet</span>
              <EditorButton onClick={() => actions.requestFix('D03')}>Request fix</EditorButton>
            </div>
          ) : (
            <FixCanvas
              look={look}
              overlay={
                outcome === 'invalid' ? (
                  <CanvasNote kind="invalid" word="invalid" text="QASM parse error (Q101) · candidate line 63, col 24 · request a new candidate" />
                ) : offline ? (
                  <CanvasNote kind="queued" word="queued" text="attempt 6 waits for the GPU machine" />
                ) : undefined
              }
            />
          )}
        </Tile>
        {worse ? (
          <RegressionLanes />
        ) : (
          <div className="fr-lower">
            <VerificationTile outcome={outcome} step={step} attempt={view !== 'empty'} />
            <BeforeAfterTile outcome={outcome} />
          </div>
        )}
      </Content>
    </Shell>
  )
}

function CanvasNote({ kind, word, text }: { kind: MarkKind; word: string; text: string }) {
  return (
    <div className="fr-canvas-note">
      <Word kind={kind}>{word}</Word>
      <span>{text}</span>
    </div>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
const PROPOSAL = {
  role: 'Qiskit/granite-3.3-8b-qiskit',
  text: 'local proposed: route the block on a line layout, 39 rzz, no swaps inside it',
  means: 'the 39 cost gates keep their angles, only their order and the qubit placement change.',
}

type Row = { title: string; review?: boolean; kind: MarkKind; word: string; line: string }

const R1: Row = { title: 'R1 · attempt 2', kind: 'rejected', word: 'rejected', line: 'two_qubit_depth 214 > 202 baseline' }
const R2: Row = { title: 'R2 · attempt 4 · block 1', kind: 'accepted', word: 'accepted', line: '298 → 281 gates · passed' }
const R3: Record<Exclude<View, 'empty'>, Omit<Row, 'title' | 'review'>> = {
  accepted: { kind: 'accepted', word: 'accepted', line: '281 → 270 gates · not applied yet' },
  'keyboard-focus': { kind: 'accepted', word: 'accepted', line: '281 → 270 gates · not applied yet' },
  focus: { kind: 'accepted', word: 'accepted', line: '281 → 270 gates · not applied yet' },
  rejected: { kind: 'rejected', word: 'rejected', line: '281 → 270 gates · two_qubit_depth 214 > 202' },
  'worse-than-before': { kind: 'rejected', word: 'rejected', line: '281 → 270 gates · two_qubit_depth 214 > 202' },
  inconclusive: { kind: 'inconclusive', word: 'inconclusive', line: 'QCEC stopped at the 60 s limit · Q402' },
  invalid: { kind: 'invalid', word: 'invalid', line: 'QASM parse error · line 63 · Q101' },
  verifying: { kind: 'verifying', word: 'verifying', line: 'step 2 of 4 · equivalent' },
  loading: { kind: 'verifying', word: 'verifying', line: 'step 3 of 4 · re-scoring on 8 seeds' },
  offline: { kind: 'queued', word: 'queued', line: 'waits for the GPU machine' },
}

function Inspector({ view, step, accepted }: { view: View; step: number; accepted: boolean }) {
  const focus = view === 'keyboard-focus' || view === 'focus'
  const engineAccepted = view === 'accepted' || focus
  const kept = view === 'rejected' || view === 'worse-than-before' || view === 'inconclusive' || view === 'invalid'
  const requestFix = () => actions.requestFix('D03')
  const keepCurrent = () => actions.keepCurrent()

  /* review block: who said what */
  let feed: ReactNode
  if (view === 'empty') {
    feed = <div className="fr-empty-feed">No proposal for finding #3 yet. Request fix asks local for one; the engine checks it here.</div>
  } else if (view === 'offline') {
    feed = (
      <>
        <div className="fr-gpu-line">
          <span className="fr-gpu-dot" />
          <span>GPU machine is off · model proposals wait</span>
        </div>
        <FeedCard who="local" role={<Word kind="queued" />} at="#3 · attempt 6" look="queued" text="Your fix request waits for the GPU machine. The engine checks run on this laptop." />
      </>
    )
  } else {
    const proposal = <FeedCard who="local" role={PROPOSAL.role} at="386 s" text={PROPOSAL.text} means={PROPOSAL.means} look={engineAccepted ? 'default' : 'proposed'} />
    const verifies = (
      <FeedCard
        who="engine"
        role="reference-qiskit · verifies"
        at="409 s"
        text="engine: allowed and equivalent, operator_equiv on 12 virtual qubits in 3.4 s"
        means="the candidate computes exactly what the current circuit computes."
      />
    )
    if (engineAccepted)
      feed = (
        <>
          {proposal}
          {verifies}
          <FeedCard who="engine" role="re-scored on 8 seeds" at="412 s" text="engine: passed, −11 gates, constraints passed" means="fewer two-qubit gates and nothing else got worse, so it qualifies." />
        </>
      )
    else if (view === 'rejected' || view === 'worse-than-before')
      feed = (
        <>
          {proposal}
          <FeedCard
            who="engine"
            role="re-scored on 8 seeds"
            at="412 s"
            text="engine: rejected · two_qubit_depth 214 > 202 baseline"
            means="fewer gates, but the circuit got deeper than the baseline allows, so it is not kept."
          />
        </>
      )
    else if (view === 'inconclusive')
      feed = (
        <>
          {proposal}
          <FeedCard who="engine" role="reference-qiskit · verifies" at="409 s" text="engine: inconclusive, the exact check ran out of time" means="nothing is claimed either way. The current circuit is untouched." />
          <ErrorBlock kind="inconclusive" word="inconclusive" what="Verification inconclusive" code="Q402" rest="QCEC stopped at the 60 s limit on 12 virtual qubits · request a new candidate" />
        </>
      )
    else if (view === 'invalid')
      feed = (
        <>
          {proposal}
          <FeedCard who="engine" role="reference-qiskit · parses first" at="387 s" text="engine: invalid, the candidate does not parse" means="nothing was checked or scored. The current circuit is untouched." />
          <ErrorBlock kind="invalid" word="invalid" what="QASM parse error" code="Q101" rest="candidate line 63, col 24, ';' missing after rzz(0.7854) q[4],q[5] · request a new candidate" />
        </>
      )
    else if (view === 'loading') feed = <>{proposal}{verifies}</>
    else feed = proposal
  }

  /* decision block: the status line, the one mint, the editor button */
  let decision: ReactNode
  if (engineAccepted) {
    decision = (
      <>
        <StatusLine kind="accepted" text="Engine accepted · not applied until you accept" />
        <PrimaryButton name="primary-action" onClick={accepted ? undefined : () => actions.accept()} style={focus ? FOCUS_RING : undefined}>
          {accepted ? 'Accepted ✓' : 'Accept'}
        </PrimaryButton>
        <ActionRow button="Keep current" onClick={keepCurrent} caption={focus ? 'Enter accepts · Tab moves to Keep current' : 'Accept makes the candidate round 3'} />
      </>
    )
  } else if (kept) {
    const word: [MarkKind, string, string] =
      view === 'inconclusive' ? ['inconclusive', 'inconclusive', ''] : view === 'invalid' ? ['invalid', 'invalid', 'line 63'] : ['rejected', 'rejected', '214 > 202 layers']
    decision = (
      <>
        {view === 'inconclusive' ? (
          <StatusLine kind="inconclusive" word="inconclusive" text="Engine could not decide · original kept" />
        ) : (
          <div className="im-status-line">
            <span className="im-status-text is-sec">Engine decision</span>
            <span className="im-grow" />
            <Word kind={word[0]}>{word[1]}</Word>
            <span className="mono im-status-value">{word[2]}</span>
          </div>
        )}
        <PrimaryButton name="primary-action" onClick={requestFix}>
          Request fix
        </PrimaryButton>
        <ActionRow button="Keep current" onClick={keepCurrent} caption={view === 'rejected' || view === 'worse-than-before' ? 'The original stays as R2' : 'Request fix asks local again'} />
      </>
    )
  } else if (view === 'verifying' || view === 'loading') {
    const s = view === 'loading' ? 3 : step
    decision = (
      <>
        <StatusLine kind="verifying" text={s >= 3 ? 'Verifying · step 3 of 4 · re-scoring on 8 seeds' : `Verifying · step ${s} of 4 · 12 qubits`} />
        <Ladder rungs={ladderFor(view === 'loading' ? 'loading' : 'verifying', s)} />
        <PrimaryButton name="primary-action" disabled>
          Accept
        </PrimaryButton>
        <ActionRow button="Keep current" onClick={keepCurrent} caption="Accept unlocks when the engine decides" />
      </>
    )
  } else if (view === 'offline') {
    decision = (
      <>
        <div className="im-status-line">
          <span className="im-status-text is-sec">Engine decision</span>
          <span className="im-grow" />
          <Word kind="queued" />
          <span className="mono im-status-value">no candidate yet</span>
        </div>
        <ActionRow button="Cancel request" onClick={keepCurrent} caption="Starts when the GPU is online" />
      </>
    )
  } else {
    decision = (
      <>
        <StatusLine kind="queued" text="No candidate yet · nothing to decide" />
        <PrimaryButton name="primary-action" onClick={requestFix}>
          Request fix
        </PrimaryButton>
        <div className="im-action-row">
          <span className="im-caption">local proposes · the engine verifies · you accept</span>
        </div>
      </>
    )
  }

  const rows: Row[] = view === 'empty' ? [R1, R2] : [R1, R2, { title: 'R3 · attempt 6 · block 2', review: true, ...R3[view] }]

  return (
    <>
      <ModeTabs />
      <div className="fr-review">
        <div className="im-mode-line">Runs on this machine · CPU · round 3 of 4 · 412 of 900 s</div>
        <div className="fr-context">
          <span className="fr-context-title">Fix review</span>
          <span className="im-grow" />
          <span className="mono fr-context-meta">{view === 'empty' ? '#3 · D03 block 2 · no attempt yet' : '#3 · D03 block 2 · attempt 6'}</span>
        </div>
        <div className="fr-feed">{feed}</div>
      </div>
      <div className="fr-decision">
        {decision}
        <PoweredBy />
      </div>
      <Section icon={SectionIcons.clock} title="Budget" meta={RUN_7F3A.budget} open={false} onToggle={() => navigate(ROUTES.loop)} />
      <Section icon={<AttemptsIcon />} title="Attempts on D03" meta={`local · ${rows.length} attempts`} bodyClassName="fr-attempts">
        {rows.map((r) => (
          <div key={r.title} className={`fr-attempt${r.review ? ' is-review' : ''}`}>
            <div className="fr-attempt-top">
              <span className="mono">{r.title}</span>
              {r.review && <span className="fr-attempt-review">in review</span>}
              <span className="im-grow" />
              <Mark kind={r.kind} />
              <span className="fr-attempt-word" style={{ color: wordColor(r.kind) }}>
                {r.word}
              </span>
            </div>
            <span className="mono fr-attempt-line">{r.line}</span>
          </div>
        ))}
      </Section>
      <div className="fr-findings">
        <Section icon={SectionIcons.list} title="Findings" meta="3 open · 1 accepted · by severity" open={false} onToggle={() => navigate(ROUTES.workspace, { transition: 'back' })} />
      </div>
    </>
  )
}
