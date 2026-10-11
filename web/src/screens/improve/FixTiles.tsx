/*
 * S-06 lower tiles: Verification (the ladder and the facts the engine checked) and Before and after
 * (primary metric, constraints that may not get worse, the changed region, the engine's decision).
 * Plus the lanes crop shown under the regression banner.
 */
import type { ReactNode } from 'react'
import { Tile } from '../../ui/parts'
import { InfoMark, Mark, Spinner, Word, type MarkKind } from './marks'
import { wordColor } from './style'
import { ladderFor, type Outcome } from './ladders'
import { Block, Fact, Ladder } from './parts'
import { AttemptCard, LaneHeader, type CardData } from './Rounds'

export type { Outcome }

/* ── Verification tile ───────────────────────────────────────────────── */
const HEAD: Record<Outcome, { kind: MarkKind; word: string; text: string; time: string }> = {
  accepted: { kind: 'passed', word: 'passed', text: 'the candidate does the same thing as the current circuit', time: '3.4 s' },
  rejected: { kind: 'rejected', word: 'rejected', text: 'equivalent, but two_qubit_depth got worse than the baseline', time: '3.4 s' },
  inconclusive: { kind: 'inconclusive', word: 'inconclusive', text: 'QCEC stopped at the 60 s limit on 12 virtual qubits', time: '60.0 s' },
  invalid: { kind: 'invalid', word: 'invalid', text: 'the candidate does not parse, nothing was checked', time: '0.1 s' },
  verifying: { kind: 'verifying', word: 'verifying', text: 'operator_equiv running on 12 virtual qubits', time: '1.2 s' },
  loading: { kind: 'verifying', word: 'verifying', text: 'equivalent passed, re-scoring the candidate on 8 seeds', time: '3.4 s' },
  waiting: { kind: 'queued', word: 'queued', text: 'no candidate yet, the check runs on this laptop when one arrives', time: '0 s' },
}

export function VerificationTile({ outcome, step = 2, attempt = true }: { outcome: Outcome; step?: number; attempt?: boolean }) {
  const h = HEAD[outcome]
  const ok = <Word kind="ok">ok</Word>
  let facts: ReactNode
  if (outcome === 'invalid') {
    facts = (
      <>
        <Fact label="method" value="parse first, before any check" />
        <Fact label="error" value="line 63, col 24 · ';' missing" status={<Word kind="invalid" />} />
        <Fact label="candidate line" value="rzz(0.7854) q[4],q[5]" />
        <Fact label="time" value="0.1 s" />
        <Fact label="engine" value="qscore-2026.1 · Qiskit 1.3.1" />
        <Fact label="checked at" value="387 s · against R2" last />
      </>
    )
  } else if (outcome === 'waiting') {
    facts = (
      <>
        <Fact label="method" value="operator_equiv on 12 virtual qubits" />
        <Fact label="permitted changes" value="gate order and routing, layers 17–31" />
        <Fact label="runs on" value="this laptop · CPU" />
        <Fact label="engine" value="qscore-2026.1 · Qiskit 1.3.1" last />
      </>
    )
  } else {
    const time = outcome === 'inconclusive' ? '60.0 s of a 60 s limit' : outcome === 'verifying' ? '1.2 s of a 60 s limit' : '3.4 s of a 60 s limit'
    const random =
      outcome === 'inconclusive' ? 'overlap 0.9998 ± 0.0002 · n 32' : outcome === 'verifying' ? 'after the exact check' : 'overlap 0.9999 ± 0.0001 · n 32'
    const checked =
      outcome === 'verifying' ? 'running · seed 37 · against R2' : outcome === 'rejected' ? '412 s · seed 37 · against R2' : '409 s · seed 37 · against R2'
    facts = (
      <>
        <Fact label="method" value="operator_equiv on 12 virtual qubits" />
        <Fact label="permitted changes" value="gate order and routing, layers 17–31" status={ok} />
        <Fact label="measurement map" value="12 of 12 classical bits" status={<Word kind="ok">unchanged</Word>} />
        <Fact label="final permutation" value="q0 to q11 relabelled on the line" status={<Word kind="ok">allowed</Word>} />
        <Fact label="time" value={time} />
        <Fact label="random states" value={random} status={<span className="im-fact-note">{outcome === 'verifying' ? 'waits' : 'supporting'}</span>} />
        <Fact label="engine" value="qscore-2026.1 · Qiskit 1.3.1" />
        <Fact label="checked at" value={checked} last />
      </>
    )
  }
  return (
    <Tile
      tabs={[{ id: 'v', label: 'Verification', active: true }]}
      meta={<span className="mono">{attempt ? 'attempt 6 · R3 · local' : 'R3 · local · no attempt yet'}</span>}
      className="fr-tile"
      bodyClassName="fr-tile-body fr-verify"
    >
      <div className="fr-verdict">
        <Mark kind={h.kind} size={14} />
        <span className="fr-verdict-word" style={{ color: wordColor(h.kind) }}>
          {h.word}
        </span>
        <span className="fr-verdict-text">{h.text}</span>
        <span className="im-grow" />
        <span className="mono fr-verdict-time">{h.time}</span>
      </div>
      <Ladder rungs={ladderFor(outcome, step)} />
      <div className="im-facts">{facts}</div>
      <div className="fr-footnote">
        <InfoMark />
        <span>random-state evidence never changes the status</span>
      </div>
    </Tile>
  )
}

/* ── Before and after ────────────────────────────────────────────────── */
type Constraint = { name: string; from: string; to: string; unit: string; status: MarkKind; word: string }

const C_ACCEPTED: Constraint[] = [
  { name: 'two_qubit_depth', from: '184', to: '178', unit: 'layers', status: 'passed', word: 'passed' },
  { name: 'routing_overhead', from: '0.446', to: '0.421', unit: 'ratio', status: 'passed', word: 'passed' },
  { name: 'reliability_heuristic', from: '0.301', to: '0.318', unit: '(0, 1]', status: 'passed', word: 'passed' },
]
const C_REJECTED: Constraint[] = [
  { name: 'two_qubit_depth', from: '184', to: '214', unit: 'layers', status: 'failed', word: 'failed' },
  { name: 'routing_overhead', from: '0.446', to: '0.431', unit: 'ratio', status: 'passed', word: 'passed' },
  { name: 'reliability_heuristic', from: '0.301', to: '0.305', unit: '(0, 1]', status: 'passed', word: 'passed' },
]
const C_SKIPPED = (word: string, kind: MarkKind): Constraint[] => [
  { name: 'two_qubit_depth', from: '184', to: '', unit: 'layers', status: kind, word },
  { name: 'routing_overhead', from: '0.446', to: '', unit: 'ratio', status: kind, word },
  { name: 'reliability_heuristic', from: '0.301', to: '', unit: '(0, 1]', status: kind, word },
]

export function BeforeAfterTile({ outcome }: { outcome: Outcome }) {
  if (outcome === 'loading' || outcome === 'verifying') return <BeforeAfterPending outcome={outcome} />
  const scored = outcome === 'accepted' || outcome === 'rejected'
  const constraints =
    outcome === 'accepted'
      ? C_ACCEPTED
      : outcome === 'rejected'
        ? C_REJECTED
        : outcome === 'waiting'
          ? C_SKIPPED('queued', 'queued')
          : C_SKIPPED('skipped', 'skipped')
  const verification: [string, MarkKind, string] =
    outcome === 'accepted' || outcome === 'rejected'
      ? ['operator_equiv · 12 q · 3.4 s', 'passed', 'passed']
      : outcome === 'inconclusive'
        ? ['QCEC stopped at 60 s · Q402', 'inconclusive', 'inconclusive']
        : outcome === 'invalid'
          ? ['parse error · line 63 · Q101', 'invalid', 'invalid']
          : ['no candidate yet', 'queued', 'queued']
  const decision: { kind: MarkKind; word: string; text: string; at: string } =
    outcome === 'accepted'
      ? { kind: 'accepted', word: 'accepted', text: 'by the engine · not applied until you accept', at: '412 s' }
      : outcome === 'rejected'
        ? { kind: 'rejected', word: 'rejected', text: 'by the engine · original R2 kept', at: '412 s' }
        : outcome === 'inconclusive'
          ? { kind: 'inconclusive', word: 'inconclusive', text: 'the engine could not decide · original kept', at: '409 s' }
          : outcome === 'invalid'
            ? { kind: 'invalid', word: 'invalid', text: 'nothing was checked or scored · original kept', at: '387 s' }
            : { kind: 'queued', word: 'queued', text: 'nothing to decide until a candidate arrives', at: '412 s' }
  return (
    <Tile
      tabs={[{ id: 'ba', label: 'Before and after', active: true }]}
      meta={<span className="mono">current R2 · candidate · seed 37 · best of 8</span>}
      className="fr-tile"
      bodyClassName="fr-tile-body fr-ba"
    >
      <div className="fr-primary">
        <div className="fr-primary-head">
          <span className="mono fr-primary-name">two_qubit_count</span>
          <span className="lp-pipe" />
          <span className="fr-primary-note">primary · lower is better</span>
        </div>
        <div className="fr-primary-hero">
          <span className="mono fr-hero">{scored ? '281 → 270 gates' : '281 gates'}</span>
          <span className="mono fr-hero-delta">{scored ? '−11 · −3.9%' : outcome === 'waiting' ? 'current R2 · no candidate' : 'current R2 · not re-scored'}</span>
          <span className="im-grow" />
          <span className="mono fr-hero-note">{scored ? '321 baseline · −51 total' : '321 baseline · −40 total'}</span>
        </div>
        <div className="fr-bars">
          <span className="fr-bar">
            <span className="fr-bar-current" style={{ width: '100%' }} />
          </span>
          <span className="fr-bar">{scored && <span className="fr-bar-candidate" style={{ width: '96%' }} />}</span>
        </div>
        <div className="fr-bar-legend">
          <span className="fr-legend-item">
            <span className="fr-swatch is-current" />
            <span className="mono">current R2 · 281 gates</span>
          </span>
          <span className="fr-legend-item">
            <span className="fr-swatch is-candidate" />
            <span className="mono">{scored ? 'candidate · 270 gates' : outcome === 'waiting' ? 'candidate · none yet' : 'candidate · not re-scored'}</span>
          </span>
        </div>
      </div>

      <div className="fr-inset">
        <div className="lp-group">
          <span className="lp-group-title">constraints</span>
          <span className="mono lp-group-note">current → candidate · may not get worse</span>
        </div>
        {constraints.map((c, i) => (
          <div key={c.name} className={`fr-crow${i < 2 ? ' has-rule' : ''}`}>
            <span className="mono fr-cname">{c.name}</span>
            <span className="mono fr-cfrom">{c.from}</span>
            {c.to ? (
              <>
                <span className="mono fr-carrow">→</span>
                <span className="mono fr-cto">{c.to}</span>
                <span className="mono fr-cunit">{c.unit}</span>
              </>
            ) : (
              <span className="mono fr-cunit is-current">{c.unit} · current</span>
            )}
            <span className="im-grow" />
            <span className="fr-cstatus">
              <Word kind={c.status}>{c.word}</Word>
            </span>
          </div>
        ))}
        <div className="fr-caveat">calibration-based reliability heuristic, not a success probability</div>
        <div className="fr-crow">
          <span className="mono fr-cname">verification</span>
          <span className="mono fr-cnote">{verification[0]}</span>
          <span className="im-grow" />
          <span className="fr-cstatus">
            <Word kind={verification[1]}>{verification[2]}</Word>
          </span>
        </div>
      </div>

      <div className="fr-inset">
        <div className="lp-group">
          <span className="lp-group-title">D03 block 2</span>
          <span className="mono lp-group-note is-11">inside the changed region</span>
        </div>
        <div className="fr-crow">
          <span className="mono fr-cname">swaps</span>
          <span className="mono fr-cfrom">6</span>
          {scored ? (
            <>
              <span className="mono fr-carrow">→</span>
              <span className="mono fr-cto">0</span>
              <span className="mono fr-cunit is-11">{outcome === 'accepted' ? 'gates · layers 15 → 13' : 'gates · layers 15 → 19'}</span>
            </>
          ) : (
            <span className="mono fr-cunit is-11 is-current">gates · current · layers 15</span>
          )}
        </div>
      </div>

      <div className="fr-decision-row">
        <span className="fr-decision-label">decision</span>
        <Word kind={decision.kind} gap={8}>
          {decision.word}
        </Word>
        <span className="fr-decision-text">{decision.text}</span>
        <span className="im-grow" />
        <span className="mono fr-decision-at">{decision.at}</span>
      </div>
    </Tile>
  )
}

/** While the engine is still checking: the stage word and blocks shaped like the numbers to come. */
function BeforeAfterPending({ outcome }: { outcome: 'loading' | 'verifying' }) {
  const loading = outcome === 'loading'
  return (
    <Tile
      tabs={[{ id: 'ba', label: 'Before and after', active: true }]}
      meta={<span className="mono">current R2 · candidate · 8 seeds</span>}
      className="fr-tile"
      bodyClassName="fr-tile-body fr-ba is-pending"
    >
      <div className="fr-stage" role="status" aria-live="polite">
        {loading ? <Spinner /> : <Mark kind="queued" size={14} />}
        <span>{loading ? 'Re-scoring candidate · seed 3 of 8 · about 20 s' : 'Re-scoring waits for step 2 · equivalent · then about 25 s'}</span>
      </div>
      <div className="fr-sk-primary">
        <Block w={220} h={12} />
        <Block w={260} h={20} />
        <Block w="100%" h={6} />
        <Block w="94%" h={6} />
      </div>
      <div className="fr-inset fr-sk-rows">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="fr-sk-row">
            <Block w={140} h={10} onInset />
            <Block w={120} h={10} onInset />
            <span className="im-grow" />
            <Block w={56} h={10} onInset />
          </div>
        ))}
      </div>
      <div className="fr-inset fr-sk-rows">
        <div className="fr-sk-row">
          <Block w={90} h={10} onInset />
          <span className="im-grow" />
          <Block w={110} h={10} onInset />
        </div>
      </div>
    </Tile>
  )
}

/* ── Lanes crop under the regression banner ──────────────────────────── */
const CROP_CARDS: CardData[] = [
  { round: 1, left: 4, width: 181, strategy: 'commutation_aware_routing', status: 'rejected', note: '2q depth', bars: [45, 48], value: '214 > 202 layers' },
  { round: 2, left: 189, width: 199, strategy: 'commutation_aware_routing', status: 'accepted', note: 'block 1 · passed', bars: [48, 45], value: '281 gates' },
  { round: 3, left: 393, width: 235, strategy: 'commutation_aware_routing', status: 'rejected', note: '2q depth 184 → 214', bars: [48, 45], value: '270 gates', look: 'bad' },
  { round: 4, left: 642, width: 230, strategy: 'block_resynthesis', status: 'queued', foot: ['round 4 · D04 top block'] },
]

export function RegressionLanes() {
  return (
    <section className="tile fr-lanes" aria-label="Rounds, local lane">
      <div className="lp-rounds-header">
        <div className="lp-rounds-tab">Rounds</div>
        <span className="im-grow" />
        <span className="mono lp-rounds-readout">412 of 900 s · R3 rejected</span>
      </div>
      <div className="fr-lanes-body">
        <LaneHeader lane={{ layer: 'local', meta: '3 attempts · 1 accepted' }} />
        <div className="lp-rule" />
        <div className="lp-lane-row is-crop">
          <span className="lp-gutter" />
          <div className="lp-lane-plot is-crop">
            {CROP_CARDS.map((c) => (
              <AttemptCard key={c.round} card={c} layer="local" />
            ))}
          </div>
        </div>
        <div className="lp-sep" />
        <div className="lp-lane-header">
          <span className="lp-lane-dot is-primary" />
          <span className="mono lp-primary-name">two_qubit_count</span>
          <span className="lp-pipe" />
          <span className="lp-lane-note">primary · lower is better</span>
          <span className="im-grow" />
          <span className="mono lp-primary-plain">281 now · 321 base · −12.5%</span>
        </div>
        <div className="lp-lane-row is-crop-primary">
          <span className="lp-gutter" />
          <div className="lp-lane-plot is-crop-primary">
            <svg width="932" height="100%" viewBox="0 0 932 132" preserveAspectRatio="xMinYMin meet" aria-label="two_qubit_count, R3 replaced nothing">
              <path d="M0 40H370V100H932" className="cv-white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <circle cx="370" cy="100" r="2.5" className="cv-fill-white" />
              <g className="cv-text">
                <text x="6" y="34" className="cv-text-white">
                  298 · R1 accepted
                </text>
                <text x="396" y="94" className="cv-text-white">
                  281 · original kept
                </text>
                <text x="646" y="94">
                  R3 rejected, nothing replaced
                </text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
