/*
 * The workbench shell, measured from the master MVN-0 (DS-06):
 * top bar 52 (2px ground border) · rail 52 incl. its 2px ground border · tab band 42 with 31-tall r4
 * tiles and a 3px mint underline · inspector 380 · 4px ground gutters.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, redo, ROUTES, undo, useHistoryPosition, type RoutePath } from '../app/router'
import { actions } from '../data/run'
import { useReducedMotion, setReducedMotion } from './motionPreference'
import { Switch } from './parts'
import {
  IconAccount,
  IconHelp,
  IconLeaderboard,
  IconNewRun,
  IconPlus,
  IconRedo,
  IconRepo,
  IconRuns,
  IconSettings,
  IconUndo,
  LogoBurst,
} from './icons'
import './shell.css'

export type RailItem = 'new' | 'runs' | 'repo' | 'leaderboard' | 'help' | 'settings' | 'account'

type ShellProps = {
  /** Second word in the top bar: Workbench, Repo, Report… */
  context?: string
  rail: RailItem
  tabs?: ReactNode
  inspector: ReactNode
  children: ReactNode
  /** Right side of the top bar. Defaults to GPU online + job id. */
  status?: ReactNode
}

export function Shell({ context = 'Workbench', rail, tabs, inspector, children, status }: ShellProps) {
  return (
    <div className="shell">
      <TopBar context={context} status={status} />
      <div className="shell-body">
        <Rail active={rail} />
        <main className="shell-main">
          {tabs}
          {children}
        </main>
        <aside className="shell-inspector" aria-label="Inspector">
          {inspector}
        </aside>
      </div>
    </div>
  )
}

export function TopBar({ context, status }: { context: string; status?: ReactNode }) {
  return (
    <header className="topbar">
      <button className="topbar-brand" onClick={() => navigate(ROUTES.newRun)} aria-label="Gatesmith home">
        <LogoBurst />
        <span className="topbar-name">Gatesmith</span>
        <span className="topbar-context">{context}</span>
      </button>
      <div className="topbar-status">
        {status ?? (
          <>
            <GpuStatus online />
            <span className="mono topbar-job">job 7f3a·0412</span>
          </>
        )}
      </div>
    </header>
  )
}

export function GpuStatus({ online }: { online: boolean }) {
  return (
    <span className="gpu-status">
      <span className="gpu-dot" style={{ background: online ? 'var(--color-text-primary)' : 'var(--color-text-disabled)' }} />
      {online ? 'GPU online' : 'GPU offline'}
    </span>
  )
}

const RAIL: { id: RailItem; label: string; to: RoutePath; icon: (c: string) => ReactNode }[] = [
  { id: 'new', label: 'New run', to: ROUTES.newRun, icon: (c) => <IconNewRun color={c} /> },
  { id: 'runs', label: 'Runs', to: ROUTES.runs, icon: (c) => <IconRuns color={c} /> },
  { id: 'repo', label: 'Repo', to: ROUTES.repo, icon: (c) => <IconRepo color={c} /> },
  { id: 'leaderboard', label: 'Leaderboard', to: ROUTES.leaderboard, icon: (c) => <IconLeaderboard color={c} /> },
  { id: 'help', label: 'Help', to: ROUTES.template, icon: (c) => <IconHelp color={c} /> },
]

export function Rail({ active }: { active: RailItem }) {
  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-nav">
        {RAIL.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              className="rail-item"
              aria-label={item.label}
              aria-current={on ? 'page' : undefined}
              title={item.label}
              onClick={() => navigate(item.to)}
            >
              <span className="rail-disc">{item.icon(on ? '#F8D441' : '#ADC5CA')}</span>
              {on && <span className="rail-marker" />}
            </button>
          )
        })}
      </div>
      <div className="rail-bottom">
        <RailPopover label="Settings" trigger={(on) => <span className="rail-disc"><IconSettings color={on ? '#FFFFFF' : '#ADC5CA'} /></span>}>
          <SettingsPanel />
        </RailPopover>
        <RailPopover label="Account" trigger={() => <span className="rail-avatar"><IconAccount color="#ADC5CA" /></span>}>
          <AccountPanel />
        </RailPopover>
      </div>
    </nav>
  )
}

export type RunTab = { id: string; label: string; active?: boolean; onClick?: () => void }

/** A tab without its own handler: a circuit opens in New run, "New run" goes there. */
function defaultTabAction(label: string) {
  if (label === 'sbox_oracle.qasm') {
    actions.selectExample('sbox_oracle')
    navigate(ROUTES.newRun)
  } else if (label === 'sidechain_qaoa.qasm') {
    navigate(ROUTES.workspace)
  } else if (label === 'New run') {
    navigate(ROUTES.newRun)
  }
}

/** One tab per circuit, on the ground. Active gets the 2px mint underline. */
export function TabStrip({ tabs }: { tabs: RunTab[]; canRedo?: boolean }) {
  const { canUndo, canRedo } = useHistoryPosition()
  return (
    <div className="tabstrip">
      <div className="tabstrip-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={!!t.active}
            className={`run-tab${t.active ? ' is-active' : ''}`}
            onClick={t.onClick ?? (t.active ? undefined : () => defaultTabAction(t.label))}
          >
            {t.label}
          </button>
        ))}
        <button className="run-tab-add" aria-label="New tab" title="New run" onClick={() => navigate(ROUTES.newRun)}>
          <IconPlus />
        </button>
      </div>
      <div className="tabstrip-history">
        <button aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}>
          <IconUndo color={canUndo ? '#FFFFFF' : '#667E83'} />
        </button>
        <button aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}>
          <IconRedo color={canRedo ? '#FFFFFF' : '#667E83'} />
        </button>
      </div>
    </div>
  )
}

/** Tiles on 4px gutters under the tab strip. */
export function Content({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`shell-content ${className}`}>{children}</div>
}

/* ── Rail popovers: settings and account ─────────────────────────────── */
function RailPopover({ label, trigger, children }: { label: string; trigger: (open: boolean) => ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="rail-popover-anchor" ref={ref}>
      <button className="rail-item" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {trigger(open)}
      </button>
      {open && (
        <div className="rail-popover" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  )
}

function SettingsPanel() {
  const reduced = useReducedMotion()
  return (
    <>
      <div className="popover-title">Settings</div>
      <label className="popover-row">
        <span>Reduce motion</span>
        <Switch on={reduced} onChange={setReducedMotion} label="Reduce motion" />
      </label>
      <div className="popover-row">
        <span>Engine</span>
        <span className="mono popover-value">qscore-2026.1</span>
      </div>
      <div className="popover-row">
        <span>Data</span>
        <span className="popover-value">scripted demo run</span>
      </div>
      <button className="btn-editor popover-action" onClick={() => actions.reset()}>
        Restart the demo
      </button>
    </>
  )
}

function AccountPanel() {
  return (
    <>
      <div className="popover-title">Local session</div>
      <div className="popover-note">Laptop mode. Circuits, scores and reports stay on this machine.</div>
      <div className="popover-row">
        <span>GitHub</span>
        <span className="mono popover-value">knighthacks</span>
      </div>
      <div className="popover-row">
        <span>Platform queue</span>
        <span className="popover-value">not signed in</span>
      </div>
    </>
  )
}
