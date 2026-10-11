/*
 * Shared components (DS-04 · Core components). Screens compose these; values are the measured ones.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { fadeIn, MOTION_MS } from './motionPreference'
import { usePresence } from './presence'
import { SpinnerRing } from './Spinner'
import { Chevron, SelectCaret } from './icons'
import { Status, type Severity } from './status'
import './parts.css'

/* ── Tile ────────────────────────────────────────────────────────────── */
export type TileTab = { id: string; label: string; active?: boolean; onClick?: () => void }

export function Tile({
  tabs,
  meta,
  children,
  className = '',
  style,
  bodyClassName = '',
  bodyStyle,
  name,
}: {
  tabs: TileTab[]
  meta?: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
  bodyClassName?: string
  bodyStyle?: CSSProperties
  /** Kept for older screens; screen changes no longer carry shared elements. */
  name?: string
}) {
  // Switching tabs snaps the tab marker and fades the body in 200 (DS-08 Navigation).
  const body = useRef<HTMLDivElement>(null)
  const active = tabs.find((t) => t.active)?.id
  const was = useRef(active)
  useLayoutEffect(() => {
    if (active !== was.current) fadeIn(body.current)
    was.current = active
  }, [active])
  return (
    <section className={`tile ${className}`} style={style} data-name={name}>
      <TileHeader tabs={tabs} meta={meta} />
      <div ref={body} className={`tile-body ${bodyClassName}`} style={bodyStyle}>
        {children}
      </div>
    </section>
  )
}

export function TileHeader({ tabs, meta }: { tabs: TileTab[]; meta?: ReactNode }) {
  return (
    <div className="tile-header">
      <div className="tile-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={!!t.active}
            className={`tile-tab${t.active ? ' is-active' : ''}`}
            onClick={t.onClick}
          >
            {t.label}
          </button>
        ))}
      </div>
      {meta != null && <div className="tile-meta">{meta}</div>}
    </div>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
/** Laptop or Platform. Uncontrolled unless `onChange` is passed; the underline slides between them. */
export function ModeTabs({ active, onChange }: { active?: 'laptop' | 'platform'; onChange?: (m: 'laptop' | 'platform') => void }) {
  const [inner, setInner] = useState<'laptop' | 'platform'>(active ?? 'laptop')
  const current = onChange ? (active ?? 'laptop') : inner
  return (
    <div className="mode-tabs" role="tablist">
      {(['laptop', 'platform'] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={current === m}
          className={`mode-tab${current === m ? ' is-active' : ''}`}
          onClick={() => (onChange ? onChange(m) : setInner(m))}
        >
          {m === 'laptop' ? 'Laptop' : 'Platform'}
        </button>
      ))}
    </div>
  )
}

/** Mode line + the one primary action + optional footnote. */
export function ModeBlock({ line, children, style }: { line: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="mode-block" style={style}>
      <div className="mode-line">{line}</div>
      {children}
    </div>
  )
}

export function PoweredBy() {
  return (
    <div className="powered-by">
      <span>Powered by the</span>
      <span className="powered-by-name">qscore</span>
      <span>engine ·</span>
      <span className="mono">qscore-2026.1</span>
    </div>
  )
}

/* ── Buttons (DS-08 Button feedback) ─────────────────────────────────── */
/*
 * One width in every state: the idle, loading and done faces stack in one grid cell, so the button
 * is as wide as its widest face and never moves. Hover steps the fill in 150, press steps again at
 * 0 ms, focus is the 2px yellow outline, disabled is opacity .3. Loading keeps the verb with the
 * spinner in its reserved slot and turns the pointer off; done shows the past verb with a check for
 * 1200 ms, fading 150 each way.
 */
type ClickResult = void | boolean | Promise<unknown>
type Phase = 'idle' | 'busy' | 'done'

function useButtonPhase(doneLabel: ReactNode | undefined) {
  const [phase, setPhase] = useState<Phase>('idle')
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const showDone = () => {
    if (doneLabel == null) return setPhase('idle')
    setPhase('done')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('idle'), MOTION_MS.done)
  }
  /** Run a click: a returned promise shows loading until it settles; success then shows done. */
  const run = (result: ClickResult) => {
    if (result instanceof Promise) {
      setPhase('busy')
      result.then(
        (ok) => (ok === false ? setPhase('idle') : showDone()),
        () => setPhase('idle'),
      )
    } else if (result !== false && doneLabel != null) showDone()
  }
  return { phase, run }
}

function Check({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.4l2.6 2.6L11 4.4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

type ButtonStateProps = {
  /** Loading from outside (a run in progress). The verb stays, the spinner shows in its slot. */
  loading?: boolean
  /** Label while loading, when it differs ("Retrying" for Retry). Defaults to the idle label. */
  loadingLabel?: ReactNode
  /** Past verb for the done state ("Saved", "Copied", "Accepted"), shown with a check for 1200 ms. */
  doneLabel?: ReactNode
  /** Show the done face from outside, as long as this is true (keep it 1200 ms: MOTION_MS.done). */
  done?: boolean
}

/** The one mint fill per view. Progress lives in the label; runs over 10 s add the 2px line in the bottom edge. */
export function PrimaryButton({
  children,
  onClick,
  progress,
  disabled,
  name: _name,
  style,
  height = 40,
  loading,
  loadingLabel,
  doneLabel,
  done,
  className = '',
}: {
  children: ReactNode
  /** Return a promise to show loading until it settles (and done, with `doneLabel`). */
  onClick?: () => ClickResult
  /** 0..1, for runs longer than 10 s: the 2px #141414 line grows with it in 400 ms */
  progress?: number
  disabled?: boolean
  /** Kept for older screens; screen changes no longer carry shared elements. */
  name?: string
  style?: CSSProperties
  height?: number
  className?: string
} & ButtonStateProps) {
  const { phase, run } = useButtonPhase(doneLabel)
  const isLoading = !!loading || phase === 'busy'
  const isDone = !isLoading && (!!done || phase === 'done')
  const reserve = loading !== undefined || loadingLabel !== undefined || isLoading
  return (
    <button
      className={`btn-primary${isLoading ? ' is-loading' : ''}${isDone ? ' is-done' : ''} ${className}`}
      onClick={isLoading || disabled ? undefined : () => run(onClick?.())}
      disabled={disabled}
      aria-busy={isLoading || undefined}
      style={{ ...style, height }}
    >
      <span className="btn-stack">
        <span className={`btn-face btn-primary-label${!isLoading && !isDone ? ' is-shown' : ''}`}>{children}</span>
        {reserve && (
          <span className={`btn-face is-loading-face${isLoading ? ' is-shown' : ''}`} aria-hidden={!isLoading}>
            <SpinnerRing size={20} tone="accent" />
            <span>{loadingLabel ?? children}</span>
          </span>
        )}
        {doneLabel != null && (
          <span className={`btn-face${isDone ? ' is-shown' : ''}`} aria-hidden={!isDone}>
            <span>{doneLabel}</span>
            <Check size={14} color="var(--color-text-on-accent)" />
          </span>
        )}
      </span>
      {progress != null && <span className="btn-primary-progress" style={{ width: `${Math.round(progress * 100)}%` }} />}
    </button>
  )
}

/** Secondary actions inside panels: inset fill, 12px, padding 4×8 (or full-width pairs at 28 tall). */
export function EditorButton({
  children,
  onClick,
  disabled,
  wide,
  style,
  onInset,
  loading,
  loadingLabel,
  doneLabel,
  done,
  className = '',
}: {
  children: ReactNode
  /** Return a promise to show loading until it settles (and done, with `doneLabel`). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => ClickResult
  disabled?: boolean
  wide?: boolean
  style?: CSSProperties
  /** On an inset (#0F1F23) strip the button is #243237 (DS-08); elsewhere it is the inset color. */
  onInset?: boolean
  className?: string
} & ButtonStateProps) {
  const { phase, run } = useButtonPhase(doneLabel)
  const isLoading = !!loading || phase === 'busy'
  const isDone = !isLoading && (!!done || phase === 'done')
  const reserve = loading !== undefined || loadingLabel !== undefined || isLoading
  return (
    <button
      className={`btn-editor${wide ? ' is-wide' : ''}${onInset ? ' on-inset' : ''}${isLoading ? ' is-loading' : ''}${isDone ? ' is-done' : ''} ${className}`}
      onClick={isLoading || disabled ? undefined : (e) => run(onClick?.(e))}
      disabled={disabled}
      aria-busy={isLoading || undefined}
      style={style}
    >
      <span className="btn-stack">
        <span className={`btn-face${!isLoading && !isDone ? ' is-shown' : ''}`}>{children}</span>
        {reserve && (
          <span className={`btn-face is-loading-face${isLoading ? ' is-shown' : ''}`} aria-hidden={!isLoading}>
            <SpinnerRing size={14} />
            <span>{loadingLabel ?? children}</span>
          </span>
        )}
        {doneLabel != null && (
          <span className={`btn-face${isDone ? ' is-shown' : ''}`} aria-hidden={!isDone}>
            <span>{doneLabel}</span>
            <Check size={12} color="var(--color-text-primary)" />
          </span>
        )}
      </span>
    </button>
  )
}

/** Two equal-width editor buttons directly under a primary. */
export function SecondaryPair({ children }: { children: ReactNode }) {
  return <div className="secondary-pair">{children}</div>
}

/**
 * Inspector section: 44px row (18 icon, gap 10, 14/500 title, mono meta right, chevron), body below.
 * Uncontrolled unless `onToggle` is passed. Opening turns the chevron in 200 ms and fades the body in
 * where it stands; the height snaps (no height tween).
 */
export function Section({
  icon,
  title,
  meta,
  open = true,
  children,
  bodyStyle,
  bodyClassName = '',
  onToggle,
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  open?: boolean
  children?: ReactNode
  bodyStyle?: CSSProperties
  bodyClassName?: string
  onToggle?: () => void
}) {
  const [inner, setInner] = useState(open)
  const isOpen = onToggle ? open : inner
  const body = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(isOpen)
  useLayoutEffect(() => {
    if (isOpen && !wasOpen.current) fadeIn(body.current)
    wasOpen.current = isOpen
  }, [isOpen])
  return (
    <section className="insp-section">
      <button className="insp-section-header" aria-expanded={isOpen} onClick={onToggle ?? (() => setInner((v) => !v))}>
        {icon}
        <span className="insp-section-title">{title}</span>
        {meta != null ? <span className="insp-section-meta">{meta}</span> : <span className="insp-section-spacer" />}
        <Chevron open={isOpen} />
      </button>
      {children != null && (
        <div ref={body} className={`insp-section-collapse${isOpen ? '' : ' is-closed'}`} aria-hidden={!isOpen}>
          <div className={`insp-section-body ${bodyClassName}`} style={bodyStyle}>
            {children}
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Fields ──────────────────────────────────────────────────────────── */
export function FieldRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="field-row">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export type FieldValidation = 'warning' | 'invalid'

/**
 * A field. Validation (on blur, DS-08): the border turns #FF986E (warning) or #FF3478 (invalid) in
 * 150 ms and the message line fades in under it in 200; on fix the border returns in 150 and the
 * message fades out. Never shakes. Field validation carries no error code.
 */
export function Field({
  value,
  unit,
  select,
  width = 180,
  focus,
  error,
  disabled,
  validation,
  where,
  message,
}: {
  value: ReactNode
  unit?: string
  select?: boolean
  width?: number
  focus?: boolean
  /** Shorthand for validation="invalid" without a message line. */
  error?: boolean
  disabled?: boolean
  validation?: FieldValidation
  /** Where the value comes from, mono: "wall_time_s · qscore.yaml:23" */
  where?: ReactNode
  /** What is wrong and the fix: "60 s ends round 1 early … use 120 s or more" */
  message?: ReactNode
}) {
  const state: FieldValidation | undefined = validation ?? (error ? 'invalid' : undefined)
  const showMessage = state != null && (message != null || where != null)
  const { mounted, leaving } = usePresence(showMessage, MOTION_MS.tile)
  // Hold the last message through its fade-out.
  const [held, setHeld] = useState({ state, where, message })
  if (showMessage && (held.state !== state || held.where !== where || held.message !== message)) setHeld({ state, where, message })
  const shown = showMessage ? { state, where, message } : held
  const field = (
    <span
      className={`field${focus ? ' is-focus' : ''}${state ? ` is-${state}` : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ width }}
      tabIndex={disabled ? -1 : 0}
      role={select ? 'combobox' : 'textbox'}
      aria-invalid={state === 'invalid' || undefined}
    >
      <span className="field-value">{value}</span>
      {unit && <span className="field-unit">{unit}</span>}
      {select && <SelectCaret />}
    </span>
  )
  if (!mounted) return field
  return (
    <span className="field-wrap">
      {field}
      <span className={`field-message is-${shown.state}${leaving ? ' is-leaving' : ''}`} role="alert">
        <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
          {shown.state === 'warning' ? (
            <path d="M5 4.5l4 7H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          ) : (
            <path d="M2 5l6 6M8 5l-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
        <span className="field-message-lines">
          <span className="field-message-head">
            <span className="field-message-word">{shown.state}</span>
            {shown.where != null && <span className="field-message-where mono">{shown.where}</span>}
          </span>
          {shown.message != null && <span className="field-message-text">{shown.message}</span>}
        </span>
      </span>
    </span>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' is-on' : ''}`}
      onClick={() => onChange?.(!on)}
    >
      <span className="switch-knob" />
    </button>
  )
}

/* ── Rows ────────────────────────────────────────────────────────────── */
/** label left (secondary), value right (mono). 28 tall, 1px divider. */
export function DataRow({
  label,
  value,
  mono = true,
  height = 28,
  divider = true,
  style,
}: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  height?: number
  divider?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={`data-row${divider ? ' has-divider' : ''}`} style={{ height, ...style }}>
      <span className="data-row-label">{label}</span>
      <span className={`data-row-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  )
}

/* ── Finding card (S-04 inspector, DS-04) ────────────────────────────── */
export type Finding = {
  rank: number
  severity: Severity
  rule: string
  ruleName: string
  title: string
  evidence: string
}

/**
 * Finding card (DS-04, master MVN-0): padding 10, gap 4, raised fill with a #354348 edge; selected
 * fills #354348 with the yellow edge. Rank, status, rule; the title; evidence and one editor action.
 */
export function FindingCard({
  finding,
  selected,
  onRequest,
  onSelect,
  style,
  name,
  actionLabel = 'Request fix',
  bottom,
  children,
  flash,
  className = '',
}: {
  finding: Finding
  selected?: boolean
  onRequest?: () => void
  onSelect?: () => void
  style?: CSSProperties
  name?: string
  /** The card's one action; "Request fix" by default ("View diff", "Review proposal", "View in round 4"). */
  actionLabel?: ReactNode
  /** Replaces the evidence line, e.g. an accepted status with its round and delta. */
  bottom?: ReactNode
  /** Extra rows between the title and the action row (an opened card). */
  children?: ReactNode
  /** The card just changed: fill #354348 and fade back over 400 ms. */
  flash?: boolean
  className?: string
}) {
  return (
    <article
      className={`finding-card${selected ? ' is-selected' : ''}${flash ? ' row-flash' : ''} ${className}`}
      style={style}
      data-name={name}
      onClick={onSelect}
    >
      <div className="finding-top">
        <span className="mono finding-rank">#{finding.rank}</span>
        <Status kind={finding.severity} />
        <span className="finding-spacer" />
        <span className="mono finding-rule">
          {finding.rule} · {finding.ruleName}
        </span>
      </div>
      <div className="finding-title">{finding.title}</div>
      {children}
      <div className="finding-bottom">
        {bottom ?? <span className="mono finding-evidence">{finding.evidence}</span>}
        {actionLabel != null && (
          <EditorButton
            onClick={(e) => {
              e.stopPropagation()
              onRequest?.()
            }}
          >
            {actionLabel}
          </EditorButton>
        )}
      </div>
    </article>
  )
}

export function SuppressedRow({ rule, label, onRestore }: { rule: string; label: string; onRestore?: () => void }) {
  return (
    <div className="suppressed-row">
      <span className="mono">{rule}</span>
      <span className="suppressed-label">{label}</span>
      <button className="suppressed-restore" onClick={onRestore}>
        Restore
      </button>
    </div>
  )
}
