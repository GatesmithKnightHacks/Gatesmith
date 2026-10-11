/*
 * Local parts for the account screens (S-17, S-18, S-19), drawn from boards OVD-0, PBH-0 and PHB-0:
 * the 480 auth tile, labelled fields, banners, the spinner beside a stage word, text links.
 */
import { useState, type ReactNode, type RefObject } from 'react'
import { useAccount } from '../../data/account'
import { GpuStatus } from '../../ui/Shell'
import './account.css'

/* ── Top bar right side ─────────────────────────────────────────────── */
export function AccountStatus() {
  const { session } = useAccount()
  return (
    <>
      <GpuStatus online />
      {session ? (
        <span className="acc-topbar-account">
          <span className="acc-topbar-avatar" aria-hidden>
            <svg width="10" height="10" viewBox="0 0 14 14">
              <path
                d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1"
                fill="none"
                stroke="var(--color-text-secondary)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="mono">{session.handle}</span>
        </span>
      ) : (
        <span className="acc-topbar-anon">Not signed in</span>
      )}
    </>
  )
}

/* ── The centered 480 tile ──────────────────────────────────────────── */
export function AuthTile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="acc-auth-tile" aria-label={title}>
      <div className="acc-tile-header">
        <div className="acc-tile-tab">{title}</div>
      </div>
      <div className="acc-auth-body">{children}</div>
    </section>
  )
}

/* ── Fields ─────────────────────────────────────────────────────────── */
type Signal = { kind: 'invalid' | 'warning'; text: string }

export function TextField({
  label,
  hint,
  signal,
  below,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  mono,
  disabled,
  inputRef,
  autoComplete,
  name,
  forceFocus,
}: {
  label: string
  /** Right side of the label row when nothing is wrong: "12 characters or more". */
  hint?: string
  /** Right side of the label row when something is: icon + word, in the signal color. */
  signal?: Signal | null
  /** A line under the input: the count under a weak password, the fix under an error. */
  below?: ReactNode
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  type?: 'text' | 'email' | 'password'
  placeholder?: string
  mono?: boolean
  disabled?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  autoComplete?: string
  name: string
  /** States boards draw the focus ring on a field; this keeps it while the page is not focused. */
  forceFocus?: boolean
}) {
  const [shown, setShown] = useState(false)
  const id = `acc-${name}`
  const isPassword = type === 'password'
  const signalId = signal ? `${id}-signal` : undefined
  return (
    <div className="acc-field">
      <div className="acc-field-label-row">
        <label className="acc-field-label" htmlFor={id}>
          {label}
        </label>
        {signal ? (
          <span id={signalId} className={`acc-signal is-${signal.kind}`} role={signal.kind === 'invalid' ? 'alert' : undefined}>
            {signal.kind === 'invalid' ? <IconCross size={12} /> : <IconWarn size={12} />}
            {signal.text}
          </span>
        ) : (
          hint && <span className="mono acc-field-hint">{hint}</span>
        )}
      </div>
      <div
        className={`acc-input-box${signal ? ` is-${signal.kind}` : ''}${disabled ? ' is-disabled' : ''}${forceFocus ? ' is-focus' : ''}`}
      >
        <input
          id={id}
          ref={inputRef}
          name={name}
          className={`acc-input${mono || (isPassword && !shown) ? ' mono' : ''}${isPassword && !shown ? ' is-secret' : ''}`}
          type={isPassword && !shown ? 'password' : type === 'password' ? 'text' : type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete={autoComplete}
          aria-invalid={signal?.kind === 'invalid' || undefined}
          aria-describedby={signalId}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {isPassword && (
          <button type="button" className="acc-show" disabled={disabled} onClick={() => setShown((v) => !v)} aria-pressed={shown}>
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {below}
    </div>
  )
}

/* ── Banners (DS-04): 28 tall inset row, 2 px rail in the signal color ── */
export type BannerKind = 'offline' | 'warning' | 'info' | 'high'

export function Banner({
  kind,
  word,
  children,
  action,
  onAction,
  busy,
}: {
  kind: BannerKind
  /** The status word; defaults to the kind. */
  word?: string
  children: ReactNode
  action?: string
  onAction?: () => void
  /** Retry in flight: the button keeps its width and reads "Retrying" with the 14 px spinner (R6). */
  busy?: boolean
}) {
  return (
    <div className={`acc-banner is-${kind}`} role={kind === 'warning' || kind === 'high' ? 'alert' : 'status'}>
      <BannerIcon kind={kind} />
      <span className="acc-banner-word">{word ?? kind}</span>
      <span className="acc-banner-text">{children}</span>
      <span className="acc-grow" />
      {action && (
        <button type="button" className={`acc-banner-btn${busy ? ' is-busy' : ''}`} onClick={onAction} disabled={busy}>
          <span className="acc-banner-btn-label">{action}</span>
          {action === 'Retry' && (
            <span className="acc-banner-btn-busy" aria-hidden={!busy}>
              <Spinner size={14} />
              Retrying
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function BannerIcon({ kind }: { kind: BannerKind }) {
  if (kind === 'offline')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M1 3.5a6 6 0 018 0M2.6 5.3a3.6 3.6 0 014.8 0M5 7.6v.1M1.5 1.5l7 7" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    )
  if (kind === 'warning')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 1.2l4 7.3H1z" fill="none" stroke="var(--color-signal-warn)" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    )
  if (kind === 'high')
    return (
      <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
        <path d="M7 2v6M7 11v.5" fill="none" stroke="var(--color-signal-bad)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <circle cx="5" cy="5" r="4" fill="none" stroke="var(--color-signal-info)" strokeWidth="1.2" />
      <path d="M5 4.5v2.5M5 3v.1" fill="none" stroke="var(--color-signal-info)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/* ── Spinner (DS-08): 2 px ring, 270° arc, always beside a stage word ── */
export function Spinner({ size = 14, onAccent }: { size?: 14 | 20 | 28; onAccent?: boolean }) {
  const r = (size - 2) / 2
  const c = 2 * Math.PI * r
  return (
    <svg className="acc-spinner" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2" className={onAccent ? 'acc-spinner-track-accent' : 'acc-spinner-track'} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="2"
        strokeDasharray={`${0.75 * c} ${c}`}
        className={onAccent ? 'acc-spinner-arc-accent' : 'acc-spinner-arc'}
      />
    </svg>
  )
}

/** The wait, carried by a stage word and its estimate: "Checking your account · about 1 s". */
export function StageLine({ word, estimate }: { word: string; estimate?: string }) {
  return (
    <div className="acc-stage" role="status" aria-live="polite">
      <Spinner size={14} />
      <span className="acc-stage-word">{word}</span>
      <span className="acc-grow" />
      {estimate && <span className="mono acc-stage-estimate">{estimate}</span>}
    </div>
  )
}

/* ── Links and small icons ──────────────────────────────────────────── */
export function TextLink({ children, onClick, strong, disabled }: { children: ReactNode; onClick?: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`acc-link${strong ? ' is-strong' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function IconDb() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <ellipse cx="7" cy="3.5" rx="4.5" ry="1.8" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.2" />
      <path d="M2.5 3.5v7c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-7M2.5 7c0 1 2 1.8 4.5 1.8S11.5 8 11.5 7" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.2" />
    </svg>
  )
}

export function IconCross({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="var(--color-signal-bad)" strokeWidth={size === 14 ? 1.5 : 1.6} strokeLinecap="round" />
    </svg>
  )
}

export function IconWarn({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2.5l5 9H2z" fill="none" stroke="var(--color-signal-warn)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCheck({ size = 14, color = 'var(--color-text-primary)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
