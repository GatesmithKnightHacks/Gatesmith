/*
 * S-09 · Final report (D1). Original and Final side by side, metrics, rounds and the machine estimate.
 * Live arrival (M5): Original and Final start as one circuit and split apart on the standard curve,
 * the mint region draws in, then Metrics, Rounds and the estimate arrive 40 ms apart.
 */
import { useEffect, useState } from 'react'
import { useHashParams } from '../app/router'
import { actions, useRun } from '../data/run'
import { RELIABILITY } from '../data/demo'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { EditorButton, ModeTabs, PrimaryButton, SecondaryPair, Tile } from '../ui/parts'
import { CircuitDrawing, FINAL, ORIGINAL } from './report/Circuit'
import { Collapsible, FactRow, Icons, copyText, useFlash } from './report/bits'
import { QasmDiff } from './report/QasmDiff'
import './report/report.css'

type ReportState = 'complete' | 'partial' | 'one-round' | 'loading' | 'empty' | 'error' | 'offline'

const CHECK = (color: string) => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M2.5 6.5l2.3 2.3L9.5 3.8" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

type MetricRow = {
  name: string
  primary?: boolean
  before: string
  after: string
  unit?: string
  change: string
  status: string
  good?: boolean
  note?: string
}

const METRICS: MetricRow[] = [
  { name: 'two_qubit_count · primary', primary: true, before: '44', after: '33', unit: 'gates', change: '−25%', status: 'improved', good: true },
  { name: 'depth', before: '58', after: '51', unit: 'layers', change: '−12%', status: 'holds' },
  { name: 'two_qubit_depth', before: '24', after: '22', unit: 'layers', change: '−8%', status: 'holds' },
  { name: 'swaps_inserted', before: '18', after: '11', unit: 'ops', change: '−39%', status: 'holds' },
  { name: 'routing_overhead', before: '0.41', after: '0.29', unit: 'ratio', change: '−29%', status: 'under 0.30' },
  {
    name: 'reliability_heuristic',
    before: '0.692',
    after: '0.762',
    change: '+0.070',
    status: 'holds',
    note: RELIABILITY.label,
  },
  { name: 'width', before: '12', after: '12', unit: 'q', change: '0', status: 'holds' },
]

export function S09Report() {
  const run = useRun()
  const params = useHashParams()
  const state = (params.get('state') ?? 'complete') as ReportState
  const [tab, setTab] = useState<'circuits' | 'qasm'>('circuits')
  // M5 plays when the live flow carries the circuit here from the loop view.
  const [arriving, setArriving] = useState(() => run.live && run.phase === 'report')
  useEffect(() => {
    if (!arriving) return
    const t = window.setTimeout(() => setArriving(false), 1200)
    return () => clearTimeout(t)
  }, [arriving])

  const empty = state === 'empty'

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
      inspector={<ReportInspector state={state} />}
    >
      <Content className={`rp-content${arriving ? ' is-arriving' : ''}`}>
        <Tile
          className="rp-circuits"
          name="circuit-canvas"
          tabs={[
            { id: 'circuits', label: 'Original and final', active: tab === 'circuits', onClick: () => setTab('circuits') },
            { id: 'qasm', label: 'QASM diff', active: tab === 'qasm', onClick: () => setTab('qasm') },
          ]}
          meta={<span className="mono">sidechain_qaoa · 12 q · FakeTorino · best of 8 seeds</span>}
        >
          {tab === 'circuits' ? (
            <div className="rp-pair">
              <figure className="rp-panel rp-panel-original">
                <figcaption className="rp-panel-head">
                  <span className="rp-panel-title">Original</span>
                  <span className="mono rp-panel-meta">44 two-qubit gates · depth 58</span>
                </figcaption>
                <CircuitDrawing cx={ORIGINAL.cx} swaps={ORIGINAL.swaps} region={ORIGINAL.region} />
              </figure>
              <figure className="rp-panel rp-panel-final">
                <figcaption className="rp-panel-head">
                  <span className="rp-panel-title">{empty ? 'Final · no accepted fixes' : 'Final · 3 accepted fixes'}</span>
                  <span className="mono rp-panel-meta">{empty ? '44 two-qubit gates · depth 58' : '33 two-qubit gates · depth 51'}</span>
                </figcaption>
                {empty ? (
                  <CircuitDrawing cx={ORIGINAL.cx} swaps={ORIGINAL.swaps} region={null} />
                ) : (
                  <CircuitDrawing cx={FINAL.cx} swaps={FINAL.swaps} region={FINAL.region} />
                )}
              </figure>
            </div>
          ) : (
            <QasmDiff />
          )}
        </Tile>

        <div className="rp-lower">
          <Tile
            className="rp-metrics rp-arrive"
            style={{ ['--i' as string]: 0 }}
            tabs={[{ id: 'm', label: 'Metrics', active: true }]}
            meta={<span className="mono">baseline vs final · same 8 seeds</span>}
          >
            {state === 'partial' ? <PartialMetrics /> : <MetricsTable empty={empty} />}
          </Tile>
          <div className="rp-right">
            <Tile
              className="rp-rounds rp-arrive"
              style={{ ['--i' as string]: 1 }}
              tabs={[{ id: 'r', label: 'Rounds', active: true }]}
              meta={<span className="mono">{state === 'one-round' ? '1 round · 2 proposals · 120 s' : '4 rounds · 8 proposals · 490 s'}</span>}
            >
              {state === 'one-round' ? <OneRound /> : <RoundsTable empty={empty} />}
            </Tile>
            <Tile
              className="rp-estimate rp-arrive"
              style={{ ['--i' as string]: 2 }}
              tabs={[{ id: 'e', label: 'On FakeTorino', active: true }]}
              meta={<span className="mono">estimate · 4,000 shots</span>}
            >
              <div className="rp-estimate-cards">
                <div className="rp-stat">
                  <span className="rp-stat-label">reliability_heuristic</span>
                  <span className="rp-stat-values">
                    <span className="mono rp-stat-before">{empty ? '0.692' : `${RELIABILITY.baseline} →`}</span>
                    {!empty && <span className="mono rp-stat-after">{RELIABILITY.final}</span>}
                  </span>
                </div>
                <div className="rp-stat">
                  <span className="rp-stat-label">Estimated cost per run</span>
                  <span className="rp-stat-values">
                    <span className="mono rp-stat-before">{empty ? '$6.72' : '$6.72 →'}</span>
                    {!empty && <span className="mono rp-stat-after">$5.32</span>}
                  </span>
                </div>
              </div>
              <p className="rp-estimate-note">
                QPU time per run 4.2 s to 3.3 s at $96 per QPU minute. About $140 saved per 100 runs. An estimate, not a quote.
              </p>
            </Tile>
          </div>
        </div>
      </Content>
    </Shell>
  )
}

function MetricsTable({ empty }: { empty: boolean }) {
  return (
    <div className="rp-table rp-metrics-table" role="table">
      <div className="rp-tr rp-th" role="row">
        <span className="rp-c-name">Metric</span>
        <span className="rp-c-num">Before</span>
        <span className="rp-c-num">After</span>
        <span className="rp-c-unit" />
        <span className="rp-c-change">Change</span>
        <span className="rp-c-status">Status</span>
      </div>
      {METRICS.map((m) => {
        const after = empty ? m.before : m.after
        const change = empty ? (m.unit === 'ratio' || m.name.startsWith('reliability') ? '0' : '0%') : m.change
        const status = empty ? 'holds' : m.status
        const good = !empty && m.good
        const row = (
          <>
            <span className={`rp-c-name${m.primary ? ' is-primary' : ''}`}>{m.name}</span>
            <span className="rp-c-num mono is-before">{m.before}</span>
            <span className="rp-c-num mono">{after}</span>
            <span className="rp-c-unit mono">{m.unit}</span>
            <span className="rp-c-change mono">{change}</span>
            <span className={`rp-c-status${good ? ' is-good' : ''}`}>
              {CHECK(good ? '#5FEEA3' : '#C2DADF')}
              {status}
            </span>
          </>
        )
        return m.note ? (
          <div key={m.name} className="rp-tr rp-tr-noted" role="row">
            <div className="rp-tr-line">{row}</div>
            <span className="rp-note">{m.note}</span>
          </div>
        ) : (
          <div key={m.name} className="rp-tr" role="row">
            {row}
          </div>
        )
      })}
      <div className="rp-tr is-last" role="row">
        <span className="rp-c-name">equivalence</span>
        <span className="rp-c-span mono">operator · exact</span>
        <span className="rp-c-status is-good">
          {CHECK('#5FEEA3')}
          passed
        </span>
      </div>
    </div>
  )
}

function PartialMetrics() {
  return (
    <div className="rp-partial">
      <div className="rp-banner is-warn">
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 2.5l5 9H2z" fill="none" stroke="#FF986E" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        Partial report. 2 metrics skipped, unaffordable at 20 qubits.
      </div>
      <div className="rp-table">
        <div className="rp-tr">
          <span className="rp-c-name">two_qubit_count · primary</span>
          <span className="mono rp-partial-value">118 → 97 gates</span>
        </div>
        <div className="rp-tr is-skipped">
          <span className="rp-c-name">simulated_task_score</span>
          <span className="rp-partial-value">skipped · unaffordable, 20 q statevector over budget</span>
        </div>
        <div className="rp-tr is-skipped is-last">
          <span className="rp-c-name">mirror_score</span>
          <span className="rp-partial-value">skipped · not selected</span>
        </div>
      </div>
    </div>
  )
}

function RoundsTable({ empty }: { empty: boolean }) {
  const rows = empty
    ? [
        { dot: '#2EA3F8', name: 'reference-qiskit', a: 0, r: 3, i: 1 },
        { dot: '#867BFA', name: 'local · granite-8b', a: 0, r: 3, i: 1 },
      ]
    : [
        { dot: '#2EA3F8', name: 'reference-qiskit', a: 1, r: 2, i: 1 },
        { dot: '#867BFA', name: 'local · granite-8b', a: 2, r: 1, i: 1 },
      ]
  const total = rows.reduce((t, x) => ({ a: t.a + x.a, r: t.r + x.r, i: t.i + x.i }), { a: 0, r: 0, i: 0 })
  return (
    <div className="rp-table rp-rounds-table" role="table">
      <div className="rp-tr rp-th" role="row">
        <span className="rp-c-name">Layer</span>
        <span className="rp-c-count">accepted</span>
        <span className="rp-c-count">rejected</span>
        <span className="rp-c-count is-wide">inconclusive</span>
      </div>
      {rows.map((x) => (
        <div key={x.name} className="rp-tr" role="row">
          <span className="rp-c-name rp-layer">
            <span className="rp-layer-dot" style={{ background: x.dot }} />
            <span className="mono">{x.name}</span>
          </span>
          <span className="rp-c-count mono">{x.a}</span>
          <span className="rp-c-count mono">{x.r}</span>
          <span className="rp-c-count is-wide mono">{x.i}</span>
        </div>
      ))}
      <div className="rp-tr is-last" role="row">
        <span className="rp-c-name is-primary">Total</span>
        <span className="rp-c-count mono">{total.a}</span>
        <span className="rp-c-count mono">{total.r}</span>
        <span className="rp-c-count is-wide mono">{total.i}</span>
      </div>
      <p className="rp-rounds-note">
        {empty
          ? '4 rounds, 0 accepted. The final circuit is the original.'
          : 'Stopped by the engine after round 4: the remaining findings are below their thresholds.'}
      </p>
    </div>
  )
}

function OneRound() {
  return (
    <div className="rp-one">
      <div className="rp-one-hero">
        <span className="mono rp-one-before">44 →</span>
        <span className="mono rp-one-after">40</span>
        <span className="rp-one-label">two-qubit gates after 1 round</span>
      </div>
      <div className="rp-one-row">
        <span className="rp-layer-dot" style={{ background: '#2EA3F8' }} />
        <span className="mono rp-one-layer">reference-qiskit</span>
        <span className="mono rp-one-strategy">routing_search</span>
        <span className="rp-one-status is-good">{CHECK('#5FEEA3')}accepted</span>
      </div>
      <div className="rp-one-row">
        <span className="rp-layer-dot" style={{ background: '#867BFA' }} />
        <span className="mono rp-one-layer">local · granite-8b</span>
        <span className="mono rp-one-strategy">commuting_reorder</span>
        <span className="rp-one-status is-bad">
          <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="#FF3478" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          rejected
        </span>
      </div>
      <p className="rp-rounds-note">Stopped by you after round 1. One row per proposal.</p>
    </div>
  )
}

function ReportInspector({ state }: { state: ReportState }) {
  const [copied, flash] = useFlash()
  const offline = state === 'offline'
  const loading = state === 'loading'

  return (
    <>
      <ModeTabs />
      <div className="rp-mode-line">
        {loading ? 'Scored on this machine · building the report' : 'Scored on this machine · 4 rounds · stopped by the engine'}
      </div>
      <div className="rp-insp-body">
        <div className="rp-export">
          {state === 'error' ? (
            <div className="rp-error">
              <div className="rp-error-head">
                <span className="rp-error-word">
                  <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="#FF3478" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Final benchmark failed
                </span>
                <span className="mono rp-error-code">Q508</span>
              </div>
              <p className="rp-export-text">Seed 79 ran out of memory during transpile. The 7 other seeds finished; retry runs only the failed one.</p>
            </div>
          ) : state === 'empty' ? (
            <div className="rp-empty">
              <span className="rp-empty-title">No fix improved this circuit</span>
              <p className="rp-export-text">
                4 rounds, 0 accepted. The final circuit is the original, and the report still lists every attempt with its decision so
                you can see what was tried.
              </p>
            </div>
          ) : loading ? (
            <div className="rp-loading-line">
              <span>Final benchmark · seed 6 of 8</span>
              <span className="mono">about 9 s left</span>
            </div>
          ) : (
            <p className="rp-export-text">Two-qubit gates went from 44 to 33. Every constraint held and every fix verified exactly.</p>
          )}
          {offline && (
            <div className="rp-offline">
              <span className="rp-offline-dot" />
              Offline. The report is saved locally; Copy report link waits for a connection.
            </div>
          )}
          {state === 'error' ? (
            <PrimaryButton onClick={() => {}}>Retry seed 79</PrimaryButton>
          ) : state === 'empty' ? (
            <PrimaryButton onClick={() => actions.reset()}>Run again</PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() => !loading && actions.openExport()}
              progress={loading ? 0.75 : undefined}
              name="primary-action"
            >
              {loading ? 'Building report (75%)' : 'Export'}
            </PrimaryButton>
          )}
          <SecondaryPair>
            <EditorButton
              wide
              disabled={offline || loading}
              onClick={() => {
                void copyText(window.location.href.split('?')[0])
                flash('Copied')
              }}
            >
              {copied ?? 'Copy report link'}
            </EditorButton>
            <EditorButton wide disabled={loading} onClick={() => actions.reset()}>
              Run again
            </EditorButton>
          </SecondaryPair>
        </div>

        <Collapsible icon={Icons.doc} title="Run facts" meta="reproducible" borderTop={false}>
          <FactRow label="Engine" value="qscore-2026.1" />
          <FactRow label="Qiskit" value="1.3.2 · aer 0.15.1" />
          <FactRow label="Seeds" value="11 23 37 41 53 67 79 97" />
          <FactRow label="Target" value="FakeTorino · opt level 3" />
          <FactRow label="Layers" value="reference-qiskit · local" />
          <FactRow label="Model" value="granite-3.3-8b-qiskit" />
          <FactRow label="Hardware" value="8 CPU · 1 GPU 48 GB" />
          <FactRow label="Circuit sha" value="c41e…9a07 → 8b2d…11fe" />
          <FactRow label="Manifest sha" value="3f9a…1c07" last />
          <p className="rp-facts-note">Rerun with the same seeds, versions and manifest to get the same scorecard, bit for bit.</p>
        </Collapsible>

        <Collapsible icon={Icons.list} title="Findings left" meta="2 · below threshold">
          <FindingLeft title="Routing overhead under its limit" rule="D01" />
          <FindingLeft title="Block is resynthesizable" rule="D04" />
        </Collapsible>

        <Collapsible icon={Icons.shield} title="Why it stopped" meta="after round 4">
          <div className="rp-why">
            <span>Stop rule</span>
            <span className="rp-why-value">every finding below threshold</span>
          </div>
          <div className="rp-why">
            <span>Two more rounds</span>
            <span className="rp-why-value mono">under 1% · about 3 min</span>
          </div>
        </Collapsible>
      </div>
    </>
  )
}

function FindingLeft({ title, rule }: { title: string; rule: string }) {
  return (
    <div className="rp-left-row">
      <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="#2EA3F8" strokeWidth="1.6" />
      </svg>
      <span className="rp-left-word">info</span>
      <span className="rp-left-title">{title}</span>
      <span className="mono rp-left-rule">{rule}</span>
    </div>
  )
}
