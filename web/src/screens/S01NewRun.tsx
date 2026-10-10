import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions, useRun, type RunState } from '../data/run'
import { Chevron } from '../ui/icons'
import { EditorButton, ModeBlock, ModeTabs, PrimaryButton, Tile } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { IkIcons } from './intake/icons'
import { EXAMPLE_PREVIEWS } from './intake/previews'
import './intake/intake.css'
import './intake/s01.css'

type ExampleId = RunState['selectedExample']

const EXAMPLES: { id: ExampleId; meta: string; qubits: number; desc: string }[] = [
  {
    id: 'sidechain_qaoa',
    meta: '12 q · expectation',
    qubits: 12,
    desc: 'Protein side-chain packing as a two-layer QAOA. Routing heavy on FakeTorino.',
  },
  {
    id: 'grover_5q',
    meta: '5 q · search',
    qubits: 5,
    desc: 'Grover search over 32 items. Small and quick, so it makes a good first run.',
  },
  {
    id: 'sbox_oracle',
    meta: '20 q · reversible',
    qubits: 20,
    desc: 'A reversible S-box oracle. The engine checks every one of its 2^16 inputs.',
  },
]

const READS = [
  ['01 · file', '.qasm file', 'OpenQASM 2.0 or 3.0. Parsed and drawn, never executed.'],
  ['02 · repo', 'GitHub repo', 'Finds .qasm files and Qiskit builder functions. Read-only.'],
  ['03 · manifest', 'qscore.yaml', 'Optional. Gatesmith drafts one from the circuit.'],
] as const

const STEPS = [
  ['1', 'Validate', 'about 1 s'],
  ['2', 'Confirm the plan', 'you'],
  ['3', 'Compile on FakeTorino', '8 seeds'],
  ['4', 'Measure and diagnose', 'D01 to D10'],
  ['5', 'Fix, check, repeat', 'up to 4 rounds'],
] as const

const MACHINE: [string, string, boolean?][] = [
  ['Hardware', '8 CPU · 1 GPU 48 GB'],
  ['Simulates up to', '31 q · statevector'],
  ['Local model', 'granite-8b · loaded', true],
  ['Qiskit', '1.3.2 · aer 0.15.1'],
  ['Engine', 'qscore-2026.1'],
]

const RECENT = [
  ['6c19·0398', 'sidechain_qaoa', '44 → 38'],
  ['5a02·0371', 'sidechain_qaoa', 'score only'],
  ['4e77·0350', 'sbox_oracle', 'score only'],
] as const

/** States from the S-01 states board, as ?state=… on #/new. */
type S01State = 'none' | 'drag-over' | 'bad-file' | 'fetching' | 'offline' | 'focus' | 'no-circuits'

function Section({
  icon,
  title,
  meta,
  children,
}: {
  icon: ReactNode
  title: string
  meta?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className="insp-section">
      <button className="insp-section-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="insp-section-title">{title}</span>
        {meta && <span className="insp-section-meta">{meta}</span>}
        <span className={`s01-chevron${open ? '' : ' is-closed'}`}>
          <Chevron open />
        </span>
      </button>
      <div className={`s01-collapse${open ? ' is-open' : ''}`}>
        <div className="s01-collapse-inner">
          <div className="s01-section-body">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function S01NewRun() {
  const run = useRun()
  const params = useHashParams()
  const forced = (params.get('state') ?? 'none') as S01State
  const [drag, setDrag] = useState(false)
  const [url, setUrl] = useState('')
  const exampleRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const state: S01State = drag ? 'drag-over' : forced
  const selected = EXAMPLES.find((e) => e.id === run.selectedExample) ?? EXAMPLES[0]

  useEffect(() => {
    const el = exampleRefs.current.sidechain_qaoa
    if (forced === 'focus') el?.focus()
    else if (el && document.activeElement === el) el.blur()
  }, [forced])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    actions.continueToPreflight()
  }

  const fetchRepo = () => navigate(ROUTES.repoScan, { transition: 'forward' })

  const urlValue = state === 'fetching' ? 'https://github.com/knighthacks/qaoa-packing' : url

  return (
    <Shell
      rail="new"
      tabs={
        <TabStrip
          tabs={[
            { id: 'new', label: 'New run', active: true },
            { id: 'sbox', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={
        <>
          <ModeTabs />
          <ModeBlock line="Runs on this machine" />
          <Section icon={IkIcons.steps} title="What happens next">
            <p className="s01-next-lead">Nothing runs until you confirm the plan.</p>
            <div className="s01-steps">
              {STEPS.map(([n, label, meta]) => (
                <div key={n} className="s01-step">
                  <span className="mono s01-step-n">{n}</span>
                  <span className="s01-step-label">{label}</span>
                  <span className="mono s01-step-meta">{meta}</span>
                </div>
              ))}
            </div>
          </Section>
          <Section icon={IkIcons.chip} title="This machine">
            <div className="ik-insp-rows">
              {MACHINE.map(([label, value, ok]) => (
                <div key={label} className="ik-insp-row">
                  <span className="ik-insp-row-label">{label}</span>
                  <span className="ik-insp-row-value s01-machine-value">
                    {ok && IkIcons.smallCheck}
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </Section>
          <Section icon={IkIcons.history} title="Recent runs" meta="two-qubit gates">
            <div className="s01-recent">
              {RECENT.map(([id, name, result]) => (
                <button key={id} className="s01-recent-row" onClick={() => navigate(ROUTES.runs)}>
                  <span className="mono s01-recent-id">{id}</span>
                  <span className="mono s01-recent-name">{name}</span>
                  <span className="mono s01-recent-result">{result}</span>
                </button>
              ))}
            </div>
            <div className="s01-recent-foot">
              <span>Runs stay on this machine</span>
              <EditorButton onClick={() => navigate(ROUTES.runs)} style={{ height: 26, paddingBlock: 0 }}>
                Open all runs
              </EditorButton>
            </div>
          </Section>
        </>
      }
    >
      <Content>
        <Tile
          className="s01-tile"
          tabs={[{ id: 'new', label: 'New run', active: true }]}
          meta={<span className="ik-meta-mono">Qiskit only</span>}
          bodyClassName="s01-body"
        >
          <div
            className={`s01-drop${state === 'drag-over' ? ' is-over' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false)
            }}
            onDrop={onDrop}
          >
            {state === 'drag-over' ? (
              <>
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" fill="none" stroke="#F8D441" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 16v3h14v-3" fill="none" stroke="#F8D441" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <div className="s01-drop-title">Release to add 2 files</div>
                <div className="mono s01-drop-files">sidechain_qaoa.qasm · sbox_oracle.qasm</div>
              </>
            ) : (
              <>
                {IkIcons.download}
                <div className="s01-drop-title">Drop .qasm files or paste a GitHub URL</div>
                <div className="s01-drop-sub">Qiskit · OpenQASM 2 or 3 · nothing runs until you confirm</div>
                <div className="s01-spacer" />
                <div className="s01-reads">
                  {READS.map(([k, title, text]) => (
                    <div key={k} className="s01-read">
                      <div className="mono s01-read-k">{k}</div>
                      <div className="s01-read-title">{title}</div>
                      <div className="s01-read-text">{text}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {state === 'bad-file' && (
            <div className="s01-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div className="s01-error-text">
                <div className="s01-error-title">Not OpenQASM</div>
                <div className="mono s01-error-detail">Q101 · notes.txt line 1 · expected OPENQASM 2.0 or 3.0 header</div>
              </div>
            </div>
          )}

          {state === 'offline' && (
            <div className="s01-banner" role="status">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span>You are offline. Uploads and bundled examples still work; repo fetch waits.</span>
            </div>
          )}

          <form
            className={`s01-url${state === 'offline' ? ' is-disabled' : ''}`}
            onSubmit={(e) => {
              e.preventDefault()
              fetchRepo()
            }}
          >
            <input
              className={`s01-url-input${state === 'fetching' ? ' is-filled' : ''}`}
              placeholder="https://github.com/owner/repo"
              value={urlValue}
              onChange={(e) => setUrl(e.target.value)}
              disabled={state === 'offline'}
              aria-label="GitHub repository URL"
              spellCheck={false}
            />
            <EditorButton disabled={state === 'offline'} style={{ height: 26, paddingBlock: 0 }}>
              {state === 'fetching' ? 'Fetching (40%)' : 'Fetch'}
            </EditorButton>
          </form>

          {state === 'fetching' && (
            <div className="mono s01-stages">
              <span className="s01-stage is-done">✓ clone</span>
              <span className="s01-stage is-running">● search</span>
              <span className="s01-stage is-pending">○ parse</span>
              <span className="s01-spacer-grow" />
              <span className="s01-stage-left">about 6 s left</span>
            </div>
          )}

          {state === 'no-circuits' && (
            <div className="s01-warning" role="alert">
              <div className="s01-warning-title">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <span>No .qasm file detected</span>
              </div>
              <p>Gatesmith searched 214 files in owner/repo. Point it at a Qiskit builder function, or start from an example.</p>
            </div>
          )}

          <div className="s01-examples-label">Or start from a bundled example</div>
          <div className="s01-examples" role="radiogroup" aria-label="Bundled examples">
            {EXAMPLES.map((ex) => {
              const on = ex.id === run.selectedExample
              return (
                <button
                  key={ex.id}
                  ref={(el) => {
                    exampleRefs.current[ex.id] = el
                  }}
                  role="radio"
                  aria-checked={on}
                  className={`s01-example${on ? ' is-selected' : ''}${forced === 'focus' && ex.id === 'sidechain_qaoa' ? ' is-focus' : ''}`}
                  onClick={() => actions.selectExample(ex.id)}
                  onDoubleClick={() => actions.continueToPreflight()}
                >
                  <span className="s01-preview" dangerouslySetInnerHTML={{ __html: EXAMPLE_PREVIEWS[ex.id] }} />
                  <span className="s01-example-head">
                    <span className="mono s01-example-name">{ex.id}</span>
                    <span className="mono s01-example-meta">{ex.meta}</span>
                  </span>
                  <span className="s01-example-desc">{ex.desc}</span>
                </button>
              )
            })}
          </div>

          <div className="s01-foot">
            <div className="s01-selected">
              <span className="s01-selected-label">Selected</span>
              <span className="mono s01-selected-file">{selected.id}.qasm</span>
              <span className="mono s01-selected-meta">{selected.qubits} q · 1 file</span>
            </div>
            <PrimaryButton onClick={() => actions.continueToPreflight()} style={{ paddingBlock: 0 }}>
              Continue
            </PrimaryButton>
          </div>
        </Tile>
      </Content>
    </Shell>
  )
}
