/*
 * Inspector and tile pieces shared by S-06 and S-07, measured from their boards: feed cards, the
 * decision row under the mint, the stop card, finding cards, the verification ladder, fact rows.
 */
import type { CSSProperties, ReactNode } from 'react'
import { EditorButton } from '../../ui/parts'
import { Mark, Word, type MarkKind } from './marks'
import { FOCUS_RING, wordColor } from './style'

/* ── Feed card: who said what, when, and what it means ─────────────────── */
export function FeedCard({
  who,
  role,
  at,
  text,
  means,
  look = 'default',
  children,
}: {
  who: 'local' | 'engine'
  role: ReactNode
  at: string
  text?: ReactNode
  means?: string
  look?: 'default' | 'proposed' | 'queued'
  children?: ReactNode
}) {
  return (
    <div className={`im-feed is-${look}`}>
      <div className="im-feed-head">
        <span className={`im-dot ${who === 'local' ? 'is-model' : 'is-engine'}`} />
        <span className="mono im-feed-who">{who}</span>
        <span className="mono im-feed-role">{role}</span>
        <span className="im-grow" />
        <span className="mono im-feed-at">{at}</span>
      </div>
      {text && <div className="im-feed-text">{text}</div>}
      {means && <div className="im-feed-means">Means: {means}</div>}
      {children}
    </div>
  )
}

/* ── Error block: 2 px rail, word, "<what failed> (<code>) · <where> · <fix>" ── */
export function ErrorBlock({ kind, word, what, code, rest }: { kind: MarkKind; word: string; what: string; code: string; rest: string }) {
  return (
    <div className={`im-error is-${kind}`} role="alert">
      <span className="im-error-icon">
        <Mark kind={kind} />
      </span>
      <span className="im-error-word">{word}</span>
      <div className="im-error-text">
        <div className="im-error-what">
          <span>{what}</span>
          <span className="mono">({code})</span>
        </div>
        <div className="im-error-rest">{rest}</div>
      </div>
    </div>
  )
}

/* ── Decision row: an editor button left, a caption right ─────────────── */
export function ActionRow({ button, onClick, caption, mono = false, focus = false }: { button: string; onClick?: () => void; caption: string; mono?: boolean; focus?: boolean }) {
  return (
    <div className="im-action-row">
      <EditorButton onClick={onClick} style={focus ? FOCUS_RING : undefined}>
        {button}
      </EditorButton>
      <span className="im-grow" />
      <span className={`im-caption${mono ? ' mono' : ''}`}>{caption}</span>
    </div>
  )
}

/* ── Status line above a mint ─────────────────────────────────────────── */
export function StatusLine({ kind, word, text, right }: { kind: MarkKind; word?: string; text: ReactNode; right?: ReactNode }) {
  return (
    <div className="im-status-line">
      <Mark kind={kind} />
      {word && (
        <span className="im-status-word" style={{ color: wordColor(kind) }}>
          {word}
        </span>
      )}
      <span className="im-status-text">{text}</span>
      {right != null && (
        <>
          <span className="im-grow" />
          {right}
        </>
      )}
    </div>
  )
}

/* ── Verification ladder: allowed, equivalent, re-scored, decided ─────── */
export type Rung = { label: string; kind: MarkKind; word: string; bar: 'done' | 'running' | 'warn' | 'bad' | 'off' }

export function Ladder({ rungs }: { rungs: Rung[] }) {
  return (
    <div className="im-ladder">
      {rungs.map((r) => (
        <div key={r.label} className="im-rung">
          <span className={`im-rung-bar is-${r.bar}`} />
          <span className={`im-rung-label${r.bar === 'off' ? ' is-off' : ''}`}>{r.label}</span>
          <Word kind={r.kind} size={11}>
            {r.word}
          </Word>
        </div>
      ))}
    </div>
  )
}

/* ── Fact rows (Verification tile) ─────────────────────────────────────── */
export function Fact({ label, value, status, last }: { label: string; value: ReactNode; status?: ReactNode; last?: boolean }) {
  return (
    <div className={`im-fact${last ? ' is-last' : ''}`}>
      <span className="im-fact-label">{label}</span>
      <span className="mono im-fact-value">{value}</span>
      {status != null && (
        <>
          <span className="im-grow" />
          <span className="im-fact-status">{status}</span>
        </>
      )}
    </div>
  )
}

/* ── Finding card (inspector) ─────────────────────────────────────────── */
export type FindingCardData = {
  rank: number
  rule: string
  title: string
  evidence?: string
  accepted?: string
  button: string
}

export function FindingCard({ f, onClick }: { f: FindingCardData; onClick?: () => void }) {
  return (
    <article className="im-finding">
      <div className="im-finding-top">
        <span className="mono im-finding-rank">#{f.rank}</span>
        <Word kind="high" />
        <span className="im-grow" />
        <span className="mono im-finding-rule">{f.rule}</span>
      </div>
      <div className="im-finding-title">{f.title}</div>
      <div className="im-finding-bottom">
        {f.accepted ? (
          <span className="im-finding-evidence is-word">
            <Word kind="accepted" />
            <span className="mono">{f.accepted}</span>
          </span>
        ) : (
          <span className="mono im-finding-evidence">{f.evidence}</span>
        )}
        <EditorButton onClick={onClick}>{f.button}</EditorButton>
      </div>
    </article>
  )
}

export function NotEvaluated() {
  return (
    <div className="im-not-evaluated">
      <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden className="im-mark">
        <circle cx="6" cy="6" r="3.5" className="mk-dis" strokeWidth="1.6" />
      </svg>
      <span className="mono">D09 D10</span>
      <span>Not evaluated: no size_sweep, no simulation</span>
    </div>
  )
}

/* ── Stop card: the engine's (or the budget's, or your) reason to stop ── */
export function StopCard({
  kind,
  word,
  who,
  at,
  title,
  text,
  rows,
  primary,
  action,
  warn = false,
}: {
  kind: MarkKind
  word: string
  who: string
  at: string
  title: string
  text: string
  rows: [string, string][]
  primary: ReactNode
  action: ReactNode
  warn?: boolean
}) {
  return (
    <div className={`im-stop${warn ? ' is-warn' : ''}`}>
      <div className="im-stop-head">
        <Word kind={kind} gap={6}>
          {word}
        </Word>
        <span className="im-stop-who">{who}</span>
        <span className="im-grow" />
        <span className="mono im-stop-at">{at}</span>
      </div>
      <div className="im-stop-copy">
        <div className="im-stop-title">{title}</div>
        <div className="im-stop-text">{text}</div>
      </div>
      <div className="im-stop-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="im-stop-row">
            <span className="mono im-stop-key">{k}</span>
            <span className="mono">{v}</span>
          </div>
        ))}
      </div>
      {primary}
      {action}
    </div>
  )
}

/* ── Skeleton block (solid, sized to the content) ─────────────────────── */
/** Shimmer block: inset color on a panel; one step up (panel, band raised) when it sits on an inset. */
export function Block({ w, h = 12, onInset = false, style }: { w: number | string; h?: number; onInset?: boolean; style?: CSSProperties }) {
  return <span className={`im-block${onInset ? ' is-on-inset' : ''}`} style={{ width: w, height: h, ...style }} aria-hidden />
}
