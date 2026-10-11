/*
 * S-09 · Final report. Original (the canonical canvas) beside Final, the metrics table, the rounds strip and the
 * machine estimate; the inspector holds the run facts, why the engine stopped, the findings and what reproduces it.
 * States from the S-09 states board at ?state=: complete (default), partial, one-round, loading, error, offline,
 * gpu-off, empty, focus.
 */
import { useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { actions } from '../data/run'
import { ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section, Tile } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { Banner, FactRow, InsetButton, MarkIcon, MarkWord, Shim, Spinner, StageLine } from './report/bits'
import { Icons } from './report/icons'
import { FinalCircuit, OriginalCircuit } from './report/Circuits'
import {
  ESTIMATE_FINAL,
  ESTIMATE_PARTIAL,
  ESTIMATE_R1,
  FINDINGS_FINAL,
  FINDINGS_PARTIAL,
  FINDINGS_R1,
  JOB,
  METRICS_FINAL,
  METRICS_PARTIAL,
  METRICS_R1,
  RELIABILITY_CAVEAT,
  REPRODUCIBILITY,
  ROUNDS,
  ROUNDS_PARTIAL,
  RUN_FACTS,
  STOP_COPY,
  type Estimate,
  type FindingLine,
  type MetricLine,
  type MetricRow,
  type RoundCell,
} from './report/data'
import './report/report.css'

type S09State = 'complete' | 'partial' | 'one-round' | 'loading' | 'error' | 'offline' | 'gpu-off' | 'empty' | 'focus'
const STATES: S09State[] = ['complete', 'partial', 'one-round', 'loading', 'error', 'offline', 'gpu-off', 'empty', 'focus']

export function S09Report() {
  const params = useHashParams()
  const raw = params.get('state') as S09State | null
  const state: S09State = raw && STATES.includes(raw) ? raw : 'complete'

  return (
    <div className="rp-screen">
      <Shell
        context="Report"
        rail="runs"
        gpu={state === 'gpu-off' ? 'off' : 'online'}
        tabs={
          <TabStrip
            tabs={[
              { id: 'file', label: 'sidechain_qaoa.qasm' },
              { id: 'report', label: 'Report', active: true },
            ]}
          />
        }
        inspector={<ReportInspector state={state} />}
      >
        <Content className="rp-content">
          {state === 'offline' && (
            <Banner kind="offline">You are offline · runs stay on this machine · syncs when the network is back</Banner>
          )}
          {state === 'gpu-off' && (
            <Banner kind="info" word="GPU off">
              GPU machine is off · model proposals wait · the engine keeps running on CPU · this report is on this machine, Export works
            </Banner>
          )}
          {state === 'error' && <ErrorBanner />}
          {state === 'empty' ? <EmptyCircuits /> : <CircuitTiles state={state} />}
          <div className="rp-bottom">
            <MetricsTile state={state} />
            <div className="rp-right">
              <RoundsTile state={state} />
              <EstimateTile state={state} />
            </div>
          </div>
        </Content>
      </Shell>
    </div>
  )
}

/* ── Circuits ─────────────────────────────────────────────────────────── */
function CircuitTiles({ state }: { state: S09State }) {
  const finalMeta =
    state === 'partial'
      ? '12 q · 281 gates · two_qubit_depth 184'
      : state === 'one-round'
        ? '12 q · 298 gates · after round 1'
        : state === 'loading'
          ? '12 q · building'
          : '12 q · 270 gates · two_qubit_depth 178'
  return (
    <div className="rp-top">
      <Tile tabs={[{ id: 'o', label: 'Original', active: true }]} meta={<span className="mono">12 q · 33 layers · two_qubit_depth 202</span>} bodyClassName="rp-canvas-body">
        <div className="rp-canvas is-centered">
          <OriginalCircuit
            block1={state === 'one-round' ? 'open' : 'fixed R2'}
            block2={state === 'partial' || state === 'one-round' ? 'open' : 'fixed R3'}
          />
        </div>
      </Tile>
      <Tile tabs={[{ id: 'f', label: 'Final', active: true }]} meta={<span className="mono">{finalMeta}</span>} bodyClassName="rp-canvas-body" name="circuit-canvas">
        <div className={`rp-canvas${state === 'loading' ? ' is-loading' : ''}`}>
          {state === 'loading' ? (
            <div className="rp-canvas-wait" role="status">
              <Spinner size={28} />
              <span className="rp-stage-word">Drawing final.qasm · 12 q · about 6 s</span>
            </div>
          ) : (
            <FinalCircuit accepted={state === 'partial' ? 1 : state === 'one-round' ? 0 : 2} />
          )}
        </div>
      </Tile>
    </div>
  )
}

function EmptyCircuits() {
  const [tab, setTab] = useState<'o' | 'f'>('o')
  return (
    <div className="rp-top">
      <Tile
        className="rp-empty-tile"
        tabs={[
          { id: 'o', label: 'Original', active: tab === 'o', onClick: () => setTab('o') },
          { id: 'f', label: 'Final', active: tab === 'f', onClick: () => setTab('f') },
        ]}
        meta={<span className="mono">sidechain_qaoa.qasm · no run finished</span>}
      >
        <div className="rp-empty">
          <div className="rp-empty-title">
            {Icons.emptyReport}
            <span>No final report yet</span>
          </div>
          <p className="rp-empty-text">It appears when the engine stops a run or you stop it.</p>
          <div className="rp-empty-action">
            <button className="btn-editor" onClick={() => navigate(ROUTES.workspace)}>
              Open workbench
            </button>
          </div>
        </div>
      </Tile>
    </div>
  )
}

/* ── Metrics ──────────────────────────────────────────────────────────── */
function MetricsTile({ state }: { state: S09State }) {
  const [tab, setTab] = useState<'metrics' | 'seeds'>('metrics')
  const meta =
    state === 'partial'
      ? 'before → after round 2 · partial'
      : state === 'one-round'
        ? 'before → after round 1 · best of 8 seeds · seed 37'
        : state === 'loading'
        ? 'building'
        : state === 'error'
          ? 'report.json · failed'
          : state === 'empty'
            ? 'no run finished'
            : 'before → after · best of 8 seeds · seed 37'
  return (
    <Tile
      className="rp-metrics"
      tabs={[
        { id: 'metrics', label: 'Metrics', active: tab === 'metrics', onClick: () => setTab('metrics') },
        { id: 'seeds', label: 'Seeds', active: tab === 'seeds', onClick: () => setTab('seeds') },
      ]}
      meta={<span className="mono">{meta}</span>}
      bodyClassName="rp-metrics-body"
    >
      {state === 'empty' ? (
        <TileEmpty title="No metrics yet" text="Before and after values appear when a run finishes." />
      ) : state === 'loading' ? (
        <MetricsLoading />
      ) : state === 'error' ? (
        <MetricsError />
      ) : tab === 'seeds' ? (
        <SeedsTable />
      ) : state === 'partial' ? (
        <>
          <Banner kind="warning" action={<InsetButton onClick={() => navigate(ROUTES.loop)}>Resume run</InsetButton>}>
            Rounds 3 and 4 skipped, run cancelled at 400 s. Values are after round 2.
          </Banner>
          <div className="rp-inset rp-table">
            <TableHead />
            <MetricLines lines={METRICS_PARTIAL} />
            <div className="rp-research">
              <span className="rp-research-label">not decided</span>
              <MarkIcon kind="unavailable" />
              <span className="rp-research-word">skipped</span>
              <span className="mono rp-research-name">R3 layout_search · R3 commutation_aware_routing · R4</span>
            </div>
          </div>
        </>
      ) : state === 'one-round' ? (
        <div className="rp-inset rp-table is-fill">
          <TableHead />
          <MetricLines lines={METRICS_R1} />
          <div className="rp-research">
            <span className="rp-research-label">not run</span>
            <MarkIcon kind="unavailable" />
            <span className="rp-research-word">skipped</span>
            <span className="mono rp-research-name">rounds 2 to 4 · budget was 1 round</span>
          </div>
        </div>
      ) : (
        <div className="rp-inset rp-table is-fill">
          <TableHead />
          <MetricLines lines={METRICS_FINAL} />
          <div className="rp-research">
            <span className="rp-research-label">research</span>
            <span className="mono rp-research-name">simulated_task_score</span>
            <MarkIcon kind="unavailable" />
            <span className="rp-research-word">unavailable</span>
            <span className="rp-pipe" />
            <span className="mono rp-research-name">mirror_score</span>
            <MarkIcon kind="unavailable" />
            <span className="rp-research-word">skipped</span>
          </div>
        </div>
      )}
    </Tile>
  )
}

function TableHead() {
  return (
    <div className="rp-table-head">
      <span className="rp-col-name rp-label">metric</span>
      <span className="rp-col-bars mono rp-axis is-right">delta</span>
      <span className="rp-col-before rp-label is-right">before</span>
      <span className="rp-col-after rp-label is-right">after</span>
      <span className="rp-col-unit" />
      <span className="rp-col-change rp-label is-right">change</span>
      <span className="rp-col-status rp-label">status</span>
    </div>
  )
}

function MetricLines({ lines }: { lines: MetricLine[] }) {
  return (
    <>
      {lines.map((l, i) =>
        l.kind === 'group' ? (
          <div key={i} className="rp-group">
            <span className="rp-label">{l.label}</span>
            {l.note && <span className="mono rp-axis">{l.note}</span>}
          </div>
        ) : l.kind === 'note' ? (
          <div key={i} className="rp-note">
            {l.text}
          </div>
        ) : (
          <MetricRowView key={i} row={l} />
        ),
      )}
    </>
  )
}

/** fix-round-2 D23: the status column holds engine words only, "high" where a rule still fires. */
function MetricRowView({ row }: { row: MetricRow }) {
  const fires = row.high
  return (
    <div className="rp-row">
      <span className="rp-col-name">
        <span className={`mono rp-metric${row.primary ? ' is-primary' : ''}`}>{row.name}</span>
        {row.qualifier && <span className="mono rp-qualifier">{row.qualifier}</span>}
      </span>
      <span className="rp-col-bars">
        <span className="rp-bars" aria-hidden>
          <span className="rp-bar-track" />
          <span className="rp-bar-before" style={{ width: row.bars.before }} />
          <span className={`rp-bar-after${fires ? ' is-high' : ''}`} style={{ width: row.bars.after }} />
          {row.bars.tick != null && <span className="rp-bar-tick" style={{ left: row.bars.tick }} />}
        </span>
        <span className="mono rp-delta">{row.delta}</span>
      </span>
      <span className="rp-col-before mono is-right rp-before">{row.before}</span>
      <span className={`rp-col-after mono is-right rp-after${row.primary ? ' is-primary' : ''}`}>{row.after}</span>
      <span className="rp-col-unit mono rp-unit">{row.unit}</span>
      <span className="rp-col-change mono is-right rp-change">{row.change}</span>
      <span className="rp-col-status">{fires && <MarkWord kind="high" gap={5} />}</span>
    </div>
  )
}

function SeedsTable() {
  const seeds = [11, 23, 37, 41, 53, 67, 79, 97]
  return (
    <div className="rp-inset rp-table is-fill">
      <div className="rp-group">
        <span className="rp-label">8 seeds · same seeds before and after</span>
        <span className="mono rp-axis">seed_spread 0.087 → 0.064 ratio</span>
      </div>
      {seeds.map((s) => (
        <div key={s} className="rp-row">
          <span className="rp-col-name mono rp-metric">seed {s}</span>
          <span className="rp-col-status rp-seed-status">
            <MarkWord kind="done" word="computed" gap={5} />
            {s === 37 && <span className="mono rp-qualifier">best · 270 gates</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function MetricsLoading() {
  return (
    <>
      <StageLine stage="Building the report" detail="scoring final.qasm on 8 seeds" estimate="about 6 s" />
      <div className="rp-inset rp-table is-fill rp-loading-rows" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rp-sk-row">
            <Shim w={130} h={10} onPanel />
            <span className="rp-grow" />
            <Shim w={36} h={10} onPanel />
            <Shim w={36} h={10} onPanel />
            <Shim w={44} h={10} onPanel />
            <Shim w={80} h={10} onPanel />
          </div>
        ))}
      </div>
    </>
  )
}

/** Q601 names the file, the folder and the fix; it spans the main column because every tile reads report.json. */
function ErrorBanner() {
  return (
    <Banner kind="failed" action={<InsetButton onClick={() => navigate(ROUTES.workspace)}>Re-score</InsetButton>}>
      <span>report.json missing</span>
      <span className="mono">(Q601)</span>
      <span className="rp-dot">·</span>
      <span className="mono rp-path">~/.gatesmith/runs/{JOB}</span>
      <span className="rp-dot">·</span>
      <span>re-score final.qasm</span>
    </Banner>
  )
}

const ALL_METRICS = [
  'two_qubit_count',
  'two_qubit_depth',
  'routing_overhead',
  'swaps_inserted',
  'compile_ratio',
  'reliability_heuristic',
  'scheduled_duration',
  'seed_spread',
  'resynthesis_potential',
]

function MetricsError() {
  return (
    <>
      <div className="rp-inset rp-table">
        <div className="rp-group">
          <span className="rp-label">metrics</span>
          <span className="mono rp-axis">read from report.json</span>
        </div>
        {ALL_METRICS.map((m) => (
          <div key={m} className="rp-row">
            <span className="mono rp-metric is-muted">{m}</span>
            <span className="rp-grow" />
            <MarkIcon kind="unavailable" />
            <span className="rp-research-word">unavailable</span>
            <span className="mono rp-research-name">until report.json is rebuilt</span>
          </div>
        ))}
      </div>
    </>
  )
}

function TileEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rp-tile-empty">
      <span className="rp-tile-empty-title">{title}</span>
      <span className="rp-tile-empty-text">{text}</span>
    </div>
  )
}

/* ── Rounds ───────────────────────────────────────────────────────────── */
const COLS = [3, 91, 180, 269]
const LABELS = [6, 94, 183, 272]
const PIPES = [88, 177, 266]

function RoundsTile({ state }: { state: S09State }) {
  const data = state === 'partial' ? ROUNDS_PARTIAL : ROUNDS
  const meta =
    state === 'one-round'
      ? '1 round · 2 attempts · 118 s'
      : state === 'loading'
        ? 'building'
        : state === 'empty'
          ? 'no rounds yet'
          : data.meta
  return (
    <Tile className="rp-rounds" tabs={[{ id: 'r', label: 'Rounds', active: true }]} meta={<span className="mono">{meta}</span>} bodyClassName="rp-rounds-body">
      {state === 'empty' ? (
        <TileEmpty title="No rounds yet" text="Each round adds an engine and a model attempt." />
      ) : state === 'loading' ? (
        <div className="rp-inset rp-strip is-loading" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rp-sk-row">
              <Shim w={i % 2 ? 300 : 140} h={i % 2 ? 20 : 10} onPanel />
            </div>
          ))}
        </div>
      ) : (
        <div className="rp-inset rp-strip">
          <div className="rp-strip-axis">
            {LABELS.map((x, i) => (
              <span key={i} className="mono rp-axis" style={{ left: x }}>
                R{i + 1}
              </span>
            ))}
            {PIPES.map((x) => (
              <span key={x} className="rp-strip-pipe" style={{ left: x }} />
            ))}
          </div>
          <LaneHead color="var(--color-signal-info)" name="reference-qiskit" role="engine" meta={state === 'one-round' ? '1 attempt · 1 accepted' : data.reference.meta} />
          {state === 'one-round' ? (
            <OneRoundLane decision="accepted" value="298 gates" />
          ) : (
            <Lane cells={data.reference.cells} />
          )}
          <div className="rp-lane-sep" />
          <LaneHead color="var(--color-signal-ai)" name="local" role="model · proposes" meta={state === 'one-round' ? '1 attempt · 0 accepted' : data.local.meta} />
          {state === 'one-round' ? <OneRoundLane decision="rejected" value="214 layers" /> : <Lane cells={data.local.cells} />}
          <div className="rp-strip-foot">
            <span className="rp-label">all rounds</span>
            <span className="rp-grow" />
            {(state === 'one-round'
              ? ([
                  ['accepted', 1],
                  ['rejected', 1],
                  ['inconclusive', 0],
                ] as const)
              : ([
                  ['accepted', data.totals.accepted],
                  ['rejected', data.totals.rejected],
                  ['inconclusive', data.totals.inconclusive],
                ] as const)
            ).map(([k, n]) => (
              <span key={k} className="rp-total">
                <MarkIcon kind={k} />
                <span className="mono">{n}</span>
                <span style={{ color: `var(--rp-${k})` }}>{k}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Tile>
  )
}

function LaneHead({ color, name, role, meta }: { color: string; name: string; role: string; meta: string }) {
  return (
    <div className="rp-lane-head">
      <span className="rp-lane-dot" style={{ background: color }} />
      <span className="mono rp-lane-name">{name}</span>
      <span className="rp-strip-pipe is-inline" />
      <span className="rp-lane-role">{role}</span>
      <span className="rp-grow" />
      <span className="mono rp-lane-meta">{meta}</span>
    </div>
  )
}

function Lane({ cells }: { cells: RoundCell[] }) {
  return (
    <div className="rp-lane">
      {PIPES.map((x) => (
        <span key={x} className="rp-lane-grid" style={{ left: x }} />
      ))}
      {cells.map((c, i) =>
        c === 'skipped' ? (
          <span key={i} className="rp-cell is-skipped" style={{ left: COLS[i] }}>
            <span className="rp-cell-word">skipped</span>
          </span>
        ) : (
          <span key={i} className="rp-cell" style={{ left: COLS[i] }}>
            <MarkIcon kind={c} />
            <span className="rp-cell-word" style={{ color: `var(--rp-${c})` }}>
              {c}
            </span>
          </span>
        ),
      )}
    </div>
  )
}

function OneRoundLane({ decision, value }: { decision: 'accepted' | 'rejected'; value: string }) {
  return (
    <div className="rp-lane is-one">
      <span className="rp-cell is-wide">
        <MarkIcon kind={decision} />
        <span className="rp-cell-word" style={{ color: `var(--rp-${decision})` }}>
          {decision}
        </span>
        <span className="mono rp-cell-value">{value}</span>
      </span>
      <span className="mono rp-not-run">not run · budget was 1 round</span>
    </div>
  )
}

/* ── Machine estimate ─────────────────────────────────────────────────── */
function EstimateTile({ state }: { state: S09State }) {
  const e: Estimate = state === 'partial' ? ESTIMATE_PARTIAL : state === 'one-round' ? ESTIMATE_R1 : ESTIMATE_FINAL
  const loading = state === 'loading'
  const empty = state === 'empty'
  return (
    <Tile
      className="rp-estimate"
      tabs={[{ id: 'e', label: 'Machine estimate', active: true }]}
      meta={<span className="mono">FakeTorino · 96 $ per minute</span>}
      bodyClassName="rp-estimate-body"
    >
      {empty ? (
        <TileEmpty title="No estimate yet" text="QPU time and cost per run follow the final score." />
      ) : (
        <>
          <EstimateRow label={<span className="mono rp-est-metric">reliability_heuristic</span>} v={e.reliability} unit="(0, 1]" loading={loading} />
          <EstimateRow label="QPU time per run" v={e.qpu} loading={loading} />
          <EstimateRow label="Cost per run" v={e.cost} loading={loading} />
          <div className="rp-est-caveat">{RELIABILITY_CAVEAT}</div>
        </>
      )}
    </Tile>
  )
}

function EstimateRow({ label, v, unit, loading }: { label: ReactNode; v: [string, string, string]; unit?: string; loading?: boolean }) {
  return (
    <div className="rp-est-row">
      <span className="rp-est-label">{label}</span>
      {loading ? (
        <>
          <Shim w={110} h={10} />
          <span className="rp-grow" />
          <Shim w={44} h={10} />
        </>
      ) : (
        <>
          <span className="rp-est-values">
            <span className="mono rp-est-before">{v[0]}</span>
            <span className="mono rp-est-arrow">→</span>
            <span className="mono rp-est-after">{v[1]}</span>
            {unit && <span className="mono rp-est-unit">{unit}</span>}
          </span>
          <span className="rp-grow" />
          <span className="mono rp-est-delta">{v[2]}</span>
        </>
      )}
    </div>
  )
}

/* ── Inspector ────────────────────────────────────────────────────────── */
function ReportInspector({ state }: { state: S09State }) {
  const loading = state === 'loading'
  const empty = state === 'empty'
  const line =
    state === 'partial'
      ? `Runs on this machine · job ${JOB} · cancelled at 400 s`
      : state === 'one-round'
        ? `Runs on this machine · job ${JOB} · done in 118 s`
        : loading
          ? `Building the report · job ${JOB}`
          : empty
            ? 'Runs on this machine · no run finished yet'
            : `Runs on this machine · job ${JOB} · done in 8 m 10 s`
  const findings: FindingLine[] = state === 'partial' ? FINDINGS_PARTIAL : state === 'one-round' ? FINDINGS_R1 : FINDINGS_FINAL
  const facts = RUN_FACTS.map(([k, v]): [string, string] =>
    k === 'wall time' && state === 'partial' ? [k, '400 s · 6 m 40 s'] : k === 'wall time' && state === 'one-round' ? [k, '118 s · 1 m 58 s'] : [k, v],
  )
  return (
    <>
      <ModeTabs />
      <ModeBlock line={line} style={{ paddingTop: 18, paddingBottom: 14 }}>
        <PrimaryButton
          name="primary-action"
          disabled={loading || empty}
          onClick={() => actions.openExport()}
          style={state === 'focus' ? { outline: '2px solid var(--color-signal-select)', outlineOffset: 2 } : undefined}
        >
          Export
        </PrimaryButton>
        <PoweredBy />
      </ModeBlock>
      <Section icon={Icons.facts} title="Run facts" meta={empty ? 'no run finished' : 'reproducible · 8 seeds'} bodyStyle={{ gap: 0 }}>
        {facts.map(([k, v]) => (
          <FactRow key={k} label={k} value={empty && k === 'wall time' ? 'no run finished' : v} loading={loading && k === 'wall time'} />
        ))}
      </Section>
      {!empty && (
        <Section
          icon={Icons.stop}
          title="Why it stopped"
          meta={state === 'partial' ? 'you · at 400 s' : state === 'one-round' ? 'budget · after round 1' : 'engine · after round 4'}
          bodyStyle={{ gap: 0, paddingBottom: 16 }}
        >
          {loading ? (
            <div className="rp-why-loading" aria-hidden>
              <Shim w={340} h={10} />
              <Shim w={300} h={10} />
              <Shim w={180} h={10} />
            </div>
          ) : (
            <p className="rp-why">
              {state === 'partial'
                ? 'You cancelled the run at 400 s. Rounds 3 and 4 were skipped, so the values are after round 2. Resume run picks up at round 3.'
                : state === 'one-round'
                  ? 'The budget was 1 round. Round 1 accepted routing_search, 321 → 298 two-qubit gates; rounds 2 to 4 did not run.'
                  : STOP_COPY}
            </p>
          )}
        </Section>
      )}
      <Section
        icon={Icons.list}
        title="Findings"
        meta={empty ? 'not scored yet' : state === 'partial' ? '3 open · 1 accepted' : state === 'one-round' ? '4 open · 0 accepted' : '2 open · 2 accepted'}
        bodyStyle={{ gap: 0 }}
      >
        {empty ? (
          <p className="rp-why is-muted">Findings appear after the first score.</p>
        ) : (
          findings.map((f) => (
            <div key={f.rank + f.evidence} className="rp-finding">
              <span className="mono rp-finding-rank">{f.rank}</span>
              <span className="rp-finding-title">{f.title}</span>
              <span className="rp-grow" />
              <span className="mono rp-finding-evidence">{f.evidence}</span>
              <span className="rp-finding-status">{loading ? <Shim w={60} h={10} /> : <MarkWord kind={f.status} word={f.word} />}</span>
            </div>
          ))
        )}
      </Section>
      {!empty && (
        <Section icon={Icons.hash} title="Reproducibility" meta="sha256 · versions" bodyStyle={{ gap: 0 }}>
          {REPRODUCIBILITY.map(([k, v]) => (
            <FactRow
              key={k}
              label={k}
              value={k === 'report.json' && state === 'error' ? 'missing (Q601)' : v}
              loading={loading && (k === 'final.qasm' || k === 'report.json')}
            />
          ))}
        </Section>
      )}
    </>
  )
}
