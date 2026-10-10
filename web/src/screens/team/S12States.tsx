/*
 * S-12 states (board "S-12 · Repo dashboard · states"), applied to the full screen:
 *   #/repo?state=no-runs-yet | one-run | loading | empty | error | offline | keyboard-focus | partial
 */
import type { ReactNode } from 'react'
import { actions } from '../../data/run'
import { navigate, ROUTES } from '../../app/router'
import { EditorButton } from '../../ui/parts'
import { StatusIcon } from '../../ui/status'
import { circuitRow, OpenCell, RepoInspector, RepoTable, Timeline, TimelineFrame, type RowView } from '../S12Repo'
import { REPO_CIRCUITS } from './repoData'
import { TeamIcons, TeamModeLine, TeamModeTabs, TeamSection } from './TeamInspector'

export type RepoStateView = {
  rows?: RowView[]
  selected: number | null
  focus?: number | null
  inspectorIndex?: number
  inspector?: ReactNode
  circuitsBody?: ReactNode
  circuitsMeta?: string
  timeline?: ReactNode
  sboxTab?: boolean
}

const [SIDECHAIN, P1, QFT, GROVER] = REPO_CIRCUITS

const notScored = (file: string, id: string): RowView => ({
  id,
  file,
  gates: <span style={{ color: 'var(--color-text-disabled)' }}>not scored</span>,
  trend: (
    <svg width="90" height="20" viewBox="0 0 90 20" aria-hidden>
      <path d="M2 10H88" fill="none" stroke="#354348" strokeDasharray="2 3" />
    </svg>
  ),
  open: (
    <span className="s12-c-open">
      <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
        <path d="M4 7h6" fill="none" stroke="#667E83" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span style={{ color: 'var(--color-text-disabled)' }}>not checked</span>
    </span>
  ),
  last: <span style={{ color: 'var(--color-text-disabled)' }}>never</span>,
})

const firstRun = (file: string, id: string, gates: number, open: RowView['open']): RowView => ({
  id,
  file,
  gates: `${gates} gates`,
  trend: (
    <svg width="90" height="20" viewBox="0 0 90 20" aria-hidden>
      <path d="M2 10H84" fill="none" stroke="#354348" strokeDasharray="2 3" />
      <circle cx="87" cy="10" r="2.5" fill="#C2DADF" />
    </svg>
  ),
  open,
  last: '4 m ago · #1',
})

const skeleton = (id: string): RowView => ({ id, file: '', gates: '', trend: null, open: null, last: '', skeleton: true })

function Message({
  tone,
  title,
  body,
  code,
  actions: buttons,
  top,
}: {
  tone: 'warning' | 'failed'
  title: string
  body: string
  code?: string
  actions: ReactNode
  top?: ReactNode
}) {
  return (
    <div className="s12-state-msg">
      {top}
      <div className="s12-state-title" style={{ color: tone === 'warning' ? 'var(--color-signal-warn)' : 'var(--color-signal-bad)' }}>
        {tone === 'warning' ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
        {title}
      </div>
      <p className="s12-state-body">{body}</p>
      {code && <div className="s12-state-code">{code}</div>}
      <div className="s12-actions">{buttons}</div>
    </div>
  )
}

function EmptyTimeline({ note }: { note: string }) {
  return (
    <div className="s12-chart" style={{ position: 'relative' }}>
      <svg width="978" height="500" viewBox="0 0 978 500" aria-hidden>
        <TimelineFrame />
      </svg>
      <div className="s12-timeline-note">{note}</div>
    </div>
  )
}

function QuietInspector({ modeLine, children }: { modeLine: string; children: ReactNode }) {
  return (
    <>
      <TeamModeTabs />
      <TeamModeLine>{modeLine}</TeamModeLine>
      <div className="team-insp-body">{children}</div>
    </>
  )
}

const workflowSection = (
  <TeamSection icon={TeamIcons.shield} title="CI gate">
    <div className="s12-code">qscore score --fail-on high</div>
    <div className="s12-gate-note">
      Add .github/workflows/qscore.yml and every pull request that touches a circuit gets a score comment.
    </div>
  </TeamSection>
)

export function repoStateView(state: string): RepoStateView | null {
  switch (state) {
    case 'no-runs-yet':
      return {
        selected: null,
        circuitsMeta: '3 circuits · main at a41c9e2 · 0 runs',
        circuitsBody: (
          <div className="s12-state-stack">
            <RepoTable
              selected={null}
              padding="0"
              rows={[
                notScored('sidechain_qaoa.qasm', 'a'),
                notScored('qft_8.qasm', 'b'),
                notScored('grover_5q.qasm', 'c'),
              ]}
            />
            <p className="s12-state-body">Nothing scored yet. Score main now, or add the workflow so every pull request gets a comment.</p>
            <div className="s12-actions">
              <button className="s12-mint" onClick={() => actions.reset()}>
                Score main
              </button>
              <EditorButton>Copy workflow</EditorButton>
            </div>
          </div>
        ),
        timeline: <EmptyTimeline note="The timeline starts at the second scored run." />,
        inspector: (
          <QuietInspector modeLine="Repo connected · CI has not scored anything">
            <div className="s12-sel">
              <div className="s12-sel-name">
                <span className="s12-sel-file">knighthacks/qaoa-packing</span>
                <span className="s12-sel-item">main at a41c9e2 · 3 circuits found</span>
              </div>
            </div>
            {workflowSection}
          </QuietInspector>
        ),
      }

    case 'one-run':
      return {
        selected: 0,
        circuitsMeta: '3 circuits · main at a41c9e2 · 1 run',
        circuitsBody: (
          <div className="s12-state-stack">
            <RepoTable
              selected={0}
              padding="0"
              rows={[
                firstRun('sidechain_qaoa.qasm', 'a', 44, <OpenCell open={{ severity: 'high', count: 3 }} />),
                firstRun('qft_8.qasm', 'b', 56, <OpenCell open={{ severity: 'high', count: 3 }} />),
                firstRun('grover_5q.qasm', 'c', 18, <OpenCell open={{ severity: 'none', count: 0 }} />),
              ]}
            />
            <p className="s12-state-body">One run so far, on pull request #1. Each line grows a point per scored pull request.</p>
          </div>
        ),
        timeline: <EmptyTimeline note="One run so far. Lines start at the second scored pull request." />,
        inspector: (
          <RepoInspector
            circuit={{ ...SIDECHAIN, gates: 44, prs: [], findings: SIDECHAIN.findings }}
            overrides={{
              hero: (
                <div className="s12-hero">
                  <span className="s12-hero-to">44</span>
                  <span className="s12-hero-unit">two-qubit gates · first scored run</span>
                </div>
              ),
              lastRun: 'run 7f00·1a20 · 4 m ago',
              pullRequest: '#1 · head 2b41f0c',
            }}
          />
        ),
      }

    case 'loading':
      return {
        selected: 0,
        circuitsMeta: '5 circuits · main at a41c9e2 · 38 runs',
        circuitsBody: (
          <div className="s12-state-stack">
            <div className="s12-loading-head">
              <span className="s12-loading-word">
                <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
                  <circle cx="7" cy="7" r="4" fill="#2EA3F8" />
                </svg>
                Loading (3 of 5)
              </span>
              <span className="s12-c-open-count">about 2 s left</span>
            </div>
            <RepoTable
              selected={null}
              padding="0"
              rows={[...REPO_CIRCUITS.slice(0, 3).map((c, i) => circuitRow(c, i, false)), skeleton('s1'), skeleton('s2')]}
            />
          </div>
        ),
        timeline: <Timeline selected={null} only={['sidechain_qaoa', 'sidechain_qaoa_p1', 'qft_8']} />,
      }

    case 'empty':
      return {
        selected: null,
        sboxTab: true,
        circuitsMeta: '0 circuits · main at 77e0b1d · 88 files',
        circuitsBody: (
          <Message
            tone="warning"
            title="No .qasm file detected"
            body="Gatesmith searched 88 files in knighthacks/sbox-oracles and found no OpenQASM. Point it at a folder of .qasm files or a Qiskit builder function."
            code="searched src/ notebooks/ tests/ · skipped .venv/"
            actions={
              <>
                <EditorButton>Choose folder</EditorButton>
                <EditorButton onClick={() => navigate(ROUTES.newRun)}>Open an example</EditorButton>
              </>
            }
          />
        ),
        timeline: <EmptyTimeline note="No circuits, so nothing to chart." />,
        inspector: (
          <QuietInspector modeLine="Nothing to score in this repo yet">
            <div className="s12-sel">
              <div className="s12-sel-name">
                <span className="s12-sel-file">knighthacks/sbox-oracles</span>
                <span className="s12-sel-item">main at 77e0b1d · 88 files searched</span>
              </div>
            </div>
            {workflowSection}
          </QuietInspector>
        ),
      }

    case 'error':
      return {
        selected: null,
        circuitsMeta: 'scores could not load',
        circuitsBody: (
          <Message
            tone="failed"
            title="Could not load scores"
            body="GitHub returned 403 for knighthacks/qaoa-packing. The Gatesmith app no longer has access to this repo."
            code="HTTP 403 · Resource not accessible by integration"
            actions={
              <>
                <EditorButton>Reconnect GitHub</EditorButton>
                <EditorButton onClick={() => navigate(ROUTES.repo)}>Try again</EditorButton>
              </>
            }
          />
        ),
        timeline: <EmptyTimeline note="Scores could not load, so the timeline is empty." />,
        inspector: (
          <QuietInspector modeLine="GitHub access lost · nothing changed in the repo">
            {workflowSection}
          </QuietInspector>
        ),
      }

    case 'offline':
      return {
        selected: 0,
        circuitsMeta: 'cached at 11:20 · main at a41c9e2',
        circuitsBody: (
          <div className="s12-state-stack">
            <div className="s12-banner">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              You are offline. Showing scores cached at 11:20. Run again waits until you are back.
            </div>
            <RepoTable selected={0} padding="0" rows={REPO_CIRCUITS.map((c, i) => circuitRow(c, i, i === 0))} />
          </div>
        ),
        inspector: <RepoInspector circuit={SIDECHAIN} modeLine="Offline · showing scores cached at 11:20" />,
      }

    case 'keyboard-focus':
    case 'focus':
      return {
        selected: 0,
        focus: 1,
        circuitsBody: (
          <div className="s12-state-stack">
            <RepoTable selected={0} focus={1} padding="0" rows={REPO_CIRCUITS.map((c, i) => circuitRow(c, i, i === 0))} />
            <p className="s12-hint">↑ ↓ move focus · Enter selects · O opens the last run · T jumps to the timeline</p>
          </div>
        ),
      }

    case 'partial':
      return {
        selected: 0,
        circuitsBody: (
          <div className="s12-state-stack">
            <RepoTable
              selected={0}
              padding="0"
              rows={[
                circuitRow(SIDECHAIN, 0, true),
                circuitRow(P1, 1, false),
                {
                  ...circuitRow(QFT, 2, false),
                  open: (
                    <span className="s12-c-open">
                      <StatusIcon kind="failed" />
                      <span style={{ color: 'var(--color-signal-bad)' }}>score failed</span>
                    </span>
                  ),
                },
                circuitRow(GROVER, 3, false),
                circuitRow(REPO_CIRCUITS[4], 4, false),
              ]}
            />
            <p className="s12-state-body">
              Run 7f30·8a42 on qft_8.qasm failed: WorkerStopped, not requeued. The last good score stays on the chart.
            </p>
            <div className="s12-actions">
              <EditorButton onClick={() => actions.reset()}>Run again</EditorButton>
              <EditorButton onClick={() => navigate(ROUTES.runs)}>Open run</EditorButton>
            </div>
          </div>
        ),
      }
  }
  return null
}
