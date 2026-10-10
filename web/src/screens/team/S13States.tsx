/*
 * S-13 states (board "S-13 · Runs · states"), applied to the full screen:
 *   #/runs?state=no-runs-yet | one-run | loading | empty | error | offline | keyboard-focus | cancel
 */
import type { ReactNode } from 'react'
import { navigate, ROUTES } from '../../app/router'
import { EditorButton, PrimaryButton } from '../../ui/parts'
import { RunInspector, RunsHead, RunsTable } from '../S13Runs'
import { JOBS, type Job } from './runsData'
import { TeamModeLine, TeamModeTabs } from './TeamInspector'

export type RunsStateView = {
  body?: ReactNode
  inspector?: ReactNode
  meta?: string
  selectedId?: string
  filter?: 'all' | 'active' | 'failed'
  failedCount?: number
  confirming?: string
}

const job = (id: string) => JOBS.find((j) => j.id === id)!

const FIRST: Job = {
  id: '7f01·a1c4',
  item: 'grover_5q',
  file: 'grover_5q.qasm',
  kind: 'score',
  state: 'running',
  started: '11:20',
  duration: '12 s',
  result: 'scoring against FakeTorino · seed 5 of 8',
  day: 'today',
  worker: 'laptop-cpu · local',
  queued: '11:20:01 · waited 1 s',
}

function Skeleton({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="s13-row" aria-busy>
          <span className="s13-c-run">
            <span className="s12-skel" style={{ width: 72 }} />
          </span>
          <span className="s13-c-item">
            <span className="s12-skel" style={{ width: i % 2 ? 88 : 112 }} />
          </span>
          <span className="s13-c-kind">
            <span className="s12-skel" style={{ width: 48 }} />
          </span>
          <span className="s13-c-state">
            <span className="s12-skel" style={{ width: 64 }} />
          </span>
          <span className="s13-c-started">
            <span className="s12-skel" style={{ width: 36 }} />
          </span>
          <span className="s13-c-dur">
            <span className="s12-skel" style={{ width: 40 }} />
          </span>
          <span className="s13-c-result">
            <span className="s12-skel" style={{ width: i % 2 ? 180 : 240 }} />
          </span>
        </div>
      ))}
    </>
  )
}

function Quiet({ line, children }: { line: string; children?: ReactNode }) {
  return (
    <>
      <TeamModeTabs />
      <TeamModeLine>{line}</TeamModeLine>
      <div className="team-insp-body">{children}</div>
    </>
  )
}

export function runsStateView(state: string): RunsStateView | null {
  switch (state) {
    case 'no-runs-yet':
      return {
        meta: 'fresh install · nothing queued',
        body: (
          <div className="s13-table">
            <RunsHead />
            <div className="s13-state-msg">
              <div className="s13-state-title">Nothing has run on this machine yet</div>
              <p className="s13-state-body">
                Runs appear here as soon as a job is queued: a score, an improve loop, a bench or a conform check. Each one keeps its events and
                result.
              </p>
            </div>
            <div className="s13-state-actions">
              <button className="s12-mint" onClick={() => navigate(ROUTES.newRun)}>
                Start a run
              </button>
              <EditorButton onClick={() => navigate(ROUTES.newRun)}>Open an example</EditorButton>
            </div>
          </div>
        ),
        inspector: <Quiet line="Jobs on this machine and the platform queue" />,
      }

    case 'one-run':
      return {
        meta: 'today · 1 run',
        body: (
          <div className="s13-table">
            <RunsTable jobs={[FIRST]} selectedId={FIRST.id} footer={false} />
            <p className="s13-hint" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: '16px', color: 'var(--color-text-secondary)' }}>
              Scoring grover_5q.qasm against FakeTorino. The result lands in this row, then in the inspector.
            </p>
            <div className="s13-progress">
              <svg width="200" height="4" viewBox="0 0 200 4" aria-hidden>
                <path d="M0 1h200v2H0z" fill="#354348" />
                <path d="M0 0h120v4H0z" fill="#2EA3F8" />
              </svg>
              Scoring (60%)
            </div>
          </div>
        ),
        inspector: (
          <RunInspector
            job={FIRST}
            workers={[{ name: 'laptop-cpu', job: 'running 7f01·a1c4' }]}
            primary={
              <div className="team-mode-line" style={{ paddingTop: 0 }}>
                <PrimaryButton progress={0.6}>Scoring (60%)</PrimaryButton>
              </div>
            }
          />
        ),
      }

    case 'loading':
      return {
        meta: 'loading runs · local and platform',
        body: (
          <div className="s13-table">
            <RunsHead />
            <div className="s13-group">
              <span className="s13-group-name" style={{ color: 'var(--color-signal-info)' }}>
                Loading runs
              </span>
              <span className="s13-group-count">local and platform</span>
            </div>
            <RunsTable jobs={[job('7f3b·0c5e')]} selectedId={null} footer={false} />
            <Skeleton n={5} />
          </div>
        ),
        inspector: <Quiet line="Reading the job queue" />,
      }

    case 'empty':
      return {
        filter: 'failed',
        failedCount: 0,
        meta: 'since yesterday · newest first · times local',
        body: (
          <div className="s13-table">
            <RunsHead />
            <div className="s13-state-msg">
              <div className="s13-state-title">No failed runs since yesterday</div>
              <p className="s13-state-body">All 17 runs ended done or cancelled, or are still active. Older failures are under Load earlier runs.</p>
            </div>
            <div className="s13-state-actions">
              <EditorButton onClick={() => navigate(ROUTES.runs)}>Show all runs</EditorButton>
              <EditorButton>Load earlier runs</EditorButton>
            </div>
          </div>
        ),
      }

    case 'error':
      return {
        meta: 'the queue did not answer',
        body: (
          <div className="s13-table">
            <RunsHead />
            <div className="s13-state-msg">
              <div className="s13-state-title" style={{ color: 'var(--color-signal-bad)', fontWeight: 400, fontSize: 12 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Could not reach the job queue
              </div>
              <p className="s13-state-body">The local queue stopped responding after 10 s. Runs already started keep going. New ones wait.</p>
              <div className="s13-code">ConnectionRefused · 127.0.0.1:7341 · exit 3</div>
            </div>
            <div className="s13-state-actions">
              <EditorButton onClick={() => navigate(ROUTES.runs)}>Try again</EditorButton>
              <EditorButton>Copy details</EditorButton>
            </div>
          </div>
        ),
        inspector: <Quiet line="Job queue unreachable · runs already started keep going" />,
      }

    case 'offline':
      return {
        meta: 'offline · platform shows last known state',
        body: (
          <div className="s13-table">
            <div className="s13-banner">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              You are offline. Local runs continue. Platform runs show their last known state.
            </div>
            <RunsTable jobs={[job('7f3a·0412'), job('7f38·51d0')]} selectedId="7f3a·0412" footer={false} />
            <p className="s13-hint">7f38·51d0 waits for a platform GPU · last seen 11:20</p>
          </div>
        ),
        inspector: <RunInspector job={job('7f3a·0412')} modeLine="Offline · local runs continue" />,
      }

    case 'keyboard-focus':
    case 'focus':
      return {
        body: (
          <div className="s13-table">
            <RunsTable
              jobs={['7f3b·0c5e', '7f3a·0412', '7f39·9c11', '7f38·51d0'].map(job)}
              selectedId="7f3a·0412"
              focusId="7f39·9c11"
              footer={false}
            />
            <p className="s13-hint">↑ ↓ move focus · Enter selects · 1 2 3 switch tabs · Delete cancels a queued run</p>
          </div>
        ),
      }

    case 'cancel':
      return {
        selectedId: '7f38·51d0',
        confirming: '7f38·51d0',
      }
  }
  return null
}
