/*
 * Shared components (DS-04 · Core components). Screens compose these; values are the measured ones.
 */
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
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
  /** view-transition-name for shared-element motion */
  name?: string
}) {
  return (
    <section className={`tile ${className}`} style={{ ...style, viewTransitionName: name }}>
      <TileHeader tabs={tabs} meta={meta} />
      <div className={`tile-body ${bodyClassName}`} style={bodyStyle}>
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
      <span>engine · qscore-2026.1</span>
    </div>
  )
}

/** The one mint fill per view. Progress lives in the label; an optional 3px bar shows it too. */
export function PrimaryButton({
  children,
  onClick,
  progress,
  disabled,
  name,
  style,
  height = 40,
}: {
  children: ReactNode
  onClick?: () => void
  progress?: number
  disabled?: boolean
  name?: string
  style?: CSSProperties
  height?: number
}) {
  return (
    <button
      className="btn-primary"
      onClick={onClick}
      disabled={disabled}
      style={{ ...style, height, viewTransitionName: name }}
    >
      <span className="btn-primary-label">{children}</span>
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
}: {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  wide?: boolean
  style?: CSSProperties
}) {
  return (
    <button className={`btn-editor${wide ? ' is-wide' : ''}`} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  )
}

/** Two equal-width editor buttons directly under a primary. */
export function SecondaryPair({ children }: { children: ReactNode }) {
  return <div className="secondary-pair">{children}</div>
}

/**
 * Inspector section: 40px header (18 icon, gap 10, 14/500 title, meta, chevron), body below.
 * Uncontrolled unless `onToggle` is passed. Collapsing animates the height and fades the body.
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
  return (
    <section className="insp-section">
      <button className="insp-section-header" aria-expanded={isOpen} onClick={onToggle ?? (() => setInner((v) => !v))}>
        {icon}
        <span className="insp-section-title">{title}</span>
        {meta != null && <span className="insp-section-meta">{meta}</span>}
        <Chevron open={isOpen} />
      </button>
      {children != null && (
        <div className={`insp-section-collapse${isOpen ? '' : ' is-closed'}`} aria-hidden={!isOpen}>
          <div className="insp-section-clip">
            <div className={`insp-section-body ${bodyClassName}`} style={bodyStyle}>
              {children}
            </div>
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

export function Field({
  value,
  unit,
  select,
  width = 180,
  focus,
  error,
  disabled,
}: {
  value: ReactNode
  unit?: string
  select?: boolean
  width?: number
  focus?: boolean
  error?: boolean
  disabled?: boolean
}) {
  return (
    <span
      className={`field${focus ? ' is-focus' : ''}${error ? ' is-error' : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ width }}
      tabIndex={disabled ? -1 : 0}
      role={select ? 'combobox' : 'textbox'}
    >
      <span className="field-value">{value}</span>
      {unit && <span className="field-unit">{unit}</span>}
      {select && <SelectCaret />}
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

export function FindingCard({
  finding,
  selected,
  onRequest,
  onSelect,
  style,
  name,
}: {
  finding: Finding
  selected?: boolean
  onRequest?: () => void
  onSelect?: () => void
  style?: CSSProperties
  name?: string
}) {
  return (
    <article
      className={`finding-card${selected ? ' is-selected' : ''}`}
      style={{ ...style, viewTransitionName: name }}
      onClick={onSelect}
    >
      <div className="finding-top">
        <span className="mono finding-rank">#{finding.rank}</span>
        <Status kind={finding.severity} />
        <span className="finding-spacer" />
        <span className="mono finding-rule">
          {finding.rule} {finding.ruleName}
        </span>
      </div>
      <div className="finding-title">{finding.title}</div>
      <div className="finding-bottom">
        <span className="mono finding-evidence">{finding.evidence}</span>
        <EditorButton
          onClick={(e) => {
            e.stopPropagation()
            onRequest?.()
          }}
        >
          Request fix
        </EditorButton>
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
