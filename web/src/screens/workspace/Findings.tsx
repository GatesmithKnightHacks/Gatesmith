/*
 * Findings cards as the master draws them (MVN-0 204K-0): default (#2A383D, 1 px #354348), accepted
 * (icon + word, the round and the gates it removed, "View diff"), and selected (#354348 + 1 px yellow)
 * with the attempt rows and the verification ladder (allowed · equivalent · re-scored · decided).
 * A local part: the shared FindingCard has one fixed button and no ladder.
 */
import type { CSSProperties } from 'react'
import { NOT_EVALUATED, type CanonicalFinding } from '../../data/demo'
import { EditorButton } from '../../ui/parts'
import { Sk } from '../../ui/Skeleton'
import { MarkIcon, MarkWord } from './icons'
import type { Mark } from './data'

export type CardView =
  | { kind: 'open'; evidence: string; action: string; onAction: () => void }
  | { kind: 'accepted'; round: number; delta: number; onAction: () => void }
  | {
      kind: 'proposal'
      evidence: string
      attempt: number
      round: number
      layer: string
      decision: 'proposed' | 'verifying'
      step: number
      ladder: { label: string; state: 'passed' | 'running' | 'queued' | 'failed' }[]
      onAction: () => void
    }

export function WsFindingCard({
  f,
  view,
  selected,
  focus,
  onSelect,
  style,
  name,
}: {
  f: CanonicalFinding
  view: CardView
  selected?: boolean
  focus?: boolean
  onSelect?: () => void
  style?: CSSProperties
  name?: string
}) {
  return (
    <article
      className={`ws-fcard${selected ? ' is-selected' : ''}${focus ? ' is-focus' : ''}`}
      style={{ ...style, viewTransitionName: name }}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onSelect?.())}
      aria-label={`#${f.rank} ${f.severity} ${f.name} ${f.title}`}
    >
      <div className="ws-fcard-top">
        <span className="ws-fcard-rank">#{f.rank}</span>
        <MarkWord kind={f.severity as Mark} weight={500} />
        <span className="ws-grow" />
        <span className="ws-fcard-rule">
          {f.rule} · {f.ruleName}
        </span>
      </div>
      <div className="ws-fcard-title">{f.title}</div>
      {view.kind === 'open' && (
        <div className="ws-fcard-bottom">
          <span className="ws-fcard-evidence">{view.evidence}</span>
          <EditorButton onClick={(e) => (e.stopPropagation(), view.onAction())}>{view.action}</EditorButton>
        </div>
      )}
      {view.kind === 'accepted' && (
        <div className="ws-fcard-bottom">
          <span className="ws-fcard-accepted">
            <MarkWord kind="accepted" />
            <span className="ws-fcard-accepted-note">
              R{view.round} · −{Math.abs(view.delta)} gates · passed
            </span>
          </span>
          <EditorButton onClick={(e) => (e.stopPropagation(), view.onAction())}>View diff</EditorButton>
        </div>
      )}
      {view.kind === 'proposal' && (
        <>
          <div className="ws-fcard-evidence is-line">{view.evidence}</div>
          <div className="ws-fcard-details">
            <div className="ws-fcard-fact">
              <span className="ws-fcard-fact-label">Strategy</span>
              <span className="ws-fcard-fact-value">commutation_aware_routing</span>
            </div>
            <div className="ws-fcard-fact">
              <span className="ws-fcard-fact-label">Attempt {view.attempt}</span>
              <span className="ws-fcard-fact-value is-row">
                <span>
                  R{view.round} · {view.layer}
                </span>
                <MarkWord kind={view.decision} />
              </span>
            </div>
            <div className="ws-fcard-fact">
              <span className="ws-fcard-fact-label">Verification</span>
              <span className="ws-fcard-fact-value">step {view.step} of 4</span>
            </div>
            <div className="ws-ladder">
              {view.ladder.map((s, i) => (
                <div key={s.label} className={`ws-ladder-step${i === view.ladder.length - 1 ? ' is-last' : ''}`}>
                  <span className={`ws-ladder-bar is-${s.state}`} />
                  <span className={`ws-ladder-label${s.state === 'queued' ? ' is-queued' : ''}`}>{s.label}</span>
                  <span className={`ws-ladder-state is-${s.state}`}>
                    <MarkIcon
                      kind={s.state === 'passed' ? 'passed' : s.state === 'running' ? 'running' : s.state === 'failed' ? 'rejected' : 'queued'}
                      tone={s.state === 'passed' ? 'var(--color-text-secondary)' : undefined}
                    />
                    {s.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="ws-fcard-foot">
            <span className="ws-fcard-foot-note">Kept only if passed and better</span>
            <EditorButton onClick={(e) => (e.stopPropagation(), view.onAction())}>Review proposal</EditorButton>
          </div>
        </>
      )}
    </article>
  )
}

/** Rules the engine could not evaluate on this run. */
export function NotEvaluatedRow() {
  return (
    <div className="ws-noteval">
      <MarkIcon kind="queued" />
      <span className="ws-noteval-rules">{NOT_EVALUATED.rules.join(' ')}</span>
      <span className="ws-noteval-label">{NOT_EVALUATED.label}</span>
    </div>
  )
}

/** Loading: three cards in their real shape under the shimmer. */
export function FindingSkeletons() {
  const rows: [number, number, number, number][] = [
    [150, 132, 170, 100],
    [136, 122, 196, 100],
    [168, 156, 148, 100],
  ]
  return (
    <div className="ws-cards" aria-hidden>
      {rows.map((r, i) => (
        <div key={i} className="ws-fcard-sk">
          <div className="ws-fcard-sk-row" style={{ height: 16 }}>
            <Sk w={56} h={12} />
            <Sk w={r[0]} h={12} />
          </div>
          <div className="ws-fcard-sk-row" style={{ height: 18 }}>
            <Sk w={r[1]} h={12} />
          </div>
          <div className="ws-fcard-sk-row" style={{ height: 24 }}>
            <Sk w={r[2]} h={12} />
            <Sk w={r[3]} h={24} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Scoring: the cards' places, waiting for diagnose. */
export function FindingPlaceholders() {
  return (
    <div className="ws-cards" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="ws-wait" style={{ height: 88, width: '100%' }} />
      ))}
    </div>
  )
}
