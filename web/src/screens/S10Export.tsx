/*
 * S-10 · Export (D2). Files, the code preview and the GitHub Action, with real downloads.
 * Micro-interactions (M6): Download swaps to a check and Saved, Convert shows its progress in the
 * label, Copy YAML confirms with Copied, Back to report folds back the way it came.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions } from '../data/run'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeTabs, PrimaryButton, SecondaryPair, Tile } from '../ui/parts'
import { Collapsible, copyText, downloadText, useFlash } from './report/bits'
import { ACTION_YAML, FINAL_QASM, MANIFEST_YAML, QISKIT_CODE, reportJson } from './report/files'
import './report/report.css'
import './report/export.css'

type ExportState =
  | 'ready'
  | 'downloaded'
  | 'converting'
  | 'added'
  | 'no-repo'
  | 'loading'
  | 'empty'
  | 'error'
  | 'offline'
  | 'focus'

type FileId = 'qasm' | 'yaml' | 'json'
const FILES: { id: FileId; name: string; note: string; size: string; sha: string; text: () => string; type: string }[] = [
  {
    id: 'qasm',
    name: 'sidechain_qaoa.final.qasm',
    note: 'OpenQASM 2.0 · 12 q · 33 two-qubit gates',
    size: '2.6 KB',
    sha: '8b2d…11fe',
    text: () => FINAL_QASM,
    type: 'text/plain',
  },
  {
    id: 'yaml',
    name: 'qscore.yaml',
    note: 'manifest of the improved circuit · rebuilds your code',
    size: '0.9 KB',
    sha: '3f9a…1c07',
    text: () => MANIFEST_YAML,
    type: 'text/yaml',
  },
  {
    id: 'json',
    name: 'report.json',
    note: 'scorecards, every attempt and decision, run facts',
    size: '38.3 KB',
    sha: 'e07a…5c92',
    text: reportJson,
    type: 'application/json',
  },
]

const CHECK = (color = '#5FEEA3', size = 12) => (
  <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
    <path d="M2.5 6.5l2.3 2.3L9.5 3.8" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function S10Export() {
  const params = useHashParams()
  const forced = (params.get('state') ?? 'ready') as ExportState

  // Live interaction state, seeded from ?state= so each states-board cell can be opened directly.
  const [saved, setSaved] = useState<Partial<Record<FileId, 'saved' | 'done'>>>(() => (forced === 'downloaded' ? { qasm: 'saved' } : {}))
  const anySaved = Object.keys(saved).length > 0
  const [codeTab, setCodeTab] = useState<'qiskit' | 'qasm'>(forced === 'converting' ? 'qasm' : 'qiskit')
  const [convert, setConvert] = useState<number | null>(forced === 'converting' ? 0.68 : null)
  const [converted, setConverted] = useState(false)
  const [action, setAction] = useState<'idle' | 'adding' | 'added' | 'error'>(
    forced === 'added' ? 'added' : forced === 'error' ? 'error' : 'idle',
  )
  const [packing, setPacking] = useState<number | null>(forced === 'loading' ? 0.67 : null)
  const [yamlCopied, flashYaml] = useFlash()
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))

  const offline = forced === 'offline'
  const empty = forced === 'empty'
  const noRepo = forced === 'no-repo'

  const download = (id: FileId) => {
    const f = FILES.find((x) => x.id === id)!
    downloadText(f.name, f.text(), f.type)
    setSaved((s) => ({ ...s, [id]: 'saved' }))
    later(3000, () => setSaved((s) => ({ ...s, [id]: 'done' })))
  }

  const downloadAll = () => {
    setPacking(0.12)
    ;[0.34, 0.67, 1].forEach((p, i) => later(300 * (i + 1), () => setPacking(p)))
    later(1100, () => {
      setPacking(null)
      FILES.forEach((f, i) => later(i * 120, () => download(f.id)))
    })
  }

  const runConvert = () => {
    if (converted) {
      downloadText('build_qaoa_final.py', QISKIT_CODE, 'text/x-python')
      return
    }
    setCodeTab('qasm')
    setConvert(0.05)
    ;[0.24, 0.47, 0.68, 0.9, 1].forEach((p, i) => later(320 * (i + 1), () => setConvert(p)))
    later(1900, () => {
      setConvert(null)
      setConverted(true)
      setCodeTab('qiskit')
    })
  }

  const addAction = () => {
    setAction('adding')
    later(900, () => setAction('added'))
  }

  const visibleFiles = empty ? FILES.filter((f) => f.id === 'json') : FILES

  return (
    <Shell
      context="Report"
      rail="runs"
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: true },
            { id: 'b', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={
        <ExportInspector
          state={forced}
          packing={packing}
          onDownloadFinal={() => download('qasm')}
          onDownloadAll={downloadAll}
          finalSaved={saved.qasm}
        />
      }
    >
      <Content className="ex-content">
        <div className="ex-left">
          <Tile
            className="ex-files"
            tabs={[{ id: 'f', label: 'Files', active: true }]}
            meta={<span className="mono">{empty ? '1 file · 38.3 KB' : '3 files · 41.8 KB'}</span>}
          >
            <div className="ex-table" role="table">
              <div className="ex-tr ex-th" role="row">
                <span className="ex-c-icon" />
                <span className="ex-c-name">File</span>
                <span className="ex-c-size">Size</span>
                <span className="ex-c-sha">sha256</span>
                <span className="ex-c-action" />
              </div>
              {visibleFiles.map((f, i) => {
                const st = saved[f.id]
                return (
                  <div key={f.id} className={`ex-tr ex-file${i === visibleFiles.length - 1 ? ' is-last' : ''}`} role="row">
                    <span className="ex-c-icon">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                        <path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="#C2DADF" strokeWidth="1.2" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="ex-c-name ex-file-name">
                      <span className="mono">{f.name}</span>
                      <span className="ex-file-note">
                        {st ? (st === 'saved' ? 'to ~/Downloads' : 'downloaded to ~/Downloads') : anySaved ? 'not downloaded yet' : f.note}
                      </span>
                    </span>
                    <span className="ex-c-size mono">{f.size}</span>
                    <span className="ex-c-sha mono">{f.sha}</span>
                    <span className="ex-c-action">
                      {st === 'saved' ? (
                        <span className="ex-saved">{CHECK()}Saved</span>
                      ) : st === 'done' ? (
                        <button className="ex-done" onClick={() => download(f.id)}>
                          {CHECK('#C2DADF')}
                          Downloaded
                        </button>
                      ) : (
                        <EditorButton onClick={() => download(f.id)}>Download</EditorButton>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </Tile>

          <Tile
            className="ex-code"
            tabs={[
              { id: 'qiskit', label: 'Qiskit code', active: codeTab === 'qiskit', onClick: () => setCodeTab('qiskit') },
              { id: 'qasm', label: 'OpenQASM', active: codeTab === 'qasm', onClick: () => setCodeTab('qasm') },
            ]}
            meta={<span className="mono">{codeTab === 'qiskit' ? 'preview · build_qaoa_final.py' : 'sidechain_qaoa.final.qasm'}</span>}
          >
            <div className="ex-code-bar">
              {convert != null ? (
                <span className="ex-converting">
                  <span>Writing Qiskit code · line {Math.max(1, Math.round(convert * 22))} of 22</span>
                  <span className="mono ex-left-time">about {Math.max(1, Math.round((1 - convert) * 6))} s left</span>
                </span>
              ) : (
                <span className="ex-code-lead">
                  {codeTab === 'qiskit'
                    ? 'A Qiskit builder you can drop back into src/packing/qaoa.py.'
                    : 'The OpenQASM file that goes to the QPU. The preview keeps it until the code is ready.'}
                </span>
              )}
              <EditorButton onClick={runConvert} disabled={convert != null}>
                {convert != null ? `Converting (${Math.round(convert * 100)}%)` : converted ? 'Download .py' : 'Convert to Qiskit code'}
              </EditorButton>
            </div>
            <CodeBlock text={codeTab === 'qiskit' ? QISKIT_CODE : FINAL_QASM.trimEnd()} />
          </Tile>
        </div>

        <ActionTile
          state={action}
          noRepo={noRepo}
          offline={offline}
          onAdd={addAction}
          onCopy={() => {
            void copyText(ACTION_YAML)
            flashYaml('Copied')
          }}
          copied={yamlCopied}
        />
      </Content>
    </Shell>
  )
}

function CodeBlock({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="ex-code-block">
      <div className="ex-gutter mono" aria-hidden>
        {lines.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre className="ex-code-text mono">{text}</pre>
    </div>
  )
}

function ActionTile({
  state,
  noRepo,
  offline,
  onAdd,
  onCopy,
  copied,
}: {
  state: 'idle' | 'adding' | 'added' | 'error'
  noRepo: boolean
  offline: boolean
  onAdd: () => void
  onCopy: () => void
  copied: string | null
}) {
  let actions: ReactNode
  if (state === 'added') {
    actions = (
      <div className="ex-added">
        <span className="ex-added-title">{CHECK('#5FEEA3', 14)}GitHub Action added</span>
        <p className="ex-muted">
          Pull request #18 adds .github/workflows/qscore.yml. The first check runs on the next pull request after it merges.
        </p>
        <div className="ex-buttons">
          <EditorButton onClick={() => navigate(ROUTES.prComment, { transition: 'forward' })}>Open pull request #18</EditorButton>
          <EditorButton onClick={onCopy}>{copied ?? 'Copy YAML'}</EditorButton>
        </div>
      </div>
    )
  } else if (state === 'error') {
    actions = (
      <div className="ex-added">
        <span className="ex-error-word">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 2v6M7 11v.5" fill="none" stroke="#FF3478" strokeWidth="2" strokeLinecap="round" />
          </svg>
          failed
          <span className="mono ex-error-code">· GitHub 403</span>
        </span>
        <span className="ex-added-title">No write access to knighthacks/qaoa-packing</span>
        <p className="ex-muted">Your files are fine. Ask a maintainer for write access, or copy the YAML and open the pull request yourself.</p>
        <div className="ex-buttons">
          <EditorButton onClick={onAdd}>Try again</EditorButton>
          <EditorButton onClick={onCopy}>{copied ?? 'Copy YAML'}</EditorButton>
        </div>
      </div>
    )
  } else {
    actions = (
      <>
        <div className="ex-bullet">
          <span className="ex-dot" />
          Opens a pull request that adds 1 file, 14 lines
        </div>
        <div className="ex-bullet">
          <span className="ex-dot" />
          Runs on GitHub-hosted CPU, no QPU time
        </div>
        <div className="ex-buttons" style={{ paddingTop: 4 }}>
          <EditorButton onClick={onAdd} disabled={offline || noRepo || state === 'adding'}>
            {state === 'adding' ? 'Opening pull request…' : 'Add the GitHub Action to this repo'}
          </EditorButton>
          <EditorButton onClick={onCopy}>{copied ?? 'Copy YAML'}</EditorButton>
        </div>
      </>
    )
  }

  return (
    <Tile
      className="ex-action"
      tabs={[{ id: 'a', label: 'GitHub Action', active: true }]}
      meta={<span className="mono">.github/workflows/qscore.yml</span>}
    >
      <div className="ex-action-head">
        <h3 className="ex-action-title">{noRepo ? 'Connect a repo to add the Action' : 'Score every pull request that touches a circuit'}</h3>
        <p className="ex-action-lead">
          {noRepo
            ? 'This circuit was uploaded, so there is no repo to add it to. Paste the repo URL, or copy the YAML into .github/workflows yourself.'
            : 'Comments the score change on the pull request and fails the check when a high finding appears.'}
        </p>
        {noRepo ? (
          <div className="ex-repo-input">
            <span className="mono">https://github.com/owner/repo</span>
          </div>
        ) : (
          <div className="ex-repo">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM5 7v6M11 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM11 9V7.5c0-1.5-1-2.5-2.5-2.5H7"
                fill="none"
                stroke="#C2DADF"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span className="mono ex-repo-name">knighthacks/qaoa-packing</span>
            <span className="mono ex-repo-branch">main</span>
          </div>
        )}
      </div>
      <pre className="ex-yaml mono">{ACTION_YAML}</pre>
      <div className="ex-action-list">
        {noRepo ? (
          <div className="ex-buttons">
            <EditorButton>Connect repo</EditorButton>
            <EditorButton onClick={onCopy}>{copied ?? 'Copy YAML'}</EditorButton>
          </div>
        ) : (
          actions
        )}
      </div>
      <button className="ex-preview" onClick={() => navigate(ROUTES.prComment, { transition: 'forward' })}>
        <span className="ex-preview-label">The comment it leaves on each pull request</span>
        <span className="ex-preview-status">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="var(--color-action-primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="ex-preview-passed">passed</span>
          <span className="ex-muted">· no high findings</span>
        </span>
        <span className="ex-preview-row">
          <span className="ex-muted">two_qubit_count</span>
          <span className="mono">44 → 33 gates · −25%</span>
        </span>
        <span className="ex-preview-row">
          <span className="ex-muted">est. cost per run</span>
          <span className="mono">$6.72 → $5.32</span>
        </span>
      </button>
      <div className="ex-severity">
        <span className="ex-severity-label">What each severity does with fail-on: high</span>
        <div className="ex-sev-row">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 2v6M7 11v.5" fill="none" stroke="#FF3478" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="ex-sev-word" style={{ color: '#FF3478' }}>
            high
          </span>
          <span className="ex-muted">fails the check and blocks the merge</span>
        </div>
        <div className="ex-sev-row">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span className="ex-sev-word" style={{ color: '#FF986E' }}>
            warning
          </span>
          <span className="ex-muted">listed in the comment, check passes</span>
        </div>
        <div className="ex-sev-row">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <circle cx="6" cy="6" r="3.5" fill="none" stroke="#2EA3F8" strokeWidth="1.5" />
          </svg>
          <span className="ex-sev-word" style={{ color: '#2EA3F8' }}>
            info
          </span>
          <span className="ex-muted">kept in report.json only</span>
        </div>
      </div>
    </Tile>
  )
}

function ExportInspector({
  state,
  packing,
  onDownloadFinal,
  onDownloadAll,
  finalSaved,
}: {
  state: ExportState
  packing: number | null
  onDownloadFinal: () => void
  onDownloadAll: () => void
  finalSaved?: 'saved' | 'done'
}) {
  const empty = state === 'empty'
  const offline = state === 'offline'
  return (
    <>
      <ModeTabs />
      <div className="rp-mode-line">Files are on this machine · nothing leaves it until you download</div>
      <div className="rp-insp-body">
        <div className="rp-export">
          {empty ? (
            <div className="rp-empty">
              <span className="rp-empty-title">Nothing changed, so there is no new circuit</span>
              <p className="rp-export-text">4 rounds, 0 accepted. You can still take report.json, which lists every attempt and why the engine rejected it.</p>
            </div>
          ) : packing != null ? (
            <div className="rp-loading-line">
              <span>Hashing report.json · {Math.min(3, Math.max(1, Math.ceil(packing * 3)))} of 3 files</span>
              <span className="mono">about 1 s left</span>
            </div>
          ) : (
            <p className="rp-export-text">
              The final circuit is ready. Operator equivalence passed, exact, with 25% fewer two-qubit gates.
            </p>
          )}
          {offline && (
            <div className="rp-offline">
              <span className="rp-offline-dot" />
              Offline. Files on this machine still download.
            </div>
          )}
          {empty ? (
            <PrimaryButton onClick={() => downloadText('report.json', reportJson(), 'application/json')}>Download report.json</PrimaryButton>
          ) : packing != null ? (
            <PrimaryButton progress={packing}>Packing files ({Math.round(packing * 100)}%)</PrimaryButton>
          ) : (
            <PrimaryButton
              name="primary-action"
              onClick={onDownloadFinal}
              style={state === 'focus' ? { outline: '2px solid var(--color-action-primary)', outlineOffset: 2 } : undefined}
            >
              {finalSaved === 'saved' ? 'Saved to ~/Downloads' : 'Download final .qasm'}
            </PrimaryButton>
          )}
          <SecondaryPair>
            {empty ? (
              <EditorButton wide onClick={() => actions.reset()}>
                Run again
              </EditorButton>
            ) : (
              <EditorButton wide onClick={onDownloadAll} disabled={packing != null}>
                Download all 3 files
              </EditorButton>
            )}
            <EditorButton wide onClick={() => navigate(ROUTES.report, { transition: 'back' })}>
              Back to report
            </EditorButton>
          </SecondaryPair>
        </div>

        <Collapsible icon={DOWNLOAD_ICON} title="In the download" meta="vs original" borderTop={false} borderBottom>
          <Row label="two_qubit_count" value={empty ? '44 → 44 gates' : '44 → 33 gates'} />
          <Row label="depth" value={empty ? '58 → 58 layers' : '58 → 51 layers'} />
          <Row label="Est. cost per run" value={empty ? '$6.72 → $6.72' : '$6.72 → $5.32'} />
        </Collapsible>

        <Collapsible icon={SHIELD_CHECK} title="Before you spend QPU time" meta="4 checks" borderTop={false} borderBottom>
          <Check text="Same task as the original" value="exact" />
          <Check text="Every constraint held" value="all" />
          <Check text="Scored on fixed seeds" value="8 seeds" />
          <Check text="Cost is an estimate, not a quote" value="$96/min" info />
        </Collapsible>

        <Collapsible icon={HASH_ICON} title="Check a download" meta="sha256" borderTop={false} borderBottom>
          <div className="ex-sha">
            <p className="rp-export-text">Run this, then compare the result with the file's sha256.</p>
            <div className="ex-sha-cmd mono">shasum -a 256 sidechain_qaoa.final.qasm</div>
          </div>
        </Collapsible>

        <Collapsible icon={CLOCK_ICON} title="Earlier runs" meta="two_qubit_count" borderTop={false}>
          <RunRow id="7f3a·0412" when="today · this run" value="44 → 33" current />
          <RunRow id="6c19·0398" when="yesterday · budget ran out" value="44 → 38" />
          <RunRow id="5a02·0371" when="Oct 8 · score only" value="44" />
        </Collapsible>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rp-fact">
      <span className="rp-fact-label" style={{ width: 140 }}>
        {label}
      </span>
      <span className="rp-fact-value mono">{value}</span>
    </div>
  )
}

function Check({ text, value, info }: { text: string; value: string; info?: boolean }) {
  return (
    <div className="ex-check">
      {info ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4" fill="none" stroke="#2EA3F8" strokeWidth="1.5" />
        </svg>
      ) : (
        CHECK()
      )}
      <span className="ex-check-text">{text}</span>
      <span className="mono ex-check-value">{value}</span>
    </div>
  )
}

function RunRow({ id, when, value, current }: { id: string; when: string; value: string; current?: boolean }) {
  return (
    <div className={`ex-run${current ? ' is-current' : ''}`}>
      <span className="ex-run-dot" />
      <span className="mono ex-run-id">{id}</span>
      <span className="ex-run-when">{when}</span>
      <span className="mono ex-run-value">{value}</span>
    </div>
  )
}

const ICON = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const DOWNLOAD_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M9 2.5v9M5.5 8L9 11.5 12.5 8M3.5 15h11" {...ICON} />
  </svg>
)
const SHIELD_CHECK = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M9 2.5l5.5 2v4.2c0 3.2-2.3 5.6-5.5 6.8-3.2-1.2-5.5-3.6-5.5-6.8V4.5zM6.6 9l1.7 1.7 3.2-3.2" {...ICON} />
  </svg>
)
const HASH_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M7 3L5.5 15M12.5 3L11 15M3.5 6.5h12M2.5 11.5h12" {...ICON} />
  </svg>
)
const CLOCK_ICON = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path d="M9 15.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM9 5.5V9l2.5 1.5" {...ICON} />
  </svg>
)
