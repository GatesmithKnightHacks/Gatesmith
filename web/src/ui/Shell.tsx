/*
 * The workbench shell (S-00 · Shell template), measured from Paper:
 * top bar 52 (2px ground border) · rail 50 · tab strip 36 with 28-tall tabs · inspector 380 · 4px ground gutters.
 */
import type { ReactNode } from 'react'
import { navigate, ROUTES, type RoutePath } from '../app/router'
import {
  IconAccount,
  IconDocs,
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

export type RailItem = 'new' | 'runs' | 'repo' | 'docs' | 'help' | 'leaderboard'

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
      <span className="gpu-dot" style={{ background: online ? 'var(--color-signal-good)' : 'var(--color-text-disabled)' }} />
      {online ? 'GPU online' : 'GPU offline'}
    </span>
  )
}

const RAIL: { id: RailItem; label: string; to: RoutePath; icon: (c: string) => ReactNode }[] = [
  { id: 'new', label: 'New run', to: ROUTES.newRun, icon: (c) => <IconNewRun color={c} /> },
  { id: 'runs', label: 'Runs', to: ROUTES.runs, icon: (c) => <IconRuns color={c} /> },
  { id: 'repo', label: 'Repo', to: ROUTES.repo, icon: (c) => <IconRepo color={c} /> },
  { id: 'docs', label: 'Docs', to: ROUTES.template, icon: (c) => <IconDocs color={c} /> },
  { id: 'help', label: 'Help', to: ROUTES.template, icon: (c) => <IconHelp color={c} /> },
  { id: 'leaderboard', label: 'Leaderboard', to: ROUTES.leaderboard, icon: (c) => <IconLeaderboard color={c} /> },
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
              <span className={`rail-disc${on ? ' is-active' : ''}`}>{item.icon(on ? '#FFFFFF' : '#ADC5CA')}</span>
              {on && <span className="rail-marker" />}
            </button>
          )
        })}
      </div>
      <div className="rail-bottom">
        <button className="rail-item" aria-label="Settings" title="Settings">
          <span className="rail-disc">
            <IconSettings />
          </span>
        </button>
        <button className="rail-item" aria-label="Account" title="Account">
          <span className="rail-avatar">
            <IconAccount />
          </span>
        </button>
      </div>
    </nav>
  )
}

export type RunTab = { id: string; label: string; active?: boolean; onClick?: () => void }

/** One tab per circuit, on the ground. Active gets the 2px mint underline. */
export function TabStrip({ tabs, canRedo = false }: { tabs: RunTab[]; canRedo?: boolean }) {
  return (
    <div className="tabstrip">
      <div className="tabstrip-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={!!t.active}
            className={`run-tab${t.active ? ' is-active' : ''}`}
            onClick={t.onClick}
          >
            {t.label}
          </button>
        ))}
        <button className="run-tab-add" aria-label="New tab">
          <IconPlus />
        </button>
      </div>
      <div className="tabstrip-history">
        <button aria-label="Undo">
          <IconUndo />
        </button>
        <button aria-label="Redo" disabled={!canRedo}>
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
