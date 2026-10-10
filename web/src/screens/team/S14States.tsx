/*
 * S-14 states (board "S-14 · Leaderboard · states"), applied to the full screen. Read-only in every state.
 *   #/leaderboard?state=no-runs-yet | one-run | loading | empty | error | offline | keyboard-focus | not-listed
 */
import type { ReactNode } from 'react'
import { navigate, ROUTES } from '../../app/router'
import { EditorButton, Tile } from '../../ui/parts'
import { BoardInspector, BoardTable, sortRows } from '../S14Leaderboard'
import { BENCH } from './boardData'
import { TeamModeLine, TeamModeTabs } from './TeamInspector'

export type BoardStateView = {
  board?: ReactNode
  fixtures?: ReactNode
  inspector?: ReactNode
  meta?: string
  tabs?: [string, string, string]
  filter?: 'all' | 'local' | 'platform'
  selectedId?: string
}

const row = (id: string) => BENCH.find((r) => r.id === id)!

function Head() {
  // the column header row alone, drawn by the table with no rows
  return <BoardTable rows={[]} sort="vir" selectedId={null} padding="0" />
}

function Message({ title, body, code, actions, tone }: { title: string; body: string; code?: string; actions?: ReactNode; tone?: 'failed' }) {
  return (
    <div className="s14-table">
      <Head />
      <div className="s14-state">
        <div className="s14-state-title" style={tone ? { color: 'var(--color-signal-bad)', fontWeight: 400, fontSize: 12 } : undefined}>
          {tone && (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
          {title}
        </div>
        <p className="s14-state-body">{body}</p>
        {code && <div className="s14-state-code">{code}</div>}
      </div>
      {actions && <div className="s14-state-actions">{actions}</div>}
    </div>
  )
}

function EmptyFixtures({ note }: { note: string }) {
  return (
    <Tile className="s14-fixtures" tabs={[{ id: 'f', label: 'Accepted by fixture', active: true }]} meta={<span className="mono">of 20 requests each</span>}>
      <div className="s14-empty-chart">{note}</div>
    </Tile>
  )
}

function Quiet({ line }: { line: string }) {
  const steps = [
    'qscore conform runs the layer on 12 fixtures',
    'qscore bench sends 20 requests per fixture',
    'Rates land here, ranked, and stay read-only',
  ]
  return (
    <>
      <TeamModeTabs />
      <TeamModeLine>{line}</TeamModeLine>
      <div className="team-insp-body">
        <section className="team-sec" style={{ borderTop: 0 }}>
          <div className="team-sec-head">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M4 15V8M9 15V3M14 15V10" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="team-sec-title">How a layer gets on the board</span>
          </div>
          {steps.map((l, i) => (
            <div key={l} className={`s14-note-row${i === steps.length - 1 ? ' is-last' : ''}`}>
              <span className="s14-note-n">{i + 1}</span>
              <span className="s14-note-text">{l}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}

export function boardStateView(state: string): BoardStateView | null {
  switch (state) {
    case 'no-runs-yet':
      return {
        tabs: ['All · 0', 'Local · 0', 'Platform · 0'],
        meta: '12 fixtures × 20 · qscore-2026.1 · nothing benchmarked',
        board: (
          <Message
            title="No layer has been benchmarked yet"
            body="A row appears after a layer passes qscore conform and runs the bench fixtures. The reference layer goes first, so every model has something to beat."
            code="qscore conform reference-qiskit then qscore bench"
          />
        ),
        fixtures: <EmptyFixtures note="The chart fills in once a layer finishes its bench run." />,
        inspector: <Quiet line="Reported, not thresholded. Read-only." />,
      }

    case 'one-run':
      return {
        tabs: ['All · 1', 'Local · 1', 'Platform · 0'],
        selectedId: 'reference',
        board: (
          <div className="s14-table">
            <BoardTable rows={[row('reference')]} sort="vir" selectedId="reference" padding="0" />
            <p className="s14-hint" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: '16px', color: 'var(--color-text-secondary)' }}>
              One layer, so rank 1 means nothing yet. Comparisons start when a second layer finishes its bench run.
            </p>
          </div>
        ),
        inspector: <BoardInspector row={row('reference')} />,
      }

    case 'loading':
      return {
        meta: 'aggregating bench results',
        board: (
          <div className="s14-table">
            <div className="s14-loading">
              <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
                <circle cx="7" cy="7" r="4" fill="#2EA3F8" />
              </svg>
              Loading (2 of 6 layers)
            </div>
            <BoardTable rows={[row('qwen-v3'), row('reference')]} sort="vir" selectedId={null} padding="0" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="s14-row" aria-busy>
                <span className="s14-c-rank">
                  <span className="s12-skel" style={{ width: 8 }} />
                </span>
                <span className="s14-c-model">
                  <span className="s12-skel" style={{ width: i % 2 ? 112 : 136 }} />
                </span>
                <span className="s14-c-layer">
                  <span className="s12-skel" style={{ width: 112 }} />
                </span>
                <span className="s14-c-prompt">
                  <span className="s12-skel" style={{ width: 16 }} />
                </span>
                <span style={{ flex: '1 1 0', display: 'flex', justifyContent: 'flex-end' }}>
                  <span className="s12-skel" style={{ width: 360 }} />
                </span>
              </div>
            ))}
          </div>
        ),
        fixtures: <EmptyFixtures note="Per-fixture results appear when the selected layer has loaded." />,
        inspector: <Quiet line="Aggregating bench results · read-only" />,
      }

    case 'empty':
      return {
        filter: 'platform',
        tabs: ['All · 6', 'Local · 6', 'Platform · 0'],
        board: (
          <Message
            title="No platform layers on this board"
            body="Every row so far ran on this machine. Platform rows appear after a bench run uses a platform GPU."
            actions={<EditorButton onClick={() => navigate(ROUTES.leaderboard)}>Show all layers</EditorButton>}
          />
        ),
      }

    case 'error':
      return {
        meta: 'results could not be read',
        board: (
          <Message
            tone="failed"
            title="Could not read bench results"
            body="bench_results.jsonl stops halfway through line 913. The rows above it are kept. This layer stays off the board until the file is complete."
            code="JSONDecodeError · line 913 · granite-8b-qiskit v2 · exit 2"
            actions={
              <>
                <EditorButton onClick={() => navigate(ROUTES.leaderboard)}>Try again</EditorButton>
                <EditorButton>Open the file</EditorButton>
              </>
            }
          />
        ),
      }

    case 'offline':
      return {
        meta: 'offline · board as of 11:20',
        board: (
          <div className="s14-table">
            <div className="s14-banner">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              You are offline. Showing the board as of 11:20. Platform rows may be out of date.
            </div>
            <BoardTable rows={sortRows(BENCH, 'vir')} sort="vir" selectedId="granite-v3" staleId="qwen-v3" padding="0" />
            <p className="s14-hint">cached rows show their last synced numbers in gray until the platform answers</p>
          </div>
        ),
      }

    case 'keyboard-focus':
    case 'focus':
      return {
        board: (
          <div className="s14-table">
            <BoardTable rows={sortRows(BENCH, 'vir')} sort="vir" selectedId="granite-v3" focusId="deepseek-v3" padding="0" />
            <p className="s14-hint">↑ ↓ move focus · Enter selects · S changes the sort column · C copies the row</p>
          </div>
        ),
      }

    case 'not-listed':
      return {
        fixtures: (
          <Tile className="s14-fixtures" tabs={[{ id: 'n', label: 'Not on the board', active: true }]} meta={<span className="mono">1 layer failed conform</span>}>
            <div className="s14-table">
              <div className="s14-state">
                <div className="s14-state-title">codegemma-7b is not on the board</div>
                <p className="s14-state-body">
                  It passed 9 of 12 conform fixtures. Only qscore-compatible layers are ranked. Rates are reported, never compared against a
                  threshold.
                </p>
                <div className="s14-state-code">qscore conform codegemma-7b · 9 of 12 · F04 F07 F11 failed</div>
              </div>
              <div className="s14-state-actions">
                <EditorButton onClick={() => navigate(ROUTES.runs)}>Open conform run</EditorButton>
              </div>
            </div>
          </Tile>
        ),
      }
  }
  return null
}
