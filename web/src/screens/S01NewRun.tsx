/*
 * S-01 · New run (Paper 157V-0, states 1OCV-0). Pick a source: drop or choose a .qasm file, fetch a
 * GitHub repo, or start from a bundled example. Continue stays disabled (opacity .3) until a source
 * is chosen. States at #/new?state=drag-over | bad-file | fetching | chosen | offline | focus.
 */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions } from '../data/run'
import { EditorButton, ModeTabs, PrimaryButton, Tile } from '../ui/parts'
import { GpuStatus, Shell, AccountMark } from '../ui/Shell'
import { InkIcons } from './intake/icons'
import { Banner, Glyph, GroupHeader, Facts, IntakeTabs, RunBlock, Shim, Spinner } from './intake/kit'
import { useOnline } from './intake/online'
import './intake/s01.css'

type S01State = 'empty' | 'drag-over' | 'bad-file' | 'fetching' | 'chosen' | 'offline' | 'focus'
type ExampleId = 'sidechain_qaoa' | 'sbox_oracle'
type Source = { kind: 'example'; id: ExampleId } | { kind: 'file'; name: string; lines: number; qubits: number | null }
type BadFile = { name: string; firstLine: string; line: number; column: number }

const CANONICAL_REPO = 'https://github.com/qlab/sidechain-packing'

const EXAMPLES: { id: ExampleId; facts: string; kind: string; desc: string; qubits: number }[] = [
  { id: 'sidechain_qaoa', facts: '88 lines · 12 q', kind: 'expectation task', desc: 'A packing problem solved with QAOA, p = 2', qubits: 12 },
  { id: 'sbox_oracle', facts: '20 q', kind: 'reversible · 100 toffoli gates', desc: 'An S-box lookup built from Toffolis', qubits: 20 },
]

const NEXT = [
  { icon: InkIcons.score, title: 'Score', meta: '10 rules · 8 seeds · qscore-2026.1' },
  { icon: InkIcons.fix, title: 'Fix', meta: 'engine + local model propose' },
  { icon: InkIcons.verify, title: 'Verify', meta: 'equivalent · re-scored · decided' },
  { icon: InkIcons.report, title: 'Report', meta: 'before and after · final .qasm' },
]

/* The fetch's stage list: clone, search, parse. Stage index = the one running. */
const STAGES = [
  { word: 'clone', done: '2.4 MB in 3.1 s · commit 4e1c2a9', running: 'cloning qlab/sidechain-packing', queued: 'shallow clone, default branch', est: 'about 3 s' },
  { word: 'search', done: '1,280 files · 7 circuits found', running: '412 of 1,280 files · .qasm and Qiskit sources', queued: '.qasm and Qiskit sources', est: 'about 2 s' },
  { word: 'parse', done: '7 circuits read', running: 'reads each circuit, counts qubits', queued: 'reads each circuit, counts qubits', est: 'about 4 s' },
]
const STAGE_LEFT = ['about 9 s left', 'about 6 s left', 'about 4 s left']

/** Read a dropped or chosen file the way the parser would: header first, then qreg widths. */
async function readQasm(file: File): Promise<{ ok: true; source: Source } | { ok: false; bad: BadFile }> {
  const text = await file.text()
  const lines = text.split(/\r?\n/)
  const first = lines.findIndex((l) => l.trim() !== '' && !l.trim().startsWith('//'))
  const header = first >= 0 ? lines[first].trim() : ''
  if (!/^OPENQASM\s+[23](\.\d)?\s*;/.test(header)) {
    return { ok: false, bad: { name: file.name, firstLine: header || '(empty file)', line: first >= 0 ? first + 1 : 1, column: 1 } }
  }
  const widths = [...text.matchAll(/qreg\s+\w+\[(\d+)\]|qubit\[(\d+)\]/g)].map((m) => Number(m[1] ?? m[2]))
  const qubits = widths.length ? widths.reduce((a, b) => a + b, 0) : null
  const count = lines.length && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
  return { ok: true, source: { kind: 'file', name: file.name, lines: count, qubits } }
}

export function S01NewRun() {
  const params = useHashParams()
  const forced = (params.get('state') ?? 'empty') as S01State
  // A forced state starts from a clean screen.
  return <NewRun key={forced} forced={forced} />
}

function NewRun({ forced }: { forced: S01State }) {
  const online = useOnline()

  const [source, setSource] = useState<Source | null>(null)
  const [bad, setBad] = useState<BadFile | null>(null)
  const [dragging, setDragging] = useState(false)
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLButtonElement>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (forced === 'focus') chooseRef.current?.focus()
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [forced])

  const offline = forced === 'offline' || !online
  const dragOver = dragging || forced === 'drag-over'
  const badFile: BadFile | null =
    bad ?? (forced === 'bad-file' ? { name: 'notes.txt', firstLine: 'Notes from the Oct 9 group meeting', line: 1, column: 1 } : null)
  const fetchStage = forced === 'fetching' ? 1 : stage
  const chosen: Source | null = forced === 'chosen' ? { kind: 'example', id: 'sidechain_qaoa' } : source
  const compactDrop = !!badFile || offline
  const repoUrl = fetchStage != null || forced === 'offline' ? url || CANONICAL_REPO : url

  const take = async (file: File | undefined) => {
    if (!file) return
    const result = await readQasm(file)
    if (result.ok) {
      setBad(null)
      setSource(result.source)
    } else {
      setSource(null)
      setBad(result.bad)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void take(e.dataTransfer.files[0])
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void take(e.target.files?.[0])
    e.target.value = ''
  }

  const pickExample = (id: ExampleId) => {
    setBad(null)
    setSource((s) => (s?.kind === 'example' && s.id === id ? null : { kind: 'example', id }))
    if (id === 'sidechain_qaoa' || id === 'sbox_oracle') actions.selectExample(id)
  }

  const fetchRepo = () => {
    if (offline || fetchStage != null) return
    if (!url) setUrl(CANONICAL_REPO)
    setStage(0)
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
    at(900, () => setStage(1))
    at(1700, () => setStage(2))
    at(2300, () => setStage(3))
    at(2500, () => navigate(ROUTES.repoScan, { transition: 'forward' }))
  }

  const proceed = () => {
    if (!chosen) return
    actions.continueToPreflight()
  }

  const chosenLabel =
    chosen?.kind === 'example'
      ? `${chosen.id}.qasm · ${EXAMPLES.find((x) => x.id === chosen.id)!.qubits} q · bundled`
      : chosen
        ? `${chosen.name} · ${chosen.lines} lines${chosen.qubits != null ? ` · ${chosen.qubits} q` : ''}`
        : ''

  return (
    <Shell
      rail="new"
      status={
        <>
          <GpuStatus online />
          <AccountMark />
        </>
      }
      tabs={<IntakeTabs label="New run" plus />}
      inspector={
        <div className="ink-scope nr-insp">
          <ModeTabs />
          <RunBlock line="Runs on this machine · CPU" />
          <div className="nr-next">
            <GroupHeader label="what happens next" note="after you confirm" className="nr-pad" />
            <div className="nr-steps">
              {NEXT.map((s) => (
                <div key={s.title} className="nr-step">
                  {s.icon}
                  <span className="nr-step-title">{s.title}</span>
                  <span className="mono nr-step-meta">{s.meta}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="nr-machine">
            <GroupHeader label="this machine" note="Laptop mode" />
            <Facts
              rows={[
                ['Processor', 'CPU · 8 cores'],
                ['Memory free', '24.0 GB'],
                ['Simulation limit', '34 qubits'],
                [
                  'GPU machine',
                  <>
                    <span className="nr-gpu-dot" />
                    online · 0 jobs waiting
                  </>,
                ],
              ]}
            />
          </div>
        </div>
      }
    >
      <div className="nr-ground ink-scope">
        <Tile
          className="nr-tile"
          tabs={[{ id: 'source', label: 'Source', active: true }]}
          meta={<span className="mono">step 1 of 3 · source</span>}
          bodyClassName="nr-body"
        >
          {offline && (
            <Banner tone="warn" word="offline" meta="retry in 10 s">
              <span className="ink-banner-grow">You are offline. Fetch waits for the connection.</span>
            </Banner>
          )}
          {badFile && (
            <>
              <Banner
                tone="bad"
                word="Not OpenQASM"
                action={
                  <EditorButton onClick={() => fileInput.current?.click()}>Choose another file</EditorButton>
                }
              >
                <span className="mono nr-banner-where">
                  (Q101) · {badFile.name} line {badFile.line}, column {badFile.column}
                </span>
                <span>·</span>
              </Banner>
              <div className="nr-code ink-fade-in" aria-label={`${badFile.name}, line ${badFile.line}`}>
                <div className="nr-code-line is-flagged">
                  <span className="mono nr-code-n">{badFile.line}</span>
                  <span className="mono nr-code-text">{badFile.firstLine}</span>
                </div>
                <div className="nr-code-line">
                  <span className="nr-code-n" />
                  <span className="mono nr-code-text is-bad">^ expected "OPENQASM 2.0;" or "OPENQASM 3;"</span>
                </div>
              </div>
            </>
          )}

          <div
            className={`nr-drop${compactDrop ? ' is-compact' : ''}${dragOver ? ' is-over' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
            }}
            onDrop={onDrop}
          >
            {dragOver ? (
              <>
                {InkIcons.upload()}
                <div className="nr-drop-title">Drop to add sidechain_qaoa.qasm</div>
                <div className="mono nr-drop-facts">1 file · 18.4 kB · OpenQASM 2.0</div>
              </>
            ) : compactDrop ? (
              <button className="nr-drop-compact" onClick={() => fileInput.current?.click()}>
                {InkIcons.upload(14, 1.8)}
                <span>{offline ? 'Drop .qasm files · bundled examples work offline' : 'Drop .qasm files or paste a GitHub URL'}</span>
              </button>
            ) : (
              <>
                {InkIcons.upload()}
                <div className="nr-drop-title">Drop .qasm files or paste a GitHub URL</div>
                <div className="nr-drop-sub">Qiskit · OpenQASM 2 or 3 · nothing runs until you confirm</div>
                <div className="nr-drop-actions">
                  <button ref={chooseRef} className={`btn-editor${forced === 'focus' ? ' is-focus' : ''}`} onClick={() => fileInput.current?.click()}>
                    Choose files
                  </button>
                </div>
              </>
            )}
            <input ref={fileInput} type="file" accept=".qasm,.txt,text/plain" hidden onChange={onPick} />
          </div>

          <div className="nr-block">
            <GroupHeader
              label="repository"
              note={fetchStage != null ? `public · ${STAGE_LEFT[Math.min(fetchStage, 2)]}` : 'public repos · private needs a token'}
            />
            <form
              className="nr-repo"
              onSubmit={(e) => {
                e.preventDefault()
                fetchRepo()
              }}
            >
              <label className="nr-url">
                {InkIcons.link}
                <input
                  className="mono"
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setUrl(e.target.value)}
                  readOnly={fetchStage != null}
                  aria-label="GitHub repository URL"
                  spellCheck={false}
                />
                {!offline && InkIcons.caret}
              </label>
              <EditorButton disabled={offline} style={{ width: 76, height: 24 }}>
                {fetchStage != null ? 'Fetching' : 'Fetch'}
              </EditorButton>
            </form>
            {fetchStage != null && <FetchProgress stage={fetchStage} />}
          </div>

          <div className="nr-block">
            <GroupHeader label="bundled examples" note="2 circuits · work offline" />
            <div className="nr-examples" role="radiogroup" aria-label="Bundled examples">
              {EXAMPLES.map((ex) => {
                const on = chosen?.kind === 'example' && chosen.id === ex.id
                return (
                  <button
                    key={ex.id}
                    role="radio"
                    aria-checked={on}
                    className={`nr-example${on ? ' is-selected' : ''}`}
                    onClick={() => pickExample(ex.id)}
                    onDoubleClick={() => {
                      actions.selectExample(ex.id)
                      actions.continueToPreflight()
                    }}
                  >
                    <span className="nr-example-head">
                      <span className="mono nr-example-name">{ex.id}.qasm</span>
                      <span className="mono nr-example-facts">{ex.facts}</span>
                    </span>
                    <span className="mono nr-example-kind">{ex.kind}</span>
                    <span className="nr-example-desc">{ex.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="nr-foot">
            <div className={`nr-chosen${chosen ? ' is-on' : ''}`} aria-live="polite">
              {chosen ? (
                <>
                  <Glyph kind="check" />
                  <span>chosen</span>
                  <span className="mono nr-chosen-file">{chosenLabel}</span>
                </>
              ) : (
                <>
                  <Glyph kind="ring" />
                  <span>No circuit chosen</span>
                </>
              )}
            </div>
            <PrimaryButton disabled={!chosen} onClick={proceed} name="primary-action" style={{ width: 200, padding: 0 }}>
              Continue
            </PrimaryButton>
          </div>
        </Tile>
      </div>
    </Shell>
  )
}

function FetchProgress({ stage }: { stage: number }) {
  return (
    <div className="nr-fetch ink-fade-in" role="status" aria-live="polite">
      <div className="nr-stages">
        {STAGES.map((s, i) => {
          const state = i < stage ? 'done' : i === stage ? 'running' : 'queued'
          return (
            <div key={s.word} className={`nr-stage is-${state}`}>
              <span className="nr-stage-icon">
                {state === 'done' ? <Glyph kind="check" /> : state === 'running' ? <Spinner size={14} /> : <Glyph kind="ring" size={8} />}
              </span>
              <span className="nr-stage-word">{s.word}</span>
              <span className="mono nr-stage-detail">{state === 'done' ? s.done : state === 'running' ? s.running : s.queued}</span>
              <span className={`nr-stage-end${state === 'running' ? ' mono' : ''}`}>
                {state === 'done' ? 'done' : state === 'running' ? s.est : 'queued'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="nr-fetch-rows" aria-hidden>
        {[220, 180, 240].map((w) => (
          <div key={w} className="nr-fetch-row">
            <Shim w={w} h={12} />
            <span className="nr-grow" />
            <Shim w={64} h={12} />
            <Shim w={40} h={12} />
          </div>
        ))}
      </div>
    </div>
  )
}
