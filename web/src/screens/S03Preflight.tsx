import { useEffect, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions, useRun } from '../data/run'
import { Chevron } from '../ui/icons'
import { EditorButton, Field, FieldRow, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Switch, Tile } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { QaoaCircuit } from './intake/QaoaCircuit'
import './intake/intake.css'
import './intake/s01.css'
import './intake/s03.css'

const FACTS_L = [
  ['Qubits', '12 q'],
  ['Gates', '72'],
  ['Two-qubit gates', '44'],
  ['Depth', '58'],
]
const FACTS_R = [
  ['Intent', 'expectation'],
  ['Item', 'packing_qaoa_p2'],
  ['Measured', '12 of 12 q'],
  ['Format', 'OpenQASM 2.0'],
]
const PLAN = [
  ['Device', 'FakeTorino · 133 q'],
  ['Method', 'statevector · double'],
  ['Memory', '64 KB of 31 GB'],
  ['Seeds', '11 23 37 41 53 67 79 97'],
  ['Estimated time', 'about 40 s to score'],
  ['Not checked', 'mirror_score · hardware runs'],
]
const CHECKS = [
  ['OpenQASM 2.0 parses', '20 lines'],
  ['Manifest matches the circuit', '12 q · 12 c'],
  ['Fits on the target', '12 of 133 q'],
  ['Simulable on this machine', '12 of 31 q'],
]
const ASSUMPTIONS = [
  ['Bit order', 'Little-endian: q0 is the rightmost bit.'],
  ['Measurement', 'All 12 qubits, read as one 12-bit string from c[12].'],
  ['Equivalence', 'Operator check up to global phase, exact at 12 q.'],
]
const DIAGNOSTICS = [
  ['D01', 'Routing adds more gates than the circuit needs'],
  ['D02', 'Results vary between seeds'],
  ['D03', 'Gates that commute and can be reordered'],
  ['D04', 'Blocks that resynthesize into fewer gates'],
]
const RESOURCES = [
  ['CPU', '8 cores · 40 s'],
  ['GPU', 'needed from round 1 · online'],
  ['Platform queue', 'not used in laptop mode'],
]
const COST = [
  ['QPU time per run', '4.2 s · 4,000 shots'],
  ['Cost per run', '$6.72 at $96/min'],
  ['100 runs', '$672'],
]

type S03State = 'none' | 'validating' | 'issues' | 'rejected' | 'impractical' | 'offline' | 'gpu-off'

const sec = { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4 } as const
const icons = {
  clock: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" {...sec} />
      <path d="M9 5.5V9l2.5 1.5" {...sec} strokeLinecap="round" />
    </svg>
  ),
  chip: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3" y="3" width="12" height="12" rx="1.5" {...sec} />
      <path d="M6.5 6.5h5v5h-5z" {...sec} />
    </svg>
  ),
  dollar: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" {...sec} />
      <path
        d="M9 4.8v8.4M11 6.6H8.2a1.4 1.4 0 0 0 0 2.8h1.6a1.4 1.4 0 0 1 0 2.8H7"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3 7.5l2.5 2.5L11 4.5" fill="none" stroke="#C2DADF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  cross: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M4 4l6 6M10 4l-6 6" fill="none" stroke="#FF3478" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  warn: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  power: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 2v4.5M4.2 4a4.2 4.2 0 105.6 0" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
}

/** A collapsible inspector section whose header lives inside the padded body (S-03 Resources and Cost). */
function InsetSection({ icon, title, meta, children }: { icon: ReactNode; title: string; meta?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="s03-inset-section">
      <button className="s03-inset-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="insp-section-title">{title}</span>
        {meta && <span className="insp-section-meta">{meta}</span>}
        <span className={`s01-chevron${open ? '' : ' is-closed'}`}>
          <Chevron open />
        </span>
      </button>
      <div className={`s01-collapse${open ? ' is-open' : ''}`}>
        <div className="s01-collapse-inner">{children}</div>
      </div>
    </section>
  )
}

function BudgetSection({ auto, setAuto }: { auto: boolean; setAuto: (v: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="insp-section">
      <button className="insp-section-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icons.clock}
        <span className="insp-section-title">Budget</span>
        <span className={`s01-chevron${open ? '' : ' is-closed'}`}>
          <Chevron open />
        </span>
      </button>
      <div className={`s01-collapse${open ? ' is-open' : ''}`}>
        <div className="s01-collapse-inner">
          <div className="s03-fields">
            <FieldRow label="Target">
              <Field value="FakeTorino" select />
            </FieldRow>
            <FieldRow label="Seeds">
              <Field value="8" unit="seeds" />
            </FieldRow>
            <FieldRow label="Max rounds">
              <Field value="4" unit="rounds" />
            </FieldRow>
            <FieldRow label="Wall time">
              <Field value="900" unit="s" />
            </FieldRow>
            <FieldRow label="Layers">
              <Field value="reference · local" select />
            </FieldRow>
            <div className="s03-auto">
              <Switch on={auto} onChange={setAuto} label="Auto mode" />
              <span>Auto mode</span>
              <span className="s03-auto-note">{auto ? 'on' : 'off'} · never keeps a worse circuit</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function S03Preflight() {
  const run = useRun()
  const params = useHashParams()
  const forced = (params.get('state') ?? 'none') as S03State
  const [auto, setAuto] = useState(false)
  const [mode, setMode] = useState<'laptop' | 'platform'>(forced === 'offline' ? 'platform' : 'laptop')
  useEffect(() => setMode(forced === 'offline' ? 'platform' : 'laptop'), [forced])

  const landed = forced === 'validating' ? 2 : run.phase === 'preflight' ? run.preflightChecks : 4
  const validating = landed < 4
  const blocked = forced === 'issues' || forced === 'rejected'
  const canConfirm = !validating && !blocked

  return (
    <Shell
      rail="new"
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: true },
            { id: 'b', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={
        <>
          <ModeTabs active={mode} onChange={setMode} />
          <ModeBlock line="Runs on this machine · CPU, 12 q fits" />
          <BudgetSection auto={auto} setAuto={setAuto} />
          <div className="s03-confirm">
            {forced === 'impractical' && (
              <div className="s03-banner">
                {icons.warn}
                <div>
                  <div className="s03-banner-title">Impractical at 30 q</div>
                  <div className="s03-banner-text">
                    Scoring fits, but each verify takes about 9 min and 2 metrics will be skipped as unaffordable. A smaller starting circuit gives faster rounds.
                  </div>
                </div>
              </div>
            )}
            {forced === 'offline' && (
              <div className="s03-banner is-row">
                {icons.warn}
                <span className="s03-banner-grow">The platform is offline. Your plan is saved.</span>
                <EditorButton onClick={() => setMode('laptop')}>Use Laptop</EditorButton>
              </div>
            )}
            {forced === 'gpu-off' && (
              <div className="s03-banner is-row is-neutral">
                {icons.power}
                <span className="s03-banner-grow">GPU off. Scoring runs now; the local model starts when the GPU is back.</span>
              </div>
            )}
            <p className="s03-confirm-lead">
              {validating ? `Validating · ${landed} of 4 checks` : 'Scores 8 seeds against D01 to D10 in about 40 s.'}
            </p>
            <PrimaryButton onClick={() => actions.confirmAndScore()} disabled={!canConfirm} name="primary-action" style={{ paddingBlock: 0 }}>
              Confirm and score
            </PrimaryButton>
            <div style={{ paddingTop: 2 }}>
              <PoweredBy />
            </div>
          </div>
          <InsetSection icon={icons.chip} title="Resources">
            {RESOURCES.map(([k, v], i) => (
              <div key={k} className={`s03-row${i === RESOURCES.length - 1 ? ' is-last' : ''}`}>
                <span className="s03-row-label">{k}</span>
                <span className="mono s03-row-value">{forced === 'gpu-off' && k === 'GPU' ? 'off · local waits' : v}</span>
              </div>
            ))}
          </InsetSection>
          <InsetSection icon={icons.dollar} title="What it costs today" meta="estimate · before fixes">
            {COST.map(([k, v], i) => (
              <div key={k} className={`s03-row${i === COST.length - 1 ? ' is-last' : ''}`}>
                <span className="s03-row-label">{k}</span>
                <span className="mono s03-row-value">{v}</span>
              </div>
            ))}
            <p className="s03-cost-note">Scoring tells you how much of this the fixes can save.</p>
          </InsetSection>
        </>
      }
    >
      <Content className="s03-content">
        <Tile
          className="s03-interp"
          tabs={[{ id: 'interp', label: 'Interpretation', active: true }]}
          meta={<span className="ik-meta-mono">what the engine understood</span>}
        >
          <div className="s03-canvas-slot">
            <div className="s03-canvas" style={{ viewTransitionName: 'circuit-canvas' }}>
              <QaoaCircuit />
            </div>
          </div>
          <div className="s03-caption">
            <p className="s03-caption-text">
              A 12-qubit, two-layer QAOA for side-chain packing. Gatesmith will estimate its expectation value and cut two-qubit gates without changing the
              answer.
            </p>
            <div className="s03-facts">
              {[FACTS_L, FACTS_R].map((col, ci) => (
                <div key={ci} className="s03-facts-col">
                  {col.map(([k, v], i) => (
                    <div key={k} className={`s03-row${i === col.length - 1 ? ' is-last' : ''}`}>
                      <span className="s03-row-label">{k}</span>
                      <span className="mono s03-row-value">{v}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Tile>
        <div className="s03-right">
          <Tile
            className="s03-plan"
            tabs={[{ id: 'plan', label: 'Plan', active: true }]}
            meta={<span className="ik-meta-mono">nothing runs until you confirm</span>}
            bodyClassName="s03-plan-body"
          >
            {PLAN.map(([k, v], i) => (
              <div key={k} className={`s03-plan-row${i === PLAN.length - 1 ? ' is-last' : ''}`}>
                <span className="s03-row-label">{k}</span>
                <span className="mono s03-row-value">{v}</span>
              </div>
            ))}
          </Tile>
          <Tile
            className="s03-validation"
            tabs={[{ id: 'validation', label: 'Validation', active: true }]}
            meta={<span className="ik-meta-mono">{validating ? `${landed} of 4 checks` : blocked ? 'one pass · 0.4 s · blocked' : 'one pass · 0.4 s'}</span>}
            bodyClassName="s03-validation-body"
          >
            {forced === 'issues' ? (
              <Issues />
            ) : forced === 'rejected' ? (
              <Rejected />
            ) : (
              <>
                <div className="s03-verdict">
                  {validating ? <span className="s03-dot is-running" /> : icons.check}
                  <span className="s03-verdict-title">{validating ? 'Checking' : 'No issues'}</span>
                  <span className="mono s03-meta">manifest sha 3f9a1c07</span>
                </div>
                <div className="s03-checks">
                  {CHECKS.map(([text, meta], i) => {
                    const done = i < landed
                    const running = i === landed && validating
                    return (
                      <div key={text} className={`s03-check${done ? ' is-done' : running ? ' is-running' : ' is-pending'}`}>
                        <span className="mono s03-check-mark">{done ? '✓' : running ? '●' : '○'}</span>
                        <span className="s03-check-text">{text}</span>
                        <span className="mono s03-meta">{done ? meta : running ? 'checking' : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <div className="s03-block">
              <div className="s03-block-title">Assumptions the engine made</div>
              {ASSUMPTIONS.map(([k, v]) => (
                <div key={k} className="s03-assume">
                  <span className="s03-assume-k">{k}</span>
                  <span className="s03-assume-v">{v}</span>
                </div>
              ))}
            </div>
            <div className="s03-block">
              <div className="s03-block-head">
                <span className="s03-block-title is-inline">What scoring will look for</span>
                <span className="mono s03-meta">D01 to D10</span>
              </div>
              {DIAGNOSTICS.map(([k, v]) => (
                <div key={k} className="s03-diag">
                  <span className="mono s03-diag-k">{k}</span>
                  <span className="s03-diag-v">{v}</span>
                </div>
              ))}
              <button className="s03-diag is-more" onClick={() => navigate(ROUTES.template)}>
                <span className="mono s03-diag-k">D05+</span>
                <span className="s03-diag-v">Six more checks, listed in Docs</span>
              </button>
            </div>
          </Tile>
        </div>
      </Content>
    </Shell>
  )
}

function Issues() {
  return (
    <div className="s03-issues" role="alert">
      <div className="s03-issues-head">
        {icons.cross}
        <span className="s03-verdict-title">2 issues</span>
        <span className="mono s03-meta">fix both to continue</span>
      </div>
      <div className="s03-issue is-focus" tabIndex={0}>
        <div className="mono s03-issue-where">
          <span className="s03-issue-code">Q202</span> qscore.yaml line 4
        </div>
        <div>Function &apos;build_qaoa2&apos; not found in src/packing/qaoa.py. Did you mean &apos;build_qaoa&apos;?</div>
      </div>
      <div className="s03-issue" tabIndex={0}>
        <div className="mono s03-issue-where">
          <span className="s03-issue-code">Q118</span> sidechain_qaoa.qasm line 3
        </div>
        <div>creg c[11] is smaller than qreg q[12]. Measure needs 12 bits. Change it to c[12].</div>
      </div>
    </div>
  )
}

function Rejected() {
  return (
    <div className="s03-rejected" role="alert">
      <div className="s03-rejected-title">
        {icons.cross}
        Needs 41 simulated qubits; this machine simulates up to 31
      </div>
      <p>Q301 · the feasibility pass found a 41-qubit register in sidechain_qaoa_xl.qasm. Statevector memory would be 32 TB.</p>
      <p>Come back with a smaller circuit, or split it into blocks of 31 qubits or fewer.</p>
      <div className="s03-rejected-actions">
        <EditorButton onClick={() => navigate(ROUTES.template)}>Read the limits</EditorButton>
        <EditorButton onClick={() => navigate(ROUTES.newRun)}>Pick another file</EditorButton>
      </div>
    </div>
  )
}
