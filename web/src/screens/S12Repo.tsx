/* S-12 · Repo dashboard (E2): every circuit in the repo, its trend, and the pull requests that moved it. */
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { actions } from '../data/run'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, Tile } from '../ui/parts'
import { Status, StatusIcon } from '../ui/status'
import { REPO_CIRCUITS, RUN_TICKS, type RepoCircuit } from './team/repoData'
import { TeamIcons, TeamKV, TeamModeLine, TeamModeTabs, TeamSection } from './team/TeamInspector'
import { repoStateView } from './team/S12States'
import './team/team.css'
import './team/S12Repo.css'

/** One table row as drawn. States swap these for their own. */
export type RowView = {
  id: string
  file: string
  gates: ReactNode
  trend: ReactNode
  open: ReactNode
  last: ReactNode
  skeleton?: boolean
}

export function circuitRow(c: RepoCircuit, i: number, selected: boolean): RowView {
  return {
    id: c.id,
    file: c.file,
    gates: `${c.gates} gates`,
    trend: <Spark d={c.spark} stroke={selected ? '#FFFFFF' : '#C2DADF'} delay={i * 40} />,
    open: <OpenCell open={c.open} />,
    last: c.lastRun,
  }
}

export function S12Repo() {
  const state = useHashParams().get('state')
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState<'timeline' | 'findings'>('timeline')
  const view = state ? repoStateView(state) : null

  const circuit = REPO_CIRCUITS[view?.inspectorIndex ?? selected]
  const rows = view?.rows ?? REPO_CIRCUITS.map((c, i) => circuitRow(c, i, i === selected))
  const sel = view ? view.selected : selected

  return (
    <Shell
      context="Repo"
      rail="repo"
      tabs={
        <TabStrip
          tabs={[
            { id: 'qaoa', label: 'knighthacks/qaoa-packing', active: !view?.sboxTab },
            { id: 'sbox', label: 'knighthacks/sbox-oracles', active: !!view?.sboxTab },
          ]}
        />
      }
      inspector={view?.inspector ?? <RepoInspector circuit={circuit} />}
    >
      <Content>
        <Tile
          className="s12-circuits"
          bodyStyle={{ flex: 'none' }}
          tabs={[{ id: 'circuits', label: 'Circuits', active: true }]}
          meta={<span className="mono">{view?.circuitsMeta ?? '5 circuits · main at a41c9e2 · 38 runs'}</span>}
        >
          {view?.circuitsBody ?? (
            <RepoTable rows={rows} selected={sel} focus={view?.focus ?? null} onSelect={view ? undefined : setSelected} />
          )}
        </Tile>
        <Tile
          className="s12-timeline"
          tabs={[
            { id: 'timeline', label: 'Timeline', active: tab === 'timeline', onClick: () => setTab('timeline') },
            { id: 'findings', label: 'Findings', active: tab === 'findings', onClick: () => setTab('findings') },
          ]}
          meta={
            <span className="mono">
              {tab === 'timeline'
                ? "two_qubit_count against each circuit's first scored run · lower is better"
                : 'open findings on main · highest severity first'}
            </span>
          }
        >
          {tab === 'findings' ? (
            <OpenFindings onSelect={setSelected} />
          ) : (
            view?.timeline ?? <Timeline selected={sel} />
          )}
        </Tile>
      </Content>
    </Shell>
  )
}

/* ── Circuits table ──────────────────────────────────────────────────── */
export function RepoTable({
  rows,
  selected,
  focus = null,
  onSelect,
  padding = '4px 12px 12px',
}: {
  rows: RowView[]
  selected: number | null
  focus?: number | null
  onSelect?: (i: number) => void
  padding?: string
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    const list = e.currentTarget.parentElement
    const go = (n: number) => (list?.children[n + 1] as HTMLElement | undefined)?.focus()
    if (e.key === 'ArrowDown') (e.preventDefault(), go(Math.min(rows.length - 1, i + 1)))
    if (e.key === 'ArrowUp') (e.preventDefault(), go(Math.max(0, i - 1)))
    if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), onSelect?.(i))
    if (e.key.toLowerCase() === 'o') navigate(ROUTES.loop)
    if (e.key.toLowerCase() === 't') (e.preventDefault(), document.querySelector<HTMLElement>('.s12-timeline [role="tab"]')?.focus())
  }
  return (
    <div className="s12-table" role="grid" aria-label="Circuits" style={{ padding }}>
      <div className="s12-head" role="row">
        <span className="team-th" style={{ flex: '1 1 0' }}>
          Circuit
        </span>
        <span className="team-th team-num" style={{ width: 150 }}>
          two_qubit_count
        </span>
        <span className="team-th" style={{ width: 130, paddingLeft: 24, flexShrink: 0 }}>
          Trend · 8 runs
        </span>
        <span className="team-th" style={{ width: 150, flexShrink: 0 }}>
          Open findings
        </span>
        <span className="team-th team-num" style={{ width: 122 }}>
          Last run
        </span>
      </div>
      {rows.map((r, i) => {
        const isSel = i === selected
        const classes = [
          's12-row',
          'team-row',
          isSel ? 'is-selected' : '',
          i === focus ? 'is-focus' : '',
          i === rows.length - 1 ? 'is-last' : '',
          selected != null && i === selected - 1 ? 'is-before-selected' : '',
        ]
        if (r.skeleton)
          return (
            <div key={r.id} role="row" className={classes.join(' ')} aria-busy>
              <span style={{ flex: '1 1 0' }}>
                <span className="s12-skel" style={{ width: i % 2 ? 104 : 136 }} />
              </span>
              <span className="team-num" style={{ width: 150 }}>
                <span className="s12-skel" style={{ width: 56 }} />
              </span>
              <span className="s12-c-trend">
                <span className="s12-skel" style={{ width: 88 }} />
              </span>
              <span style={{ width: 150, flexShrink: 0 }}>
                <span className="s12-skel" style={{ width: 72 }} />
              </span>
              <span className="team-num" style={{ width: 122 }}>
                <span className="s12-skel" style={{ width: 80 }} />
              </span>
            </div>
          )
        return (
          <div
            key={r.id}
            role="row"
            tabIndex={0}
            aria-selected={isSel}
            className={classes.join(' ')}
            onClick={() => onSelect?.(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="s12-c-name">{r.file}</span>
            <span className="s12-c-gates team-num">{r.gates}</span>
            <span className="s12-c-trend">{r.trend}</span>
            {r.open}
            <span className="s12-c-last team-num">{r.last}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Spark({ d, stroke, delay = 0 }: { d: string; stroke: string; delay?: number }) {
  return (
    <svg width="90" height="20" viewBox="0 0 90 20" aria-hidden>
      <path
        className="s12-spark team-draw"
        d={d}
        pathLength={1}
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        style={{ animationDelay: `${delay}ms` }}
      />
    </svg>
  )
}

export function OpenCell({ open }: { open: RepoCircuit['open'] }) {
  if (open.severity === 'none')
    return (
      <span className="s12-c-open">
        <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
          <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#C2DADF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ color: 'var(--color-text-secondary)' }}>none open</span>
      </span>
    )
  const color =
    open.severity === 'high' ? 'var(--color-signal-bad)' : open.severity === 'warning' ? 'var(--color-signal-warn)' : 'var(--color-signal-info)'
  return (
    <span className="s12-c-open">
      <StatusIcon kind={open.severity} />
      <span className="s12-c-open-word" style={{ color }}>
        {open.severity}
      </span>
      <span className="s12-c-open-count">{open.count} open</span>
    </span>
  )
}

/* ── Timeline ────────────────────────────────────────────────────────── */
const TICK_X = RUN_TICKS.map((_, i) => 56 + i * 77.2)
const LABEL_Y: Record<string, number> = {
  qft_8: 50.5,
  grover_5q: 134.5,
  sidechain_qaoa_p1: 229.0,
  vqe_h2_4q: 281.5,
  sidechain_qaoa: 397.0,
}

export function TimelineFrame({ children }: { children?: ReactNode }) {
  return (
    <>
      <path d="M56 26.0H828M56 236.0H828M56 341.0H828M56 446.0H828" fill="none" stroke="#0F1F23" />
      <path d="M56 131.0H828" fill="none" stroke="#354348" />
      {(['+10%', '0%', '−10%', '−20%', '−30%'] as const).map((t, i) => (
        <text key={t} x="44" y={29.5 + i * 105} textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          {t}
        </text>
      ))}
      {RUN_TICKS.map((t, i) => (
        <text key={t} x={TICK_X[i].toFixed(1)} y="492" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          {t}
        </text>
      ))}
      {children}
    </>
  )
}

export function Timeline({ selected, only }: { selected: number | null; only?: string[] }) {
  const shown = REPO_CIRCUITS.map((c, i) => ({ c, i })).filter(({ c }) => !only || only.includes(c.id))
  // The selected line draws last so it sits on top.
  const order = [...shown].sort((a, b) => Number(a.i === selected) - Number(b.i === selected))
  const sel = selected != null ? REPO_CIRCUITS[selected] : null
  return (
    <div className="s12-chart">
      <svg width="978" height="500" viewBox="0 0 978 500" role="img" aria-label="two_qubit_count trend per circuit">
        <TimelineFrame>
          <path d="M828 12V474" fill="none" stroke="#F8D441" strokeWidth="1.5" />
          <circle cx="828" cy="12" r="4" fill="#F8D441" />
          {order.map(({ c, i }) => {
            const on = i === selected
            return (
              <path
                key={c.id}
                className="s12-line team-draw"
                d={c.line}
                pathLength={1}
                fill="none"
                stroke={on ? '#FFFFFF' : '#496166'}
                strokeWidth={on ? 2 : 1.4}
                style={{ animationDelay: `${i * 40}ms` }}
              />
            )
          })}
          {sel && <circle className="s12-end" cx="828" cy={sel.endY} r="4" fill="#FFFFFF" />}
          {shown.map(({ c, i }) => (
            <text
              key={c.id}
              className="s12-label"
              x="842"
              y={LABEL_Y[c.id] ?? c.endY + 3.5}
              fontFamily="JetBrains Mono"
              fontSize="10"
              fill={i === selected ? '#FFFFFF' : '#ADC5CA'}
            >
              {c.label}
            </text>
          ))}
        </TimelineFrame>
      </svg>
    </div>
  )
}

function OpenFindings({ onSelect }: { onSelect: (i: number) => void }) {
  const rows = REPO_CIRCUITS.flatMap((c, i) => c.findings.map((f) => ({ ...f, file: c.file, i })))
  const rank = { high: 0, warning: 1, info: 2 } as const
  rows.sort((a, b) => rank[a.severity] - rank[b.severity])
  return (
    <div className="s12-findings">
      {rows.map((f, k) => (
        <div
          key={`${f.file}-${f.rule}`}
          className="s12-f-row team-row team-arrive"
          style={{ animationDelay: `${k * 40}ms` }}
          onClick={() => onSelect(f.i)}
        >
          <span className="s12-f-file">{f.file}</span>
          <span className="s12-f-sev">
            <Status kind={f.severity} />
          </span>
          <span className="s12-f-rule">{f.rule}</span>
          <span className="s12-f-title">{f.title}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
export function RepoInspector({
  circuit,
  modeLine = 'Scored by CI on every pull request · main',
  overrides,
}: {
  circuit: RepoCircuit
  modeLine?: ReactNode
  overrides?: { hero?: ReactNode; lastRun?: string; pullRequest?: string }
}) {
  return (
    <>
      <TeamModeTabs />
      <TeamModeLine>{modeLine}</TeamModeLine>
      <div className="team-insp-body s12-insp-swap" key={circuit.id}>
        <div className="s12-sel">
          <div className="s12-sel-name">
            <span className="s12-sel-file">{circuit.file}</span>
            <span className="s12-sel-item">
              item {circuit.item} · {circuit.qubits} q · FakeTorino
            </span>
          </div>
          {overrides?.hero ?? (
            <div className="s12-hero">
              <span className="s12-hero-from">{circuit.first} →</span>
              <span className="s12-hero-to">{circuit.gates}</span>
              <span className="s12-hero-unit">two-qubit gates since #31</span>
            </div>
          )}
          <div className="s12-kvs">
            <TeamKV label="Last run" value={overrides?.lastRun ?? circuit.run} />
            <TeamKV label="Pull request" value={overrides?.pullRequest ?? circuit.pullRequest} />
            <TeamKV label="reliability_heuristic" value={circuit.reliability} />
            <TeamKV label="Score version" value="qscore-2026.1" />
          </div>
          <div className="s12-actions">
            <EditorButton onClick={() => navigate(ROUTES.loop)}>Open last run</EditorButton>
            <EditorButton onClick={() => actions.reset()}>Run again</EditorButton>
          </div>
        </div>
        <TeamSection
          icon={TeamIcons.list}
          title="Open findings"
          meta={circuit.findings.length ? `${circuit.findings.length} open` : 'none open'}
          gap={8}
        >
          {circuit.findings.length === 0 && <span className="s12-empty-note">No open findings. Every rule is below its threshold.</span>}
          {circuit.findings.map((f) => (
            <div key={f.rule} className="s12-card">
              <div className="s12-card-top">
                <Status kind={f.severity} gap={8} />
                <span className="s12-card-rule">{f.rule}</span>
              </div>
              <div className="s12-card-title">{f.title}</div>
            </div>
          ))}
        </TeamSection>
        <TeamSection icon={TeamIcons.shield} title="CI gate">
          <div className="s12-code">qscore score --fail-on high</div>
          <div className="s12-gate-note">{circuit.gate}</div>
        </TeamSection>
        <TeamSection icon={TeamIcons.pr} title="Pull requests that moved it" meta="two-qubit gates">
          {circuit.prs.length === 0 && (
            <div className="s12-pr">
              <span className="s12-pr-title">No pull request changed it since #31.</span>
            </div>
          )}
          {circuit.prs.map((p) => (
            <div key={p.pr} className="s12-pr">
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
                <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#C2DADF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="s12-pr-n">{p.pr}</span>
              <span className="s12-pr-title">{p.title}</span>
              <span className="s12-pr-change">{p.change}</span>
            </div>
          ))}
        </TeamSection>
      </div>
    </>
  )
}
