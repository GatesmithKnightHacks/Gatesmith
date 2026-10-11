/* S-13 · Runs: every run saved to qlab-dev, newest first, with the selected run, the account and what it stores. */
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams, type RoutePath } from '../app/router'
import { Content, Shell, TabStrip, GpuStatus, AccountMark } from '../ui/Shell'
import { Banner, ErrorCode } from '../ui/Banner'
import { EditorButton, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { Sk } from '../ui/Skeleton'
import { FAILURE, ITEMS, JOBS, QUEUED_WHILE_GPU_OFF, STATES, type Job } from './team/runsData'
import { FilterSelect, InspRow, InspRows, SearchField, StateIcon, StateWord } from './team/S13Parts'
import { isRunsState, noMatchWords, stateConfig, type ItemFilter, type RunsState, type StateConfig, type StateFilter } from './team/S13Config'
import { SectionGlyph } from './team/S13Glyphs'
import { LoadingRows, SignInTile } from './team/S13States'
import './team/S13Runs.css'

const wait = (ms: number) => new Promise((done) => window.setTimeout(done, ms))

const STATE_OPTIONS: readonly StateFilter[] = ['all', ...STATES]
const ITEM_OPTIONS: readonly ItemFilter[] = ['all', ...ITEMS]

export function S13Runs() {
  const params = useHashParams()
  const raw = params.get('state')
  const state: RunsState = isRunsState(raw) ? raw : 'main'
  // ?select=<run id> opens the list on that run (other screens link here).
  const select = params.get('select')
  // Remount per state so its starting filters and selection apply.
  return <RunsScreen key={`${state}-${select ?? ''}`} state={state} select={select} />
}

function RunsScreen({ state, select }: { state: RunsState; select: string | null }) {
  const cfg = stateConfig(state)
  const [query, setQuery] = useState(cfg.query ?? '')
  const [stateFilter, setStateFilter] = useState<StateFilter>(cfg.state ?? 'all')
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(select ?? cfg.selectedId)
  const [requeued, setRequeued] = useState<string[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cfg.focusFilter) searchRef.current?.focus()
  }, [cfg.focusFilter])

  const source: Job[] = cfg.list === 'gpu-off' ? [QUEUED_WHILE_GPU_OFF, ...JOBS] : cfg.list === 'all' ? JOBS : []
  const all = source.map((j) =>
    requeued.includes(j.id)
      ? { ...j, state: 'queued' as const, duration: 'not started', gates: '', result: 'requeued · waiting for GPU · position 2' }
      : j,
  )
  const q = query.trim().toLowerCase()
  const jobs = all.filter(
    (j) =>
      (!q || j.id.toLowerCase().includes(q) || j.item.toLowerCase().includes(q)) &&
      (stateFilter === 'all' || j.state === stateFilter) &&
      (itemFilter === 'all' || j.item === itemFilter),
  )
  const filtered = !!q || stateFilter !== 'all' || itemFilter !== 'all'
  const selected = all.find((j) => j.id === selectedId) ?? null
  const clearFilters = () => {
    setQuery('')
    setStateFilter('all')
    setItemFilter('all')
  }
  const requeue = (id: string) => {
    setRequeued((r) => [...r, id])
    setFlash(id)
  }

  const banner =
    cfg.banner === 'sync-failed' ? (
      <Banner
        kind="warning"
        action={{
          label: 'Retry',
          loadingLabel: 'Retrying',
          // The mock account store answers after 1.2 s; the list then reads from the account again.
          onClick: () => wait(1200).then(() => navigate(ROUTES.runs, { replace: true })),
        }}
      >
        Could not reach the database <ErrorCode code="Q901" />. Showing this machine's copy.
      </Banner>
    ) : cfg.banner === 'offline' ? (
      <Banner kind="offline" word="offline">
        You are offline · runs stay on this machine · syncs when the network is back
      </Banner>
    ) : cfg.banner === 'gpu-off' ? (
      <Banner kind="offline" word="offline" action={{ label: 'Switch to Laptop', onClick: () => navigate(ROUTES.runs, { replace: true }) }}>
        GPU machine is off, model proposals wait. 2 proposals are queued.
      </Banner>
    ) : null

  return (
    <Shell
      context="Runs"
      rail="runs"
      gpu={cfg.gpu ? 'online' : 'off'}
      status={
        <>
          <GpuStatus online={cfg.gpu} />
          <AccountMark signedIn={!cfg.signedOut} />
        </>
      }
      tabs={
        <TabStrip
          tabs={[
            { id: 'all', label: 'All runs', active: true },
            { id: 'file', label: 'sidechain_qaoa.qasm', onClick: () => navigate(ROUTES.workspace) },
          ]}
        />
      }
      inspector={<RunsInspector cfg={cfg} selected={selected} total={all.length} />}
    >
      <Content className={cfg.signedOut ? 's13-content-signin' : ''}>
        {cfg.signedOut ? (
          <SignInTile />
        ) : (
          <Tile
            className="s13-tile"
            tabs={[{ id: 'runs', label: 'Runs', active: true }]}
            meta={<span className="mono">{cfg.meta}</span>}
            bodyClassName="s13-tile-body"
          >
            <div className="s13-body">
              {banner}
              {cfg.list !== 'none' && cfg.list !== 'loading' && (
                <div className="s13-toolbar">
                  <SearchField value={query} onChange={setQuery} inputRef={searchRef} />
                  <FilterSelect label="State" value={stateFilter} options={STATE_OPTIONS} onChange={setStateFilter} />
                  <FilterSelect label="Item" value={itemFilter} options={ITEM_OPTIONS} onChange={setItemFilter} />
                  <span className="s13-grow" />
                  {filtered && (
                    <span className="s13-toolbar-count mono">
                      {jobs.length} of {all.length} runs
                    </span>
                  )}
                </div>
              )}
              <div className="s13-scroll">
                <RunsHead />
                {cfg.list === 'loading' ? (
                  <LoadingRows />
                ) : cfg.list === 'none' ? (
                  <div className="s13-empty">No runs yet. Start a run in the inspector, and it is saved here with its scorecard.</div>
                ) : jobs.length === 0 ? (
                  <div className="s13-nomatch">
                    <span>{noMatchWords(query.trim(), stateFilter, itemFilter)}</span>
                    <EditorButton onClick={clearFilters}>Clear filters</EditorButton>
                  </div>
                ) : (
                  <RunsTable jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} flashId={flash} onRequeue={requeue} />
                )}
                {cfg.banner === 'sync-failed' && (
                  <div className="s13-readonly mono">
                    {jobs.length} of {all.length} from this machine · read-only until the database answers
                  </div>
                )}
              </div>
            </div>
            <div className="s13-footnote">
              Runs, scorecards and exports are saved to your account. A copy stays on this machine. Circuit source stays on this machine unless you export it.
            </div>
          </Tile>
        )}
      </Content>
    </Shell>
  )
}

/* ── Table ───────────────────────────────────────────────────────────── */
function RunsHead() {
  return (
    <div className="s13-head" role="row">
      <span className="s13-th s13-c-run">Run</span>
      <span className="s13-th s13-c-item">Item</span>
      <span className="s13-th s13-c-state">State</span>
      <span className="s13-th s13-c-started">Started</span>
      <span className="s13-th s13-c-dur">Duration</span>
      <span className="s13-th s13-c-result">
        Result<span className="mono">· two_qubit_count</span>
      </span>
    </div>
  )
}

function RunsTable({
  jobs,
  selectedId,
  onSelect,
  flashId,
  onRequeue,
}: {
  jobs: Job[]
  selectedId: string | null
  onSelect: (id: string) => void
  flashId: string | null
  onRequeue: (id: string) => void
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    const rows = Array.from(e.currentTarget.closest('.s13-table')?.querySelectorAll<HTMLElement>('.s13-row') ?? [])
    const at = rows.indexOf(e.currentTarget)
    const to = e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : null
    if (to != null) {
      e.preventDefault()
      rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }
  const group = (label: string, list: Job[]) =>
    list.length > 0 && (
      <Fragment key={label}>
        <div className="s13-group" role="row">
          <span className="s13-group-name">{label}</span>
          <span className="s13-group-count mono">{list.length} runs</span>
        </div>
        {list.map((j) => {
          const isSel = j.id === selectedId
          const failure = isSel && j.state === 'failed' ? FAILURE[j.id] : undefined
          return (
            <Fragment key={j.id}>
              <div
                role="row"
                tabIndex={0}
                aria-selected={isSel}
                aria-expanded={j.state === 'failed' ? !!failure : undefined}
                className={`s13-row${isSel ? ' is-selected' : ''}${failure ? ' is-open' : ''}${j.id === flashId ? ' is-flash' : ''}`}
                onClick={() => onSelect(j.id)}
                onKeyDown={(e) => onKey(e, j.id)}
              >
                <span className="s13-c-run s13-v">{j.id}</span>
                <span className="s13-c-item">
                  <span className="s13-v">{j.item}</span>
                  <span className="s13-q">{j.qubits} q</span>
                </span>
                <span className="s13-c-state">
                  <StateWord state={j.state} />
                </span>
                <span className="s13-c-started s13-v2">{j.started}</span>
                <span className={`s13-c-dur ${j.duration === 'not started' ? 's13-v3' : 's13-v'}`}>{j.duration}</span>
                <span className="s13-c-result">
                  <span className="s13-gates s13-v">{j.gates}</span>
                  <span className="s13-v2">{j.result}</span>
                </span>
              </div>
              {failure && (
                <div className="s13-failure" role="row">
                  <div className="s13-failure-line">
                    <span className="s13-v">{failure.code}</span>
                    <span className="s13-failure-where mono">{failure.where}</span>
                  </div>
                  <div className="s13-failure-line is-fix">
                    <span>{failure.fix}</span>
                    <span className="s13-grow" />
                    <EditorButton
                      onClick={(e) => {
                        e.stopPropagation()
                        onRequeue(j.id)
                      }}
                    >
                      Requeue
                    </EditorButton>
                  </div>
                </div>
              )}
            </Fragment>
          )
        })}
      </Fragment>
    )
  return (
    <div className="s13-table" role="grid" aria-label="Runs">
      {group(
        'Today',
        jobs.filter((j) => j.day === 'today'),
      )}
      {group(
        'Yesterday',
        jobs.filter((j) => j.day === 'yesterday'),
      )}
    </div>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
/** Section body: rows inset 16, 16 under the last rule, no gap between rows. */
const BODY = { gap: 0, paddingBottom: 16 }

function openTarget(j: Job): RoutePath | null {
  if (j.state === 'queued' || j.state === 'cancelled') return null
  if (j.kind === 'bench') return ROUTES.bench
  if (j.kind === 'score' || j.state === 'failed') return ROUTES.workspace
  return j.state === 'running' ? ROUTES.loop : ROUTES.report
}

function RunsInspector({ cfg, selected, total }: { cfg: StateConfig; selected: Job | null; total: number }) {
  const empty = cfg.list === 'none' && !cfg.signedOut
  const target = selected ? openTarget(selected) : null
  return (
    <>
      <ModeTabs />
      <div className="s13-runblock">
        <div className="s13-runline">
          <span>{cfg.signedOut ? 'Runs on this machine · not signed in' : 'Runs on this machine · saved to your account'}</span>
          {!empty && <EditorButton onClick={() => navigate(ROUTES.newRun)}>Start a run</EditorButton>}
        </div>
        {empty ? (
          <PrimaryButton onClick={() => navigate(ROUTES.newRun)}>Start a run</PrimaryButton>
        ) : cfg.signedOut ? null : (
          <PrimaryButton
            disabled={!target}
            onClick={() => {
              if (target) navigate(target)
            }}
          >
            Open run
          </PrimaryButton>
        )}
        <PoweredBy />
      </div>
      {!cfg.signedOut && <SelectedRun cfg={cfg} job={selected} />}
      <Section icon={SectionGlyph.account} title="Account" bodyStyle={BODY}>
        <InspRows>
          {cfg.signedOut ? (
            <>
              <InspRow label="Signed in as" value={<span className="s13-v3">not signed in</span>} />
              <InspRow label="On this machine" value="14 runs" />
            </>
          ) : (
            <>
              <InspRow label="Signed in as" value="qlab-dev" />
              <InspRow label="Synced" value={<Synced kind={cfg.synced} total={total} />} />
            </>
          )}
        </InspRows>
        <div className="s13-actions">
          {cfg.signedOut ? (
            <EditorButton onClick={() => navigate(ROUTES.signUp)}>Create an account</EditorButton>
          ) : (
            // Same screen, another state: the hash change re-renders it (the mock store keeps the local copy).
            <EditorButton
              onClick={() => {
                window.location.hash = `#${ROUTES.runs}?state=signed-out`
              }}
            >
              Sign out
            </EditorButton>
          )}
        </div>
      </Section>
      <Section icon={SectionGlyph.stored} title="Stored in your account" bodyStyle={BODY}>
        <InspRows>
          <InspRow label="Runs, rounds and scorecards" value={cfg.signedOut ? 'after sign in' : 'saved'} />
          <InspRow label="Exports (final .qasm you chose to upload)" value={cfg.signedOut ? 'after sign in' : 'saved'} />
          <InspRow label="Circuit source" value={<span className="s13-v2">this machine only</span>} />
        </InspRows>
      </Section>
    </>
  )
}

function Synced({ kind, total }: { kind: StateConfig['synced']; total: number }) {
  if (kind === 'loading') return <Sk w={150} h={10} />
  if (kind === 'failed')
    return (
      <span className="s13-synced is-warn">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M5 1L9.3 8.8H0.7L5 1Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M5 4.2V6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span className="s13-v">Q901 · last synced 11:42</span>
      </span>
    )
  if (kind === 'offline')
    return (
      <span className="s13-synced is-off">
        <StateIcon state="queued" />
        <span className="s13-v">not synced · last 11:42</span>
      </span>
    )
  return (
    <span className="s13-synced">
      <StateIcon state="done" />
      <span className="s13-v">{kind === 'empty' ? '0 runs · 12 s ago' : `${total} runs · 2.1 MB · 12 s ago`}</span>
    </span>
  )
}

function SelectedRun({ cfg, job }: { cfg: StateConfig; job: Job | null }) {
  if (cfg.list === 'loading')
    return (
      <Section icon={SectionGlyph.run} title="Selected run" meta={<Sk w={64} h={10} />} bodyStyle={BODY}>
        <InspRows>
          {['Run', 'Item', 'State', 'two_qubit_count', 'Started', 'Duration', 'Fixes'].map((l, i) => (
            <InspRow key={l} label={l} monoLabel={l === 'two_qubit_count'} value={<Sk w={[64, 132, 44, 96, 36, 52, 180][i]} h={10} />} />
          ))}
        </InspRows>
      </Section>
    )
  if (!job)
    return (
      <Section icon={SectionGlyph.run} title="Selected run" meta="none" bodyStyle={BODY}>
        <p className="s13-insp-empty">No run selected yet. A run you start shows its facts here.</p>
      </Section>
    )
  const facts: [string, ReactNode, boolean?][] = [
    ['Run', job.id],
    [
      'Item',
      <Fragment key="i">
        {job.item}
        <span className="s13-note">{job.qubits} q</span>
      </Fragment>,
    ],
    ['State', <StateWord key="s" state={job.state} />],
    [
      'two_qubit_count',
      job.gates ? (
        <Fragment key="g">
          {job.gates}
          {job.baseline && <span className="s13-note">from {job.baseline}</span>}
        </Fragment>
      ) : (
        <span key="g" className="s13-v3">{job.state === 'failed' ? 'none · stopped before scoring' : 'not scored yet'}</span>
      ),
      true,
    ],
    ['Started', job.started],
    ['Duration', <span key="d" className={job.duration === 'not started' ? 's13-v3' : ''}>{job.duration}</span>],
    ['Fixes', job.fixes],
  ]
  return (
    <Section icon={SectionGlyph.run} title="Selected run" meta={job.id} bodyStyle={BODY}>
      <InspRows>
        {facts.map(([l, v, mono]) => (
          <InspRow key={l} label={l} value={v} monoLabel={mono} />
        ))}
      </InspRows>
    </Section>
  )
}
