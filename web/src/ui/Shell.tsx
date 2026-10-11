/*
 * The workbench shell, measured from the master MVN-0 (DS-06):
 * top bar 52 (2px ground border) · rail 52 incl. its 2px ground border · tab band 42 with 31-tall r4
 * tiles and a 3px mint underline · inspector 380 · 4px ground gutters.
 *
 * The rail (fix round 3, DS-08 "Rail navigation"): New run, Runs, Repo, Leaderboard, Help; Settings,
 * Account and Expand at the foot. 24px icons on a 70px pitch, the whole 52 × 70 row is the hit area.
 * Hover brightens the icon in 150 ms and shows the label chip at once; the current item carries the
 * 2px yellow bar and a yellow icon and snaps on click. Expand widens the rail to 200 (remembered).
 * Keyboard: Tab reaches the rail as one stop, ↑ ↓ move the yellow outline, Enter or Space opens,
 * Esc returns to the main column, g then n / r / p / l / a jumps from anywhere.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { navigate, redo, ROUTES, undo, useHistoryPosition, type RoutePath } from '../app/router'
import { actions } from '../data/run'
import { useReducedMotion, setReducedMotion } from './motionPreference'
import { usePresence } from './presence'
import { isTyping, railFocus, setRailExpanded, useRailExpanded } from './railState'
import { Switch } from './parts'
import {
  IconAccount,
  IconHelp,
  IconLeaderboard,
  IconNewRun,
  IconPlus,
  IconRailChevron,
  IconRedo,
  IconRepo,
  IconRuns,
  IconSettings,
  IconUndo,
  LogoBurst,
} from './icons'
import './shell.css'

export type RailItem = 'new' | 'runs' | 'repo' | 'leaderboard' | 'help' | 'settings' | 'account'

/** One badge per item at most: the Runs count while runs are in progress, the Repo dot after a CI regression. */
export type RailBadges = {
  /** Runs in progress; the 16px count chip shows when above 0. */
  runs?: number
  /** The last CI check regressed: the 6px pink dot on Repo. */
  repoRegressed?: boolean
}

type ShellProps = {
  /** Second word in the top bar: Workbench, Repo, Report… */
  context?: string
  /** The current rail item (D6): new on intake, runs on the workbench screens, repo, leaderboard, account. */
  rail: RailItem
  /** Rail badges, e.g. `{ runs: 1 }` on S-04 to S-07 while a run is in progress. */
  railBadges?: RailBadges
  tabs?: ReactNode
  inspector: ReactNode
  children: ReactNode
  /** Right side of the top bar. Defaults to GPU online + job id. */
  status?: ReactNode
}

export function Shell({ context = 'Workbench', rail, railBadges, tabs, inspector, children, status }: ShellProps) {
  const main = useRef<HTMLElement>(null)
  return (
    <div className="shell">
      <TopBar context={context} status={status} />
      <div className="shell-body">
        <Rail active={rail} badges={railBadges} main={main} />
        <main className="shell-main" ref={main} tabIndex={-1}>
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

/* ── Rail ────────────────────────────────────────────────────────────── */
type RailEntry = {
  id: RailItem | 'expand'
  label: string
  /** g then this key jumps here */
  key?: string
  /** a screen, or a popover that opens in place */
  to?: RoutePath
  menu?: 'settings' | 'help'
  icon: ReactNode
  /** a rule above it in the expanded rail */
  rule?: boolean
}

const TOP: RailEntry[] = [
  { id: 'new', label: 'New run', key: 'n', to: ROUTES.newRun, icon: <IconNewRun /> },
  { id: 'runs', label: 'Runs', key: 'r', to: ROUTES.runs, icon: <IconRuns /> },
  { id: 'repo', label: 'Repo', key: 'p', to: ROUTES.repo, icon: <IconRepo /> },
  { id: 'leaderboard', label: 'Leaderboard', key: 'l', to: ROUTES.leaderboard, icon: <IconLeaderboard />, rule: true },
  { id: 'help', label: 'Help', menu: 'help', icon: <IconHelp /> },
]
const BOTTOM: RailEntry[] = [
  { id: 'settings', label: 'Settings', menu: 'settings', icon: <IconSettings /> },
  { id: 'account', label: 'Account', key: 'a', to: ROUTES.account, icon: <IconAccount /> },
]
const JUMPS: Record<string, { id: RailItem; to: RoutePath }> = Object.fromEntries(
  [...TOP, ...BOTTOM].filter((e) => e.key && e.to).map((e) => [e.key, { id: e.id as RailItem, to: e.to! }]),
)
/** g, then the letter within this window */
const CHORD_MS = 1200

export function Rail({
  active,
  badges,
  main,
}: {
  active: RailItem
  badges?: RailBadges
  /** where Esc sends focus; defaults to the shell's main column */
  main?: RefObject<HTMLElement | null>
}) {
  const expanded = useRailExpanded()
  const [menu, setMenu] = useState<'settings' | 'help' | null>(null)
  const entries: RailEntry[] = [
    ...TOP,
    ...BOTTOM,
    { id: 'expand', label: expanded ? 'Collapse' : 'Expand', icon: <IconRailChevron collapse={expanded} /> },
  ]
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const currentIndex = Math.max(
    0,
    entries.findIndex((e) => e.id === active),
  )
  const [stop, setStop] = useState(currentIndex)
  const nav = useRef<HTMLElement>(null)

  // A rail that navigated with focus hands it to the new screen's rail.
  useEffect(() => {
    if (railFocus.take()) refs.current[currentIndex]?.focus()
  }, [currentIndex])

  // g then n / r / p / l / a, from anywhere on a screen with the rail.
  useEffect(() => {
    let armed = 0
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const now = performance.now()
      if (armed && now - armed < CHORD_MS && JUMPS[e.key]) {
        armed = 0
        e.preventDefault()
        const jump = JUMPS[e.key]
        if (jump.id !== active) navigate(jump.to)
        return
      }
      armed = e.key === 'g' ? now : 0
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const open = (entry: RailEntry) => {
    if (entry.id === 'expand') return setRailExpanded(!expanded)
    if (entry.menu) return setMenu((m) => (m === entry.menu ? null : entry.menu!))
    // The current item does nothing; anything else snaps the marker and fades the main column in.
    if (entry.id === active || !entry.to) return
    if (nav.current?.contains(document.activeElement)) railFocus.hand()
    navigate(entry.to)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const last = entries.length - 1
    const move = (i: number) => {
      e.preventDefault()
      setStop(i)
      refs.current[i]?.focus()
    }
    if (e.key === 'ArrowDown') move(stop >= last ? 0 : stop + 1)
    else if (e.key === 'ArrowUp') move(stop <= 0 ? last : stop - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(last)
    else if (e.key === 'Escape') {
      e.preventDefault()
      if (menu) {
        setMenu(null)
        return
      }
      ;(main?.current ?? document.querySelector<HTMLElement>('.shell-main'))?.focus()
    }
  }

  const item = (entry: RailEntry, i: number) => {
    const current = entry.id === active
    const runs = entry.id === 'runs' && badges?.runs ? badges.runs : 0
    const dot = entry.id === 'repo' && !!badges?.repoRegressed
    const aria = runs ? `${entry.label}, ${runs} in progress` : dot ? `${entry.label}, last CI check regressed` : entry.label
    const slot = (
      <div key={entry.id} className={`rail-slot${entry.rule ? ' has-rule' : ''}`}>
        <button
          ref={(el) => {
            refs.current[i] = el
          }}
          className={`rail-item${current ? ' is-current' : ''}`}
          aria-label={aria}
          aria-current={current && entry.to ? 'page' : undefined}
          aria-expanded={entry.menu ? menu === entry.menu : entry.id === 'expand' ? expanded : undefined}
          aria-keyshortcuts={entry.key ? `g ${entry.key}` : undefined}
          tabIndex={i === stop ? 0 : -1}
          onFocus={() => setStop(i)}
          onClick={() => open(entry)}
        >
          <span className="rail-disc">{entry.icon}</span>
          <span className="rail-label">{entry.label}</span>
          {current && <span className="rail-marker" />}
          {runs > 0 && (
            <span key={runs} className="rail-count mono" aria-hidden>
              {runs}
            </span>
          )}
          {dot && <span className="rail-dot" aria-hidden />}
        </button>
        {!expanded && (
          <span className="rail-tip" aria-hidden>
            <span>{entry.label}</span>
            {entry.key && <span className="rail-tip-key mono">g {entry.key}</span>}
          </span>
        )}
        {entry.menu && (
          <RailMenu open={menu === entry.menu} label={entry.label} onClose={() => setMenu(null)}>
            {entry.menu === 'settings' ? <SettingsPanel /> : <HelpPanel />}
          </RailMenu>
        )}
      </div>
    )
    return slot
  }

  return (
    <nav ref={nav} className={`rail${expanded ? ' is-expanded' : ''}`} aria-label="Main" onKeyDown={onKeyDown}>
      <div className="rail-nav">{TOP.map((e, i) => item(e, i))}</div>
      <div className="rail-bottom">{entries.slice(TOP.length).map((e, i) => item(e, TOP.length + i))}</div>
    </nav>
  )
}

/** A rail popover: fades in 200 in place, out 150; outside click or Esc closes it. */
function RailMenu({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const { mounted, leaving } = usePresence(open)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const slot = ref.current?.parentElement
      if (slot && !slot.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open, onClose])
  if (!mounted) return null
  return (
    <div ref={ref} className={`rail-popover${leaving ? ' is-leaving' : ''}`} role="dialog" aria-label={label}>
      {children}
    </div>
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

/* ── Rail menus ─────────────────────────────────────────────────────── */
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

const SHORTCUTS: [string, string][] = [
  ['New run', 'g n'],
  ['Runs', 'g r'],
  ['Repo', 'g p'],
  ['Leaderboard', 'g l'],
  ['Account', 'g a'],
  ['Move in the rail', '↑ ↓'],
  ['Back to the work', 'Esc'],
]

function HelpPanel() {
  return (
    <>
      <div className="popover-title">Help</div>
      <div className="popover-note">Keys work on every screen with the rail.</div>
      {SHORTCUTS.map(([what, keys]) => (
        <div key={what} className="popover-row">
          <span>{what}</span>
          <span className="mono popover-value">{keys}</span>
        </div>
      ))}
      <button className="btn-editor popover-action" onClick={() => navigate(ROUTES.template)}>
        Open the shell template
      </button>
    </>
  )
}
