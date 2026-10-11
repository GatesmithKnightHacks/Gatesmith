/*
 * S-03 · Pre-flight (Paper 175Y-0, states 1ODU-0). What the engine understood, the plan and its cost,
 * and the validation. Nothing runs until "Confirm and score". Auto mode is off in the canonical run
 * (the user accepts each verified fix).
 * States at #/preflight?state=issues | rejected | impractical | loading | offline | gpu-off | focus.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { GPU_OFF_MESSAGE } from '../data/demo'
import { actions } from '../data/run'
import { EditorButton, ModeTabs, PrimaryButton, Tile } from '../ui/parts'
import { GpuStatus, Shell } from '../ui/Shell'
import { SboxCanvas, SidechainCanvas } from './intake/canvases'
import { AccountHandle, Banner, Facts, Glyph, InspSection, IntakeTabs, RunBlock, Shim, Spinner } from './intake/kit'
import { useOnline } from './intake/online'
import './intake/s03.css'

type S03State = 'clean' | 'issues' | 'rejected' | 'impractical' | 'loading' | 'offline' | 'gpu-off' | 'focus'
type Circuit = 'sidechain' | 'sbox' | 'lattice'

const SECONDS_PER_ROUND = 90

const CHECKS: Record<Exclude<Circuit, 'lattice'>, [string, string, string][]> = {
  sidechain: [
    ['parse', 'OpenQASM 2.0 read in full · 88 lines · 12 q', 'sidechain_qaoa.qasm:1'],
    ['width', '12 qubits fit the 34 qubit simulation limit', 'sidechain_qaoa.qasm:4'],
    ['basis', 'Every gate compiles to cz rz sx x', 'target.basis'],
    ['manifest', 'qscore.yaml matches the schema', 'qscore.yaml'],
    ['task', 'Expectation task names its observable, cost_hamiltonian', 'qscore.yaml:7'],
    ['budget', '8 seeds and 4 rounds fit the 900 s wall time', 'qscore.yaml:22'],
    ['metrics', 'two_qubit_count can be computed on FakeTorino', 'qscore.yaml:16'],
  ],
  sbox: [
    ['parse', 'OpenQASM 2.0 read in full · 214 lines · 20 q', 'sbox_oracle.qasm:1'],
    ['width', '20 qubits fit the 34 qubit simulation limit', 'sbox_oracle.qasm:4'],
    ['basis', 'Every gate compiles to cz rz sx x', 'target.basis'],
    ['manifest', 'qscore.yaml matches the schema', 'qscore.yaml'],
    ['task', 'Reversible task checks every input', 'qscore.yaml:7'],
    ['budget', '8 seeds and 4 rounds fit the 900 s wall time', 'qscore.yaml:22'],
    ['metrics', 'two_qubit_count can be computed on FakeTorino', 'qscore.yaml:16'],
  ],
}

const icons = {
  budget: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 5.5V9l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  item: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M4.5 2.5h6l3 3v10h-9z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10.5 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  high: (
    <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2v6M7 11v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  caret: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 3.5L5 6.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

export function S03Preflight() {
  const params = useHashParams()
  const forced = (params.get('state') ?? 'clean') as S03State
  return <Preflight key={forced} forced={forced} />
}

function Preflight({ forced }: { forced: S03State }) {
  const online = useOnline()
  const circuit: Circuit = forced === 'rejected' ? 'lattice' : forced === 'impractical' ? 'sbox' : 'sidechain'
  const loading = forced === 'loading'
  const offline = forced === 'offline' || !online
  const gpuOff = forced === 'gpu-off'

  const [applied, setApplied] = useState(false)
  const [rounds, setRounds] = useState(forced === 'issues' ? '40' : '4')
  const [seeds, setSeeds] = useState('8')
  const [wall, setWall] = useState('900')
  const [auto, setAuto] = useState(false)
  const [limits, setLimits] = useState(false)
  const target = useRef<HTMLSelectElement>(null)
  const firstIssue = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (forced === 'focus') target.current?.focus()
    if (forced === 'issues') firstIssue.current?.focus()
  }, [forced])

  const highOpen = forced === 'issues' && !applied
  const roundsOver = Number(rounds) * SECONDS_PER_ROUND > Number(wall)
  const warnings = roundsOver ? 1 : 0
  const blocked = highOpen || circuit === 'lattice' || loading

  const file = circuit === 'sidechain' ? 'sidechain_qaoa.qasm' : circuit === 'sbox' ? 'sbox_oracle.qasm' : 'lattice_41q.qasm'
  const item = circuit === 'sidechain' ? 'packing_qaoa_p2' : circuit === 'sbox' ? 'sbox_oracle' : 'lattice_41q'

  const runLine = loading
    ? 'Reading the circuit · about 2 s'
    : circuit === 'lattice'
      ? 'Nothing to confirm · the circuit is over the limit'
      : highOpen
        ? 'Confirm waits for 1 high issue · warnings do not block'
        : circuit === 'sbox'
          ? 'Runs on this machine · CPU · about 26 min'
          : gpuOff
            ? 'Runs on this machine · CPU · scoring about 40 s'
            : 'Runs on this machine · CPU · about 40 s'

  const validationMeta = loading
    ? 'checking · 0 of 7 done'
    : circuit === 'lattice'
      ? 'rejected · 1 issue'
      : circuit === 'sbox'
        ? '1 issue · 1 warning · sbox_oracle.qasm'
        : highOpen || warnings
          ? `${(highOpen ? 1 : 0) + warnings} issue${(highOpen ? 1 : 0) + warnings === 1 ? '' : 's'} · ${highOpen ? '1 high' : '0 high'}${warnings ? ' · 1 warning' : ''}`
          : '0 issues · 7 checks · schema qscore-2026.1'

  return (
    <Shell
      rail="new"
      status={
        gpuOff ? (
          <>
            <span className="pf-gpu-off">
              <span className="pf-gpu-off-dot" />
              {GPU_OFF_MESSAGE}
            </span>
            <AccountHandle />
          </>
        ) : (
          <>
            <GpuStatus online />
            <AccountHandle />
          </>
        )
      }
      tabs={<IntakeTabs label={file} />}
      inspector={
        <div className="ink-scope pf-insp">
          <ModeTabs />
          <RunBlock center line={runLine}>
            <PrimaryButton disabled={blocked} onClick={() => actions.confirmAndScore()} name="primary-action">
              Confirm and score
            </PrimaryButton>
          </RunBlock>
          <InspSection icon={icons.budget} title="Budget" meta="from qscore.yaml" ruled={false} bodyClassName="pf-budget">
            <label className="pf-field-row">
              <span className="pf-field-label">Target</span>
              <span className="pf-field is-select">
                <select ref={target} className="mono" defaultValue="FakeTorino" aria-label="Target">
                  <option value="FakeTorino">FakeTorino · 133 q</option>
                  <option value="FakeKyiv">FakeKyiv · 127 q</option>
                  <option value="FakeSherbrooke">FakeSherbrooke · 127 q</option>
                </select>
                {icons.caret}
              </span>
            </label>
            <NumberField label="Seeds" unit="seeds" value={seeds} onChange={setSeeds} />
            <NumberField label="Max rounds" unit="rounds" value={rounds} onChange={setRounds} warn={roundsOver} />
            <NumberField label="Wall time" unit="s" value={wall} onChange={setWall} warn={roundsOver} />
            {roundsOver && (
              <div className="pf-field-msg ink-fade-in" role="status">
                about {SECONDS_PER_ROUND} s per round · {rounds} rounds need {Number(rounds) * SECONDS_PER_ROUND} s
              </div>
            )}
            <div className="pf-check-row">
              <button role="checkbox" aria-checked={auto} className={`pf-checkbox${auto ? ' is-on' : ''}`} onClick={() => setAuto((a) => !a)} aria-label="Auto mode">
                {auto && icons.check}
              </button>
              <span>Auto mode · never keeps a worse circuit</span>
            </div>
          </InspSection>
          <InspSection icon={icons.item} title="Item" meta={`item id ${item}`}>
            <Facts
              topRule={false}
              labelWidth={84}
              rows={
                circuit === 'sidechain'
                  ? [
                      ['Source', 'qlab/sidechain-packing@4e1c2a9'],
                      ['Circuit', 'circuits/sidechain_qaoa.qasm'],
                      ['Manifest', 'qscore.yaml · 9c41…e07b'],
                      ['Job', 'created on confirm'],
                    ]
                  : circuit === 'sbox'
                    ? [
                        ['Source', 'bundled example'],
                        ['Circuit', 'sbox_oracle.qasm'],
                        ['Manifest', 'qscore.yaml · drafted'],
                        ['Job', 'created on confirm'],
                      ]
                    : [
                        ['Source', 'dropped file'],
                        ['Circuit', 'lattice_41q.qasm'],
                        ['Manifest', 'qscore.yaml · drafted'],
                        ['Job', 'not created · rejected'],
                      ]
              }
            />
          </InspSection>
        </div>
      }
    >
      <div className="pf-tiles ink-scope">
        <div className="pf-top">
          {/* ── Interpretation ── */}
          <Tile
            className="pf-interp"
            tabs={[{ id: 'interp', label: 'Interpretation', active: true }]}
            meta={<span className="mono">step 3 of 3 · what the engine understood</span>}
            bodyClassName="pf-interp-body"
          >
            <div className="pf-canvas">
              {loading ? (
                <div className="pf-canvas-wait" aria-hidden>
                  {[240, 200, 256, 176, 232, 208].map((w) => (
                    <Shim key={w} w={w} />
                  ))}
                </div>
              ) : circuit === 'lattice' ? (
                <div className="pf-canvas-empty">
                  <span>Not drawn · 41 qubits is over the 34 qubit simulation limit</span>
                </div>
              ) : circuit === 'sbox' ? (
                <SboxCanvas />
              ) : (
                <SidechainCanvas />
              )}
            </div>
            {loading ? (
              <div className="pf-caption is-stage" role="status">
                <Spinner size={14} />
                <span className="pf-stage-word">Reading the circuit</span>
                <span className="mono pf-stage-detail">line 48 of 88</span>
                <span className="mono pf-stage-est">about 2 s</span>
              </div>
            ) : (
              <div className="pf-caption mono">
                {circuit === 'sidechain'
                  ? '12 qubits · QAOA p = 2 · expectation · 2 commuting blocks'
                  : circuit === 'sbox'
                    ? '20 qubits · reversible · 100 toffoli gates'
                    : '41 qubits · lattice model · over the limit'}
              </div>
            )}
          </Tile>

          {/* ── Plan ── */}
          <Tile
            className="pf-plan"
            tabs={[{ id: 'plan', label: 'Plan', active: true }]}
            meta={<span className="mono">{loading ? 'waits for the circuit' : 'estimate · reference-qiskit'}</span>}
            bodyClassName="pf-plan-body"
          >
            <Plan circuit={circuit} loading={loading} seeds={seeds} />
          </Tile>
        </div>

        {/* ── Validation ── */}
        <Tile
          className="pf-validation"
          tabs={[{ id: 'validation', label: 'Validation', active: true }]}
          meta={<span className="mono">{validationMeta}</span>}
          bodyClassName="pf-val-body"
        >
          {offline && (
            <Banner tone="warn" word="offline">
              <span className="ink-banner-grow">You are offline · runs stay on this machine · syncs when the network is back</span>
            </Banner>
          )}
          {loading ? (
            <ChecksTable rows={CHECKS.sidechain} loading />
          ) : circuit === 'lattice' ? (
            <Rejected limits={limits} onLimits={() => setLimits((v) => !v)} />
          ) : circuit === 'sbox' ? (
            <>
              <Banner tone="warn" word="warning">
                <span className="mono pf-banner-where">estimate</span>
                <span className="ink-banner-grow">Scoring takes about 26 min on this machine</span>
              </Banner>
              <div className="pf-reason">
                <div className="pf-reason-row">
                  <span className="pf-reason-label">Reason</span>
                  <span className="mono">1041 two-qubit gates × 8 seeds · equivalence checks on 20 q</span>
                </div>
                <div className="pf-reason-row">
                  <span className="pf-reason-label">Faster</span>
                  <span className="mono">2 seeds · about 7 min · or switch to Platform</span>
                </div>
              </div>
              <ChecksTable rows={CHECKS.sbox} />
            </>
          ) : highOpen || roundsOver ? (
            <>
              {highOpen && (
                <div className="pf-issue-wrap" ref={firstIssue} tabIndex={-1}>
                  <div className="pf-issue is-high">
                    <div className="pf-issue-head">
                      <span className="pf-sev is-high">
                        {icons.high}
                        high
                      </span>
                      <span className="pf-issue-title">Unsupported gate</span>
                      <span className="mono pf-code">(Q102)</span>
                      <span className="mono pf-where">· sidechain_qaoa.qasm line 52, column 1</span>
                    </div>
                    <div>ms is not in qelib1.inc · replace it before scoring</div>
                    <div className="pf-issue-foot">
                      <span className="pf-hint-label">Did you mean</span>
                      <span className="mono pf-hint">rzz(0.7854) q[0],q[1]; · same angle, in qelib1.inc</span>
                      <EditorButton onClick={() => setApplied(true)}>Apply</EditorButton>
                    </div>
                  </div>
                </div>
              )}
              {roundsOver && (
                <div className="pf-issue is-warn ink-fade-in">
                  <div className="pf-issue-head">
                    <span className="pf-sev is-warn">
                      <Glyph kind="warn" />
                      warning
                    </span>
                    <span className="mono pf-where">qscore.yaml line 22</span>
                  </div>
                  <div>
                    max_rounds: {rounds} cannot finish inside wall_time_s: {wall}
                  </div>
                  <div className="pf-issue-foot">
                    <span className="pf-hint-label">Hint</span>
                    <span className="mono pf-hint">about {SECONDS_PER_ROUND} s per round · use 4 rounds or raise the wall time</span>
                  </div>
                </div>
              )}
              <div className="pf-passed-row">
                <Glyph kind="check" />
                <span>passed</span>
                <span className="mono pf-passed-list">
                  parse · width · manifest · task · metrics{applied ? ' · basis' : ''}
                </span>
                <span className="pf-grow" />
                <span className="mono pf-passed-count">
                  {applied ? 6 : 5} of 7 checks
                </span>
              </div>
            </>
          ) : (
            <>
              <Banner
                tone="good"
                word="No issues"
                action={<EditorButton onClick={() => navigate(ROUTES.repoScan)}>View manifest</EditorButton>}
              >
                <span className="mono pf-banner-where">manifest sha256 9c41…e07b</span>
                <span className="ink-banner-grow" />
              </Banner>
              <ChecksTable rows={CHECKS.sidechain} />
            </>
          )}
        </Tile>
      </div>
    </Shell>
  )
}

function NumberField({ label, unit, value, onChange, warn }: { label: string; unit: string; value: string; onChange: (v: string) => void; warn?: boolean }) {
  return (
    <label className="pf-field-row">
      <span className="pf-field-label">{label}</span>
      <span className={`pf-field${warn ? ' is-warn' : ''}`}>
        <input
          className="mono"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          aria-label={label}
          aria-invalid={warn || undefined}
        />
        <span className="mono pf-field-unit">{unit}</span>
      </span>
    </label>
  )
}

function PlanRow({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div className="pf-plan-row">
      <span className="pf-plan-label">{label}</span>
      <span className={`mono pf-plan-value${tone ? ` is-${tone}` : ''}`}>{value}</span>
      {note != null && <span className="mono pf-plan-note">{note}</span>}
    </div>
  )
}

function Plan({ circuit, loading, seeds }: { circuit: Circuit; loading: boolean; seeds: string }) {
  const n = Number(seeds) || 8
  const wait = (w: number) => <Shim w={w} />
  return (
    <>
      <div className="pf-plan-group is-first">compile</div>
      <PlanRow label="Device" value="FakeTorino" note="133 q · cz rz sx x" />
      <PlanRow label="Method" value={loading ? wait(120) : `level 3 compile × ${n} seeds`} note={loading ? undefined : 'engine · deterministic'} />
      <PlanRow label="Seeds" value={`best of ${n}`} note={loading ? undefined : 'seed spread reported'} />
      <div className="pf-plan-group">cost on this machine</div>
      {circuit === 'lattice' ? (
        <>
          <PlanRow label="Memory" value="35.2 TB" note="of 24.0 GB free" tone="bad" />
          <PlanRow label="Estimated time" value="not run" note="rejected before scoring" />
        </>
      ) : (
        <>
          <PlanRow label="Memory" value={loading ? wait(56) : circuit === 'sbox' ? '16.8 GB' : '1.2 GB'} note={loading ? undefined : 'of 24.0 GB free'} />
          <PlanRow
            label="Estimated time"
            value={loading ? wait(72) : circuit === 'sbox' ? 'about 26 min' : 'about 40 s'}
            note={loading ? undefined : 'score only · fix rounds use the budget'}
            tone={circuit === 'sbox' ? 'warn' : undefined}
          />
        </>
      )}
      <div className="pf-plan-group">scope</div>
      <PlanRow label="Primary metric" value="two_qubit_count" note="lower is better" />
      <PlanRow label="Rules" value="D01 to D08" note="D09 D10 not evaluated" />
      <div className="pf-plan-row is-tall">
        <span className="pf-plan-label">Will not be checked</span>
        {loading ? (
          <span className="pf-plan-value">{wait(136)}</span>
        ) : (
          <div className="pf-nc">
            <div className="pf-nc-row">
              <span className="mono pf-nc-name">simulated_task_score</span>
              <Glyph kind="ring" size={8} />
              <span className="pf-nc-status">unavailable</span>
              <span className="mono pf-nc-why">not in the MVP build</span>
            </div>
            <div className="pf-nc-row">
              <span className="mono pf-nc-name">mirror_score</span>
              <Glyph kind="ring" size={8} />
              <span className="pf-nc-status">skipped</span>
              <span className="mono pf-nc-why">not selected</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ChecksTable({ rows, loading }: { rows: [string, string, string][]; loading?: boolean }) {
  return (
    <div className="pf-table" role="table" aria-label="Validation checks">
      <div className="pf-thead" role="row">
        <span className="pf-col-status">status</span>
        <span className="pf-col-check">check</span>
        <span className="pf-col-result">result</span>
        <span>location</span>
      </div>
      {rows.map(([check, result, where], i) => {
        const state = !loading ? 'passed' : i === 0 ? 'running' : 'queued'
        return (
          <div key={check} className={`pf-trow is-${state}`} role="row">
            <span className="pf-col-status pf-status">
              {state === 'passed' ? <Glyph kind="check" /> : state === 'running' ? <Spinner size={14} /> : <Glyph kind="ring" size={8} />}
              {state}
            </span>
            <span className="mono pf-col-check">{check}</span>
            <span className="pf-col-result">{state === 'passed' ? result : state === 'running' ? 'reading line 48 of 88' : <Shim w={180 + ((i * 47) % 120)} />}</span>
            <span className="mono pf-where-col">{state === 'queued' ? <Shim w={96} /> : where}</span>
          </div>
        )
      })}
    </div>
  )
}

function Rejected({ limits, onLimits }: { limits: boolean; onLimits: () => void }) {
  return (
    <>
      <Banner tone="bad" word="rejected">
        <span>Circuit wider than the target</span>
        <span className="mono pf-code">(Q103)</span>
        <span className="mono pf-where">· lattice_41q.qasm line 4 · use a smaller circuit</span>
      </Banner>
      <div className="pf-reject">
        <div className="pf-reject-title">Needs 41 simulated qubits; this machine has 34</div>
        <div className="mono pf-reject-detail">statevector for 41 q needs 35.2 TB · 24.0 GB free</div>
      </div>
      <div className="pf-reject-foot">
        <span className="pf-grow">Come back with a smaller circuit</span>
        <EditorButton onClick={onLimits}>
          <span className={`pf-limits-label${limits ? ' is-open' : ''}`}>
            Read size limits
            {icons.caret}
          </span>
        </EditorButton>
      </div>
      {limits && (
        <div className="pf-limits ink-fade-in">
          <Facts
            labelWidth={160}
            rows={[
              ['Statevector', '34 q · 24.0 GB free on this machine'],
              ['Compile only', 'up to 133 q · FakeTorino'],
            ]}
          />
        </div>
      )}
    </>
  )
}
