/*
 * S-05 · Machine estimate. What the final circuit (270 two-qubit gates) costs per run on five fake
 * backends, and how the cost fell round by round. Opens as the "Estimate" tab beside the file tab,
 * which is the way back (fix-round-1 D6). Choosing a backend moves the yellow outline and the
 * inspector's before and after follows it (click, or arrow keys and Enter).
 *
 * States (?state=…): selected, error (Q904, alias unavailable), loading, focus, empty, offline.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { RUN, TWO_QUBIT } from '../data/demo'
import { actions } from '../data/run'
import { EditorButton, ModeBlock, ModeTabs, Section, TileHeader } from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { BackendTable, type RowMode } from './estimate/BackendTable'
import { CostChart } from './estimate/CostChart'
import { BACKENDS, SNAPSHOT_DATE, perRound, saving, sec, signedPct, usd } from './estimate/data'
import { Spinner } from './estimate/Spinner'
import './estimate/estimate.css'

type StateParam = 'selected' | 'error' | 'unavailable' | 'loading' | 'focus' | 'empty' | 'offline' | null

const FOOTNOTE = 'cost = QPU time × 96 $ per minute · an estimate, not a quote'

const KYIV = BACKENDS.findIndex((b) => b.name === 'FakeKyiv')
const MARRAKESH = BACKENDS.findIndex((b) => b.name === 'FakeMarrakesh')
const BRISBANE = BACKENDS.findIndex((b) => b.name === 'FakeBrisbane')

export function S05Estimate() {
  const raw = (useHashParams().get('state') as StateParam) ?? null
  const state = raw === 'unavailable' ? 'error' : raw
  const [mode, setMode] = useState<'laptop' | 'platform'>('laptop')
  const [chosen, setChosen] = useState(state === 'selected' ? MARRAKESH : 0)
  const [open, setOpen] = useState(true)
  // A deep link to another state resets the choice that state draws.
  const [shownState, setShownState] = useState(state)
  if (shownState !== state) {
    setShownState(state)
    setChosen(state === 'selected' ? MARRAKESH : 0)
  }

  const empty = state === 'empty'
  // With a banner above the table, the footnote moves up into the assumptions header so nothing scrolls.
  const compact = state === 'error' || state === 'offline'
  const loading = state === 'loading'
  const backend = BACKENDS[chosen]
  const gates = TWO_QUBIT[4]

  const modes: RowMode[] | undefined = loading
    ? ['estimated', 'estimated', 'running', 'queued', 'queued']
    : state === 'error'
      ? BACKENDS.map((_, i) => (i === KYIV ? 'unavailable' : 'estimated'))
      : undefined

  const meta = empty
    ? 'not scored yet'
    : state === 'offline'
      ? `cached snapshots of ${SNAPSHOT_DATE}`
      : loading
        ? `final circuit · ${gates} two-qubit gates · estimating 3 of 5 backends · about 25 s`
        : state === 'error'
          ? `final circuit · ${gates} two-qubit gates · 4 of 5 backends estimated · 96 $ per QPU minute`
          : `final circuit · ${gates} two-qubit gates · 5 fake backends · 96 $ per QPU minute`

  const s = saving(backend)

  const inspector = (
    <>
      <ModeTabs active={mode} onChange={setMode} />
      <ModeBlock line={`Estimates use the target's calibration snapshot of ${SNAPSHOT_DATE}`} style={{ paddingTop: 18, paddingBottom: 14 }} />
      <Section
        icon={<SwapIcon />}
        title="Before and after"
        meta={empty ? 'not scored yet' : `${backend.name} · per run`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        bodyStyle={{ padding: '0 16px 16px', gap: 0 }}
      >
        {empty ? (
          <div className="est-insp-empty">Not scored yet · Run engine to score</div>
        ) : (
          <>
            <div className="est-ba-head">
              <span className="est-ba-c1" />
              <span className="est-ba-c2 est-label">reliability_heuristic</span>
              <span className="est-ba-c3 est-label">QPU time</span>
              <span className="est-ba-c4 est-label">cost</span>
            </div>
            <BeforeAfterRow label="baseline" dim rel={backend.rel.baseline} time={backend.time.baseline} cost={backend.cost.baseline} />
            <BeforeAfterRow label="final" rel={backend.rel.final} time={backend.time.final} cost={backend.cost.final} />
            <div className="est-ba-saving">
              <span>saving</span>
              <span className="est-ba-spacer" />
              <span className="est-ba-sum">
                <span className="mono est-value">{usd(s.perRun)}</span>
                <span className="mono est-unit">$ per run</span>
                <span className="mono est-ba-pct">· {signedPct(s.pct)}</span>
              </span>
            </div>
            <div className="est-ba-actions">
              <EditorButton onClick={() => actions.exportFinal()}>Export final</EditorButton>
            </div>
          </>
        )}
      </Section>
    </>
  )

  return (
    <Shell
      rail="runs"
      tabs={
        <TabStrip
          tabs={[
            { id: 'file', label: RUN.file },
            { id: 'estimate', label: 'Estimate', active: true },
            { id: 'other', label: RUN.other },
          ]}
        />
      }
      inspector={inspector}
    >
      <Content>
        <section className="tile est-tile">
          <TileHeader tabs={[{ id: 'estimate', label: 'Machine estimate', active: true }]} meta={<span className="mono">{meta}</span>} />
          {empty ? (
            <div className="est-body">
              <div className="est-empty">Run the engine to see the estimate</div>
            </div>
          ) : (
            <div className="est-body">
              <div className="est-table-group">
                {state === 'error' && (
                  <Banner word="unavailable" onRetry={() => navigate(ROUTES.estimate)}>
                    Calibration data unreachable <span className="mono">(Q904)</span> · FakeKyiv · retry to estimate it
                  </Banner>
                )}
                {state === 'offline' && (
                  <Banner word="offline" onRetry={() => navigate(ROUTES.estimate)}>
                    You are offline · cached snapshots of {SNAPSHOT_DATE} still estimate
                  </Banner>
                )}
                <BackendTable
                  chosen={chosen}
                  onChoose={setChosen}
                  modes={modes}
                  focusIndex={state === 'focus' ? BRISBANE : undefined}
                />
              </div>
              <div className="est-lede">A circuit that fails on hardware wastes the time you paid for.</div>
              <div className="est-chart-block">
                <div className="est-chart-head">
                  <span className="est-label">QPU cost per run after each round</span>
                  <span className="est-spacer" />
                  <span className="mono est-meta">{backend.name} · 96 $ per minute · baseline 4 000 shots</span>
                </div>
                <CostChart series={perRound(backend)} />
                <div className="est-assume">
                  <div className="est-assume-head">
                    <span className="est-label">what the estimate assumes</span>
                    {compact && (
                      <>
                        <span className="est-spacer" />
                        <span className="mono est-meta">{FOOTNOTE}</span>
                      </>
                    )}
                  </div>
                  <AssumeRow label="shots">4 000 × 0.263 ÷ reliability_heuristic · same precision as the baseline</AssumeRow>
                  <AssumeRow label="time per shot">scheduled_duration + about 1 ms reset and readout</AssumeRow>
                  <AssumeRow label="price" last>
                    96 $ per QPU minute · published rate card
                  </AssumeRow>
                </div>
              </div>
              {!compact && (
                <div className="est-footer">
                  <span className="est-spacer" />
                  <span className="mono est-meta">{FOOTNOTE}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </Content>
    </Shell>
  )
}

function BeforeAfterRow({ label, rel, time, cost, dim }: { label: string; rel: number; time: number; cost: number; dim?: boolean }) {
  return (
    <div className={`est-ba-row${dim ? ' is-dim' : ''}`}>
      <span className="est-ba-c1">{label}</span>
      <span className="est-ba-c2 mono">{rel.toFixed(3)}</span>
      <span className="est-ba-c3">
        <span className="mono">{sec(time)}</span>
        <span className="mono est-unit">s</span>
      </span>
      <span className="est-ba-c4">
        <span className="mono">{usd(cost)}</span>
        <span className="mono est-unit">$</span>
      </span>
    </div>
  )
}

function AssumeRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`est-assume-row${last ? ' is-last' : ''}`}>
      <span className="est-assume-label">{label}</span>
      <span className="mono est-assume-value">{children}</span>
    </div>
  )
}

/**
 * Warning banner (28 tall, inset, 2 px orange rail): icon + status word + message + Retry. Retry keeps
 * its width while it works: "Retrying" with the 14 px spinner sits in the same reserved slot (R6).
 */
function Banner({ word, children, onRetry }: { word: string; children: ReactNode; onRetry: () => void }) {
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div className="est-banner" role="status">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ flexShrink: 0 }}>
        <path d="M5 1.2L9.2 8.6H.8z" fill="none" stroke="var(--color-signal-warn)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5 4v2" fill="none" stroke="var(--color-signal-warn)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="est-banner-word">{word}</span>
      <span className="est-banner-text">{children}</span>
      <span className="est-spacer" />
      <button
        className="btn-editor est-retry"
        aria-busy={busy}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          timer.current = window.setTimeout(() => {
            setBusy(false)
            onRetry()
          }, 1200)
        }}
      >
        <span className={`est-retry-label${busy ? ' is-hidden' : ''}`}>Retry</span>
        <span className={`est-retry-label${busy ? '' : ' is-hidden'}`}>
          <Spinner size={14} />
          Retrying
        </span>
      </button>
    </div>
  )
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M3 6h11M11 3l3 3-3 3M15 12H4M7 9l-3 3 3 3"
        fill="none"
        stroke="var(--color-text-primary)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
