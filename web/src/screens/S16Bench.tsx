/*
 * S-16 · Model bench (stretch). Paper: EVP-0, states G05-0, motion M6 row S-16.
 * The in-house model rewrites one block for one quality; the engine verifies it like any other proposal.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, GpuStatus, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeBlock, ModeTabs, PrimaryButton, SecondaryPair, TileHeader } from '../ui/parts'
import { GlyphAccepted, GlyphRejected, GlyphWarning, IconHistory, InspSection, KV, StretchStatus, useElapsed, useTimers } from './stretch/parts'
import { BENCH, BENCH_SET, BY_WIDTH, INPUT, INVALID, REWRITES, type Box, type ModelId } from './s16/data'
import './s16/s16.css'

type StateName = 'loading' | 'empty' | 'not-loaded' | 'invalid' | 'focus' | 'offline' | null
const STATES = ['loading', 'empty', 'not-loaded', 'invalid', 'focus', 'offline'] as const

type Run =
  | { kind: 'idle' }
  | { kind: 'running'; what: 'one' | 'both'; step: 'proposing' | 'verifying' }
  | { kind: 'done'; what: 'one' | 'both' }
  | { kind: 'loading-model' }

export function S16Bench() {
  const params = useHashParams()
  const raw = params.get('state')
  const state: StateName = (STATES as readonly string[]).includes(raw ?? '') ? (raw as StateName) : null

  const [tab, setTab] = useState<'block' | 'set'>('block')
  const [model, setModel] = useState<ModelId>('inhouse')
  const [run, setRun] = useState<Run>({ kind: 'idle' })
  const [loaded, setLoaded] = useState(true)
  const [invalidCleared, setInvalidCleared] = useState(false)
  const [menu, setMenu] = useState(false)
  const timers = useTimers()
  const elapsed = useElapsed(run.kind === 'running' || run.kind === 'loading-model')

  useEffect(() => {
    setLoaded(state !== 'not-loaded')
    setInvalidCleared(false)
    setRun({ kind: 'idle' })
  }, [state])

  const offline = state === 'offline'
  const empty = state === 'empty'
  const invalid = state === 'invalid' && !invalidCleared
  const canRun = loaded && !offline && !empty && run.kind !== 'running' && run.kind !== 'loading-model'

  function start(what: 'one' | 'both') {
    timers.clear()
    setTab('block')
    setModel('inhouse')
    setRun({ kind: 'running', what, step: 'proposing' })
    const propose = what === 'one' ? 900 : 1600
    timers.after(propose, () => setRun({ kind: 'running', what, step: 'verifying' }))
    timers.after(propose + 1100, () => setRun({ kind: 'done', what }))
  }

  function loadModel() {
    setRun({ kind: 'loading-model' })
    timers.after(1800, () => {
      setLoaded(true)
      setRun({ kind: 'idle' })
    })
  }

  // ?state=focus: bench row #2 holds keyboard focus
  const focusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state === 'focus') focusRef.current?.focus()
  }, [state])

  const rw = REWRITES[model]
  const running = run.kind === 'running'
  const done = run.kind === 'done'

  const modeLine = offline
    ? 'GPU off · nothing can be proposed here'
    : empty
      ? 'sbox_oracle · no block fits the model'
      : done
        ? `Block D04 · round 4 · ${run.what === 'both' ? 'two proposals verified' : 'accepted'}`
        : 'Block D04 · q9–q10 · targeting two_qubit_count'

  const actionText = offline
    ? 'Both local models run on the GPU, so nothing can be proposed here. The last bench run stays readable.'
    : !loaded
      ? 'The in-house block model is not on the GPU yet. Load it first; it takes about 20 s and 3.1 GB of VRAM.'
      : running
        ? run.step === 'proposing'
          ? `The ${run.what === 'both' ? 'two models are' : 'in-house model is'} rewriting D04. The engine verifies what comes back like any other proposal.`
          : 'The engine is checking the rewrite: operator equivalence on q9–q10, then two_qubit_count on the whole circuit.'
        : done
          ? run.what === 'both'
            ? 'Both rewrites passed. The in-house model removed two CX gates, granite-8b-qiskit one, so the engine keeps the in-house rewrite.'
            : 'The engine accepted the rewrite in round 4: two fewer two-qubit gates in D04. It went through the same verifier as every other proposal.'
          : 'The rewrite above is from a bench replay of round 3. Block D04 is still unchanged in the live run. Running here sends one proposal into round 4, and the engine verifies it like any other.'

  const primary = running
    ? {
        label: `${run.step === 'proposing' ? (run.what === 'both' ? 'Running 2 models' : 'Proposing') : 'Verifying'} · ${elapsed} s`,
        onClick: undefined,
        progress: run.step === 'proposing' ? 0.45 : 0.85,
      }
    : run.kind === 'loading-model'
      ? { label: `Loading model · ${elapsed} s`, onClick: undefined, progress: undefined }
      : done
        ? { label: 'Open loop view', onClick: () => navigate(ROUTES.loop, { transition: 'forward' }), progress: undefined }
        : { label: 'Run on this block', onClick: () => start('one'), progress: undefined }

  const replayRows: [React.ReactNode, React.ReactNode][] = done
    ? run.what === 'both'
      ? [
          ['In-house, round 4', <Verdict key="a" status="accepted" value="−2 gates" />],
          ['granite-8b, round 4', <Verdict key="b" status="accepted" value="−1 gate" />],
        ]
      : [
          ['Equivalence', rw.equivalence],
          ['In round 4', <Verdict key="c" status="accepted" value="−2 gates" />],
        ]
    : invalid
      ? [
          ['Equivalence', 'not proven'],
          ['On the replay', <Verdict key="d" status="invalid" value="0 gates" />],
        ]
      : [
          ['Equivalence', rw.equivalence],
          ['On the replay', <Verdict key="e" status={rw.replay.status} value={rw.replay.value} />],
        ]

  return (
    <Shell
      rail="runs"
      status={offline ? <OfflineStatus /> : <StretchStatus />}
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: !empty, onClick: () => empty && navigate(ROUTES.bench) },
            {
              id: 'b',
              label: 'sbox_oracle.qasm',
              active: empty,
              // no block in sbox_oracle fits the in-house model: that tab is the empty state
              onClick: () => !empty && (window.location.hash = '#/bench?state=empty'),
            },
          ]}
        />
      }
      inspector={
        <>
          <ModeTabs />
          <ModeBlock line={modeLine} />
          <div className="st-action">
            <p className="st-note">{actionText}</p>
            <PrimaryButton onClick={canRun || done ? primary.onClick : undefined} progress={primary.progress} disabled={!canRun && !done && !running && run.kind !== 'loading-model'}>
              {primary.label}
            </PrimaryButton>
            <SecondaryPair>
              <div className="s16-pick">
                <EditorButton wide onClick={() => start('both')} disabled={!canRun}>
                  Run both models
                </EditorButton>
              </div>
              <div className="s16-pick">
                <EditorButton wide onClick={() => setMenu((m) => !m)} disabled={running}>
                  Pick another block
                </EditorButton>
                {menu && <BlockMenu onClose={() => setMenu(false)} />}
              </div>
            </SecondaryPair>
          </div>
          <InspSection icon={<IconBlockModel />} title="In-house block model" meta="stretch" inset bodyStyle={{ gap: 0 }}>
            <KV
              rows={[
                ['Kind', 'block rewriter · 0.3B'],
                ['Input', 'one block · up to 5 qubits'],
                ['Optimizes', 'one quality per call'],
                ['Trained on', '6,200 accepted rewrites'],
                ['Bench', '120 blocks · last run 10:48'],
                ['Runs on', loaded && !offline ? 'GPU · 3.1 GB VRAM' : 'GPU · not loaded'],
                ['Latency', '0.4 s per proposal'],
              ]}
            />
            <p className="st-note" style={{ paddingTop: 12 }}>
              It proposes and never scores. Its rewrites go through the same verifier as granite-8b-qiskit, and the engine decides.
            </p>
          </InspSection>
          <GpuMemory loaded={loaded} offline={offline} />
          <InspSection icon={<IconHistory />} title="Bench history" meta="4 runs" defaultOpen={false} bodyStyle={{ gap: 0 }}>
            <KV
              rows={[
                ['10:48 · today', '120 blocks · 47% · 31%'],
                ['16:02 · yesterday', '120 blocks · 45% · 31%'],
                ['Oct 8', '96 blocks · 41% · 30%'],
                ['Oct 7', '96 blocks · 38% · 29%'],
              ]}
            />
          </InspSection>
        </>
      }
    >
      <Content>
        <section className="tile s16-block">
          <TileHeader
            tabs={[
              { id: 'block', label: 'This block', active: tab === 'block', onClick: () => setTab('block') },
              { id: 'set', label: 'Bench set', active: tab === 'set', onClick: () => setTab('set') },
            ]}
            meta={
              <span className="mono">
                {tab === 'set'
                  ? '120 recorded blocks · 14 circuits · eight largest shown'
                  : empty
                    ? 'sbox_oracle · 20 q · no block of 5 qubits or fewer'
                    : 'bench replay of round 3 · two_qubit_count 36 gates · FakeTorino'}
              </span>
            }
          />
          {offline ? (
            <StateIntro icon={<OfflineDot />} word="offline" wordColor="var(--color-text-secondary)" title="GPU machine is off, GPU jobs will wait">
              Both local models run on the GPU, so nothing can be proposed here. The last bench run stays readable.
            </StateIntro>
          ) : !loaded ? (
            <StateIntro icon={<NotLoadedGlyph />} word="not loaded" wordColor="var(--color-text-secondary)" title="The in-house block model is not on the GPU">
              <span>
                Loading takes about 20 s and 3.1 GB of VRAM. granite-8b-qiskit already holds 9.4 GB of 48 GB. Run on this block waits until the model is
                loaded.
              </span>
              <span className="s16-state-actions">
                <EditorButton onClick={loadModel} disabled={run.kind === 'loading-model'}>
                  {run.kind === 'loading-model' ? `Loading · ${elapsed} s` : 'Load model'}
                </EditorButton>
                <span className="mono s16-dim">GPU · 38.6 GB free</span>
              </span>
            </StateIntro>
          ) : invalid ? (
            <StateIntro icon={<InvalidGlyph />} word="invalid" wordColor="var(--color-text-secondary)" title="Not equivalent to the input" code="Q431">
              <span>
                The engine could not prove the rewrite of D04 equivalent. Nothing changed in the circuit, and the attempt stays in the record with its reason.
              </span>
              <span className="s16-state-actions">
                <EditorButton onClick={() => setInvalidCleared(true)}>Run again</EditorButton>
              </span>
            </StateIntro>
          ) : tab === 'set' ? null : empty ? (
            <div className="s16-intro">
              <h2 className="s16-heading">The in-house model rewrites one block of gates for one quality.</h2>
              <p className="st-note">It takes blocks of 5 qubits or fewer. sbox_oracle has none open right now, so here is why.</p>
            </div>
          ) : (
            <div className="s16-intro">
              <h2 className="s16-heading">The in-house model rewrites one block of gates for one quality.</h2>
              <p className="st-note">
                It sees two qubits of sidechain_qaoa, never the whole circuit, and aims at two_qubit_count only. The engine verifies its rewrite like any
                other proposal.
              </p>
            </div>
          )}
          {tab === 'set' ? (
            <BenchSet />
          ) : empty ? (
            <div className="s16-empty">
              <span className="s16-empty-title">No block in sbox_oracle fits</span>
              <span className="st-note">Every open finding spans 6 or more qubits, and the in-house model takes 5 or fewer.</span>
              <KV
                style={{ paddingBlock: 4 }}
                rows={[
                  ['D04 · resynthesis', '8 q block'],
                  ['D05 · linear block', '6 q block'],
                  ['D01 · routing', 'whole circuit · 20 q'],
                ]}
              />
              <span>
                <EditorButton onClick={() => setModel('granite')}>Run granite-8b-qiskit</EditorButton>
              </span>
            </div>
          ) : (
            <div className="s16-block-body">
              <div className="s16-card">
                <div className="s16-card-head">
                  <span className="s16-card-title">Input · block D04</span>
                  <span className="mono s16-dim">10 gates · 4 two-qubit</span>
                </div>
                <BlockDrawing cx={INPUT.cx} boxes={INPUT.boxes} region="#FF986E" />
                <div className="s16-card-status">
                  <GlyphWarning size={12} />
                  <span style={{ color: 'var(--color-signal-warn)' }}>warning</span>
                  <span className="st-note">D04 · 4 gates removable</span>
                </div>
              </div>
              <div className="s16-arrow">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="#ADC5CA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={`s16-card s16-output${running ? ' is-running' : ''}`} key={model}>
                <div className="s16-card-head">
                  <span className="s16-card-title">{rw.title}</span>
                  <span className="mono s16-dim">{running ? `writing · ${elapsed} s` : rw.meta}</span>
                </div>
                <BlockDrawing cx={rw.cx} boxes={rw.boxes} region="#867BFA" />
                <div className="s16-card-status">
                  {invalid ? (
                    <>
                      <InvalidGlyph size={12} />
                      <span style={{ color: 'var(--color-text-secondary)' }}>invalid</span>
                      <span className="st-note">not equivalent to the input</span>
                    </>
                  ) : rw.status.kind === 'rewrite' ? (
                    <>
                      <SparkGlyph />
                      <span style={{ color: 'var(--color-violet-300)' }}>{rw.status.word}</span>
                      <span className="st-note">{rw.status.text}</span>
                    </>
                  ) : (
                    <>
                      <PassesGlyph />
                      <span style={{ color: 'var(--color-signal-info)' }}>{rw.status.word}</span>
                      <span className="st-note">{rw.status.text}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="s16-quality">
                <div className="s16-quality-top">
                  <span className="mono s16-dim s16-quality-label">targeted quality</span>
                  <span className="mono s16-quality-name">two_qubit_count</span>
                  <span className="s16-quality-figure">
                    <span className="mono s16-quality-number" key={rw.target}>
                      {rw.target}
                    </span>
                    <span className="mono s16-quality-unit">gates in this block</span>
                  </span>
                </div>
                <KV
                  rows={[
                    ['Whole circuit', rw.whole],
                    ['Depth, not targeted', rw.depth],
                    ...replayRows,
                  ]}
                />
              </div>
            </div>
          )}
        </section>

        <section className="tile s16-bench">
          <TileHeader
            tabs={[{ id: 'bench', label: 'Local models on the bench', active: true }]}
            meta={
              state === 'loading' ? (
                <span className="s16-running-meta">
                  <span className="s16-running-dot" />
                  <span style={{ color: 'var(--color-signal-info)' }}>running</span>
                  <span className="mono">74 of 120 blocks · about 40 s left</span>
                </span>
              ) : (
                <span className="mono">120 recorded blocks · 14 circuits · 8 seeds · FakeTorino</span>
              )
            }
          />
          {state === 'loading' && (
            <div className="s16-replay-bar">
              <span style={{ width: '62%' }} />
            </div>
          )}
          <div className="s16-bench-body">
            <div className="s16-brow s16-bhead">
              <span className="s16-b-rank">Rank</span>
              <span className="s16-b-name">Model · layer · size</span>
              <span className="s16-b-rate">Verified-improvement rate</span>
              <span className="s16-b-gain">Mean gain</span>
              <span className="s16-b-invalid">Invalid rate</span>
              <span className="s16-b-latency">Latency per proposal</span>
            </div>
            {BENCH.map((b, i) => (
              <div
                key={b.id}
                ref={state === 'focus' && b.id === 'granite' ? focusRef : undefined}
                className={`s16-brow s16-bench-row${model === b.id ? ' is-selected' : ''}${state === 'focus' && b.id === 'granite' ? ' is-focus' : ''}`}
                tabIndex={0}
                role="row"
                aria-selected={model === b.id}
                onClick={() => setModel(b.id)}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setModel(b.id)
                    setTab('block')
                  }
                  if (e.key === 'ArrowDown') (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus()
                  if (e.key === 'ArrowUp') (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus()
                }}
              >
                <span className="s16-b-rank mono s16-dim">{b.rank}</span>
                <span className="s16-b-name s16-model">
                  <span className="mono">{b.name}</span>
                  <span className="s16-model-sub">
                    <span className="s16-dot" style={{ background: b.dot }} />
                    <span className="mono">{b.sub}</span>
                  </span>
                </span>
                <span className="s16-b-rate s16-rate">
                  <span className="s16-track">
                    <span className="s16-fill s16-grow" style={{ width: b.rate * 2, '--i': i } as CSSProperties} />
                  </span>
                  <span className="mono s16-rate-value">{b.rate}%</span>
                </span>
                <span className="s16-b-gain mono">{b.gain}</span>
                <span className="s16-b-invalid mono">{b.invalid}</span>
                <span className="s16-b-latency mono">{b.latency}</span>
              </div>
            ))}
            <p className="st-note s16-bench-note">
              {state === 'loading'
                ? 'Rates update when the replay finishes. The table keeps the last complete run.'
                : 'Same blocks and seeds for every row. Mean gain counts accepted rewrites only; invalid means the engine could not parse the rewrite or prove it equivalent.'}
            </p>
          </div>
        </section>

        <div className="s16-lower">
          <section className="tile s16-width">
            <TileHeader tabs={[{ id: 'w', label: 'By block width', active: true }]} meta={<span className="mono">verified-improvement rate</span>} />
            <div className="s16-width-body">
              <div className="s16-width-bars">
                {BY_WIDTH.map((r, i) => (
                  <div key={r.label} className="s16-width-row">
                    <span className="mono s16-width-label">{r.label}</span>
                    <span className="s16-width-pair">
                      <span className="s16-width-line">
                        <span className="s16-wbar s16-grow" style={{ width: Math.round(r.a * 3.2), background: '#FFFFFF', '--i': i } as CSSProperties} />
                        <span className="mono">{r.a}%</span>
                      </span>
                      <span className="s16-width-line is-b">
                        <span className="s16-wbar s16-grow" style={{ width: Math.round(r.b * 3.2), background: '#667E83', '--i': i } as CSSProperties} />
                        <span className="mono">{r.b}%</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="s16-width-side">
                <div className="s16-width-legend">
                  <span className="s16-legend-row">
                    <span className="s16-swatch" style={{ background: '#FFFFFF' }} />
                    <span className="mono">in-house</span>
                  </span>
                  <span className="s16-legend-row">
                    <span className="s16-swatch" style={{ background: '#667E83' }} />
                    <span className="mono">granite-8b-qiskit</span>
                  </span>
                </div>
                <p className="st-note">The lead shrinks on wide blocks. It is not offered above 5 qubits.</p>
              </div>
            </div>
          </section>
          <section className="tile s16-invalid">
            <TileHeader tabs={[{ id: 'i', label: 'Why proposals were invalid', active: true }]} meta={<span className="mono">960 proposals per model</span>} />
            <div className="s16-invalid-body">
              <div className="s16-irow s16-ihead">
                <span className="s16-i-reason">Reason</span>
                <span className="s16-i-a">in-house</span>
                <span className="s16-i-b">granite-8b-qiskit</span>
              </div>
              {INVALID.map(([reason, a, b]) => (
                <div key={reason} className="s16-irow">
                  <span className="s16-i-reason st-note">{reason}</span>
                  <span className="s16-i-a mono">{a}</span>
                  <span className="s16-i-b mono">{b}</span>
                </div>
              ))}
              <div className="s16-irow is-total">
                <span className="s16-i-reason">Invalid in total</span>
                <span className="s16-i-a mono">19 · 2%</span>
                <span className="s16-i-b mono">86 · 9%</span>
              </div>
            </div>
          </section>
        </div>
      </Content>
    </Shell>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────── */

/** The q9–q10 block, drawn exactly as the board: CX pairs, RZ/RX boxes, a dashed region. */
function BlockDrawing({ cx, boxes, region }: { cx: number[]; boxes: Box[]; region: string }) {
  return (
    <svg className="s16-drawing" width="300" height="148" viewBox="0 0 300 148" aria-hidden>
      <path d="M30 58H292M30 90H292" fill="none" stroke="#496166" strokeWidth="1.5" />
      <text x="2" y="62" fontFamily="JetBrains Mono" fontSize="11" fill="#ADC5CA">
        q9
      </text>
      <text x="2" y="94" fontFamily="JetBrains Mono" fontSize="11" fill="#ADC5CA">
        q10
      </text>
      <rect className="s16-region" x="94" y="40" width="128" height="68" rx="2" fill="none" stroke={region} strokeWidth="1.5" strokeDasharray="4 3" />
      {cx.map((x) => (
        <g key={x} className="s16-gate">
          <path d={`M${x} 58V99`} fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          <circle cx={x} cy="58" r="4.5" fill="#FFFFFF" />
          <circle cx={x} cy="90" r="9" fill="#0F1F23" stroke="#FFFFFF" strokeWidth="1.5" />
          <path d={`M${x - 9} 90H${x + 9}M${x} 81V99`} fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
        </g>
      ))}
      {boxes.map((b) => (
        <g key={`${b.x}-${b.y}`} className="s16-gate">
          <rect x={b.x} y={b.y} width="24" height="22" rx="2" fill="#0F1F23" stroke={b.changed ? '#B3ACFC' : '#C2DADF'} strokeWidth="1.5" />
          <text x={b.x + 12} y={b.y + 15} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Verdict({ status, value }: { status: 'accepted' | 'rejected' | 'invalid'; value: string }) {
  return (
    <span className="s16-verdict st-swap">
      <span className={`s16-verdict-word is-${status}`}>
        {status === 'accepted' ? <GlyphAccepted size={12} /> : status === 'rejected' ? <GlyphRejected size={12} /> : <InvalidGlyph size={12} />}
        {status}
      </span>
      <span className="mono">{value}</span>
    </span>
  )
}

function BenchSet() {
  return (
    <div className="s16-set">
      <div className="s16-set-row s16-set-head">
        <span className="s16-s-circuit">Circuit</span>
        <span className="s16-s-num">Blocks</span>
        <span className="s16-s-num">Widths</span>
        <span className="s16-s-num">in-house</span>
        <span className="s16-s-num s16-s-wide">granite-8b-qiskit</span>
      </div>
      {BENCH_SET.map((r, i) => (
        <div key={r.circuit} className="s16-set-row st-land" style={{ '--i': i } as CSSProperties}>
          <span className="s16-s-circuit mono">{r.circuit}</span>
          <span className="s16-s-num mono">{r.blocks}</span>
          <span className="s16-s-num mono">{r.widths}</span>
          <span className="s16-s-num mono">{r.inhouse}</span>
          <span className="s16-s-num s16-s-wide mono">{r.granite}</span>
        </div>
      ))}
      <p className="st-note s16-set-note">Six more circuits hold the other 35 blocks. Every model sees the same blocks and the same 8 seeds.</p>
    </div>
  )
}

function GpuMemory({ loaded, offline }: { loaded: boolean; offline: boolean }) {
  const inhouse = loaded && !offline ? 3.1 : 0
  const granite = offline ? 0 : 9.4
  const free = 48 - inhouse - granite
  const px = (gb: number) => Math.round((gb / 48) * 348)
  return (
    <InspSection icon={<IconGpu />} title="GPU memory" meta={offline ? 'offline' : `${(inhouse + granite).toFixed(1)} of 48 GB`} bodyStyle={{ gap: 12 }}>
      <div className="s16-mem-bar">
        <span className="s16-mem-seg s16-grow" style={{ width: px(inhouse), background: '#FFFFFF' }} />
        <span className="s16-mem-seg s16-grow" style={{ width: px(granite), background: '#667E83', '--i': 1 } as CSSProperties} />
      </div>
      <div className="st-kv">
        <div className="st-kv-row s16-mem-row">
          <span className="s16-swatch" style={{ background: '#FFFFFF' }} />
          <span className="mono s16-mem-name">in-house block model</span>
          <span className="mono st-kv-value">{inhouse ? `${inhouse} GB` : 'not loaded'}</span>
        </div>
        <div className="st-kv-row s16-mem-row">
          <span className="s16-swatch" style={{ background: '#667E83' }} />
          <span className="mono s16-mem-name">granite-8b-qiskit</span>
          <span className="mono st-kv-value">{granite ? `${granite} GB` : 'off'}</span>
        </div>
        <div className="st-kv-row s16-mem-row is-last">
          <span className="s16-swatch is-free" />
          <span className="s16-mem-name st-note">Free</span>
          <span className="mono st-kv-value">{free.toFixed(1)} GB</span>
        </div>
      </div>
    </InspSection>
  )
}

/** Pick another block: only D04 fits the model this round; the others say why. */
function BlockMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])
  const items = [
    { id: 'D04', label: 'D04 · q9–q10 · 10 gates', note: 'open now', enabled: true },
    { id: 'D03', label: 'D03 · q3–q6', note: 'resolved in round 3', enabled: false },
    { id: 'D01', label: 'D01 · routing', note: 'not a block', enabled: false },
  ]
  return (
    <ul className="st-menu s16-menu" role="listbox" ref={ref}>
      {items.map((it) => (
        <li key={it.id}>
          <button className={`st-menu-item s16-menu-item${it.id === 'D04' ? ' is-current' : ''}`} disabled={!it.enabled} onClick={onClose} role="option" aria-selected={it.id === 'D04'}>
            <span>{it.label}</span>
            <span className="s16-menu-note">{it.note}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function StateIntro({
  icon,
  word,
  wordColor,
  title,
  code,
  children,
}: {
  icon: React.ReactNode
  word: string
  wordColor: string
  title: string
  code?: string
  children: React.ReactNode
}) {
  return (
    <div className="s16-intro s16-state" role="status">
      <div className="s16-state-line">
        {icon}
        <span className="s16-state-word" style={{ color: wordColor }}>
          {word}
        </span>
        <span className="s16-state-title">{title}</span>
        {code && (
          <>
            <span style={{ flex: '1 1 0' }} />
            <span className="mono s16-dim">{code}</span>
          </>
        )}
      </div>
      <div className="st-note s16-state-text">{children}</div>
    </div>
  )
}

function OfflineStatus() {
  return (
    <>
      <GpuStatus online={false} />
      <span className="mono">job 7f3a·0412</span>
      <span className="mono stretch-marker">stretch</span>
    </>
  )
}

function SparkGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M7 1.5v3M7 9.5v3M1.5 7h3M9.5 7h3M3.2 3.2l1.8 1.8M9 9l1.8 1.8M10.8 3.2L9 5M5 9l-1.8 1.8"
        fill="none"
        stroke="#B3ACFC"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
function PassesGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="3.5" fill="#2EA3F8" />
    </svg>
  )
}
function InvalidGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path d="M3.5 7h7" fill="none" stroke="#C2DADF" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function NotLoadedGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeDasharray="2 2" />
    </svg>
  )
}
function OfflineDot() {
  return (
    <span className="s16-offline-dot-box">
      <span className="s16-offline-dot" />
    </span>
  )
}
function IconBlockModel() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M1.5 4.5h3M13.5 4.5h3M1.5 9h3M13.5 9h3M1.5 13.5h3M13.5 13.5h3" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 2.5h9v13h-9z" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7.5 7.5l1.5 1.5 1.5-1.5" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconGpu() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M2.5 5.5h13v7h-13zM5 12.5v2M9 12.5v2M13 12.5v2M5.5 8h2v2h-2zM10.5 8h2v2h-2z" fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
