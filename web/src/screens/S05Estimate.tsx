/*
 * S-05 · Machine estimate (B2). What the current circuit would cost on five fake IBM backends.
 * Bars fill left to right, 40 ms apart, on enter; choosing a backend moves the yellow row
 * (click, or arrow keys and Enter).
 *
 * States (?state=…): empty, loading, focus, error.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { RUN } from '../data/demo'
import { useRun } from '../data/run'
import { Chevron } from '../ui/icons'
import { EditorButton, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, TileHeader } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import './estimate/estimate.css'

type StateParam = 'empty' | 'loading' | 'focus' | 'error' | null

const BACKENDS = [
  { name: 'FakeTorino', qubits: 133, rel: 0.741, bar: 296, time: '3.5 s', cost: '$5.60' },
  { name: 'FakeSherbrooke', qubits: 127, rel: 0.612, bar: 245, time: '4.7 s', cost: '$7.52' },
  { name: 'FakeKyiv', qubits: 127, rel: 0.587, bar: 235, time: '5.0 s', cost: '$8.00' },
  { name: 'FakeBrisbane', qubits: 127, rel: 0.503, bar: 201, time: '5.7 s', cost: '$9.12' },
  { name: 'FakeOsaka', qubits: 127, rel: 0.466, bar: 186, time: '6.1 s', cost: '$9.76' },
]

const BEFORE_AFTER = [
  { label: 'two_qubit_count', from: '44 →', to: '36', unit: 'gates' },
  { label: 'reliability_heuristic', from: '0.692 →', to: '0.741' },
  { label: 'QPU time per run', from: '4.2 →', to: '3.5', unit: 's' },
  { label: 'Estimated cost per run', from: '$6.72 →', to: '$5.60' },
]

const BY_ROUND = [
  { label: 'baseline', width: '100%', cost: '$6.72', gates: '44 gates' },
  { label: 'round 1', width: '92%', cost: '$6.16', gates: '40 gates' },
  { label: 'round 2', width: '83%', cost: '$5.60', gates: '36 gates', current: true },
]

export function S05Estimate() {
  const run = useRun()
  const state = (useHashParams().get('state') as StateParam) ?? null
  const [mode, setMode] = useState<'laptop' | 'platform'>('laptop')
  const [chosen, setChosen] = useState(0)
  const [tab, setTab] = useState<'estimate' | 'coupling'>('estimate')
  const [open, setOpen] = useState({ rates: true, why: true, lands: true })
  const rows = useRef<(HTMLDivElement | null)[]>([])

  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  const onKey = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(BACKENDS.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))
      rows.current[next]?.focus()
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setChosen(i)
    }
  }

  // The empty state is about sbox_oracle; the whole screen follows it.
  const sbox = state === 'empty'
  const loopLabel = sbox ? 'Queued · GPU position 1' : `Running round ${run.round} of 4 (${Math.round(run.loopProgress * 100)}%)`
  const meta =
    state === 'loading'
      ? 'estimating 3 of 5 backends · 4,000 shots'
      : sbox
        ? 'sbox_oracle · 20 q · 118 two-qubit gates · 4,000 shots'
        : 'current circuit · after round 2 · 36 two-qubit gates · 4,000 shots'

  const inspector = (
    <>
      <ModeTabs active={mode} onChange={setMode} />
      <ModeBlock line="Estimated on this machine · no QPU used">
        <PrimaryButton
          name="primary-action"
          progress={sbox ? undefined : run.loopProgress}
          onClick={sbox ? undefined : () => navigate(ROUTES.loop, { transition: 'forward' })}
        >
          {loopLabel}
        </PrimaryButton>
        <PoweredBy />
      </ModeBlock>
      <div className="est-insp">
        <InspSection
          title="Rates and assumptions"
          open={open.rates}
          onToggle={() => toggle('rates')}
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="9" cy="9" r="6.5" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <path
                d="M9 5.5v7M11 7c-.4-.7-1.1-1-2-1-1.1 0-2 .6-2 1.5S7.9 9 9 9s2 .6 2 1.5-.9 1.5-2 1.5c-.9 0-1.6-.3-2-1"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          }
          rows={[
            ['Pay as you go', '$96 / QPU min'],
            ['Free tier', '10 min / month'],
            ['Shots', '4,000'],
            ['Calibration snapshot', 'qiskit-ibm-runtime 0.29'],
            ['Chosen backend', sbox ? 'none · no estimate' : BACKENDS[chosen].name],
          ]}
          after={
            <p className="est-insp-note">
              Estimates come from fake backends, not live machines. Real queues, error mitigation and pricing changes are not
              modeled.
            </p>
          }
        />
        <InspSection
          title={sbox ? 'Why there is no estimate' : 'Why FakeTorino leads'}
          open={open.why}
          onToggle={() => toggle('why')}
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <circle cx="4" cy="9" r="2" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <circle cx="14" cy="4.5" r="2" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <circle cx="14" cy="13.5" r="2" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
              <path d="M6 8l6-3M6 10l6 3" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
            </svg>
          }
          rows={
            sbox
              ? [
                  ['Links the circuit needs', 'all-to-all · 20 q'],
                  ['Two-qubit gates', '118 before routing'],
                  ['SWAPs after routing', 'past 400 on every backend'],
                  ['Estimate', 'withheld, not zero'],
                ]
              : [
                  ['Native two-qubit gate', 'CZ'],
                  ['Median CZ error', '2.6e-3'],
                  ['Median readout error', '1.9e-2'],
                  ['SWAPs after routing', '14 ops'],
                ]
          }
        />
        <InspSection
          title="Where the circuit lands"
          meta="seed 11"
          open={open.lands}
          onToggle={() => toggle('lands')}
          icon={
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M9 2.5l5.6 3.25v6.5L9 15.5l-5.6-3.25v-6.5z" fill="none" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="9" cy="9" r="1.6" fill="#FFFFFF" />
            </svg>
          }
          rows={[
            ['Lattice', 'heavy-hex · degree ≤ 3'],
            ['Physical qubits used', sbox ? '20 of 133' : '12 of 133'],
            ['Pairs that need a SWAP', sbox ? 'most of them' : '5 of 11'],
          ]}
          after={
            <div className="est-insp-action">
              <EditorButton onClick={() => setTab('coupling')}>Open coupling map</EditorButton>
            </div>
          }
        />
      </div>
    </>
  )

  return (
    <Shell
      rail="runs"
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: RUN.file, active: !sbox, onClick: () => navigate(ROUTES.workspace, { transition: 'back' }) },
            { id: 'b', label: RUN.other, active: sbox },
          ]}
        />
      }
      inspector={inspector}
    >
      <Content>
        <section className="tile est-tile">
          <TileHeader
            tabs={[
              { id: 'estimate', label: 'Machine estimate', active: tab === 'estimate', onClick: () => setTab('estimate') },
              { id: 'coupling', label: 'Coupling map', active: tab === 'coupling', onClick: () => setTab('coupling') },
            ]}
            meta={<span className="mono">{meta}</span>}
          />
          {tab === 'coupling' ? (
            <CouplingMap />
          ) : (
            <div className="est-body">
              <div className="est-intro">
                <h2 className="est-title">A circuit that fails on hardware wastes the time you paid for.</h2>
                <p className="est-lead">
                  Fake backends are snapshots of real IBM machines: their connectivity, native gates and noise. Cost uses the
                  published pay-as-you-go rate of $96 per QPU minute.
                </p>
              </div>

              {state === 'empty' ? (
                <div className="est-unsupported">
                  <div className="est-unsupported-head">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                      <circle cx="7" cy="7" r="4.5" fill="none" stroke="#C2DADF" strokeWidth="1.4" />
                      <path d="M4 10l6-6" fill="none" stroke="#C2DADF" strokeWidth="1.4" />
                    </svg>
                    <span>unsupported</span>
                  </div>
                  <p className="est-unsupported-body">
                    No estimate for this circuit. sbox_oracle needs 20 q with all-to-all links; every fake backend here routes it
                    past 400 SWAPs, and the heuristic is not meaningful that far out.
                  </p>
                  <p className="est-unsupported-note">The scorecard still holds. Hardware rows show their reason instead of a number.</p>
                </div>
              ) : null}
              {state === 'empty' ? (
                <>
                  <div className="est-table">
                    <div className="est-row is-head">
                      <span className="est-c-name">Backend</span>
                      <span className="est-c-q">Qubits</span>
                      <span className="est-c-rel">reliability_heuristic</span>
                      <span className="est-c-time">QPU time</span>
                      <span className="est-c-cost">Estimated cost</span>
                    </div>
                    {BACKENDS.map((b) => (
                      <div key={b.name} className="est-row is-unsupported">
                        <span className="est-c-name mono">{b.name}</span>
                        <span className="est-c-q mono">{b.qubits} q</span>
                        <span className="est-c-rel mono est-reason">routes past 400 SWAPs</span>
                        <span className="est-c-time mono est-reason">n/a</span>
                        <span className="est-c-cost mono est-reason">n/a</span>
                      </div>
                    ))}
                  </div>
                  <section className="est-section">
                    <div className="est-section-head">
                      <h3>What still holds for sbox_oracle</h3>
                      <span className="mono">from the scorecard · run 7f37·a2e4</span>
                    </div>
                    <div className="est-cards">
                      {[
                        ['width', '20', 'q'],
                        ['two_qubit_count', '118', 'gates'],
                        ['depth', '212', 'layers'],
                        ['routing_overhead', '0.52', 'ratio'],
                      ].map(([label, to, unit]) => (
                        <div key={label} className="est-card">
                          <span className="est-card-label">{label}</span>
                          <span className="est-card-values">
                            <span className="mono est-card-to">{to}</span>
                            <span className="mono est-card-unit">{unit}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="est-section-note">Fewer two-qubit gates also shrink the routing problem. Once sbox_oracle routes under 400 SWAPs, an estimate appears here.</p>
                  </section>
                </>
              ) : (
                <div className="est-table">
                  {state === 'error' && (
                    <div className="est-error">
                      <div className="est-error-head">
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                          <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                        <span className="est-error-title">FakeKyiv snapshot not cached</span>
                        <span className="est-error-spacer" />
                        <span className="mono est-error-code">Q412</span>
                      </div>
                      <p className="est-error-body">
                        You are offline and this backend's calibration was never downloaded. The other 4 are estimated from cached
                        snapshots.
                      </p>
                    </div>
                  )}
                  <div className="est-row is-head">
                    <span className="est-c-name">Backend</span>
                    <span className="est-c-q">Qubits</span>
                    <span className="est-c-rel">reliability_heuristic</span>
                    <span className="est-c-time">QPU time</span>
                    <span className="est-c-cost">Estimated cost</span>
                  </div>
                  {BACKENDS.map((b, i) => {
                    const isChosen = i === chosen
                    const loadingNow = state === 'loading' && i === 2
                    const queued = state === 'loading' && i > 2
                    const missing = state === 'error' && i === 2
                    const focusRing = state === 'focus' && i === 1
                    return (
                      <div
                        key={b.name}
                        ref={(el) => {
                          rows.current[i] = el
                        }}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isChosen}
                        className={`est-row${isChosen ? ' is-chosen' : ''}${queued ? ' is-queued' : ''}${focusRing ? ' is-focus' : ''}`}
                        onClick={() => setChosen(i)}
                        onKeyDown={onKey(i)}
                      >
                        <span className="est-c-name mono">{b.name}</span>
                        <span className="est-c-q mono">{queued || loadingNow || missing ? '' : `${b.qubits} q`}</span>
                        <span className="est-c-rel">
                          {loadingNow ? (
                            <span className="est-progress mono">● routing · seed 4 of 8</span>
                          ) : queued ? (
                            <span className="est-queued mono">○ queued</span>
                          ) : missing ? (
                            <span className="est-missing">
                              <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
                                <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
                              </svg>
                              snapshot not cached · Q412
                            </span>
                          ) : (
                            <>
                              <span className="est-bar">
                                <span
                                  className="est-bar-fill"
                                  style={{ width: b.bar, animationDelay: `${i * 40}ms` } as CSSProperties}
                                />
                              </span>
                              <span className="est-rel mono">{b.rel.toFixed(3)}</span>
                            </>
                          )}
                        </span>
                        <span className="est-c-time mono">
                          {focusRing ? <span className="est-hint">Enter chooses it</span> : queued || loadingNow || missing ? '' : b.time}
                        </span>
                        <span className="est-c-cost mono">{queued || loadingNow || missing ? '' : b.cost}</span>
                      </div>
                    )
                  })}
                  <p className="est-footnote">
                    reliability_heuristic: calibration-based reliability heuristic, not a success probability. Cost is an estimate
                    from QPU time at $96 per minute, not a quote.
                  </p>
                </div>
              )}

              {state !== 'empty' && (
                <>
                  <section className="est-section">
                    <div className="est-section-head">
                      <h3>On {BACKENDS[0].name}, baseline to now</h3>
                      <span className="mono">same seeds · same shots</span>
                    </div>
                    <div className="est-cards">
                      {BEFORE_AFTER.map((c) => (
                        <div key={c.label} className="est-card">
                          <span className="est-card-label">{c.label}</span>
                          <span className="est-card-values">
                            <span className="mono est-card-from">{c.from}</span>
                            <span className="mono est-card-to">{c.to}</span>
                            {c.unit && <span className="mono est-card-unit">{c.unit}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="est-section-note">
                      At 100 runs a month the fixes so far save about $112 of QPU time. The free tier's 10 minutes now covers 171
                      runs instead of 142.
                    </p>
                  </section>
                  <section className="est-section">
                    <div className="est-section-head">
                      <h3>Estimated cost by round</h3>
                      <span className="mono">FakeTorino · per run</span>
                    </div>
                    {BY_ROUND.map((r, i) => (
                      <div key={r.label} className="est-round">
                        <span className={`mono est-round-label${r.current ? ' is-current' : ''}`}>{r.label}</span>
                        <span className="est-round-track">
                          <span
                            className={`est-round-fill${r.current ? ' is-current' : ''}`}
                            style={{ width: r.width, animationDelay: `${(BACKENDS.length + i) * 40}ms` }}
                          />
                        </span>
                        <span className="mono est-round-cost">{r.cost}</span>
                        <span className="mono est-round-gates">{r.gates}</span>
                      </div>
                    ))}
                    <div className="est-round">
                      <span className="mono est-round-label is-pending">round 3</span>
                      <span className="est-round-track is-pending" />
                      <span className="mono est-round-cost is-running">● running</span>
                      <span className="mono est-round-gates">{Math.round(run.loopProgress * 100)}%</span>
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </section>
      </Content>
    </Shell>
  )
}

function InspSection({
  title,
  meta,
  icon,
  open,
  onToggle,
  rows,
  after,
}: {
  title: string
  meta?: string
  icon: ReactNode
  open: boolean
  onToggle: () => void
  rows: [string, string][]
  after?: ReactNode
}) {
  return (
    <section className="est-insp-section">
      <button className="est-insp-head" aria-expanded={open} onClick={onToggle}>
        {icon}
        <span className="est-insp-title">{title}</span>
        {meta && <span className="mono est-insp-meta">{meta}</span>}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="est-insp-body">
          {rows.map(([k, v], i) => (
            <div key={k} className={`est-insp-row${i === rows.length - 1 ? ' is-last' : ''}`}>
              <span className="est-insp-k">{k}</span>
              <span className="mono est-insp-v">{v}</span>
            </div>
          ))}
          {after}
        </div>
      )}
    </section>
  )
}

/** Coupling map: FakeTorino's heavy-hex lattice around the 12 qubits the circuit lands on (seed 11). */
function CouplingMap() {
  const cols = 15
  const rowsN = 7
  const pos = (r: number, c: number) => ({ x: 60 + c * 44, y: 56 + r * 32 })
  // heavy-hex: full rows on even r, bridge qubits every 4th column on odd r (offset by 2 on alternate bands)
  const ids: [number, number][] = []
  for (let r = 0; r < rowsN; r++) {
    if (r % 2 === 0) for (let c = 0; c < cols; c++) ids.push([r, c])
    else for (let c = r % 4 === 1 ? 0 : 2; c < cols; c += 4) ids.push([r, c])
  }
  const edges: [string, string][] = []
  for (let r = 0; r < rowsN; r += 2) for (let c = 0; c < cols - 1; c++) edges.push([`${r}-${c}`, `${r}-${c + 1}`])
  for (const [r, c] of ids.filter(([r]) => r % 2 === 1)) {
    edges.push([`${r - 1}-${c}`, `${r}-${c}`])
    if (r + 1 < rowsN) edges.push([`${r}-${c}`, `${r + 1}-${c}`])
  }
  const used = new Set(['1-8', '2-5', '2-6', '2-7', '2-8', '2-9', '3-6', '4-5', '4-6', '4-7', '4-8', '4-9'])
  const swaps = new Set(['2-5|2-6', '2-6|3-6', '3-6|4-6', '4-8|4-9', '2-8|2-9'])
  const at = (id: string) => {
    const [r, c] = id.split('-').map(Number)
    return pos(r, c)
  }
  return (
    <div className="est-map">
      <svg width="700" height="300" viewBox="0 0 700 300" aria-label="FakeTorino coupling map, the 12 used qubits highlighted">
        {edges.map(([a, b]) => {
          const pa = at(a)
          const pb = at(b)
          const swap = swaps.has(`${a}|${b}`)
          const both = used.has(a) && used.has(b)
          return (
            <line
              key={`${a}|${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={swap ? '#FF3478' : both ? '#C2DADF' : '#354348'}
              strokeWidth={swap ? 2 : 1.5}
              strokeDasharray={swap ? '4 3' : undefined}
            />
          )
        })}
        {ids.map(([r, c]) => {
          const id = `${r}-${c}`
          const on = used.has(id)
          const p = pos(r, c)
          return <circle key={id} cx={p.x} cy={p.y} r={on ? 6 : 4} fill={on ? '#FFFFFF' : '#496166'} />
        })}
      </svg>
      <div className="est-map-legend">
        <span>
          <i className="est-dot" /> 12 used qubits
        </span>
        <span>
          <i className="est-swap" /> 5 pairs that need a SWAP
        </span>
        <span className="mono">FakeTorino · 133 q · heavy-hex · seed 11</span>
      </div>
    </div>
  )
}
