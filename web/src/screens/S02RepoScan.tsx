/*
 * S-02 · Repo scan (Paper 172W-0, states 1OCW-0). What the scan of qlab/sidechain-packing found: the
 * circuits, the manifest Gatesmith will write (or the repo's own), and the Qiskit check. The mint
 * "Use these" takes the chosen circuit and manifest into pre-flight.
 * States at #/scan?state=found | no-qiskit | private-repo | token-rejected | scanning | offline | focus.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useHashParams } from '../app/router'
import { actions } from '../data/run'
import { EditorButton, ModeTabs, PrimaryButton, Tile } from '../ui/parts'
import { GpuStatus, Shell } from '../ui/Shell'
import { AccountHandle, Banner, Code, Facts, Glyph, GroupHeader, InspSection, IntakeTabs, RunBlock, Shim, Spinner } from './intake/kit'
import { codeLines } from './intake/code'
import { useOnline } from './intake/online'
import { draftManifest, FOUND_MANIFEST, NOT_CHECKED, QASM_FILES, QISKIT_SOURCES, REPO, SKIPPED, type ScanFile } from './intake/scanData'
import './intake/s02.css'

type S02State = 'not-found' | 'found' | 'no-qiskit' | 'private-repo' | 'token-rejected' | 'scanning' | 'offline' | 'focus'

const icons = {
  repo: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
      <path d="M6 3.5v13M6 9.5c0 2.2 1.8 3 4 3h1.2a3 3 0 003-3V8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M6 3.5m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0M14.2 6.2m-1.8 0a1.8 1.8 0 103.6 0a1.8 1.8 0 10-3.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  chosen: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="3" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 9.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5.5V4a2 2 0 014 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
}

/* The scan's stage list while it runs: clone and search done, parse running. */
const SCAN_STAGES = [
  { word: 'clone', done: '2.4 MB in 3.1 s', running: 'cloning qlab/sidechain-packing', est: 'about 3 s' },
  { word: 'search', done: '9 candidates in 1,280 files · 1.8 s', running: 'reading the file tree', est: 'about 2 s' },
  { word: 'parse', done: '9 of 9 read', running: '5 of 9 · circuits/archive/qaoa_p1.qasm', est: 'about 3 s' },
]

export function S02RepoScan() {
  const params = useHashParams()
  const forced = (params.get('state') ?? 'not-found') as S02State
  return <RepoScan key={forced} forced={forced} />
}

function RepoScan({ forced }: { forced: S02State }) {
  const online = useOnline()
  const [chosenPath, setChosenPath] = useState(QASM_FILES[0].path)
  // live flows: a rescan or a token fetch plays the stage list, then shows the result
  const [scanStage, setScanStage] = useState<number | null>(null)
  const [access, setAccess] = useState<'ok' | 'private' | 'rejected'>(
    forced === 'private-repo' ? 'private' : forced === 'token-rejected' ? 'rejected' : 'ok',
  )
  const [qiskitOk, setQiskitOk] = useState(forced !== 'no-qiskit')
  const [token, setToken] = useState('')
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (forced === 'focus') rows.current[0]?.focus()
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [forced])

  const offline = forced === 'offline' || !online
  const stage = forced === 'scanning' ? 2 : scanStage
  const scanning = stage != null
  const blocked = access !== 'ok'
  const found = forced === 'found'
  const file = QASM_FILES.find((f) => f.path === chosenPath) ?? QASM_FILES[0]
  const manifestText = found ? FOUND_MANIFEST : draftManifest(file)
  const manifestLines = manifestText.split('\n').length
  const ready = !scanning && !blocked

  const rescan = (after?: () => void) => {
    if (offline) return
    setScanStage(0)
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
    at(700, () => setScanStage(1))
    at(1400, () => setScanStage(2))
    at(2200, () => {
      setScanStage(null)
      after?.()
    })
  }

  const fetchWithToken = () => {
    if (!/^(github_pat_|ghp_)\w{20,}$/.test(token.trim())) {
      setAccess('rejected')
      return
    }
    setAccess('ok')
    rescan()
  }

  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const next = Math.max(0, Math.min(QASM_FILES.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    rows.current[next]?.focus()
  }

  const tableMeta = blocked
    ? '0 files · not reachable'
    : scanning
      ? 'scanning · about 3 s left'
      : offline
        ? 'last scan 2 min ago'
        : 'step 2 of 3 · check · 7 circuits · 1 chosen'

  return (
    <Shell
      rail="new"
      status={
        <>
          <GpuStatus online />
          <AccountHandle />
        </>
      }
      tabs={<IntakeTabs label="New run" plus />}
      inspector={
        <div className="ink-scope rs-insp">
          <ModeTabs />
          <RunBlock
            center
            line={
              ready
                ? `${file.path.split('/').pop()} · ${found ? 'qscore.yaml from the repo' : 'new qscore.yaml'} · Qiskit ${REPO.qiskit}`
                : scanning
                  ? 'Scanning qlab/sidechain-packing'
                  : 'Nothing chosen · the repo is not reachable'
            }
          >
            <PrimaryButton disabled={!ready} onClick={() => actions.continueToPreflight()} name="primary-action">
              Use these
            </PrimaryButton>
          </RunBlock>
          <InspSection icon={icons.repo} title="Repository" meta={blocked ? 'private · not reachable' : 'public · read-only'}>
            <Facts
              topRule={false}
              labelWidth={84}
              rows={[
                ['URL', REPO.url],
                ['Branch', blocked ? 'not reachable' : REPO.branch],
                ['Commit', blocked ? 'not reachable' : REPO.commit],
                ['Fetched', blocked ? '404 in 0.4 s' : REPO.fetched],
              ]}
            />
          </InspSection>
          <InspSection icon={icons.chosen} title="Chosen" meta={ready ? '1 circuit · 1 manifest' : 'nothing yet'}>
            {ready ? (
              <Facts
                topRule={false}
                labelWidth={84}
                rows={[
                  ['Circuit', file.path],
                  ['Item id', `${file.item} · ${file.qubits} q`],
                  ['Manifest', found ? 'qscore.yaml · from the repo' : 'qscore.yaml · written on use'],
                  ['Qiskit', qiskitOk ? `${REPO.qiskit} · from pyproject` : 'not found · .qasm only'],
                ]}
              />
            ) : scanning ? (
              <div className="rs-insp-shim" aria-label="Waiting for the scan">
                {[180, 140, 196, 120].map((w) => (
                  <div key={w} className="ink-fact">
                    <span className="ink-fact-label" style={{ width: 84 }}>
                      <Shim w={52} />
                    </span>
                    <span className="ink-fact-value">
                      <Shim w={w} />
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rs-insp-empty">Nothing chosen yet · fetch the repo or go back and pick a file</div>
            )}
          </InspSection>
        </div>
      }
    >
      <div className="rs-tiles ink-scope">
        {/* ── Files found ── */}
        <Tile className="rs-files" tabs={[{ id: 'files', label: 'Files found', active: true }]} meta={<span className="mono">{tableMeta}</span>} bodyClassName="rs-files-body">
          {blocked ? (
            <PrivateRepo
              rejected={access === 'rejected'}
              token={token}
              onToken={setToken}
              onFetch={fetchWithToken}
            />
          ) : scanning ? (
            <ScanProgress stage={stage} />
          ) : (
            <>
              {offline && (
                <Banner tone="warn" word="offline" className="rs-offline">
                  <span className="ink-banner-grow">You are offline. The scan resumes when the connection returns.</span>
                </Banner>
              )}
              <div className="rs-thead">
                <span className="rs-col-path">path</span>
                <span className="rs-col-format">format</span>
                <span className="rs-col-num">size</span>
                <span className="rs-col-num">qubits</span>
              </div>
              <div className="rs-group is-first">
                <GroupHeader label="openqasm" note="5 files" className="rs-group-head" />
                <div role="listbox" aria-label="OpenQASM files">
                  {QASM_FILES.map((f, i) => {
                    const on = f.path === chosenPath
                    return (
                      <button
                        key={f.path}
                        ref={(el) => {
                          rows.current[i] = el
                        }}
                        role="option"
                        aria-selected={on}
                        tabIndex={on ? 0 : -1}
                        className={`rs-row${on ? ' is-selected' : ''}${forced === 'focus' && i === 0 ? ' is-focus' : ''}`}
                        onClick={() => setChosenPath(f.path)}
                        onKeyDown={(e) => onRowKey(e, i)}
                      >
                        <Cells file={f} />
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="rs-group">
                <GroupHeader label="qiskit sources" note="2 files · built at scan" className="rs-group-head" />
                {QISKIT_SOURCES.map((f) => (
                  <div key={f.path} className="rs-row is-static">
                    <span className="mono rs-col-path">{f.path}</span>
                    <span className="mono rs-col-format">{f.format}</span>
                    <span className="mono rs-col-num">{f.size}</span>
                    <span className="mono rs-col-num">{f.qubits}</span>
                  </div>
                ))}
              </div>
              <div className="rs-group">
                <GroupHeader label="skipped" note="2 files · not circuits" className="rs-group-head" />
                {SKIPPED.map((f) => (
                  <div key={f.path} className="rs-row is-static is-skipped">
                    <span className="mono rs-col-path">{f.path}</span>
                    <span className="mono rs-col-format">{f.format}</span>
                    <span className="mono rs-col-num">{f.size}</span>
                    <span className="mono rs-col-num is-small">skipped</span>
                  </div>
                ))}
              </div>
              <Preview file={file} />
              <div className="rs-done">
                <Glyph kind="check" />
                <span>done</span>
                <span className="mono rs-done-facts">9 files scanned in 1.8 s · .gitignore respected</span>
              </div>
            </>
          )}
        </Tile>

        <div className="rs-right">
          {/* ── Manifest ── */}
          <Tile
            className="rs-manifest"
            tabs={[{ id: 'manifest', label: 'Manifest', active: true }]}
            meta={
              <span className="mono">
                {ready ? `qscore.yaml · ${manifestLines} lines · ${found ? 'found' : 'new'}` : scanning ? 'waiting for the scan' : 'no manifest yet'}
              </span>
            }
            bodyClassName="rs-manifest-body"
          >
            {ready ? (
              <ManifestBody found={found} text={manifestText} />
            ) : scanning ? (
              <div className="rs-wait" aria-label="Waiting for the scan">
                {[236, 150, 48, 160, 236, 140, 196, 64, 150, 172, 120, 210].map((w, i) => (
                  <div key={i} className="rs-wait-line">
                    <Shim w={18} />
                    <Shim w={w} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rs-empty">The manifest is read after the scan reaches the repo.</div>
            )}
          </Tile>

          {/* ── Qiskit check ── */}
          <Tile
            className="rs-check"
            tabs={[{ id: 'qiskit', label: 'Qiskit check', active: true }]}
            meta={<span className="mono">{qiskitOk ? 'pyproject.toml' : 'pyproject.toml · requirements.txt'}</span>}
            bodyClassName="rs-check-body"
          >
            {blocked ? (
              <div className="rs-check-row is-quiet">
                <Glyph kind="ring" />
                <span>waiting</span>
                <span className="rs-check-what">checked once the repo is reachable</span>
              </div>
            ) : scanning ? (
              <div className="rs-check-row">
                <Spinner size={14} />
                <span>checking</span>
                <span className="rs-check-what">pyproject.toml and requirements.txt</span>
                <span className="rs-grow" />
                <span className="mono rs-check-meta">about 1 s</span>
              </div>
            ) : qiskitOk ? (
              <div className="rs-check-row">
                <span className="rs-check-ok">
                  <Glyph kind="check" size={12} />
                </span>
                <span className="rs-check-word">passed</span>
                <span className="rs-check-what">Qiskit 1.3 found in pyproject</span>
                <span className="rs-grow" />
                <span className="mono rs-check-meta">qiskit 1.3.1 · python 3.11</span>
              </div>
            ) : (
              <>
                <div className="rs-check-row is-bad" role="alert">
                  <Glyph kind="x" />
                  <span>No Qiskit detected</span>
                  <span className="mono rs-check-meta">(Q104) · pyproject.toml · add qiskit 1.3.1</span>
                </div>
                <div className="rs-check-fix">
                  <span className="rs-grow">2 Qiskit sources cannot be built · the .qasm files still can</span>
                  <EditorButton onClick={() => rescan(() => setQiskitOk(true))} disabled={offline}>
                    Scan again
                  </EditorButton>
                </div>
              </>
            )}
          </Tile>
        </div>
      </div>
    </Shell>
  )
}

function Cells({ file }: { file: ScanFile }) {
  return (
    <>
      <span className="mono rs-col-path">{file.path}</span>
      <span className="mono rs-col-format">{file.format}</span>
      <span className="mono rs-col-num">{file.size}</span>
      <span className="mono rs-col-num">{file.qubits} q</span>
    </>
  )
}

function ScanProgress({ stage }: { stage: number }) {
  return (
    <div className="rs-scan" role="status" aria-live="polite">
      <div className="rs-stages">
        {SCAN_STAGES.map((s, i) => {
          const state = i < stage ? 'done' : i === stage ? 'running' : 'queued'
          return (
            <div key={s.word} className={`rs-stage is-${state}`}>
              <span className="rs-stage-icon">
                {state === 'done' ? <Glyph kind="check" /> : state === 'running' ? <Spinner size={14} /> : <Glyph kind="ring" size={8} />}
              </span>
              <span className="rs-stage-word">{s.word}</span>
              <span className="mono rs-stage-detail">{state === 'done' ? s.done : state === 'running' ? s.running : 'queued'}</span>
              <span className={state === 'running' ? 'mono rs-stage-est' : 'rs-stage-end'}>
                {state === 'done' ? 'done' : state === 'running' ? s.est : 'queued'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="rs-scan-rows" aria-hidden>
        {[200, 168, 216, 184, 152, 208].map((w) => (
          <div key={w} className="rs-scan-row">
            <Shim w={w} />
            <span className="rs-grow" />
            <Shim w={84} />
            <Shim w={48} />
            <Shim w={32} />
          </div>
        ))}
      </div>
    </div>
  )
}

function PrivateRepo({
  rejected,
  token,
  onToken,
  onFetch,
}: {
  rejected: boolean
  token: string
  onToken: (t: string) => void
  onFetch: () => void
}) {
  return (
    <div className="rs-private">
      {rejected ? (
        <Banner tone="bad" word="Token rejected">
          <span className="mono rs-code">(Q903)</span>
          <span className="mono rs-where">· qlab/sidechain-packing · paste a new token</span>
        </Banner>
      ) : (
        <div className="ink-banner is-bad" role="alert">
          <span className="ink-banner-word">
            {icons.lock}
            Repository not found
          </span>
          <span className="mono rs-code">(Q902)</span>
          <span className="mono rs-where">· qlab/sidechain-packing · add a token</span>
        </div>
      )}
      <p className="rs-private-text">
        {rejected
          ? 'GitHub refused the token. It may have expired or lack contents: read on this repo.'
          : 'The repo is private or the URL is wrong. Make it public, or paste a token with contents: read.'}
      </p>
      <form
        className="rs-token"
        onSubmit={(e) => {
          e.preventDefault()
          onFetch()
        }}
      >
        <label className="rs-token-label" htmlFor="rs-token">
          Token
        </label>
        <span className={`rs-token-field${rejected ? ' is-bad' : ''}`}>
          <input
            id="rs-token"
            className="mono"
            type="password"
            autoComplete="off"
            placeholder="github_pat_…"
            value={token}
            onChange={(e) => onToken(e.target.value)}
          />
          <span className="mono rs-token-scope">contents: read</span>
        </span>
        <EditorButton style={{ height: 26, paddingBlock: 0, paddingInline: 12 }}>Fetch with token</EditorButton>
      </form>
      <div className="mono rs-token-note">kept for this session only · never written to the manifest</div>
    </div>
  )
}

/** The manifest tile body. The code keeps whole lines: it gets the height left after the status row
 * and the not-checked list, rounded down to 20 px lines, and scrolls for the rest. */
function ManifestBody({ found, text }: { found: boolean; text: string }) {
  const body = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const maxHeight = useWholeLines(body, top, bottom, text.split('\n').length)
  return (
    <div className="rs-manifest-inner" ref={body}>
      <div ref={top}>
        {found ? (
          <div className="rs-found">
            <Glyph kind="check" />
            <span className="rs-found-word">found</span>
            <span className="mono">qscore.yaml</span>
            <span className="mono rs-found-meta">repo root · sha256 9c41…e07b</span>
          </div>
        ) : (
          <Banner tone="info" word="info">
            <span className="ink-banner-grow">No qscore.yaml found. Gatesmith will write one from the circuit.</span>
          </Banner>
        )}
      </div>
      <Code lines={codeLines(text)} className="rs-manifest-code" label="qscore.yaml" style={maxHeight ? { maxHeight } : undefined} />
      <div className="rs-notchecked" ref={bottom}>
        <GroupHeader label="will not be checked" note="from this manifest" />
        <div className="rs-nc-rows">
          {NOT_CHECKED.map((r) => (
            <div key={r.name} className="rs-nc-row">
              <span className="mono rs-nc-name">{r.name}</span>
              <Glyph kind="ring" size={8} />
              <span className="rs-nc-status">{r.status}</span>
              <span className="mono rs-nc-why">{r.why}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Height for a code block of `lines` 20 px lines that fits what its siblings leave, in whole lines. */
function useWholeLines(
  container: RefObject<HTMLElement | null>,
  above: RefObject<HTMLElement | null>,
  below: RefObject<HTMLElement | null>,
  lines: number,
) {
  const [h, setH] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const gap = parseFloat(cs.rowGap) || 0
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const used = (above.current?.offsetHeight ?? 0) + (below.current?.offsetHeight ?? 0) + gap * 2 + pad
      const room = el.clientHeight - used - 10 // 4 + 4 padding, 1 + 1 border
      const fit = Math.max(1, Math.min(lines, Math.floor(room / 20)))
      setH(fit * 20 + 10)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (above.current) ro.observe(above.current)
    if (below.current) ro.observe(below.current)
    return () => ro.disconnect()
  }, [container, above, below, lines])
  return h
}

/** The chosen file's first lines, as many whole 20 px lines as the space holds. */
function Preview({ file }: { file: ScanFile }) {
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(16)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setFit(Math.max(1, Math.floor((el.clientHeight - 10) / 20)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const lines = codeLines(file.preview).slice(0, Math.min(16, fit))
  return (
    <div className="rs-preview">
      <GroupHeader label="preview · chosen file" note={`lines 1 to ${lines.length} of ${file.lines}`} className="rs-group-head" />
      <div className="rs-preview-box" ref={box}>
        <Code lines={lines} className="rs-preview-code" label={`${file.path}, first lines`} />
      </div>
    </div>
  )
}
