/*
 * S-19 main column (board PHB-0): Account, Stored in your account, Sessions and tokens, Recent activity.
 */
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { navigate, ROUTES } from '../../app/router'
import { ACCOUNT_DATA_MODEL, kb, mb, type Activity, type ActivityIcon, type AccountCopy, type NewToken, type SavedRun } from '../../data/account'
import { EditorButton } from '../../ui/parts'
import { Sk, SkRegion } from '../../ui/Skeleton'
import { copyText } from './hooks'
import { Banner, StageLine, TextLink } from './parts'

/* ── Tile frame ─────────────────────────────────────────────────────── */
function AccTile({ title, meta, className = '', children }: { title: string; meta?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`acc19-tile ${className}`} aria-label={title}>
      <div className="acc-tile-header">
        <div className="acc-tile-tab">{title}</div>
        {meta != null && <div className="acc-tile-meta">{meta}</div>}
      </div>
      {children}
    </section>
  )
}

/** Events share the tile's height but stop growing at the board's pitch, so a short list stays at the top. */
const EVENT_MAX = 57

/** Inset rows from board 1IED-0, rules included: exports 22, runs by item 24; head 18 + 4 padding + 2 border. */
const EXPORT_ROW = 22
const ITEM_ROW = 24
const INSET_CHROME = 24
const GAP = 12

const Unit = ({ children }: { children: ReactNode }) => <span className="acc19-unit">{children}</span>

/* ── Account ────────────────────────────────────────────────────────── */
export function AccountTile({
  meta,
  loading,
  handle,
  email,
  onHandle,
  onEmail,
  createdAt,
  plan,
  disabled,
  handleRef,
}: {
  meta: string
  loading: boolean
  handle: string
  email: string
  onHandle: (v: string) => void
  onEmail: (v: string) => void
  createdAt: string
  plan: string
  disabled?: boolean
  handleRef: RefObject<HTMLInputElement | null>
}) {
  const [day, time] = createdAt.split(' ')
  if (loading)
    return (
      <AccTile title="Account" meta={meta} className="acc19-account">
        <SkRegion label="Loading your account" className="acc19-body">
          <div className="acc19-row is-ruled">
            <StageLine word="Loading your account" estimate="about 1 s" />
          </div>
          <KV label="Handle" ruled>
            <Sk w="100%" h={26} style={{ flex: '1 1 0' }} />
          </KV>
          <KV label="Email" ruled>
            <Sk w="100%" h={26} style={{ flex: '1 1 0' }} />
          </KV>
          <KV label="Created" ruled>
            <Sk w={140} h={12} />
          </KV>
          <KV label="Plan">
            <Sk w={80} h={12} />
          </KV>
        </SkRegion>
      </AccTile>
    )
  return (
    <AccTile title="Account" meta={meta} className="acc19-account">
      <div className="acc19-body">
        <KV label="Handle" ruled htmlFor="acc19-handle">
          <span className="acc-input-box acc19-input">
            <input
              id="acc19-handle"
              ref={handleRef}
              className="acc-input mono"
              value={handle}
              disabled={disabled}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="username"
              onChange={(e) => onHandle(e.target.value)}
            />
          </span>
        </KV>
        <KV label="Email" ruled htmlFor="acc19-email">
          <span className="acc-input-box acc19-input">
            <input
              id="acc19-email"
              className="acc-input"
              type="email"
              value={email}
              disabled={disabled}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="email"
              onChange={(e) => onEmail(e.target.value)}
            />
          </span>
        </KV>
        <KV label="Created" ruled>
          <span className="acc19-value">
            <span className="mono">{day}</span>
            <span className="mono acc19-unit">{time} local</span>
          </span>
        </KV>
        <KV label="Plan">
          <span className="acc19-value">{plan}</span>
        </KV>
      </div>
    </AccTile>
  )
}

function KV({ label, ruled, htmlFor, children }: { label: string; ruled?: boolean; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={`acc19-row${ruled ? ' is-ruled' : ''}`}>
      {htmlFor ? (
        <label className="acc19-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="acc19-label">{label}</span>
      )}
      {children}
    </div>
  )
}

/* ── Stored in your account ─────────────────────────────────────────── */
export function StoredTile({
  copy,
  meta,
  loading,
  banner,
  pending,
  machineCopy,
}: {
  copy: AccountCopy
  meta: string
  loading: boolean
  /** The one sync banner on the screen (Q901 or offline), with its Retry. */
  banner: ReactNode
  /** Runs on this machine the account does not have yet. */
  pending: SavedRun[]
  /** Showing this machine's copy (sync failed or offline): the rows say so. */
  machineCopy: boolean
}) {
  const runBytes = copy.runs.reduce((n, r) => n + r.bytes, 0)
  const exportBytes = copy.exports.reduce((n, e) => n + e.bytes, 0)
  const items = (['sidechain_qaoa.qasm', 'sbox_oracle.qasm'] as const)
    .map((item) => {
      const runs = copy.runs.filter((r) => r.item === item)
      return { item, count: runs.length, bytes: runs.reduce((n, r) => n + r.bytes, 0) }
    })
    .filter((i) => i.count > 0)
  const empty = copy.runs.length === 0 && copy.exports.length === 0

  // The insets take what the tile has left and never show a cut row: the exports list shows whole
  // rows (the rest scrolls), and on short windows an inset that cannot fit one row steps out.
  const bodyRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ items: boolean; rows: number } | null>(null)
  const hasBanner = !!banner
  useLayoutEffect(() => {
    const body = bodyRef.current
    const group = groupRef.current
    if (!body || !group) return
    const measure = () => {
      const pad = parseFloat(getComputedStyle(body).paddingBottom) || 0
      const avail = body.getBoundingClientRect().bottom - pad - group.getBoundingClientRect().bottom
      const itemsH = INSET_CHROME + items.length * ITEM_ROW
      const showItems = avail >= GAP + itemsH
      const left = avail - (showItems ? GAP + itemsH : 0) - GAP - INSET_CHROME
      const rows = Math.max(0, Math.floor(left / EXPORT_ROW))
      setFit((f) => (f && f.items === showItems && f.rows === rows ? f : { items: showItems, rows }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(body)
    return () => ro.disconnect()
  }, [hasBanner, pending.length, loading, empty, items.length])
  const showItems = fit ? fit.items : true
  const rows = fit ? fit.rows : copy.exports.length
  const clamp = rows < copy.exports.length ? { maxHeight: rows * EXPORT_ROW } : undefined

  return (
    <AccTile title="Stored in your account" meta={meta} className="acc19-stored">
      <div className="acc19-body acc19-stored-body" ref={bodyRef}>
        {banner}
        <div className="acc19-group" ref={groupRef}>
          <div className="acc19-sentence">{ACCOUNT_DATA_MODEL}</div>
          <div className="acc19-row is-ruled">
            <span className="acc19-label is-wide">Runs</span>
            {loading ? (
              <Sk w={180} h={12} />
            ) : (
              <span className="acc19-count">
                <span className="mono">{copy.runs.length}</span>
                <Unit>
                  {copy.runs.length === 1 ? 'run' : 'runs'}
                  {machineCopy ? " · this machine's copy" : copy.runs.length ? <span className="acc19-suffix"> · rounds and scorecards</span> : ''}
                </Unit>
              </span>
            )}
            {loading ? <Sk w={44} h={12} /> : <Size value={mb(runBytes)} unit="MB" />}
          </div>
          {pending.length > 0 && (
            <div className="acc19-row is-ruled">
              <span className="acc19-label is-wide">Not yet synced</span>
              <span className="acc19-count">
                <span className="mono">{pending.length}</span>
                <Unit>
                  {pending.length === 1 ? 'run' : 'runs'} · {pending.map((r) => r.id).join(', ')} · waits
                </Unit>
              </span>
              <Size value={mb(pending.reduce((n, r) => n + r.bytes, 0))} unit="MB" />
            </div>
          )}
          <div className={`acc19-row${empty ? ' is-ruled' : ''}`}>
            <span className="acc19-label is-wide">Exports (final .qasm you chose to upload)</span>
            {loading ? (
              <Sk w={60} h={12} />
            ) : (
              <span className="acc19-count">
                <span className="mono">{copy.exports.length}</span>
                <Unit>{copy.exports.length === 1 ? 'file' : 'files'}</Unit>
              </span>
            )}
            {loading ? <Sk w={44} h={12} /> : <Size value={mb(exportBytes)} unit="MB" />}
          </div>
        </div>

        {loading ? (
          <>
            {/* blocks the size of the two insets: the real shape, no numbers before they arrive */}
            <Sk w="100%" h={72} />
            <Sk w="100%" h={156} />
          </>
        ) : empty ? (
          <div className="acc19-empty">
            <div className="acc19-empty-title">Nothing stored yet.</div>
            <div className="acc19-empty-body">
              Your first run is saved here when it finishes. Start one from <TextLink onClick={() => navigate(ROUTES.newRun)}>New run</TextLink>.
            </div>
          </div>
        ) : (
          <>
            {showItems && (
            <div className="acc19-inset">
              <div className="acc19-inset-head">
                <span className="acc19-group-label">runs by item</span>
                <span className="acc19-axis">bar = share of {mb(runBytes)} MB</span>
              </div>
              {items.map((i, n) => (
                    <div key={i.item} className={`acc19-item-row${n < items.length - 1 ? ' is-ruled' : ''}`}>
                      <span className="mono acc19-item-name">{i.item}</span>
                      <span className="acc19-item-count">
                        <span className="mono">{i.count}</span>
                        <Unit>runs</Unit>
                      </span>
                      <span className="acc19-bar">
                        <span style={{ width: `${Math.round((100 * i.bytes) / runBytes)}%` }} />
                      </span>
                      <span className="acc19-item-size">
                        <span className="mono">{mb(i.bytes)}</span>
                        <Unit>MB</Unit>
                      </span>
                    </div>
                  ))}
            </div>
            )}
            {rows > 0 && (
            <div className="acc19-inset acc19-exports">
              <div className="acc19-inset-head">
                <span className="acc19-group-label">exports</span>
                <span className="acc19-axis">final .qasm · from run · size</span>
              </div>
              <div className="acc19-exports-list" style={clamp} tabIndex={clamp ? 0 : undefined} aria-label={clamp ? 'Exports, scrolls' : undefined}>
                {copy.exports.map((e, n) => (
                      <div key={`${e.fromRun}-${n}`} className={`acc19-export-row${n < copy.exports.length - 1 ? ' is-ruled' : ''}`}>
                        <span className="mono acc19-export-file">{e.file}</span>
                        <span className="mono acc19-export-run">{e.fromRun}</span>
                        <span className="acc19-export-size">
                          <span className="mono">{kb(e.bytes)}</span>
                          <span className="acc19-unit acc19-kb">KB</span>
                        </span>
                      </div>
                    ))}
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </AccTile>
  )
}

function Size({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="acc19-size">
      <span className="mono">{value}</span>
      <Unit>{unit}</Unit>
    </span>
  )
}

/* ── Sessions and tokens ────────────────────────────────────────────── */
export function SessionsTile({
  copy,
  signedIn,
  loading,
  newToken,
  creating,
  onCreateToken,
}: {
  copy: AccountCopy
  signedIn: string
  loading: boolean
  newToken: NewToken | null
  creating: boolean
  onCreateToken: () => void
}) {
  const tokens = copy.tokens.filter((t) => t.name !== newToken?.name)
  const count = tokens.length + (newToken ? 1 : 0)
  return (
    <AccTile title="Sessions and tokens" meta={`1 session · ${count} ${count === 1 ? 'token' : 'tokens'}`} className="acc19-sessions">
      <div className="acc19-body">
        <div className="acc19-row is-ruled is-between">
          <span className="acc19-group-label">sessions</span>
          <span className="acc19-axis">where · signed in</span>
        </div>
        <div className="acc19-row is-ruled acc19-gap">
          <IconLaptop />
          <span>this machine</span>
          <span className="acc19-note">this session</span>
          <span className="acc-grow" />
          {loading ? <Sk w={120} h={12} /> : <span className="mono">signed in {signedIn}</span>}
        </div>
        <div className={`acc19-row is-between${count || loading ? ' is-ruled' : ''}`}>
          <span className="acc19-baseline">
            <span className="acc19-group-label">tokens</span>
            <span className="acc19-axis">for the GitHub Action and scripts</span>
          </span>
          <EditorButton onClick={onCreateToken} disabled={creating || loading}>
            {creating ? 'Creating token' : 'Create token'}
          </EditorButton>
        </div>
        {loading ? (
          <div className="acc19-row acc19-gap">
            <Sk w={14} h={14} />
            <Sk w={180} h={12} />
          </div>
        ) : null}
        {!loading && tokens.map((t, i) => (
          <div key={t.name} className={`acc19-row acc19-gap${i < tokens.length - 1 || newToken ? ' is-ruled' : ''}`}>
            <IconKey />
            <span className="mono">{t.name}</span>
            <span className="mono acc19-meta">
              ····{t.last4} · {t.scope}
            </span>
            <span className="acc-grow" />
            <span className="mono">{t.usedAt ? `used ${t.usedAt}` : 'not used yet'}</span>
          </div>
        ))}
        {newToken && <NewTokenRows token={newToken} />}
      </div>
    </AccTile>
  )
}

function NewTokenRows({ token }: { token: NewToken }) {
  return (
    <>
      <div className="acc19-row acc19-gap acc19-flash">
        <IconKey />
        <span className="mono">{token.name}</span>
        <span className="mono acc19-secret">{token.secret}</span>
        <span className="acc-grow" />
        <EditorButton doneLabel="Copied" onClick={() => copyText(token.secret)}>
          Copy
        </EditorButton>
      </div>
      <Banner kind="info">
        Shown once. Store it in your repo secrets as <span className="mono">GATESMITH_TOKEN</span>
      </Banner>
    </>
  )
}

/* ── Recent activity ────────────────────────────────────────────────── */
export function ActivityTile({ activity, loading }: { activity: Activity[]; loading: boolean }) {
  const days = (['today', 'yesterday'] as const)
    .map((day) => ({ day, events: activity.filter((a) => a.day === day) }))
    .filter((d) => d.events.length > 0)
  return (
    <AccTile title="Recent activity" meta="newest first · times local" className="acc19-activity">
      <div className="acc19-activity-body">
        {loading ? (
          <SkRegion label="Loading activity" className="acc19-activity-group" style={{ flexGrow: 1 }}>
            <div className="acc19-day">
              <Sk w={40} h={10} />
            </div>
            {[150, 120, 170, 140, 110].map((w, i) => (
              <div key={i} className="acc19-event is-ruled">
                <Sk w={32} h={10} />
                <span className="acc19-event-text">
                  <Sk w={w * 0.6} h={12} />
                  <Sk w={w} h={10} />
                </span>
                <Sk w={56} h={12} />
              </div>
            ))}
          </SkRegion>
        ) : (
          days.map((d, di) => (
            <Fragment key={d.day}>
              <div className="acc19-day">
                <span className="acc19-group-label">{d.day}</span>
                <span className="acc19-axis">
                  {d.events[0].date} · {d.events.length} {d.events.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              <div className="acc19-activity-group" style={{ flexGrow: d.events.length, maxHeight: d.events.length * EVENT_MAX }}>
                {d.events.map((a, i) => (
                  <div key={`${a.time}-${i}`} className={`acc19-event${di < days.length - 1 || i < d.events.length - 1 ? ' is-ruled' : ''}`}>
                    <span className="mono acc19-event-time">{a.time}</span>
                    <ActivityGlyph icon={a.icon} />
                    <span className="acc19-event-text" title={`${a.title} · ${a.detail}`}>
                      <span className={a.icon === 'failed' ? 'acc19-failed' : undefined}>{a.title}</span>
                      <span className="mono acc19-meta">{a.detail}</span>
                    </span>
                    <span className="mono acc19-event-value">{a.value}</span>
                  </div>
                ))}
              </div>
            </Fragment>
          ))
        )}
        <div className="acc19-activity-foot">Activity is kept for 30 days</div>
      </div>
    </AccTile>
  )
}

/* ── Icons ──────────────────────────────────────────────────────────── */
const S = 'var(--color-text-secondary)'

function ActivityGlyph({ icon }: { icon: ActivityIcon }) {
  switch (icon) {
    case 'running':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-label="running">
          <circle cx="7" cy="7" r="3" fill="var(--color-signal-info)" />
        </svg>
      )
    case 'queued':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-label="queued">
          <circle cx="7" cy="7" r="3.5" fill="none" stroke={S} strokeWidth="1.3" />
        </svg>
      )
    case 'export':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 2.5v6.5M4.2 6.5L7 9.3l2.8-2.8M2.5 11.5h9" fill="none" stroke={S} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'done':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-label="done">
          <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'action':
      return (
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
          <path d="M6 3.5v13M6 9.5c0 2.2 1.8 3 4 3h1.2a3 3 0 003-3V8" fill="none" stroke={S} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M14.2 6.2m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0" fill="none" stroke={S} strokeWidth="1.6" />
        </svg>
      )
    case 'token':
      return <IconKey />
    case 'failed':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-label="failed">
          <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="var(--color-signal-bad)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'sign-in':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1" fill="none" stroke={S} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )
  }
}

function IconKey() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="4.5" cy="7" r="2.5" fill="none" stroke={S} strokeWidth="1.2" />
      <path d="M7 7h6M11 7v2.2M13 7v1.6" fill="none" stroke={S} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconLaptop() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="2" y="3" width="10" height="6.5" rx="1" fill="none" stroke={S} strokeWidth="1.2" />
      <path d="M1 11.5h12" fill="none" stroke={S} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
