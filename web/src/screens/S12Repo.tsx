/*
 * S-12 · Repo dashboard (board 1B78-0, states 1IR7-0): every circuit in qlab/sidechain-packing, its
 * two-qubit trend across runs (jobs, never rounds), and what the GitHub Action reported. The latest
 * run 7f3a·0412 finished at 11:42 with 270 gates, from #41 Reorder commuting block in sidechain_qaoa.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { DataRow, EditorButton, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { Sk, SkRegion } from '../ui/Skeleton'
import { RunChart } from './team/S12Chart'
import { S12Icon, S12SectionIcon } from './team/S12Icons'
import { HighestCell, S12Spinner, S12TopStatus } from './team/S12Parts'
import { repoView, type RepoView } from './team/S12States'
import { HEAD, PR_COMMENTS, REPO, type RepoCircuit } from './team/repoData'
import './team/S12Repo.css'

export function S12Repo() {
  const state = useHashParams().get('state')
  const view = repoView(state)
  // A state is a fresh screen: remount so selection and mode start from the board.
  return <RepoScreen key={state ?? 'main'} view={view} />
}

function RepoScreen({ view }: { view: RepoView }) {
  const [selected, setSelected] = useState<number | null>(view.selected)
  const [mode, setMode] = useState(view.inspector.mode)
  const circuit = view.circuits[selected ?? 0]

  return (
    <Shell
      context="Repo"
      rail="repo"
      status={<S12TopStatus gpuOnline={view.gpuOnline} />}
      tabs={<TabStrip tabs={[{ id: 'repo', label: REPO, active: true }]} />}
      inspector={<RepoInspector view={view} circuit={circuit} mode={mode} onMode={setMode} />}
    >
      <Content className="s12">
        {view.mainBanner}
        <Tile
          className="s12-circuits"
          bodyClassName="s12-circuits-body"
          tabs={[{ id: 'circuits', label: 'Circuits', active: true }]}
          meta={<span className="mono">{view.circuitsMeta}</span>}
        >
          {view.circuitsBanner}
          <CircuitsTable view={view} selected={selected} onSelect={setSelected} />
        </Tile>
        <Tile
          className="s12-timeline"
          bodyClassName="s12-timeline-body"
          tabs={[{ id: 'timeline', label: 'Timeline', active: true }]}
          meta={<span className="mono">{view.timelineMeta}</span>}
        >
          <TimelineBody view={view} selected={selected} onSelect={setSelected} />
        </Tile>
      </Content>
    </Shell>
  )
}

/* ── Circuits table ──────────────────────────────────────────────────── */
function CircuitsTable({ view, selected, onSelect }: { view: RepoView; selected: number | null; onSelect: (i: number) => void }) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (view.focus) list.current?.querySelector<HTMLElement>('.s12-row')?.focus()
  }, [view.focus])

  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    const rows = list.current?.querySelectorAll<HTMLElement>('.s12-row')
    if (!rows) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      rows[Math.min(rows.length - 1, i + 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      rows[Math.max(0, i - 1)]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(i)
    }
  }

  return (
    <div className="s12-table" role="grid" aria-label="Circuits" ref={list}>
      <div className="s12-tr s12-head" role="row">
        <span className="s12-c1" role="columnheader">
          Circuit
        </span>
        <span className="s12-c2" role="columnheader">
          Primary <span className="mono">· two_qubit_count</span>
        </span>
        <span className="s12-c3" role="columnheader">
          Trend
        </span>
        <span className="s12-c4" role="columnheader">
          Findings
        </span>
        <span className="s12-c5" role="columnheader">
          Highest
        </span>
        <span className="s12-c6" role="columnheader">
          Last run
        </span>
      </div>
      {view.table === 'loading' ? (
        <SkRegion label={`Loading runs for ${REPO}`}>
          <div className="s12-tr s12-stage">
            <S12Spinner />
            <span>Loading runs for {REPO}</span>
            <span className="s12-stage-gap" />
            <span className="mono s12-stage-est">about 2 s</span>
          </div>
          {[0, 1, 2].map((r) => (
            <div key={r} className="s12-tr s12-sk-row" aria-hidden>
              <span className="s12-c1">
                <Sk w={140} h={10} />
              </span>
              <span className="s12-c2">
                <Sk w={64} h={10} />
              </span>
              <span className="s12-c3">
                <Sk w={52} h={10} />
              </span>
              <span className="s12-c4">
                <Sk w={48} h={10} />
              </span>
              <span className="s12-c5">
                <Sk w={40} h={10} />
              </span>
              <span className="s12-c6">
                <Sk w={88} h={10} />
              </span>
            </div>
          ))}
        </SkRegion>
      ) : (
        view.circuits.map((c, i) => (
          <CircuitRow
            key={c.id}
            c={c}
            mode={view.table}
            selected={i === selected}
            last={i === view.circuits.length - 1}
            onSelect={() => onSelect(i)}
            onKeyDown={(e) => onKey(e, i)}
          />
        ))
      )}
    </div>
  )
}

function CircuitRow({
  c,
  mode,
  selected,
  last,
  onSelect,
  onKeyDown,
}: {
  c: RepoCircuit
  mode: RepoView['table']
  selected: boolean
  last: boolean
  onSelect: () => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
}) {
  const never = mode === 'never'
  const ro = mode === 'readonly'
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      className={`s12-tr s12-row${selected ? ' is-selected' : ''}${ro ? ' is-readonly' : ''}${last ? ' is-last' : ''}`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span className="s12-c1">
        <span className="mono s12-v">{c.file}</span>
        <span className="mono s12-q">{c.qubits} q</span>
      </span>
      {never ? (
        <>
          <span className="s12-c2 mono s12-na">n/a</span>
          <span className="s12-c3 mono s12-na">n/a</span>
          <span className="s12-c4 mono s12-na">n/a</span>
          <span className="s12-c5 mono s12-na">n/a</span>
          <span className="s12-c6 mono s12-na">never</span>
        </>
      ) : (
        <>
          <span className="s12-c2 mono s12-v">{c.gates}</span>
          <span className={`s12-c3 mono s12-trend is-${c.trendTone}`}>{c.trend}</span>
          <span className={`s12-c4 mono ${c.open ? 's12-v' : 's12-na'}`}>{c.open} open</span>
          <span className="s12-c5">
            <HighestCell value={c.highest} />
          </span>
          <span className="s12-c6">
            <span className="mono s12-time">{c.lastTime}</span>
            <span className="mono s12-q">{c.lastWhat}</span>
          </span>
        </>
      )}
    </div>
  )
}

/* ── Timeline ────────────────────────────────────────────────────────── */
function TimelineBody({ view, selected, onSelect }: { view: RepoView; selected: number | null; onSelect: (i: number) => void }) {
  if (view.timeline === 'empty')
    return (
      <div className="s12-inset s12-empty">
        <span>No runs yet. Score now runs the first one, or open a pull request.</span>
      </div>
    )
  if (view.timeline === 'loading')
    return (
      <SkRegion label="Loading the timeline" className="s12-inset s12-sk-chart">
        <Sk w="100%" h={10} />
        <Sk w="72%" h={10} />
        <Sk w="46%" h={10} />
      </SkRegion>
    )
  const sel = view.circuits[selected ?? 0]
  const selId = view.chart.series.some((s) => s.id === sel.id) ? sel.id : 'sidechain_qaoa'
  return (
    <>
      {view.legend === 'main' && (
        <div className="s12-legend">
          <span className="s12-key">
            <span className="s12-swatch is-sel" />
            <span className="mono s12-key-sel">{view.circuits.find((c) => c.id === selId)?.file}</span>
            <span className="s12-key-note">selected</span>
          </span>
          <span className="s12-key">
            <span className="s12-swatch" />
            other circuits
          </span>
          <span className="s12-key">
            <span className="s12-swatch is-needle" />
            latest run
          </span>
        </div>
      )}
      {view.legend === 'many' && (
        <div className="s12-legend">
          <span className="s12-key">
            <span className="s12-swatch is-sel" />
            <span className="mono s12-key-sel">sidechain_qaoa.qasm · −15.9% since Oct 4</span>
          </span>
          <span className="s12-key">
            <span className="s12-swatch" />7 other circuits
          </span>
        </div>
      )}
      <div className="s12-inset s12-chart">
        <RunChart
          {...view.chart}
          selected={selId}
          onSelect={(id) => {
            const i = view.circuits.findIndex((c) => c.id === id)
            if (i >= 0) onSelect(i)
          }}
        />
      </div>
      {view.footnote && <div className="s12-footnote">{view.footnote}</div>}
    </>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
function RepoInspector({
  view,
  circuit,
  mode,
  onMode,
}: {
  view: RepoView
  circuit: RepoCircuit
  mode: 'laptop' | 'platform'
  onMode: (m: 'laptop' | 'platform') => void
}) {
  const ins = view.inspector
  const loading = !!ins.loading
  const v = (node: ReactNode, w: number) => (loading ? <Sk w={w} h={10} /> : node)
  return (
    <div className="s12-insp">
      <ModeTabs active={mode} onChange={onMode} />
      <ModeBlock line={mode === 'platform' && ins.mode !== 'platform' ? 'Scores main on the platform queue' : ins.modeLine} style={{ padding: '18px 16px 14px' }}>
        <PrimaryButton name="primary-action" onClick={() => navigate(ROUTES.repoScan)}>
          Score now
        </PrimaryButton>
        <PoweredBy />
      </ModeBlock>

      <Section icon={S12SectionIcon.repo} title="Repo" meta={REPO} bodyClassName="s12-sec-body">
        <div className="s12-rows">
          <DataRow divider={false} label="Branch" value={v('main', 36)} />
          <DataRow
            label="Action"
            mono={false}
            value={
              loading ? (
                <Sk w={120} h={10} />
              ) : ins.actionInstalled ? (
                <span className="s12-inline">
                  {S12Icon.check}
                  <span>enabled</span>
                  <span className="mono s12-q12">· gatesmith.yml</span>
                </span>
              ) : (
                <span className="s12-inline s12-warn">
                  {S12Icon.warning}
                  <span>not installed</span>
                </span>
              )
            }
          />
          {ins.actionInstalled && (
            <>
              <DataRow divider={false} label="Last PR comment" value={v(ins.runs === 'many' ? `${PR_COMMENTS[0].n} · 2 min ago · improved` : 'none yet', 160)} />
              <DataRow divider={false} label="Last push" value={v(ins.runs === 'one' ? `12:05 · ${HEAD}` : `11:40 · ${HEAD}`, 104)} />
            </>
          )}
        </div>
        {!ins.actionInstalled && <ActionCard />}
      </Section>

      <Section icon={S12SectionIcon.circuit} title="Selected circuit" meta={circuit.file} bodyClassName="s12-sec-body">
        <div className="s12-rows">
          <DataRow divider={false} label="Latest" value={v(ins.runs === 'none' ? 'not scored' : circuit.latest, 72)} />
          <DataRow divider={false} label="Runs" value={v(ins.runs === 'none' ? '0 runs' : circuit.runs, 120)} />
          <DataRow
            label="Top finding"
            mono={false}
            value={
              loading ? (
                <Sk w={180} h={10} />
              ) : ins.runs === 'none' ? (
                <span className="mono">not scored yet</span>
              ) : circuit.top ? (
                <span className="s12-inline">
                  <span className="mono">{circuit.top.rule} ·</span>
                  <HighestCell value={circuit.top.severity} />
                </span>
              ) : (
                <HighestCell value="none" />
              )
            }
          />
        </div>
        <div className="s12-actions">
          <EditorButton disabled={ins.runs === 'none' || loading} onClick={() => navigate(ROUTES.report)}>
            Open run
          </EditorButton>
        </div>
      </Section>

      <Section icon={S12SectionIcon.comments} title="PR comments" meta={ins.runs === 'many' && ins.actionInstalled ? 'last 3' : 'none yet'} bodyClassName="s12-sec-body">
        {ins.runs === 'many' && ins.actionInstalled ? (
          <div className="s12-rows">
            {PR_COMMENTS.map((p) => (
              <button key={p.n} className="s12-pr" onClick={() => navigate(ROUTES.prComment)} disabled={loading}>
                <span className="mono s12-pr-n">{v(p.n, 28)}</span>
                <span className="s12-pr-title">{v(p.title, 160)}</span>
                {!loading && (
                  <span className={`s12-pr-verdict is-${p.verdict.replace(' ', '-')}`}>
                    {p.verdict === 'improved' ? S12Icon.improved : p.verdict === 'regressed' ? S12Icon.regressed : S12Icon.firstRun}
                    <span>{p.verdict}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="s12-note">
            {ins.actionInstalled ? 'No comments yet. The Action comments on the next pull request.' : 'No comments. Add the Action and the next pull request gets one.'}
          </div>
        )}
      </Section>
    </div>
  )
}

function ActionCard() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1200)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = () => {
    void navigator.clipboard?.writeText('.github/workflows/gatesmith.yml').catch(() => {})
    setDone(true)
  }
  return (
    <div className="s12-card" role="status">
      <div className="s12-card-top">
        <span className="s12-inline s12-warn">
          {S12Icon.warning}
          <span>warning</span>
        </span>
        <span className="mono s12-card-path">.github/workflows</span>
      </div>
      <div className="s12-card-title">Action not installed</div>
      <div className="s12-card-body">
        Pull requests on {REPO} get no comment. Add .github/workflows/gatesmith.yml to main, then push.
      </div>
      <div className="s12-card-actions">
        <EditorButton onClick={copy}>
          <span className="s12-copy">
            <span className={done ? 'is-hidden' : ''}>Copy workflow</span>
            <span className={done ? '' : 'is-hidden'}>Copied ✓</span>
          </span>
        </EditorButton>
      </div>
    </div>
  )
}
