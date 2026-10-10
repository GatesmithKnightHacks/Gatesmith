import { useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions } from '../data/run'
import { Chevron } from '../ui/icons'
import { EditorButton, ModeBlock, ModeTabs, PrimaryButton, Tile } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { QaoaCircuit } from './intake/QaoaCircuit'
import './intake/intake.css'
import './intake/s01.css'
import './intake/s02.css'

type FileRow = { path: string; size: string; qubits: string; kind: string; broken?: boolean }

const FILES: FileRow[] = [
  { path: 'circuits/sidechain_qaoa.qasm', size: '3.1 KB', qubits: '12 q', kind: 'OpenQASM 2' },
  { path: 'circuits/sidechain_qaoa_p1.qasm', size: '1.7 KB', qubits: '12 q', kind: 'OpenQASM 2' },
  { path: 'src/packing/qaoa.py · build_qaoa', size: '6.4 KB', qubits: '12 q', kind: 'Qiskit builder' },
  { path: 'tests/fixtures/broken_header.qasm', size: '0.2 KB', qubits: 'n/a', kind: '× not OpenQASM', broken: true },
]

const MANIFEST = `version: 1
items:
  - id: packing_qaoa_p2
    source: circuits/sidechain_qaoa.qasm
    intent: expectation   # default
    target: FakeTorino    # default
    seeds: 8              # default
    primary: two_qubit_count
    max_rounds: 4         # default
    layers: [reference-qiskit, local]`

const DEFAULTS = [
  ['intent', 'measure all, no oracle register, so expectation'],
  ['target', 'the platform default fake backend'],
  ['primary', 'two-qubit gates dominate the QAOA cost'],
  ['layers', 'GPU online, so the local model is on'],
  ['seeds', 'the engine default, enough to see seed spread'],
  ['max_rounds', 'the engine default; it can recommend stopping sooner'],
]

const CHECKS: { ok: boolean; text: string; meta: string }[] = [
  { ok: true, text: 'Aer simulator found', meta: 'qiskit-aer==0.15.1' },
  { ok: true, text: 'build_qaoa returns a QuantumCircuit', meta: 'signature only' },
  { ok: true, text: 'No hardware credentials in the repo', meta: 'nothing is sent' },
  { ok: false, text: '1 file skipped, header is not OpenQASM', meta: 'tests/fixtures' },
]

const REPO = [
  ['URL', 'github.com/knighthacks/qaoa-packing'],
  ['Branch', 'main'],
  ['Commit', 'a41c9e2'],
  ['Scanned', '214 files · 2.8 s'],
]

const LOG = [
  ['Clone', '1.2 s · depth 1'],
  ['Search', '0.9 s · 214 files'],
  ['Parse', '0.6 s · 4 circuits, 1 rejected'],
  ['Draft the manifest', '0.1 s · qscore.yaml'],
]

const SKIPPED = [
  ['.venv/', 'environment'],
  ['.github/workflows/', '1 workflow · no circuits'],
  ['notebooks/*.ipynb', '3 files · not read in v1'],
  ['data/', '41 files · no circuits'],
]

type S02State = 'none' | 'scanning' | 'no-circuit' | 'no-qiskit' | 'private-repo' | 'focus' | 'offline'

const FILES_META: Partial<Record<S02State, string>> = {
  scanning: '96 of 214 files',
  'no-circuit': '0 circuits · 1 builder · 214 files',
  'no-qiskit': '0 circuits · 214 files',
  'private-repo': 'not scanned',
}

/* What the rest of the screen says while a state holds, so no tile contradicts the state cell. */
const BLOCKED: Partial<Record<S02State, { line: string; manifest: string; manifestMeta: string }>> = {
  scanning: {
    line: 'Scanning on this machine · nothing is run',
    manifest: 'The manifest is drafted when the scan finishes.',
    manifestMeta: 'waiting for the scan',
  },
  'no-circuit': {
    line: 'Scanned on this machine · no circuit to use yet',
    manifest: 'Nothing to draft yet: export the builder or upload a .qasm file first.',
    manifestMeta: 'nothing to write',
  },
  'no-qiskit': {
    line: 'Scanned on this machine · no Qiskit circuit found',
    manifest: 'Nothing to draft: Gatesmith only reads Qiskit circuits for now.',
    manifestMeta: 'nothing to write',
  },
  'private-repo': {
    line: 'Not scanned · the repo is private',
    manifest: 'Nothing to draft: the repo was not cloned.',
    manifestMeta: 'nothing to write',
  },
}

type CheckRow = { kind: 'ok' | 'warn' | 'bad' | 'pending'; text: string; meta: string }

const CHECK_ROWS: Partial<Record<S02State, CheckRow[]>> = {
  scanning: [
    { kind: 'ok', text: 'Qiskit 1.3 found in pyproject.toml', meta: 'qiskit==1.3.2' },
    { kind: 'pending', text: 'Aer simulator', meta: 'checking' },
    { kind: 'pending', text: 'Builder signatures', meta: 'after parse' },
    { kind: 'pending', text: 'Hardware credentials', meta: 'after parse' },
  ],
  'no-circuit': [
    { kind: 'ok', text: 'Qiskit 1.3 found in pyproject.toml', meta: 'qiskit==1.3.2' },
    { kind: 'ok', text: 'build_qaoa returns a QuantumCircuit', meta: 'signature only' },
    { kind: 'ok', text: 'No hardware credentials in the repo', meta: 'nothing is sent' },
    { kind: 'warn', text: 'No OpenQASM file in the repo', meta: '214 files read' },
  ],
  'no-qiskit': [
    { kind: 'bad', text: 'No qiskit package in pyproject.toml or requirements.txt', meta: 'Q210' },
    { kind: 'pending', text: 'Aer simulator', meta: 'not checked' },
    { kind: 'pending', text: 'Builder signatures', meta: 'not checked' },
    { kind: 'ok', text: 'No hardware credentials in the repo', meta: 'nothing is sent' },
  ],
  'private-repo': [
    { kind: 'pending', text: 'Qiskit version', meta: 'not cloned' },
    { kind: 'pending', text: 'Aer simulator', meta: 'not cloned' },
    { kind: 'pending', text: 'Builder signatures', meta: 'not cloned' },
    { kind: 'pending', text: 'Hardware credentials', meta: 'not cloned' },
  ],
}

const LOG_ROWS: Partial<Record<S02State, { kind: 'ok' | 'running' | 'pending' | 'bad'; label: string; meta: string }[]>> = {
  scanning: [
    { kind: 'ok', label: 'Clone', meta: '1.2 s · depth 1' },
    { kind: 'running', label: 'Search', meta: '96 of 214 files' },
    { kind: 'pending', label: 'Parse', meta: 'next' },
    { kind: 'pending', label: 'Draft the manifest', meta: 'last' },
  ],
  'private-repo': [
    { kind: 'bad', label: 'Clone', meta: 'HTTP 404 · Q205' },
    { kind: 'pending', label: 'Search', meta: 'not run' },
    { kind: 'pending', label: 'Parse', meta: 'not run' },
    { kind: 'pending', label: 'Draft the manifest', meta: 'not run' },
  ],
  'no-qiskit': [
    { kind: 'ok', label: 'Clone', meta: '1.2 s · depth 1' },
    { kind: 'ok', label: 'Search', meta: '0.9 s · 214 files' },
    { kind: 'ok', label: 'Parse', meta: '0.4 s · 0 circuits' },
    { kind: 'pending', label: 'Draft the manifest', meta: 'nothing to draft' },
  ],
  'no-circuit': [
    { kind: 'ok', label: 'Clone', meta: '1.2 s · depth 1' },
    { kind: 'ok', label: 'Search', meta: '0.9 s · 214 files' },
    { kind: 'ok', label: 'Parse', meta: '0.5 s · 0 circuits, 1 builder' },
    { kind: 'pending', label: 'Draft the manifest', meta: 'nothing to draft' },
  ],
}

const icons = {
  repo: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="5" cy="4" r="1.6" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
      <circle cx="5" cy="14" r="1.6" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
      <circle cx="13" cy="5.5" r="1.6" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
      <path d="M5 5.6v6.8M13 7.1c0 3-4.2 2.6-7.4 5.4" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  log: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M3 4.5h12M3 9h12M3 13.5h7" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  skip: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
      <path d="M4.8 13.2l8.4-8.4" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  checkWide: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#C2DADF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warn: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  bad: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  pending: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="3.5" fill="none" stroke="#667E83" strokeWidth="1.4" />
    </svg>
  ),
  running: (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="3.5" fill="#2EA3F8" />
    </svg>
  ),
}

function Section({ icon, title, meta, children }: { icon: ReactNode; title: string; meta?: string; children: ReactNode }) {
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

export function S02RepoScan() {
  const params = useHashParams()
  const state = (params.get('state') ?? 'none') as S02State
  const [selected, setSelected] = useState(0)
  const useThese = () => navigate(ROUTES.preflight, { transition: 'forward' })
  const empty = state === 'no-circuit' || state === 'no-qiskit' || state === 'private-repo'
  const blocked = BLOCKED[state]
  const logRows = LOG_ROWS[state]
  const checkRows = CHECK_ROWS[state]

  return (
    <Shell
      context="Repo"
      rail="repo"
      tabs={
        <TabStrip
          tabs={[
            { id: 'repo', label: 'knighthacks/qaoa-packing', active: true },
            { id: 'sbox', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={
        <>
          <ModeTabs />
          <ModeBlock line={blocked?.line ?? 'Scanned on this machine · nothing was run'}>
            {state === 'scanning' ? (
              <PrimaryButton progress={0.45} name="primary-action">
                Scanning (45%)
              </PrimaryButton>
            ) : (
              <PrimaryButton
                disabled={!!blocked}
                onClick={() => {
                  actions.selectExample('sidechain_qaoa')
                  actions.continueToPreflight()
                }}
                name="primary-action"
              >
                Use these
              </PrimaryButton>
            )}
            <div className="s02-using">
              {blocked ? (
                <span>{state === 'scanning' ? 'Pick a circuit when the scan finishes' : 'Nothing selected'}</span>
              ) : (
                <>
                  <span>Using</span>
                  <span className="mono s02-using-file">sidechain_qaoa.qasm</span>
                  <span>and a new</span>
                  <span className="mono s02-using-file">qscore.yaml</span>
                </>
              )}
            </div>
          </ModeBlock>
          <Section icon={icons.repo} title="Repository">
            <div className="ik-insp-rows">
              {REPO.map(([k, v]) =>
                k === 'Scanned' && state === 'scanning'
                  ? [k, '96 of 214 files']
                  : state === 'private-repo' && (k === 'Commit' || k === 'Scanned')
                    ? [k, 'not cloned']
                    : [k, v],
              ).map(([k, v]) => (
                <div key={k} className="ik-insp-row">
                  <span className="ik-insp-row-label">{k}</span>
                  <span className="ik-insp-row-value">{v}</span>
                </div>
              ))}
            </div>
          </Section>
          <Section icon={icons.log} title="Scan log" meta={state === 'scanning' ? 'running' : state === 'private-repo' ? 'stopped' : '2.8 s'}>
            <div className="ik-insp-rows">
              {(logRows ?? LOG.map(([label, meta]) => ({ kind: 'ok' as const, label, meta }))).map((r, i) => (
                <div
                  key={r.label}
                  className={`ik-insp-row s02-log-row${r.kind === 'pending' ? ' is-pending' : ''}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {r.kind === 'ok' ? icons.check : icons[r.kind]}
                  <span className="s02-log-label">{r.label}</span>
                  <span className="mono s02-log-meta">{r.meta}</span>
                </div>
              ))}
            </div>
            <p className="s02-log-note">Private repo? Paste a read-only token on the New run screen. It stays on this machine.</p>
          </Section>
          <Section icon={icons.skip} title="Not scanned" meta=".gitignore + defaults">
            <div className="ik-insp-rows">
              {SKIPPED.map(([k, v]) => (
                <div key={k} className="ik-insp-row">
                  <span className="mono s02-skip-path">{k}</span>
                  <span className="mono s02-log-meta">{v}</span>
                </div>
              ))}
            </div>
          </Section>
        </>
      }
    >
      <Content className="s02-content">
        <Tile
          className="s02-files"
          tabs={[{ id: 'files', label: 'Files found', active: true }]}
          meta={<span className="ik-meta-mono">{FILES_META[state] ?? '4 circuits · 214 files'}</span>}
        >
          <S02States state={state} />
          {state !== 'no-circuit' && state !== 'no-qiskit' && state !== 'private-repo' && (
            <div className="s02-table" role="radiogroup" aria-label="Circuits found">
              <div className="s02-row s02-head">
                <span className="s02-radio-slot" />
                <span className="s02-path">Path</span>
                <span className="s02-num">Size</span>
                <span className="s02-num">Qubits</span>
                <span className="s02-kind">Kind</span>
              </div>
              {FILES.map((f, i) => {
                const on = i === selected
                return (
                  <button
                    key={f.path}
                    role="radio"
                    aria-checked={on}
                    disabled={f.broken}
                    className={`s02-row s02-file${on ? ' is-selected' : ''}${f.broken ? ' is-broken' : ''}${
                      state === 'focus' && i === 1 ? ' is-focus' : ''
                    }`}
                    onClick={() => setSelected(i)}
                  >
                    <span className="s02-radio-slot">
                      <span className={`s02-radio${on ? ' is-on' : ''}`} />
                    </span>
                    <span className="mono s02-path">{f.path}</span>
                    <span className="mono s02-num s02-size">{f.size}</span>
                    <span className="mono s02-num s02-q">{f.qubits}</span>
                    <span className="s02-kind">{f.kind}</span>
                  </button>
                )
              })}
              <p className="s02-note">Discovery parses files and never runs them. Builders are read for their signature only.</p>
            </div>
          )}
          <div className="tile-header s02-preview-header">
            <div className="tile-tabs">
              <span className="tile-tab is-active">Preview</span>
            </div>
            <div className="tile-meta ik-meta-mono">{empty ? 'nothing parsed' : '12 q · 44 two-qubit gates · depth 58 · parsed, not run'}</div>
          </div>
          <div className="s02-preview">
            <div className="s02-canvas" style={{ viewTransitionName: 'circuit-canvas' }}>
              {empty ? (
                <div className="s02-empty">
                  <div className="s02-empty-title">No circuit to preview</div>
                  <div className="mono s02-empty-sub">{state === 'private-repo' ? 'the repo was not cloned' : 'no OpenQASM file in this repo'}</div>
                </div>
              ) : (
                <QaoaCircuit />
              )}
            </div>
          </div>
        </Tile>
        <div className="s02-right">
          <Tile
            className="s02-manifest"
            tabs={[{ id: 'manifest', label: 'Manifest', active: true }]}
            meta={<span className="ik-meta-mono">{blocked?.manifestMeta ?? 'will write qscore.yaml'}</span>}
            bodyClassName="s02-manifest-body"
          >
            {blocked ? (
              <div className="s02-empty s02-manifest-empty">
                <div className="s02-empty-title">No manifest yet</div>
                <div className="s02-empty-note">{blocked.manifest}</div>
              </div>
            ) : (
              <>
            <p>No qscore.yaml found. Gatesmith will write one from the circuit.</p>
            <div className="s02-code">
              <pre className="s02-gutter">{Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, ' ')).join('\n')}</pre>
              <pre className="s02-yaml">{MANIFEST}</pre>
            </div>
            <p className="s02-hint">Every line marked default can be changed on the next screen.</p>
            <div className="s02-defaults">
              <div className="s02-defaults-title">Where the defaults came from</div>
              {DEFAULTS.map(([k, v]) => (
                <div key={k} className="s02-default">
                  <span className="mono s02-default-k">{k}</span>
                  <span className="s02-default-v">{v}</span>
                </div>
              ))}
            </div>
              </>
            )}
          </Tile>
          <Tile className="s02-check" tabs={[{ id: 'check', label: 'Qiskit check', active: true }]} bodyClassName="s02-check-body">
            {checkRows ? (
              <div className="s02-check-rows s02-check-rows-state">
                {checkRows.map((c) => (
                  <div key={c.text} className={`s02-check-row is-${c.kind}`}>
                    {c.kind === 'ok' ? icons.checkWide : icons[c.kind]}
                    <span className="s02-check-text">{c.text}</span>
                    <span className="mono s02-check-meta">{c.meta}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="s02-check-first">
                  {icons.checkWide}
                  <span className="s02-check-text">Qiskit 1.3 found in pyproject.toml</span>
                  <span className="mono s02-check-meta">qiskit==1.3.2</span>
                </div>
                <div className="s02-check-rows">
                  {CHECKS.map((c) => (
                    <div key={c.text} className="s02-check-row">
                      {c.ok ? icons.checkWide : icons.warn}
                      <span className="s02-check-text">{c.text}</span>
                      <span className="mono s02-check-meta">{c.meta}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Tile>
        </div>
      </Content>
    </Shell>
  )

  function S02States({ state }: { state: S02State }) {
    if (state === 'scanning')
      return (
        <div className="s02-state s02-scanning">
          <div className="s02-progress">
            <span style={{ width: '45%' }} />
          </div>
          <div className="mono s01-stages">
            <span className="s01-stage is-done">✓ clone</span>
            <span className="s01-stage is-running">● search</span>
            <span className="s01-stage is-pending">○ parse</span>
            <span className="s01-spacer-grow" />
            <span className="s01-stage-left">about 2 s left</span>
          </div>
        </div>
      )
    if (state === 'offline')
      return (
        <div className="s02-state">
          <div className="s01-banner" role="status">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span>You are offline. The last scan is shown; Rescan waits for a connection.</span>
          </div>
          <div className="s02-offline-meta">
            <span className="mono">main · a41c9e2 · 214 files · scanned 12 min ago</span>
            <EditorButton disabled>Rescan</EditorButton>
          </div>
        </div>
      )
    if (state === 'no-circuit')
      return (
        <div className="s02-state s02-message">
          <div className="s02-message-title is-warn">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            No .qasm file detected
          </div>
          <p>
            Found 1 Qiskit builder: src/packing/qaoa.py · build_qaoa(n_residues, p). Gatesmith can export it to OpenQASM 3 with your arguments, without running
            anything else in the repo.
          </p>
          <div className="s02-actions">
            <EditorButton onClick={useThese}>Export from builder</EditorButton>
            <EditorButton onClick={() => navigate(ROUTES.newRun)}>Upload instead</EditorButton>
          </div>
        </div>
      )
    if (state === 'no-qiskit')
      return (
        <div className="s02-state s02-message">
          <div className="s02-message-title is-bad">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            No Qiskit detected
            <span className="mono s02-code-ref">Q210</span>
          </div>
          <p>pyproject.toml and requirements.txt list no qiskit package. Gatesmith supports Qiskit only for now. Upload the circuit as OpenQASM to continue.</p>
        </div>
      )
    if (state === 'private-repo')
      return (
        <div className="s02-state s02-message">
          <div className="s02-message-title is-warn">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <rect x="3" y="6.5" width="8" height="5.5" rx="1" fill="none" stroke="#FF986E" strokeWidth="1.4" />
              <path d="M5 6.5V5a2 2 0 014 0v1.5" fill="none" stroke="#FF986E" strokeWidth="1.4" />
            </svg>
            Repository is private
            <span className="mono s02-code-ref">HTTP 404 · Q205</span>
          </div>
          <p>Paste a read-only token, or clone it yourself and use laptop mode. The token stays on this machine.</p>
          <div className="s01-url">
            <input className="s01-url-input" placeholder="ghp_ read-only token" aria-label="Read-only token" />
            <EditorButton style={{ height: 26, paddingBlock: 0 }}>Retry</EditorButton>
          </div>
        </div>
      )
    return null
  }
}
