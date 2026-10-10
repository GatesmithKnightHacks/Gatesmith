/* S-13 · Runs: every job on this machine and the platform queue, newest first. */
import { Fragment, useState, type KeyboardEvent, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, Tile } from '../ui/parts'
import { eventsFor, isActive, isFailed, JOBS, type Job, type JobState } from './team/runsData'
import { TeamKV, TeamModeLine, TeamModeTabs } from './team/TeamInspector'
import { runsStateView } from './team/S13States'
import './team/team.css'
import './team/S13Runs.css'

type Filter = 'all' | 'active' | 'failed'

export function S13Runs() {
  const state = useHashParams().get('state')
  // Remount per state so its starting selection and filter apply.
  return <RunsScreen key={state ?? 'main'} state={state} />
}

function RunsScreen({ state }: { state: string | null }) {
  const view = state ? runsStateView(state) : null
  const [filter, setFilter] = useState<Filter>(view?.filter ?? 'all')
  const [selectedId, setSelectedId] = useState(view?.selectedId ?? '7f3a·0412')
  const [cancelled, setCancelled] = useState<string[]>([])
  const [confirming, setConfirming] = useState<string | null>(view?.confirming ?? null)

  const all = JOBS.map((j) => (cancelled.includes(j.id) ? { ...j, state: 'cancelled' as const, result: 'cancelled while queued', duration: 'not started' } : j))
  const jobs = all.filter((j) => (filter === 'active' ? isActive(j) : filter === 'failed' ? isFailed(j) : true))
  const selected = all.find((j) => j.id === selectedId) ?? all[1]

  // 1 2 3 switch tabs · Delete cancels a queued run
  const onKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === '1') setFilter('all')
    if (e.key === '2') setFilter('active')
    if (e.key === '3') setFilter('failed')
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.state === 'queued') setConfirming(selected.id)
  }

  return (
    <Shell
      rail="runs"
      tabs={
        <TabStrip
          tabs={[
            { id: 'all', label: 'All runs', active: true },
            { id: 'file', label: 'sidechain_qaoa.qasm', onClick: () => navigate(ROUTES.workspace) },
          ]}
        />
      }
      inspector={
        view?.inspector ?? (
          <RunInspector
            job={selected}
            confirming={confirming === selected.id}
            onCancel={() => setConfirming(selected.id)}
            onKeep={() => setConfirming(null)}
            onConfirm={() => {
              setCancelled((c) => [...c, selected.id])
              setConfirming(null)
            }}
          />
        )
      }
    >
      <Content>
        <Tile
          className="s13-tile"
          tabs={[
            { id: 'all', label: 'All · 17', active: filter === 'all', onClick: () => setFilter('all') },
            { id: 'active', label: `Active · ${all.filter(isActive).length}`, active: filter === 'active', onClick: () => setFilter('active') },
            { id: 'failed', label: `Failed · ${view?.failedCount ?? 2}`, active: filter === 'failed', onClick: () => setFilter('failed') },
          ]}
          meta={<span className="mono">{view?.meta ?? 'since yesterday · newest first · times local'}</span>}
        >
          <div className="s13-keys" onKeyDown={onKeys}>
            {view?.body ?? (
              <RunsTable key={filter} jobs={jobs} selectedId={selected.id} onSelect={setSelectedId} filter={filter} />
            )}
          </div>
        </Tile>
      </Content>
    </Shell>
  )
}

/* ── Table ───────────────────────────────────────────────────────────── */
export function RunsHead() {
  return (
    <div className="s13-head" role="row">
      <span className="team-th s13-c-run">Run</span>
      <span className="team-th s13-c-item">Item</span>
      <span className="team-th s13-c-kind">Kind</span>
      <span className="team-th s13-c-state">State</span>
      <span className="team-th s13-c-started">Started</span>
      <span className="team-th s13-c-dur">Duration</span>
      <span className="team-th s13-c-result">Result</span>
    </div>
  )
}

export function RunsTable({
  jobs,
  selectedId,
  onSelect,
  filter = 'all',
  focusId,
  footer = true,
}: {
  jobs: Job[]
  selectedId: string | null
  onSelect?: (id: string) => void
  filter?: Filter
  focusId?: string
  footer?: boolean
}) {
  const today = jobs.filter((j) => j.day === 'today')
  const yesterday = jobs.filter((j) => j.day === 'yesterday')
  let k = 0
  const onKey = (e: KeyboardEvent<HTMLDivElement>, j: Job) => {
    const rows = Array.from(e.currentTarget.closest('.s13-table')?.querySelectorAll<HTMLElement>('.s13-row') ?? [])
    const at = rows.indexOf(e.currentTarget)
    if (e.key === 'ArrowDown') (e.preventDefault(), rows[Math.min(rows.length - 1, at + 1)]?.focus())
    if (e.key === 'ArrowUp') (e.preventDefault(), rows[Math.max(0, at - 1)]?.focus())
    if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), onSelect?.(j.id))
  }
  const group = (label: string, list: Job[]) =>
    list.length > 0 && (
      <Fragment key={label}>
        <div className="s13-group" role="row">
          <span className="s13-group-name">{label}</span>
          <span className="s13-group-count">{list.length} runs</span>
        </div>
        {list.map((j, i) => {
          const isSel = j.id === selectedId
          const delay = k++ * 40
          return (
            <div
              key={j.id}
              role="row"
              tabIndex={0}
              aria-selected={isSel}
              className={[
                's13-row',
                'team-row',
                'team-arrive',
                isSel ? 'is-selected' : '',
                i === list.length - 1 && label === 'Today' && yesterday.length > 0 ? 'is-group-end' : '',
                j.id === focusId ? 'is-focus' : '',
              ].join(' ')}
              style={{ animationDelay: `${delay}ms` }}
              onClick={() => onSelect?.(j.id)}
              onKeyDown={(e) => onKey(e, j)}
            >
              <span className="s13-c-run s13-strong">{j.id}</span>
              <span className="s13-c-item s13-strong">{j.item}</span>
              <span className="s13-c-kind">{j.kind}</span>
              <span className="s13-c-state">
                <JobStateWord state={j.state} />
              </span>
              <span className="s13-c-started">{j.started}</span>
              <span className={`s13-c-dur${j.duration === 'not started' ? ' is-muted' : ''}`}>{j.duration}</span>
              <span className="s13-c-result">{j.result}</span>
            </div>
          )
        })}
      </Fragment>
    )
  return (
    <div className="s13-table" role="grid" aria-label="Runs">
      <RunsHead />
      {group('Today', today)}
      {group('Yesterday', yesterday)}
      {jobs.length === 0 && (
        <div className="s13-none">{filter === 'failed' ? 'No failed runs since yesterday.' : 'Nothing is running or queued.'}</div>
      )}
      {footer && (
        <div className="s13-footer">
          <span className="s13-footer-note">
            {filter === 'all'
              ? '17 runs since yesterday. 197 more this week on this machine and the platform queue.'
              : `${jobs.length} of 17 runs since yesterday match this filter.`}
          </span>
          <EditorButton>Load earlier runs</EditorButton>
        </div>
      )}
    </div>
  )
}

const STATE_COLOR: Record<JobState, string> = {
  claimed: 'var(--color-signal-info)',
  running: 'var(--color-signal-info)',
  done: 'var(--color-text-primary)',
  queued: 'var(--color-text-secondary)',
  failed: 'var(--color-signal-bad)',
  cancelled: 'var(--color-text-disabled)',
}

export function JobStateIcon({ state, size = 12 }: { state: JobState; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true } as const
  switch (state) {
    case 'claimed':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="#2EA3F8" strokeWidth="1.6" />
          <path d="M7 2.5a4.5 4.5 0 010 9z" fill="#2EA3F8" />
        </svg>
      )
    case 'running':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r={size >= 14 ? 4.5 : 4} fill="#2EA3F8" />
        </svg>
      )
    case 'done':
      return (
        <svg {...s}>
          <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'queued':
      return (
        <svg {...s}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="#C2DADF" strokeWidth="1.6" />
        </svg>
      )
    case 'failed':
      return (
        <svg {...s}>
          <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg {...s}>
          <path d="M3.5 7h7" fill="none" stroke="#667E83" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
  }
}

export function JobStateWord({ state }: { state: JobState }) {
  return (
    <span className="s13-state" style={{ color: STATE_COLOR[state] }}>
      <JobStateIcon state={state} />
      {state}
    </span>
  )
}

/* ── Inspector ───────────────────────────────────────────────────────── */
const WORKERS = [
  { name: 'laptop-gpu', job: 'running 7f3a·0412' },
  { name: 'laptop-cpu', job: 'claimed 7f3b·0c5e' },
  { name: 'platform queue', job: '7f38·51d0 waits for GPU', idle: true },
]

const CANCEL_NOTE: Record<JobState, string> = {
  running: 'Cancel works only while a job is queued. This one is running, so it finishes its round.',
  claimed: 'Cancel works only while a job is queued. A worker has claimed this one, so it runs.',
  queued: 'Cancel removes it from the queue. Nothing has run yet, so nothing is lost.',
  done: 'This run finished. Run it again to get a fresh scorecard with the same seeds.',
  failed: 'Failed jobs are not retried automatically. Run it again when the cause is fixed.',
  cancelled: 'This job was cancelled before a worker claimed it. Nothing ran.',
}

export function RunInspector({
  job,
  modeLine = 'Jobs on this machine and the platform queue',
  confirming = false,
  onCancel,
  onKeep,
  onConfirm,
  primary,
  workers = WORKERS,
}: {
  workers?: { name: string; job: string; idle?: boolean }[]
  job: Job
  modeLine?: string
  confirming?: boolean
  onCancel?: () => void
  onKeep?: () => void
  onConfirm?: () => void
  primary?: ReactNode
}) {
  const events = eventsFor(job)
  return (
    <>
      <TeamModeTabs />
      <TeamModeLine>{modeLine}</TeamModeLine>
      {primary}
      <div className="team-insp-body s13-insp-swap" key={job.id}>
        <div className="s13-sel">
          <div className="s12-sel-name">
            <span className="s12-sel-file">run {job.id}</span>
            <span className="s12-sel-item">
              {job.kind} · {job.item} · {job.file}
            </span>
          </div>
          <div className="s13-sel-state">
            <JobStateIcon state={job.state} size={14} />
            <span className="s13-sel-word" style={{ color: STATE_COLOR[job.state] }}>
              {job.state}
            </span>
            <span className="s13-sel-meta">
              {job.id === '7f3a·0412' ? '6 m 40 s · round 3 of 4' : job.duration}
            </span>
          </div>
          <div className="s12-kvs">
            <TeamKV label="Worker" value={job.worker ?? 'none yet'} />
            <TeamKV label="Attempt" value={job.state === 'queued' || job.state === 'cancelled' ? '0 of 3' : '1 of 3'} />
            <TeamKV label="Model" value={job.model ?? 'none · engine only'} />
            <TeamKV label="Queued" value={job.queued ?? job.started} />
            <TeamKV label="Score version" value="qscore-2026.1" />
          </div>
        </div>
        <section className="team-sec">
          <div className="team-sec-head">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="9" cy="9" r="6.3" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <path d="M9 5.5V9l2.4 1.6" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="team-sec-title">Events</span>
            <span className="team-sec-meta">{events.length} · newest last</span>
          </div>
          <div className="s13-events">
            <svg width="12" height={events.length * 28} viewBox={`0 0 12 ${events.length * 28}`} aria-hidden>
              <path d={`M6 14V${14 + (events.length - 1) * 28}`} fill="none" stroke="#354348" />
              {events.map((e, i) =>
                e.now ? (
                  <circle key={i} cx="6" cy={14 + i * 28} r="4.5" fill="#2EA3F8" />
                ) : (
                  <circle key={i} cx="6" cy={14 + i * 28} r="3.5" fill="#C2DADF" />
                ),
              )}
            </svg>
            <div className="s13-event-list">
              {events.map((e, i) => (
                <div key={i} className="s13-event">
                  <span className="s13-event-time" style={e.now ? { color: 'var(--color-signal-info)' } : undefined}>
                    {e.time}
                  </span>
                  <span className="s13-event-word" style={e.now ? { color: 'var(--color-signal-info)' } : undefined}>
                    {e.word}
                  </span>
                  {e.note && <span className="s13-event-note">{e.note}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="s13-actions-sec">
          <div className="s12-actions">
            <EditorButton onClick={() => navigate(ROUTES.loop)}>Open loop</EditorButton>
            <EditorButton onClick={() => navigator.clipboard?.writeText(job.id).catch(() => {})}>Copy job id</EditorButton>
            <EditorButton disabled={job.state !== 'queued'} onClick={onCancel}>
              Cancel
            </EditorButton>
          </div>
          {confirming ? (
            <div className="s13-confirm">
              <div className="s13-confirm-title">Cancel run {job.id}?</div>
              <p className="s13-note">It has not started, so nothing is lost. It moves from queued to cancelled and leaves the GPU queue.</p>
              <div className="s12-actions">
                <EditorButton onClick={onConfirm}>Cancel run</EditorButton>
                <EditorButton onClick={onKeep}>Keep it</EditorButton>
              </div>
            </div>
          ) : (
            <p className="s13-note">{CANCEL_NOTE[job.state]}</p>
          )}
        </section>
        <section className="team-sec">
          <div className="team-sec-head">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <rect x="2.5" y="3.5" width="13" height="4" rx="1" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <rect x="2.5" y="10.5" width="13" height="4" rx="1" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
            </svg>
            <span className="team-sec-title">Workers</span>
            <span className="team-sec-meta">
              {workers.filter((w) => !w.idle).length} busy · {workers.filter((w) => w.idle).length} queued
            </span>
          </div>
          {workers.map((w) => (
            <div key={w.name} className="s13-worker">
              <span className={`s13-worker-dot${w.idle ? ' is-idle' : ''}`} />
              <span className="s13-worker-name">{w.name}</span>
              <span className="s13-worker-job">{w.job}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}
