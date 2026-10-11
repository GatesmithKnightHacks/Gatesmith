/*
 * S-11 · PR comment (E1). A GitHub pull request in dark dimmed with the gatesmith bot's score comment.
 * It follows GitHub's own rendering, not the Gatesmith shell or tokens. Static by design (M6).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { LogoBurst } from '../ui/icons'
import './pr/pr.css'

type PrState = 'passed' | 'loading' | 'empty' | 'failed' | 'error'

const s = (d: string, color = '#768390', extra: Record<string, string | number> = {}) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...extra} />
  </svg>
)

const PR_ICON = 'M4 2.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM4 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM12 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM4 5.5v5M12 10.5V6a2 2 0 00-2-2H8'
const ISSUE_ICON = 'M8 1.75a6.25 6.25 0 110 12.5 6.25 6.25 0 010-12.5zM8 7a1 1 0 110 2 1 1 0 010-2z'
const CODE_ICON = 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5'

export function S11PrComment() {
  const params = useHashParams()
  const state = (params.get('state') ?? 'passed') as PrState
  const goRuns = () => navigate(ROUTES.runs, { transition: 'forward' })

  return (
    <div className="gh">
      <header className="gh-header">
        <div className="gh-top">
          <span className="gh-iconbtn">{s('M2 4h12M2 8h12M2 12h12')}</span>
          <button className="gh-crumbs" onClick={() => navigate(ROUTES.repo, { transition: 'back' })}>
            <span>knighthacks</span>
            <span className="gh-muted">/</span>
            <span className="gh-strong">qaoa-packing</span>
          </button>
          <span className="gh-search">
            {s('M7 2.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM10.5 10.5l3 3')}
            <span className="gh-muted">Type / to search</span>
          </span>
          <span className="gh-actions">
            <span className="gh-iconbtn">{s('M8 3v10M3 8h10')}</span>
            <span className="gh-iconbtn">{s(ISSUE_ICON)}</span>
            <span className="gh-iconbtn">{s(PR_ICON)}</span>
            <span className="gh-iconbtn">{s('M2.5 9.5l1.6-6h7.8l1.6 6v3.5h-11zM2.5 9.5h3.2l.8 1.5h3l.8-1.5h3.2')}</span>
            <span className="gh-avatar-lg">JT</span>
          </span>
        </div>
        <nav className="gh-nav">
          <NavItem icon={s(CODE_ICON)} label="Code" />
          <NavItem icon={s(ISSUE_ICON)} label="Issues" count={4} />
          <NavItem icon={s(PR_ICON, '#ADBAC7')} label="Pull requests" count={3} active />
          <NavItem icon={s('M8 1.75a6.25 6.25 0 110 12.5 6.25 6.25 0 010-12.5zM6.5 5.5l4 2.5-4 2.5z')} label="Actions" />
          <NavItem icon={s('M2.5 2.5h11v11h-11zM6 2.5v11M10 2.5v7')} label="Projects" />
          <NavItem icon={s('M8 1.5l5.5 2.2v4c0 3.4-2.4 5.4-5.5 6.8-3.1-1.4-5.5-3.4-5.5-6.8v-4z')} label="Security" />
          <NavItem icon={s('M2 13.5h12M4 13.5V9M8 13.5V3M12 13.5V6.5')} label="Insights" />
        </nav>
      </header>

      <section className="gh-pr-head">
        <PrTitle />
        <div className="gh-meta-row">
          <span className={`gh-state${state === 'failed' || state === 'error' ? ' is-open' : ''}`}>
            {s(PR_ICON, '#FFFFFF')}
            Open
          </span>
          <span className="gh-strong">jtorres</span>
          <span className="gh-muted">wants to merge 3 commits into</span>
          <span className="gh-branch">main</span>
          <span className="gh-muted">from</span>
          <span className="gh-branch">reorder-commuting</span>
        </div>
        <div className="gh-tabs">
          <div className="gh-tabs-left">
            <span className="gh-tab is-active">
              {s('M2 3.5h12v7.5H7l-3 2.5V11H2z', '#ADBAC7')}
              Conversation <span className="gh-counter">4</span>
            </span>
            <span className="gh-tab">
              {s('M8 5a3 3 0 110 6 3 3 0 010-6zM1 8h4M11 8h4')}
              Commits <span className="gh-counter">3</span>
            </span>
            <span className="gh-tab" onClick={goRuns}>
              {s('M3 8.5l3 3 7-7')}
              Checks <span className="gh-counter">1</span>
            </span>
            <span className="gh-tab">
              {s('M3 2.5h7l3 3v8H3zM8 6v4M6 8h4')}
              Files changed <span className="gh-counter">2</span>
            </span>
          </div>
          <div className="gh-diffstat">
            <span className="gh-add">+48</span>
            <span className="gh-del">−31</span>
            <svg width="44" height="8" viewBox="0 0 44 8" aria-hidden>
              <path d="M0 0h8v8H0zM9 0h8v8H9zM18 0h8v8h-8z" fill="#57AB5A" />
              <path d="M27 0h8v8h-8z" fill="#E5534B" />
              <path d="M36 0h8v8h-8z" fill="#444C56" />
            </svg>
          </div>
        </div>
      </section>

      <section className="gh-body">
        <div className="gh-timeline">
          <div className="gh-comment-row">
            <span className="gh-bot-avatar">
              <LogoBurst size={30} />
            </span>
            <article className="gh-comment">
              <svg className="gh-caret" width="9" height="16" viewBox="0 0 9 16" aria-hidden>
                <path d="M9 0L0.7 8 9 16z" fill="#2D333B" />
                <path d="M8.5 0.5L0.7 8l7.8 7.5" fill="none" stroke="#444C56" />
              </svg>
              <header className="gh-comment-head">
                <span className="gh-strong">gatesmith</span>
                <span className="gh-bot">bot</span>
                <span className="gh-muted gh-when">commented {state === 'loading' ? 'just now' : state === 'passed' ? '2 minutes ago' : '1 minute ago'}</span>
                <span className="gh-grow" />
                {state === 'passed' && (
                  <span className="gh-edited">
                    edited
                    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                      <path d="M1 2.5h6L4 6z" fill="#768390" />
                    </svg>
                  </span>
                )}
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M3 8h.01M8 8h.01M13 8h.01" fill="none" stroke="#768390" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </header>
              <div className="gh-comment-body">
                <CommentBody state={state} onOpenRun={goRuns} />
              </div>
            </article>
          </div>
          <div className="gh-line" />
          <div className="gh-end" />
          <ChecksBox state={state} onDetails={goRuns} />
        </div>

        <aside className="gh-sidebar">
          <SideBlock
            title="Reviewers"
            extra={s(
              'M8 2.2l1.2 1 1.6-.3.5 1.5 1.5.5-.3 1.6 1 1.2-1 1.2.3 1.6-1.5.5-.5 1.5-1.6-.3L8 13.8l-1.2-1-1.6.3-.5-1.5-1.5-.5.3-1.6-1-1.2 1-1.2-.3-1.6 1.5-.5.5-1.5 1.6.3zM8 6a2 2 0 110 4 2 2 0 010-4z',
              '#768390',
              { strokeWidth: 1.2 },
            )}
            first
          >
            <div className="gh-person">
              <span className="gh-avatar">AN</span>
              <span className="gh-strong gh-grow">anguyen</span>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M8 2.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11z" fill="none" stroke="#C69026" strokeWidth="1.5" />
                <path d="M8 6.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" fill="#C69026" />
              </svg>
            </div>
          </SideBlock>
          <SideBlock title="Assignees">
            <div className="gh-person">
              <span className="gh-avatar">JT</span>
              <span className="gh-strong">jtorres</span>
            </div>
          </SideBlock>
          <SideBlock title="Labels">
            <div className="gh-labels">
              <span className="gh-label is-blue">circuits</span>
              <span className="gh-label is-teal">optimization</span>
            </div>
          </SideBlock>
          <SideBlock title="Projects">
            <span className="gh-side-text">None yet</span>
          </SideBlock>
          <SideBlock title="Milestone">
            <span className="gh-side-text">Demo build</span>
          </SideBlock>
          <SideBlock title="Development" last>
            <span className="gh-side-text">Successfully merging this pull request may close these issues.</span>
            <span className="gh-side-text gh-link">Cut SWAPs in sidechain_qaoa #38</span>
          </SideBlock>
        </aside>
      </section>
    </div>
  )
}

function NavItem({ icon, label, count, active }: { icon: ReactNode; label: string; count?: number; active?: boolean }) {
  return (
    <span className={`gh-nav-item${active ? ' is-active' : ''}`}>
      <span className="gh-nav-inner">
        {icon}
        <span>{label}</span>
        {count != null && <span className="gh-counter">{count}</span>}
      </span>
      {active && <span className="gh-nav-bar" />}
    </span>
  )
}

function SideBlock({ title, extra, children, first, last }: { title: string; extra?: ReactNode; children: ReactNode; first?: boolean; last?: boolean }) {
  return (
    <div className={`gh-side${first ? ' is-first' : ''}${last ? ' is-last' : ''}`}>
      <div className="gh-side-title">
        <span>{title}</span>
        {extra}
      </div>
      {children}
    </div>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="gh-code">{children}</code>
}

function CommentBody({ state, onOpenRun }: { state: PrState; onOpenRun: () => void }) {
  if (state === 'loading')
    return (
      <>
        <h2 className="gh-h2">Scoring sidechain_qaoa.qasm</h2>
        <p className="gh-p">
          Head <Code>9c2e17b</Code> against base <Code>main 4e1a0c2</Code> on FakeTorino, seed 3 of 8.
        </p>
        <p className="gh-p">This comment updates in place when the run finishes.</p>
        <p className="gh-p">
          <Code>qscore score --fail-on high</Code> is running.{' '}
          <button className="gh-link" onClick={onOpenRun}>
            Watch run 7f2c·b310
          </button>
        </p>
      </>
    )
  if (state === 'empty')
    return (
      <>
        <h2 className="gh-h2">No circuits changed</h2>
        <p className="gh-p">This pull request touches 4 files and none of them is a .qasm file or a Qiskit builder, so nothing was scored.</p>
        <p className="gh-p">
          <b>Last score on main:</b> <Code>sidechain_qaoa.qasm</Code> 33 two-qubit gates.
        </p>
        <p className="gh-p">
          <Code>qscore score --fail-on high</Code> exited 0 in 3 s.{' '}
          <button className="gh-link" onClick={onOpenRun}>
            Open main's run
          </button>
        </p>
      </>
    )
  if (state === 'error')
    return (
      <>
        <h2 className="gh-h2">Gatesmith could not score this pull request</h2>
        <p className="gh-p">qscore stopped with a runtime failure while scoring sidechain_qaoa.qasm. The circuit was not judged, so there is no score change.</p>
        <pre className="gh-pre">{'WorkerStopped: worker laptop-gpu stopped after 40 s\nexit 3 · runtime failure · not requeued'}</pre>
        <p className="gh-p">
          <b>Last score on main:</b> <Code>sidechain_qaoa.qasm</Code> 33 two-qubit gates.
        </p>
        <p className="gh-p">
          <button className="gh-link" onClick={onOpenRun}>
            Open run 7f42·90ac
          </button>{' '}
          or comment <Code>/gatesmith rescore</Code> to try again.
        </p>
      </>
    )
  const failed = state === 'failed'
  const rows = failed
    ? [
        ['two_qubit_count', '33', '38', '+5 (+15%)'],
        ['routing_overhead', '0.29', '0.36', '+0.07'],
        ['reliability_heuristic', '0.762', '0.731', '−0.031'],
      ]
    : [
        ['two_qubit_count', '44', '33', '−11 (−25%)'],
        ['routing_overhead', '0.41', '0.29', '−0.12'],
        ['reliability_heuristic', '0.692', '0.762', '+0.070'],
        ['Est. cost per run', '$6.72', '$5.32', '−$1.40'],
      ]
  return (
    <>
      <h2 className="gh-h2">Score change for sidechain_qaoa.qasm</h2>
      <p className="gh-p gh-inline">
        <b>{failed ? 'Failed.' : 'Passed.'}</b> {failed ? '1 high finding. Head' : 'No high findings. Head'}{' '}
        <Code>{failed ? '3b81e4d' : '9c2e17b'}</Code> against base <Code>main 4e1a0c2</Code>
      </p>
      <table className="gh-table">
        <thead>
          <tr>
            <th className="gh-c-metric">Metric</th>
            <th>Base</th>
            <th>Head</th>
            <th className="gh-c-change">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([m, a, b, c], i) => (
            <tr key={m} className={i % 2 === 1 ? 'is-alt' : ''}>
              <td className="gh-c-metric">{m.includes('_') ? <Code>{m}</Code> : m}</td>
              <td>{a}</td>
              <td>{b}</td>
              <td className="gh-c-change">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {failed ? (
        <p className="gh-p gh-inline">
          <b>Top finding</b> <Code>D01</Code> <Code>high</Code> Routing dominates the transpiled circuit
        </p>
      ) : (
        <blockquote className="gh-quote">reliability_heuristic: calibration-based reliability heuristic, not a success probability</blockquote>
      )}
      <p className="gh-p gh-inline">
        <Code>qscore score --fail-on high</Code> {failed ? 'exited 1.' : 'exited 0 in 41 s on FakeTorino.'}{' '}
        <button className="gh-link" onClick={onOpenRun}>
          {failed ? 'Open run 7f41·2b7d' : 'Open run 7f2c·b310'}
        </button>
      </p>
    </>
  )
}

function ChecksBox({ state, onDetails }: { state: PrState; onDetails: () => void }) {
  const kind = state === 'loading' ? 'pending' : state === 'failed' || state === 'error' ? 'fail' : 'pass'
  const title = kind === 'pending' ? 'Some checks haven’t completed yet' : kind === 'fail' ? 'Some checks were not successful' : 'All checks have passed'
  const sub = kind === 'pending' ? '1 in progress check' : kind === 'fail' ? '1 failing check' : '1 successful check'
  const line =
    kind === 'pending' ? 'In progress' : kind === 'fail' ? (state === 'error' ? 'Failing after 40s' : 'Failing after 39s') : state === 'empty' ? 'Successful in 3s' : 'Successful in 41s'
  return (
    <div className="gh-checks-row">
      <span className={`gh-checks-badge is-${kind}`}>
        <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
          <path d={PR_ICON} fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <div className="gh-checks">
        <div className="gh-checks-head">
          <span className={`gh-checks-icon is-${kind}`}>
            {kind === 'pass' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : kind === 'fail' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M5 5l6 6M11 5l-6 6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
              </svg>
            )}
          </span>
          <div className="gh-checks-text">
            <span className="gh-checks-title">{title}</span>
            <span className="gh-checks-sub">{sub}</span>
          </div>
        </div>
        <div className="gh-check-row">
          {kind === 'pass' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="#57AB5A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : kind === 'fail' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M5 5l6 6M11 5l-6 6" fill="none" stroke="#E5534B" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="3" fill="#C69026" />
            </svg>
          )}
          <span className="gh-check-name">qscore / score (pull_request)</span>
          <span className="gh-muted">{line}</span>
          <span className="gh-grow" />
          <button className="gh-link" onClick={onDetails}>
            Details
          </button>
        </div>
      </div>
    </div>
  )
}

const REPO_URLS = {
  HTTPS: 'https://github.com/knighthacks/qaoa-packing.git',
  SSH: 'git@github.com:knighthacks/qaoa-packing.git',
  'GitHub CLI': 'gh repo clone knighthacks/qaoa-packing',
} as const

/** The title row behaves like GitHub's: Edit turns the title into a field; Code opens the clone menu. */
function PrTitle() {
  const [title, setTitle] = useState('Reorder commuting block in sidechain_qaoa')
  const [draft, setDraft] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [proto, setProto] = useState<keyof typeof REPO_URLS>('HTTPS')
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  if (draft !== null) {
    const save = () => {
      if (draft.trim()) setTitle(draft.trim())
      setDraft(null)
    }
    return (
      <div className="gh-title-row gh-title-edit">
        <input
          className="gh-title-input"
          value={draft}
          autoFocus
          aria-label="Pull request title"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setDraft(null)
          }}
        />
        <button className="gh-btn" onClick={save}>
          Save
        </button>
        <button className="gh-link-btn" onClick={() => setDraft(null)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="gh-title-row">
      <h1 className="gh-title">
        {title}
        <span className="gh-number">#41</span>
      </h1>
      <div className="gh-title-actions">
        <button className="gh-btn" onClick={() => setDraft(title)}>
          Edit
        </button>
        <div className="gh-menu-anchor" ref={menuRef}>
          <button className="gh-btn gh-btn-code" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
            {s(CODE_ICON)}
            Code
            {s('M4.5 6.5L8 10l3.5-3.5')}
          </button>
          {menu && (
            <div className="gh-menu" role="menu">
              <div className="gh-menu-title">Clone</div>
              <div className="gh-menu-tabs">
                {(Object.keys(REPO_URLS) as (keyof typeof REPO_URLS)[]).map((k) => (
                  <button key={k} className={`gh-menu-tab${k === proto ? ' is-active' : ''}`} onClick={() => setProto(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <div className="gh-menu-url">
                <input readOnly value={REPO_URLS[proto]} aria-label="Clone URL" onFocus={(e) => e.currentTarget.select()} />
                <button
                  className="gh-menu-copy"
                  aria-label="Copy URL"
                  onClick={() => {
                    void navigator.clipboard?.writeText(REPO_URLS[proto]).catch(() => {})
                    setCopied(true)
                  }}
                >
                  {copied
                    ? s('M3 8.5l3 3 7-7', '#57ab5a')
                    : s('M5.5 5.5V3.5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-2M3.5 5.5h6a1 1 0 011 1v6a1 1 0 01-1 1h-6a1 1 0 01-1-1v-6a1 1 0 011-1z')}
                </button>
              </div>
              <p className="gh-menu-note">
                {copied ? 'Copied.' : 'Clone using the web URL.'} The improved circuit is on the branch reorder-commuting.
              </p>
              <button className="gh-menu-item" onClick={() => navigate(ROUTES.export, { transition: 'forward' })}>
                {s('M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10')}
                Download the improved files
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
