/*
 * S-11 · PR comment. A neutral, light code-host pull request page with the gatesmith bot's score comment.
 * It follows the host page's rendering, not the Gatesmith shell (no rail, no top bar). Paper boards 1AQF-0
 * (improved) and 1FRW-0 (states). The comment is markdown on the host's page: its one interactive element is
 * the run link, so keyboard focus lands there.
 */
import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import './pr/pr.css'

type PrState = 'improved' | 'regressed' | 'partial' | 'first-run' | 'running' | 'error' | 'gpu-off' | 'focus'

/** Board captions kebab-cased, plus the names older links used. */
const ALIASES: Record<string, PrState> = {
  'score-regressed': 'regressed',
  failed: 'regressed',
  'first-run-on-the-repo': 'first-run',
  empty: 'first-run',
  loading: 'running',
  offline: 'gpu-off',
  'keyboard-focus': 'focus',
}

function readState(raw: string | null): PrState {
  if (!raw) return 'improved'
  const known: PrState[] = ['improved', 'regressed', 'partial', 'first-run', 'running', 'error', 'gpu-off', 'focus']
  return (known as string[]).includes(raw) ? (raw as PrState) : (ALIASES[raw] ?? 'improved')
}

/* ── Icons (16 px, filled, the host's grey) ─────────────────────────── */
const ICON = {
  menu: 'M1 2.75A.75.75 0 0 1 1.75 2h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 2.75Zm0 5A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75ZM1.75 12h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5Z',
  pr: 'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
  conversation:
    'M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z',
  commits: 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
  checks:
    'M2.5 1.75v11.5c0 .138.112.25.25.25h3.17a.75.75 0 0 1 0 1.5H2.75A1.75 1.75 0 0 1 1 13.25V1.75C1 .784 1.784 0 2.75 0h8.5C12.216 0 13 .784 13 1.75v7.736a.75.75 0 0 1-1.5 0V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13.274 9.537v-.001l-4.557 4.45a.75.75 0 0 1-1.055-.008l-1.943-1.95a.75.75 0 0 1 1.062-1.058l1.419 1.425 4.026-3.932a.75.75 0 1 1 1.048 1.074ZM4.75 4h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM4 7.75A.75.75 0 0 1 4.75 7h2a.75.75 0 0 1 0 1.5h-2A.75.75 0 0 1 4 7.75Z',
  files:
    'M1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073ZM8 3.25a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0V7h-1.5a.75.75 0 0 1 0-1.5h1.5V4A.75.75 0 0 1 8 3.25Zm-3 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z',
  kebab: 'M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
}

function Icon({ d, white }: { d: string; white?: boolean }) {
  return (
    <svg className={`pr-icon${white ? ' is-white' : ''}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d={d} />
    </svg>
  )
}

/** The bot's avatar: the Gatesmith mark drawn as an 8-bit glyph in the host's neutral grey. */
function BotAvatar() {
  const cells: [number, number, number][] = [
    [5, 3, 6], [3, 5, 2], [7, 5, 2], [11, 5, 2], [3, 7, 4], [9, 7, 4], [5, 9, 2], [9, 9, 2], [3, 11, 2], [7, 11, 2], [11, 11, 2],
  ]
  return (
    <svg className="pr-avatar" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7.5" className="pr-avatar-ring" />
      {cells.map(([x, y, w]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height="2" className="pr-avatar-cell" />
      ))}
    </svg>
  )
}

/* ── Metrics table ───────────────────────────────────────────────────── */
type Row = { metric: string; base: string; head: string; change: string; status: string; strong?: boolean }

const IMPROVED: Row[] = [
  { metric: 'two_qubit_count', base: '321 gates', head: '270 gates', change: '−15.9% · improved', status: 'computed' },
  { metric: 'two_qubit_depth', base: '202 layers', head: '178 layers', change: '−11.9% · improved', status: 'computed' },
  { metric: 'routing_overhead', base: '0.514 ratio', head: '0.421 ratio', change: '−18.1% · improved', status: 'computed' },
  { metric: 'reliability_heuristic', base: '0.263 (0, 1]', head: '0.318 (0, 1]', change: '+20.9% · improved', status: 'computed' },
]

const REGRESSED: Row[] = [
  { metric: 'two_qubit_count', base: '270 gates', head: '284 gates', change: '+5.2% · regressed', status: 'computed', strong: true },
  { metric: 'two_qubit_depth', base: '178 layers', head: '171 layers', change: '−3.9% · improved', status: 'computed' },
]

const PARTIAL: Row[] = [
  IMPROVED[0],
  IMPROVED[1],
  { metric: 'routing_overhead', base: '0.514 ratio', head: 'n/a', change: 'n/a', status: 'unavailable' },
  { metric: 'reliability_heuristic', base: '0.263 (0, 1]', head: 'n/a', change: 'n/a', status: 'unavailable' },
]

const FIRST_RUN: Row[] = IMPROVED.map((r) => ({ ...r, base: 'n/a', change: 'n/a' }))

function MetricsTable({ rows }: { rows: Row[] }) {
  return (
    <table className="pr-table">
      <thead>
        <tr>
          <th className="pr-col-metric">metric</th>
          <th className="pr-col-base is-num">base</th>
          <th className="pr-col-head is-num">head</th>
          <th className="pr-col-change is-num">change</th>
          <th className="pr-col-status">status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.metric}>
            <td>{r.metric}</td>
            <td className="is-num">{r.base}</td>
            <td className="is-num">{r.head}</td>
            <td className={`is-num${r.strong ? ' is-strong' : ''}`}>{r.change}</td>
            <td>{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Comment bodies per state ────────────────────────────────────────── */
function PrimaryLine({ children }: { children: ReactNode }) {
  return (
    <div className="pr-primary-line">
      <code className="pr-code">two_qubit_count</code>
      <span>{children}</span>
    </div>
  )
}

const REGRESSION_MESSAGE =
  'If results are stagnating, the changes improve the circuit in one way, but worsen it in another, or you suspect the pipeline has serious flaws, please consider making a GitHub Issue and documenting your problems'

function CommentBody({ state, linkRef }: { state: PrState; linkRef: RefObject<HTMLAnchorElement | null> }) {
  const openRun = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    navigate(ROUTES.report, { transition: 'forward' })
  }
  switch (state) {
    case 'regressed':
      // The fact comes first; the word "regressed" stays uncoloured.
      return (
        <>
          <PrimaryLine>(primary) regressed on this pull request: 270 → 284 gates (+5.2%).</PrimaryLine>
          <p className="pr-para">{REGRESSION_MESSAGE}</p>
          <MetricsTable rows={REGRESSED} />
        </>
      )
    case 'partial':
      return (
        <>
          <p className="pr-para">
            2 of 4 metrics computed. routing_overhead and reliability_heuristic are unavailable: the FakeTorino compile
            stopped at the Action's 10 min limit (Q302). Raise timeout-minutes in .github/workflows/gatesmith.yml.
          </p>
          <MetricsTable rows={PARTIAL} />
        </>
      )
    case 'first-run':
      return (
        <>
          <p className="pr-para">
            First Gatesmith check on this repository, so there is no base to compare. Values are for the head of this
            pull request.
          </p>
          <MetricsTable rows={FIRST_RUN} />
        </>
      )
    case 'running':
      return <p className="pr-para">Checking sidechain_qaoa.qasm against base 3b7d0f1 · started 11:42 · about 2 min</p>
    case 'error':
      return (
        <p className="pr-para">
          Gatesmith could not check this pull request. Unsupported gate (Q102) at sidechain_qaoa.qasm line 48: unknown
          gate rzx. Include qelib1.inc or rename the gate, then push again.
        </p>
      )
    case 'gpu-off':
      return (
        <p className="pr-para">
          GPU machine is off, model proposals wait. The engine keeps scoring on CPU; this comment updates when the fix
          round runs.
        </p>
      )
    default:
      return (
        <>
          <PrimaryLine>(primary) improved on this pull request: 321 → 270 gates (−15.9%).</PrimaryLine>
          <MetricsTable rows={IMPROVED} />
          <p className="pr-small">reliability_heuristic is a calibration-based reliability heuristic, not a success probability.</p>
          <div className="pr-finding">
            <h3 className="pr-h3">Top finding</h3>
            <div className="pr-finding-line">
              <strong>D01 Routing-dominated</strong>
              <span>· high · 0.421 ratio ≥ 0.30 · next: noise_aware_layout</span>
            </div>
          </div>
          <a ref={linkRef} className="pr-link" href="#/report" onClick={openRun}>
            Open the run in Gatesmith · 7f3a·0412
          </a>
          <p className="pr-small">qscore-2026.1 · FakeTorino 133 q · 8 seeds · base 3b7d0f1 · head 9c41e2a</p>
        </>
      )
  }
}

const POSTED: Record<PrState, string> = {
  improved: 'commented 2 minutes ago',
  regressed: 'commented 2 minutes ago',
  partial: 'commented 2 minutes ago',
  'first-run': 'commented 2 minutes ago',
  running: 'commented now',
  error: 'commented 1 minute ago',
  'gpu-off': 'commented 4 minutes ago',
  focus: 'commented 2 minutes ago',
}

export function S11PrComment() {
  const params = useHashParams()
  const state = readState(params.get('state'))
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (state === 'focus') linkRef.current?.focus({ preventScroll: true })
  }, [state])

  return (
    <div className="pr-page">
      <header className="pr-header">
        <span className="pr-menu" aria-hidden>
          <Icon d={ICON.menu} />
        </span>
        <button className="pr-crumbs" onClick={() => navigate(ROUTES.repo, { transition: 'back' })}>
          <span>qlab</span>
          <span className="pr-muted">/</span>
          <span className="pr-strong">sidechain-packing</span>
        </button>
      </header>

      <main className="pr-column">
        <h1 className="pr-title">
          <span>Reorder commuting block in sidechain_qaoa</span>
          <span className="pr-number">#41</span>
        </h1>
        <div className="pr-meta">
          <span className="pr-state">
            <Icon d={ICON.pr} white />
            <span>Open</span>
          </span>
          <span className="pr-meta-text">
            <span className="pr-strong">qlab-dev</span>
            <span className="pr-muted">wants to merge 3 commits into</span>
            <code className="pr-branch">main</code>
            <span className="pr-muted">from</span>
            <code className="pr-branch">reorder-commuting-block</code>
          </span>
        </div>

        <nav className="pr-tabs" aria-label="Pull request">
          <span className="pr-tab is-active" aria-current="page">
            <Icon d={ICON.conversation} />
            <span className="pr-strong">Conversation</span>
            <span className="pr-counter">3</span>
          </span>
          <span className="pr-tab">
            <Icon d={ICON.commits} />
            <span>Commits</span>
            <span className="pr-counter">3</span>
          </span>
          <span className="pr-tab">
            <Icon d={ICON.checks} />
            <span>Checks</span>
            <span className="pr-counter">2</span>
          </span>
          <span className="pr-tab">
            <Icon d={ICON.files} />
            <span>Files changed</span>
            <span className="pr-counter">4</span>
          </span>
        </nav>

        <article className="pr-comment" aria-label="gatesmith comment">
          <div className="pr-comment-head">
            <div className="pr-comment-who">
              <BotAvatar />
              <span className="pr-strong">gatesmith</span>
              <span className="pr-bot">bot</span>
              <span className="pr-muted">{POSTED[state]}</span>
            </div>
            <Icon d={ICON.kebab} />
          </div>
          <div className="pr-comment-body" key={state}>
            <CommentBody state={state} linkRef={linkRef} />
          </div>
        </article>
      </main>
    </div>
  )
}
