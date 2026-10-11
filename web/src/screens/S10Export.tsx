/*
 * S-10 · Export. The three files of run 7f3a·0412 with their hashes and a preview, the Qiskit conversion, and the
 * GitHub Action for qlab/sidechain-packing. The one mint downloads final.qasm; the upload to the account is an
 * opt-in checkbox above the saved line (fix-round-2 D33). States from the S-10 states board at ?state=:
 * ready (default), downloaded, converting, converted, added, no-repo, error, loading, offline, empty, focus.
 */
import { useEffect, useRef, useState } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { EditorButton, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { Banner, CodeBlock, FactRow, InsetButton, MarkIcon, MarkWord, Shim, Spinner, StageLine } from './report/bits'
import { copyText, downloadText, useFlash } from './report/helpers'
import { Icons } from './report/icons'
import {
  ACTION_FACTS,
  ACTION_LINES,
  EXPORT_FILES,
  HANDLE,
  JOB,
  PR,
  QASM_PREVIEW,
  QISKIT_PREVIEW,
  REPO,
  RUN_SECTION,
  type CodeLine,
  type ExportFile,
} from './report/data'
import { FINAL_QASM, MANIFEST_PREVIEW, MANIFEST_YAML, QISKIT_CODE, REPORT_PREVIEW, reportJson } from './report/files'
import './report/report.css'
import './report/export.css'

type S10State = 'ready' | 'downloaded' | 'converting' | 'converted' | 'added' | 'no-repo' | 'error' | 'loading' | 'offline' | 'empty' | 'focus'
const STATES: S10State[] = ['ready', 'downloaded', 'converting', 'converted', 'added', 'no-repo', 'error', 'loading', 'offline', 'empty', 'focus']

type Convert = 'idle' | 'converting' | 'converted'
type ActionStep = 'idle' | 'adding' | 'added'

export function S10Export() {
  const params = useHashParams()
  const raw = params.get('state') as S10State | null
  const state: S10State = raw && STATES.includes(raw) ? raw : 'ready'
  // Keyed by state: a forced ?state= starts from a clean interaction state, so it always shows its board cell.
  return <ExportView key={state} state={state} />
}

function ExportView({ state }: { state: S10State }) {
  const [upload, setUpload] = useState(true)
  const [mintDone, flashMint] = useFlash(1200)
  const [saved, setSaved] = useState<string | null>(state === 'downloaded' ? 'final.qasm' : null)
  // Q602: cleared by Retry on the row or by choosing another folder in the banner
  const [written, setWritten] = useState(state !== 'error')

  const disabled = state === 'loading' || state === 'empty'
  const download = () => {
    downloadText('final.qasm', FINAL_QASM)
    flashMint('Downloaded ✓')
    setSaved('final.qasm')
  }

  return (
    <div className="rp-screen">
      <Shell
        context="Report"
        rail="runs"
        tabs={
          <TabStrip
            tabs={[
              { id: 'file', label: 'sidechain_qaoa.qasm' },
              { id: 'report', label: 'Report', onClick: () => navigate(ROUTES.report, { transition: 'back' }) },
              { id: 'export', label: 'Export', active: true },
            ]}
          />
        }
        inspector={
          <>
            <ModeTabs />
            <ModeBlock style={{ paddingTop: 18, paddingBottom: 14 }} line={state === 'empty' ? 'Runs on this machine · no finished run' : `Runs on this machine · job ${JOB} · 3 files ready`}>
              <PrimaryButton
                name="primary-action"
                disabled={disabled}
                onClick={download}
                style={state === 'focus' ? { outline: '2px solid var(--color-signal-select)', outlineOffset: 2 } : undefined}
              >
                {mintDone ?? 'Download final .qasm'}
              </PrimaryButton>
              <label className="ex-check">
                <input type="checkbox" checked={upload} onChange={(e) => setUpload(e.target.checked)} disabled={disabled} />
                <span className="ex-check-box" aria-hidden>
                  {upload && (
                    <svg width="10" height="10" viewBox="0 0 12 12">
                      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span>Upload final.qasm to my account</span>
              </label>
              <SavedLine upload={upload} state={state} />
              <PoweredBy />
            </ModeBlock>
            <Section icon={Icons.list} title="Run" meta={`${JOB} · 321 → 270 gates`} bodyStyle={{ gap: 0 }}>
              {RUN_SECTION.map(([k, v]) => (
                <FactRow key={k} label={k} value={v} labelWidth={136} />
              ))}
              <div className="ex-pr">
                <span className="ex-pr-label">pull request</span>
                <span className="ex-pr-title">
                  <span className="mono">{PR.split(' ')[0]}</span> {PR.slice(PR.indexOf(' ') + 1)}
                </span>
              </div>
            </Section>
            <Section icon={Icons.facts} title="Manifest" meta="8 seeds · qscore-2026.1 · p-2026.1" open={false} bodyStyle={{ gap: 0 }}>
              <FactRow label="file" value="qscore.yaml · sha256 7c2b…" labelWidth={96} />
              <FactRow label="seeds" value="11 23 37 41 53 67 79 97" labelWidth={96} />
              <FactRow label="score" value="qscore-2026.1" labelWidth={96} />
              <FactRow label="prompt" value="p-2026.1" labelWidth={96} />
              <FactRow label="auto" value="false" labelWidth={96} />
            </Section>
            <Section icon={Icons.target} title="Target" meta="FakeTorino · 133 q · cz rz sx x" open={false} bodyStyle={{ gap: 0 }}>
              <FactRow label="backend" value="FakeTorino · 133 q" labelWidth={96} />
              <FactRow label="basis" value="cz rz sx x" labelWidth={96} />
              <FactRow label="calibration" value="snapshot Oct 9" labelWidth={96} />
            </Section>
          </>
        }
      >
        <Content className="rp-content">
          {state === 'offline' && (
            <Banner kind="offline">You are offline · files still download from this machine · Add to repo and sync wait</Banner>
          )}
          {state === 'error' && !written && (
            <Banner kind="failed" action={<InsetButton onClick={() => setWritten(true)}>Choose folder</InsetButton>}>
              <span>Export could not be written</span>
              <span className="mono">(Q602)</span>
              <span className="rp-dot">·</span>
              <span className="mono rp-path">~/Downloads</span>
              <span className="rp-dot">·</span>
              <span>choose another folder</span>
            </Banner>
          )}
          <div className="rp-top">
            <FilesTile state={state} saved={saved} setSaved={setSaved} failed={!written} setWritten={setWritten} />
            <QiskitTile state={state} />
          </div>
          <ActionTile state={state} />
        </Content>
      </Shell>
    </div>
  )
}

function SavedLine({ upload, state }: { upload: boolean; state: S10State }) {
  if (state === 'offline')
    return (
      <div className="ex-saved">
        <MarkIcon kind="unavailable" size={12} />
        <span>not synced</span>
        <span className="mono ex-saved-handle">{HANDLE}</span>
        <span>· retries when the network is back</span>
      </div>
    )
  if (!upload || state === 'empty')
    return (
      <div className="ex-saved">
        <span>Stays on this machine · not uploaded</span>
      </div>
    )
  return (
    <div className="ex-saved">
      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
        <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Saved to</span>
      <span className="mono ex-saved-handle">{HANDLE}</span>
      <span>· a copy stays on this machine</span>
    </div>
  )
}

/* ── Files ────────────────────────────────────────────────────────────── */
const PREVIEWS: Record<string, { lines: CodeLine[]; meta: string }> = {
  'final.qasm': { lines: QASM_PREVIEW, meta: 'lines 1 to 10 of 84 · rail marks accepted lines' },
  'qscore.yaml': { lines: MANIFEST_PREVIEW, meta: 'lines 1 to 10 of 17' },
  'report.json': { lines: REPORT_PREVIEW, meta: 'lines 1 to 10 of 46' },
}

function FilesTile({
  state,
  saved,
  setSaved,
  failed,
  setWritten,
}: {
  state: S10State
  saved: string | null
  setSaved: (f: string | null) => void
  failed: boolean
  setWritten: (v: boolean) => void
}) {
  const [selected, setSelected] = useState('final.qasm')
  const [retrying, setRetrying] = useState(false)
  const [copied, flashCopied] = useFlash(1200)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const meta = state === 'loading' ? 'packing' : state === 'empty' ? '0 files' : `3 files · 42.7 KB · job ${JOB}`

  const act = (f: ExportFile) => {
    if (f.action === 'Copy hash') {
      void copyText('1f0e9a4c7b2d55e0c3a8f61b94d07e2a')
      flashCopied('Copied ✓')
      return
    }
    if (f.name === 'qscore.yaml') downloadText('qscore.yaml', MANIFEST_YAML)
    else downloadText('report.json', reportJson(), 'application/json')
    setSaved(f.name)
  }
  const retry = () => {
    setRetrying(true)
    timer.current = window.setTimeout(() => {
      setRetrying(false)
      setWritten(true)
      setSaved('final.qasm')
    }, 900)
  }

  return (
    <Tile tabs={[{ id: 'files', label: 'Files', active: true }]} meta={<span className="mono">{meta}</span>} bodyClassName="ex-files-body">
      {state === 'empty' ? (
        <div className="rp-empty">
          <div className="rp-empty-title">
            {Icons.emptyFile}
            <span>Nothing to export yet</span>
          </div>
          <p className="rp-empty-text">Files appear here when the run finishes.</p>
          <div className="rp-empty-action">
            <button className="btn-editor" onClick={() => navigate(ROUTES.workspace)}>
              Open workbench
            </button>
          </div>
        </div>
      ) : state === 'loading' ? (
        <>
          <div className="ex-stage">
            <StageLine stage="Packing the export" detail="hashing 3 files" estimate="about 2 s" />
          </div>
          <div className="ex-files" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="ex-file is-loading">
                <Shim w={16} h={16} />
                <span className="ex-file-name">
                  <Shim w={88} h={10} />
                  <Shim w={140} h={8} />
                </span>
                <span className="rp-grow" />
                <Shim w={44} h={10} />
                <Shim w={90} h={10} />
                <Shim w={64} h={24} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="ex-files" role="listbox" aria-label="Export files">
            {EXPORT_FILES.map((f) => {
              const on = f.name === selected
              const rowFailed = failed && f.name === 'final.qasm'
              return (
                <div
                  key={f.name}
                  role="option"
                  aria-selected={on}
                  tabIndex={0}
                  className={`ex-file${on ? ' is-selected' : ''}`}
                  onClick={() => setSelected(f.name)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(f.name)}
                >
                  {Icons.file(on ? '#FFFFFF' : '#C2DADF')}
                  <span className="ex-file-name">
                    <span className="mono ex-file-title">{f.name}</span>
                    <span className="ex-file-note">{f.note}</span>
                  </span>
                  <span className="mono ex-file-size">{f.size}</span>
                  {/* the done word takes the hash column for a moment, so the row keeps its width */}
                  {rowFailed ? (
                    <span className="ex-file-hash">
                      <MarkWord kind="failed" className="ex-file-flag" />
                    </span>
                  ) : saved === f.name ? (
                    <span className="ex-file-hash">
                      <MarkWord kind="done" word="Saved" size={12} className="ex-file-flag is-saved" />
                    </span>
                  ) : (
                    <span className="mono ex-file-hash">{f.hash}</span>
                  )}
                  <span className="rp-grow" />
                  <span onClick={(e) => e.stopPropagation()} className="ex-file-action">
                    {rowFailed ? (
                      <button className="btn-editor ex-retry" onClick={retry} disabled={retrying}>
                        <span className="ex-retry-slot">{retrying && <Spinner />}</span>
                        {retrying ? 'Retrying' : 'Retry'}
                      </button>
                    ) : (
                      <EditorButton onClick={() => act(f)}>{f.action === 'Copy hash' && copied ? copied : f.action}</EditorButton>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="ex-preview">
            <div className="ex-preview-head">
              <span className="rp-label">preview · {selected}</span>
              <span className="mono ex-preview-meta">{PREVIEWS[selected].meta}</span>
            </div>
            <CodeBlock lines={PREVIEWS[selected].lines} />
          </div>
        </>
      )}
    </Tile>
  )
}

/* ── Qiskit code ──────────────────────────────────────────────────────── */
function QiskitTile({ state }: { state: S10State }) {
  const initial: Convert = state === 'converting' ? 'converting' : state === 'converted' ? 'converted' : 'idle'
  const [convert, setConvert] = useState<Convert>(initial)
  const [lines, setLines] = useState(state === 'converting' ? 21 : 31)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const start = () => {
    setConvert('converting')
    setLines(0)
    // 31 lines in about 1 s; the count swaps in place (no digit ticking)
    const steps = [8, 16, 24, 31]
    steps.forEach((n, i) => timers.current.push(window.setTimeout(() => setLines(n), 250 * (i + 1))))
    timers.current.push(window.setTimeout(() => setConvert('converted'), 1150))
  }

  const empty = state === 'empty'
  const loading = state === 'loading'
  const shown = convert === 'converting' ? Math.min(4, Math.round((lines / 31) * 7)) : 16

  return (
    <Tile tabs={[{ id: 'q', label: 'Qiskit code', active: true }]} meta={<span className="mono">Python · qiskit 1.3.1</span>} bodyClassName="ex-qiskit-body">
      {empty ? (
        <div className="rp-tile-empty">
          <span className="rp-tile-empty-title">No final.qasm to convert yet</span>
          <span className="rp-tile-empty-text">Qiskit code appears once the run finishes.</span>
        </div>
      ) : (
        <>
          <div className="ex-convert">
            {convert === 'converted' ? (
              // once converted, the button's next verb is the download (the tile is too narrow for both)
              <EditorButton onClick={() => downloadText('final.py', QISKIT_CODE, 'text/x-python')}>Download final.py</EditorButton>
            ) : (
              <EditorButton onClick={() => convert !== 'converting' && start()} disabled={loading}>
                Convert to Qiskit code
              </EditorButton>
            )}
            {convert === 'converting' ? (
              <>
                <span className="ex-convert-stage">
                  <Spinner />
                  <span className="rp-stage-word">Converting · {lines} of 31 lines</span>
                </span>
                <span className="mono ex-convert-estimate">about 1 s</span>
              </>
            ) : convert === 'converted' ? (
              <>
                <MarkWord kind="done" word="Saved" size={12} className="ex-file-flag is-saved" />
                <span className="mono ex-convert-meta">final.py · 1.2 KB · 31 lines</span>
              </>
            ) : (
              <span className="mono ex-convert-meta">final.qasm → final.py · 31 lines</span>
            )}
          </div>
          {loading ? (
            <CodeBlock lines={[]} pending={12} />
          ) : (
            <CodeBlock lines={QISKIT_PREVIEW.slice(0, shown)} pending={convert === 'converting' ? 3 : 0} />
          )}
        </>
      )}
    </Tile>
  )
}

/* ── GitHub Action ────────────────────────────────────────────────────── */
function ActionTile({ state }: { state: S10State }) {
  const initial: ActionStep = state === 'added' ? 'added' : 'idle'
  const [step, setStep] = useState<ActionStep>(initial)
  const [url, setUrl] = useState('')
  const [hasRepo, setHasRepo] = useState(state !== 'no-repo')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const offline = state === 'offline'
  const add = () => {
    setStep('adding')
    timer.current = window.setTimeout(() => setStep('added'), 1200)
  }
  const meta = !hasRepo
    ? 'needs a repo URL'
    : step === 'added'
      ? '.github/workflows/gatesmith.yml · added'
      : '.github/workflows/gatesmith.yml · 13 lines · not added'

  return (
    <Tile className="ex-action" tabs={[{ id: 'a', label: 'GitHub Action', active: true }]} meta={<span className="mono">{meta}</span>} bodyClassName="ex-action-body">
      <div className={`ex-card${hasRepo ? '' : ' is-no-repo'}`}>
        <div className="ex-card-main">
          <div className="ex-card-title">
            {Icons.branch}
            <span>{hasRepo ? `Add the GitHub Action to ${REPO}` : 'Add the GitHub Action to a repo'}</span>
          </div>
          <p className="ex-card-desc">Scores every pull request and comments the delta</p>
          {!hasRepo ? (
            <>
              <Banner kind="info">This run came from an uploaded file, so it has no repo. Paste a GitHub repo URL to continue.</Banner>
              <form
                className="ex-repo"
                onSubmit={(e) => {
                  e.preventDefault()
                  setHasRepo(true)
                }}
              >
                <input
                  className="ex-repo-input mono"
                  placeholder="https://github.com/owner/repo"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-label="GitHub repository URL"
                  spellCheck={false}
                />
                <button type="submit" className="btn-editor">
                  Use this repo
                </button>
              </form>
            </>
          ) : (
            <>
              <div className={`ex-facts${step === 'added' ? ' is-added' : ''}`}>
                {(step === 'added'
                  ? ([
                      ['repo', REPO],
                      ['pull request', 'gatesmith/add-action · open'],
                      ['first check', 'runs on the next pull request'],
                    ] as [string, string][])
                  : ACTION_FACTS
                ).map(([k, v]) => (
                  <div key={k} className="ex-fact">
                    <span className="ex-fact-label">{k}</span>
                    <span className="mono ex-fact-value">{v}</span>
                  </div>
                ))}
              </div>
              <span className="rp-grow" />
              <div className="ex-card-foot">
                {step === 'added' ? (
                  <>
                    <EditorButton onClick={() => navigate(ROUTES.prComment)}>View pull request</EditorButton>
                    <MarkWord kind="done" word="added" size={12} className="ex-file-flag is-saved" />
                    <span className="mono ex-card-hint">.github/workflows/gatesmith.yml</span>
                  </>
                ) : (
                  <>
                    <button className="btn-editor ex-add" onClick={add} disabled={step === 'adding' || offline}>
                      Add to repo
                    </button>
                    {step === 'adding' ? (
                      <span className="ex-convert-stage">
                        <Spinner />
                        <span className="rp-stage-word">Opening a pull request on {REPO}</span>
                      </span>
                    ) : (
                      <span className="mono ex-card-hint">{offline ? 'waits for the network' : 'opens a pull request'}</span>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
        {hasRepo && (
          <div className="ex-card-code">
            <CodeBlock lines={ACTION_LINES} />
          </div>
        )}
      </div>
    </Tile>
  )
}
