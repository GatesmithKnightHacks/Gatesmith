/*
 * S-00 · Shell template (17B7-0): the measured shell every screen is built from, with the board's
 * own content (measured sizes, type scale, color roles, the three rules) and the master's inspector.
 * `?state=feedback` shows every DS-08 feedback part live on the same shell.
 */
import { useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Banner, ErrorCode } from '../ui/Banner'
import { SectionIcons } from '../ui/icons'
import { EditorButton, Field, FieldRow, FindingCard, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { Sk, SkSwap } from '../ui/Skeleton'
import { Spinner } from '../ui/Spinner'
import { Status, StatusIcon } from '../ui/status'
import { Toast } from '../ui/Toast'
import { Tooltip } from '../ui/Tooltip'
import '../ui/template.css'

/* ── Board data ──────────────────────────────────────────────────────── */
type Size = [name: string, note: string, value: string]
const SHELL_SIZES: Size[] = [
  ['top bar', 'logo 28 · name 20/500', '52'],
  ['rail', 'incl. 2 px right border', '52'],
  ['tab band', 'one tab per circuit item', '42'],
  ['active tab', '3 px mint underline', '31'],
  ['tile header', 'tabs left, meta right', '28'],
  ['section row', '18 icon · 14/500 title', '44'],
  ['card row', 'inspector card head', '44'],
  ['field', 'select, number, text', '26'],
  ['data row', 'scores, code, details', '20'],
  ['gutter', 'between tiles', '4'],
  ['inspector', 'tabs, run, sections', '380'],
]
const GRID_SIZES: Size[] = [
  ['top tiles', 'three tiles', '434'],
  ['rounds tile', 'lanes and needle', '364'],
  ['main column', 'tiles span this width', '1000'],
  ['run button', 'the one mint fill', '348 x 40'],
]

type Role = [name: string, hex: string, use: string, token: string, dark?: boolean]
const ROLES: Role[] = [
  ['ground', '#061419', 'app background, gutters', '--color-teal-950', true],
  ['inset', '#0F1F23', 'headers, plots, code, fields', '--color-teal-900', true],
  ['panel', '#243237', 'tiles, top bar, inspector', '--color-teal-800', true],
  ['raised', '#2A383D', 'cards, elapsed time', '--color-teal-750', true],
  ['selected', '#354348', 'open card, selected row', '--color-teal-700', true],
  ['control border', '#496166', 'fields, card outlines', '--color-teal-600'],
  ['disabled', '#667E83', 'disabled text and icons', '--color-teal-500'],
  ['tertiary', '#ADC5CA', 'meta, units, labels', '--color-teal-300'],
  ['secondary', '#C2DADF', 'notes, inactive tabs', '--color-teal-200'],
  ['white', '#FFFFFF', 'values, titles, body', '--color-white'],
  ['on-accent', '#141414', 'text on the mint button', '--color-onyx', true],
  ['mint', '#5FEEA3', 'the one action, tab underline', '--color-mint-400'],
  ['yellow', '#F8D441', 'where you are', '--color-yellow-400'],
  ['pink', '#FF3478', 'high, failed, rejected, invalid', '--color-pink-400'],
  ['orange', '#FF986E', 'warning, inconclusive', '--color-orange-300'],
  ['blue', '#2EA3F8', 'info, running, engine lane', '--color-blue-400'],
  ['violet', '#867BFA', 'anything a model proposed', '--color-violet-400'],
  ['indigo', '#2C3456', 'circuit canvas', '--color-indigo-800'],
]

const RULES: { title: string; sub: string; here: ReactNode }[] = [
  {
    title: 'One mint fill per view',
    sub: 'the next action and the active tab underline, never a status',
    here: 'Run engine (44%) in the inspector, sidechain_qaoa.qasm underlined',
  },
  {
    title: 'Yellow only where you are',
    sub: 'selected row, gate, line, needle, focus, current rail item',
    here: 'Runs in the rail, finding #3 selected in the inspector',
  },
  {
    title: 'Status is an icon and a word',
    sub: 'info, warning, high · passed, failed, inconclusive, unsupported',
    here: (
      <span className="s00-chips">
        <span style={{ color: 'var(--color-signal-bad)' }}>! high</span>
        <span style={{ color: 'var(--color-signal-ai)' }}>◇ proposed</span>
        <span style={{ color: 'var(--color-signal-info)' }}>● running</span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>○ queued</span>
      </span>
    ),
  },
]

/* ── Main column ─────────────────────────────────────────────────────── */
function SizeRows({ rows }: { rows: Size[] }) {
  return (
    <>
      {rows.map(([name, note, value]) => (
        <div key={name} className="s00-size">
          <span className="s00-size-name">{name}</span>
          <span className="s00-size-note">{note}</span>
          <span className="s00-size-value">{value}</span>
          <span className="s00-size-unit s00-axis">px</span>
        </div>
      ))}
    </>
  )
}

function Board() {
  return (
    <div className="s00-main">
      <div className="s00-top">
        <Tile tabs={[{ id: 'sizes', label: 'Measured sizes', active: true }]} meta="px at 1440 x 900" bodyClassName="s00-pad">
          <div className="s00-inset">
            <div className="s00-group">
              <span className="s00-caps">shell</span>
              <span className="s00-axis">height or width</span>
            </div>
            <SizeRows rows={SHELL_SIZES} />
            <div className="s00-group">
              <span className="s00-caps">grid</span>
              <span className="s00-axis">main column</span>
            </div>
            <SizeRows rows={GRID_SIZES} />
          </div>
        </Tile>
        <Tile tabs={[{ id: 'type', label: 'Type scale', active: true }]} meta="400 and 500" bodyClassName="s00-pad">
          <div className="s00-type">
            <div className="s00-type-row is-head">
              <span className="s00-caps">Hanken Grotesk</span>
              <span className="s00-axis">size · weight · use</span>
            </div>
            <div className="s00-type-row">
              <span className="s00-t20">Gatesmith</span>
              <span className="s00-axis">20 · 500 · product name</span>
            </div>
            <div className="s00-type-row">
              <span className="s00-t14">Findings</span>
              <span className="s00-axis">14 · 500 · titles, buttons</span>
            </div>
            <div className="s00-type-row">
              <span>Runs on this machine</span>
              <span className="s00-axis">12 · 400 · body</span>
            </div>
            <div className="s00-type-row">
              <span className="s00-caps">hardware</span>
              <span className="s00-axis">11 · 400 · labels, notes</span>
            </div>
            <div className="s00-type-row">
              <span className="s00-t10">Powered by the qscore engine</span>
              <span className="s00-axis">10 · 400 · captions</span>
            </div>
            <div className="s00-type-row is-head">
              <span className="s00-caps">JetBrains Mono</span>
              <span className="s00-axis">size · use</span>
            </div>
            <div className="s00-type-row">
              <span className="mono">281 gates</span>
              <span className="s00-axis">12 · values, code</span>
            </div>
            <div className="s00-type-row">
              <span className="s00-mono11">job 7f3a·0412</span>
              <span className="s00-axis">11 · ids, meta</span>
            </div>
            <div className="s00-type-row">
              <span className="s00-axis">−12.5% · 400 s</span>
              <span className="s00-axis">10 · units, axes, deltas</span>
            </div>
          </div>
        </Tile>
        <Tile tabs={[{ id: 'roles', label: 'Color roles', active: true }]} meta="18 roles · hex" bodyClassName="s00-pad">
          <div className="s00-roles">
            {ROLES.map(([name, hex, use, token, dark]) => (
              <div key={name} className="s00-role" title={token}>
                <span className={`s00-swatch${dark ? ' is-dark' : ''}`} style={{ background: `var(${token})` }} />
                <span className="s00-role-name">{name}</span>
                <span className="s00-role-hex">{hex}</span>
                <span className="s00-role-use">{use}</span>
              </div>
            ))}
          </div>
        </Tile>
      </div>
      <Tile
        className="s00-rules-tile"
        tabs={[{ id: 'rules', label: 'Rules', active: true }]}
        meta="every screen keeps these three"
        bodyClassName="s00-rules"
      >
        {RULES.map((r, i) => (
          <div key={r.title} className="s00-rule">
            <span className="s00-rule-n">{i + 1}</span>
            <span className="s00-rule-what">
              <span className="s00-rule-title">{r.title}</span>
              <span className="s00-rule-sub">{r.sub}</span>
            </span>
            <span className="s00-rule-here">
              <span className="s00-axis">on this board</span>
              {typeof r.here === 'string' ? <span className="s00-rule-here-text">{r.here}</span> : r.here}
            </span>
          </div>
        ))}
        <div className="s00-rules-foot">
          <span>tokens.css is the only source of values · qscore-2026.1</span>
          <span>radius 2 or 4 · no shadows · no gradients</span>
        </div>
      </Tile>
    </div>
  )
}

/* ── Inspector (the master's) ────────────────────────────────────────── */
function Step({ name, state, bar }: { name: string; state: 'passed' | 'running' | 'queued'; bar: string }) {
  const color = state === 'passed' ? 'var(--color-text-secondary)' : state === 'running' ? 'var(--color-signal-info)' : undefined
  return (
    <span className={`s00-step${state === 'passed' ? ' is-done' : state === 'running' ? ' is-now' : ''}`}>
      <span className="s00-step-bar" style={{ background: bar }} />
      <span className="s00-step-name">{name}</span>
      <span className="s00-step-state" style={{ color }}>
        <StatusIcon kind={state} size={8} />
        {state}
      </span>
    </span>
  )
}

function Inspector() {
  const [open, setOpen] = useState({ target: false, budget: false, findings: true })
  const [selected, setSelected] = useState(3)
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  return (
    <>
      <ModeTabs />
      <ModeBlock line="Runs on this machine · CPU · round 3 of 4 · 400 of 900 s">
        <PrimaryButton onClick={() => navigate(ROUTES.workspace)}>Run engine (44%)</PrimaryButton>
        <PoweredBy />
      </ModeBlock>
      <Section icon={SectionIcons.target} title="Target" meta="FakeTorino · 133 q · cz rz sx x" open={open.target} onToggle={() => toggle('target')}>
        <FieldRow label="Machine">
          <Field value="FakeTorino" select />
        </FieldRow>
      </Section>
      <Section icon={SectionIcons.clock} title="Budget" meta="8 seeds · 4 rounds · 900 s · auto off" open={open.budget} onToggle={() => toggle('budget')}>
        <FieldRow label="Seeds">
          <Field value="8" unit="seeds" />
        </FieldRow>
        <FieldRow label="Max rounds">
          <Field value="4" unit="rounds" />
        </FieldRow>
      </Section>
      <Section
        icon={SectionIcons.list}
        title="Findings"
        meta="3 open · 1 accepted"
        open={open.findings}
        onToggle={() => toggle('findings')}
        bodyStyle={{ paddingBottom: 16 }}
      >
        <div className="s00-cards">
          <FindingCard
            finding={{ rank: 1, severity: 'high', rule: 'D01', ruleName: 'routing_overhead', title: 'Routing-dominated', evidence: '0.446 ≥ 0.30 ratio · 49 swaps' }}
            selected={selected === 1}
            onSelect={() => setSelected(1)}
          />
          <FindingCard
            finding={{ rank: 2, severity: 'high', rule: 'D03', ruleName: 'structure · block 1', title: 'Commuting block', evidence: '' }}
            selected={selected === 2}
            onSelect={() => setSelected(2)}
            actionLabel="View diff"
            bottom={
              <span className="s00-accepted">
                <Status kind="accepted" />
                <span className="s00-card-sub">R2 · −17 gates · passed</span>
              </span>
            }
          />
          <FindingCard
            finding={{ rank: 3, severity: 'high', rule: 'D03', ruleName: 'structure · block 2', title: 'Commuting block', evidence: '' }}
            selected={selected === 3}
            onSelect={() => setSelected(3)}
            className="s00-card-open"
            actionLabel="Review proposal"
            onRequest={() => navigate(ROUTES.fixReview)}
            bottom={<span className="s00-keep-text">Kept only if passed and better</span>}
          >
            <span className="s00-card-sub">39 2q ops · 12 q · layers 17–31 · lines 48–86</span>
            <span className="s00-detail">
              <span className="s00-detail-row">
                <span className="s00-detail-label">Region</span>
                <span className="s00-detail-value">logical · q0 to q11 · layers 17–31</span>
              </span>
              <span className="s00-detail-row">
                <span className="s00-detail-label">Strategy</span>
                <span className="s00-detail-value">commutation_aware_routing</span>
              </span>
              <span className="s00-detail-row">
                <span className="s00-detail-label">Attempt 6</span>
                <span className="s00-detail-value">
                  R3 · local
                  <Status kind="proposed" />
                </span>
              </span>
              <span className="s00-ladder">
                <span className="s00-ladder-label">Verification</span>
                <Step name="allowed" state="passed" bar="var(--color-text-secondary)" />
                <Step name="equivalent" state="running" bar="var(--color-signal-info)" />
                <Step name="re-scored" state="queued" bar="var(--color-surface-selected)" />
                <Step name="decided" state="queued" bar="var(--color-surface-selected)" />
              </span>
            </span>
          </FindingCard>
          <FindingCard
            finding={{ rank: 4, severity: 'high', rule: 'D04', ruleName: 'resynthesis_potential', title: 'Resynthesizable blocks', evidence: '6 gates removable · q25 q26' }}
            selected={selected === 4}
            onSelect={() => setSelected(4)}
          />
          <div className="s00-not-evaluated">
            <StatusIcon kind="queued" size={8} />
            <span className="s00-mono11">D09 D10</span>
            <span>Not evaluated: no size_sweep, no simulation</span>
          </div>
        </div>
      </Section>
    </>
  )
}

/* ── ?state=feedback: the DS-08 parts, live ──────────────────────────── */
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

function Feedback({ onToast }: { onToast: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [field, setField] = useState<'warning' | 'invalid' | 'fixed'>('warning')
  const [flash, setFlash] = useState(0)
  const [banner, setBanner] = useState(true)
  const [drag, setDrag] = useState(false)
  return (
    <div className="s00-gallery">
      <Tile tabs={[{ id: 'b', label: 'Buttons', active: true }]} meta="one width in every state">
        <div className="s00-row">
          <PrimaryButton doneLabel="Accepted" onClick={() => wait(1600)} loading={undefined} loadingLabel="Accept">
            Accept
          </PrimaryButton>
          <PrimaryButton loading>Open run</PrimaryButton>
          <PrimaryButton done doneLabel="Saved">
            Save
          </PrimaryButton>
          <PrimaryButton disabled>Accept</PrimaryButton>
        </div>
        <div className="s00-strip">
          <EditorButton onInset doneLabel="Copied" onClick={() => undefined}>
            Copy link
          </EditorButton>
          <EditorButton onInset loading>
            Copy link
          </EditorButton>
          <EditorButton onInset disabled>
            Copy link
          </EditorButton>
          <Tooltip tip="Waits 400 ms, fades in 200, out 150.">
            <EditorButton onInset>Hover me</EditorButton>
          </Tooltip>
        </div>
        <PrimaryButton progress={0.44}>Run engine (44%)</PrimaryButton>
      </Tile>
      <Tile tabs={[{ id: 's', label: 'Spinner', active: true }]} meta="ring 2 px · 270° · 14 · 20 · 28">
        <Spinner stage="Scoring · measure" estimate="about 40 s left" />
        <Spinner
          stage={
            <>
              Loading run <span className="mono">7f3a·0412</span> from your account
            </>
          }
          estimate="about 2 s"
        />
        <Spinner stage="Verifying · QCEC" estimate="estimate unknown" size={20} />
        <Spinner stage="Compiling · seed 3 of 8" estimate="about 20 s left" size={28} />
      </Tile>
      <Tile tabs={[{ id: 'k', label: 'Skeleton', active: true }]} meta={loaded ? 'spread 0.071' : <Spinner stage="Loading" estimate="about 2 s" />}>
        <SkSwap
          loading={!loaded}
          skeleton={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[180, 120, 150, 96].map((w) => (
                <div key={w} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Sk w={w} />
                  <Sk w={40} h={16} />
                </div>
              ))}
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['width 12 qubits', 'depth 541 layers', 'two_qubit_count 281 gates', 'swaps_inserted 49'].map((t) => (
              <div key={t} className="mono" style={{ height: 16 }}>
                {t}
              </div>
            ))}
          </div>
        </SkSwap>
        <div className="s00-row">
          <span className="tile-header" style={{ padding: '0 10px' }}>
            <Sk w={72} strip />
          </span>
          <EditorButton onClick={() => setLoaded((v) => !v)}>{loaded ? 'Load again' : 'Show content'}</EditorButton>
        </div>
      </Tile>
      <Tile tabs={[{ id: 'f', label: 'Fields', active: true }]} meta="on blur · border 150 · message 200">
        <FieldRow label="Wall time">
          <Field
            value={field === 'fixed' ? '900' : '60'}
            unit="s"
            width={160}
            validation={field === 'warning' ? 'warning' : undefined}
            where="wall_time_s · qscore.yaml:23"
            message="60 s ends round 1 early, which takes about 92 s · use 120 s or more"
          />
        </FieldRow>
        <FieldRow label="Entry point">
          <Field
            value={field === 'invalid' ? 'build_qaoa2' : 'build_qaoa'}
            width={200}
            validation={field === 'invalid' ? 'invalid' : undefined}
            where="src/packing/qaoa.py:14"
            message="'build_qaoa2' not found. Did you mean 'build_qaoa'?"
          />
        </FieldRow>
        <div className="s00-row">
          <EditorButton onClick={() => setField('warning')}>Warning</EditorButton>
          <EditorButton onClick={() => setField('invalid')}>Invalid</EditorButton>
          <EditorButton onClick={() => setField('fixed')}>Fix</EditorButton>
        </div>
      </Tile>
      <Tile tabs={[{ id: 'n', label: 'Banners and toasts', active: true }]} meta="in 200 · out 150 · in place">
        <Banner open={banner} kind="warning" action={{ label: 'Retry', loadingLabel: 'Retrying', onClick: () => wait(1500) }}>
          Could not reach the database <ErrorCode code="Q901" />. Showing this machine&apos;s copy.
        </Banner>
        <Banner kind="offline" action={{ label: 'Retry', loadingLabel: 'Retrying', onClick: () => wait(1500) }}>
          You are offline. Showing this machine&apos;s copy.
        </Banner>
        <Banner kind="error" action={{ label: 'Choose folder', onClick: () => undefined }}>
          Export could not be written <ErrorCode code="Q602" /> · <span className="mono">~/runs/7f3a</span> · choose another folder
        </Banner>
        <div className="s00-row">
          <EditorButton onClick={() => setBanner((v) => !v)}>{banner ? 'Hide banner' : 'Show banner'}</EditorButton>
          <EditorButton onClick={onToast}>Show toast</EditorButton>
        </div>
      </Tile>
      <Tile tabs={[{ id: 'r', label: 'Rows and drag', active: true }]} meta="fill, then fade back · drag-over 150">
        <div key={flash} className={`s00-list-row${flash ? ' row-flash' : ''}`}>
          <span className="mono">7f3c·1a02 · sbox_oracle.qasm</span>
          <Status kind="queued" />
        </div>
        <div className="s00-row">
          <EditorButton onClick={() => setFlash((n) => n + 1)}>Queue it again</EditorButton>
        </div>
        <div
          className={`s00-drop drop-zone${drag ? ' is-drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
          }}
          onPointerEnter={() => setDrag(true)}
          onPointerLeave={() => setDrag(false)}
        >
          Drop .qasm files or paste a GitHub URL
        </div>
      </Tile>
    </div>
  )
}

/** S-00 · Shell template: the measured grammar every screen is built from. */
export function S00Template() {
  const state = useHashParams().get('state')
  const [toast, setToast] = useState(false)
  const showToast = () => {
    setToast(true)
    window.setTimeout(() => setToast(false), 4000)
  }
  return (
    <Shell
      rail="runs"
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: true },
            { id: 'b', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={<Inspector />}
      toast={
        <Toast open={toast} action={{ label: 'Open', onClick: () => navigate(ROUTES.runs) }}>
          Run <span className="mono">7f3c·1a02</span> finished <span className="mono">298 gates</span>
        </Toast>
      }
    >
      <Content>{state === 'feedback' ? <Feedback onToast={showToast} /> : <Board />}</Content>
    </Shell>
  )
}
