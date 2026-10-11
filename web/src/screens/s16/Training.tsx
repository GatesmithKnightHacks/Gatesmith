/*
 * S-16 bottom row (Paper 1HYU-0): the Training run tile with its loss curve, and the GPU tile.
 * Variants from 1LWU-0: training (epoch 23), queued behind vLLM, stored results while the GPU is off,
 * loading, empty, and the failed qscore conform run.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { EditorButton, TileHeader } from '../../ui/parts'
import { Banner, Block, Fact, Stage, StatusWord } from '../stretch/parts'
import { CONFORM_FAILURES, THROUGHPUT, TRAIN, VALIDATION } from './data'

/* ── Loss chart: drawn to the height it gets (342 on the board) ──────── */
const X0 = 44
const PX_PER_EPOCH = 590 / 40
const yAt = (y: number, h: number) => 30 + ((y - 30) * (h - 56)) / 284

function path(points: [number, number][], h: number, upTo = 40) {
  const pts: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    const [e, y] = points[i]
    if (e <= upTo) pts.push([e, y])
    else {
      const [e0, y0] = points[i - 1]
      pts.push([upTo, y0 + ((y - y0) * (upTo - e0)) / (e - e0)])
      break
    }
  }
  return { d: pts.map(([e, y], i) => `${i ? 'L' : 'M'}${(X0 + e * PX_PER_EPOCH).toFixed(1)} ${yAt(y, h).toFixed(1)}`).join(''), end: pts[pts.length - 1] }
}

export function LossChart({ upTo = 40, label }: { upTo?: number; label?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(340)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setH(Math.max(160, Math.round(el.clientHeight)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const train = path(TRAIN, h, upTo)
  const val = path(VALIDATION, h, upTo)
  const done = upTo >= 40
  const grid = [50.3, 131.4, 212.6, 293.7].map((y) => yAt(y, h))
  const bottom = h - 26
  return (
    <div className="s16-chart" ref={ref}>
      <svg width="650" height={h} viewBox={`0 0 650 ${h}`} aria-label={`Loss per epoch: train ${done ? '0.21' : '0.25'}, validation ${done ? '0.26 kept at epoch 34' : 'drawing'}`}>
        <path d={grid.map((y) => `M44 ${y.toFixed(1)}H634`).join('')} fill="none" stroke="var(--color-surface-app)" />
        <path d={[44, 191.5, 339, 486.5, 634].map((x) => `M${x} 30V${bottom}`).join('')} fill="none" stroke="var(--color-surface-app)" />
        <path d={`M44 ${bottom}H634`} fill="none" stroke="var(--color-border-subtle)" />
        {done && <path d={`M545.5 30V${bottom}`} fill="none" stroke="var(--color-text-secondary)" strokeDasharray="3 3" />}
        <path d={val.d} fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={train.d} fill="none" stroke="var(--color-text-primary)" strokeWidth="2" strokeLinejoin="round" />
        {!done && <circle cx={X0 + upTo * PX_PER_EPOCH} cy={yAt(train.end[1], h)} r="3" fill="var(--color-text-primary)" />}
      </svg>
      <span className="mono s16-axis" style={{ left: 44, top: 9 }}>
        loss · nats per token
      </span>
      <span className="s16-chart-legend">
        <span>
          <span className="s16-line-solid" />
          train
        </span>
        <span>
          <svg width="16" height="2" viewBox="0 0 16 2" aria-hidden>
            <path d="M0 1H16" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          validation
        </span>
      </span>
      {done ? (
        <span className="mono s16-axis is-secondary" style={{ left: 449, top: 34 }}>
          kept · epoch 34
        </span>
      ) : (
        label && (
          <span className="mono s16-axis is-white" style={{ left: X0 + upTo * PX_PER_EPOCH + 8, top: yAt(train.end[1], h) - 12 }}>
            {label}
          </span>
        )
      )}
      {['1.4', '1.0', '0.6', '0.2'].map((t, i) => (
        <span key={t} className="mono s16-axis s16-y" style={{ top: grid[i] - 7 }}>
          {t}
        </span>
      ))}
      <span className="mono s16-axis" style={{ left: 4, top: bottom + 6 }}>
        epoch
      </span>
      {[0, 10, 20, 30, 40].map((e) => (
        <span key={e} className="mono s16-axis s16-x" style={{ left: X0 + e * PX_PER_EPOCH - (e === 40 ? 8 : 15), width: e === 40 ? 16 : 30, top: bottom + 6 }}>
          {e}
        </span>
      ))}
    </div>
  )
}

export type TrainingView = 'done' | 'training' | 'loading' | 'queued' | 'stored' | 'empty' | 'conform-failed' | 'offline'

export function TrainingTile({ view, onShowReport, onChooseSubset }: { view: TrainingView; onShowReport?: () => void; onChooseSubset?: () => void }) {
  const conform = view === 'conform-failed'
  const meta: Record<TrainingView, string> = {
    done: 'gategroup-reversible-0.1 · epoch 40 of 40 · done',
    offline: 'gategroup-reversible-0.1 · epoch 40 of 40 · done',
    training: 'gategroup-reversible-0.1 · epoch 23 of 40 · running',
    loading: 'gategroup-reversible-0.1',
    queued: 'epoch 0 of 40',
    stored: 'results from 11:20',
    empty: 'no training run yet',
    'conform-failed': '7f3c·91b2 · 9 of 12 fixtures passed',
  }
  return (
    <section className="tile s16-training">
      <TileHeader
        tabs={[{ id: 't', label: conform ? 'qscore conform' : 'Training run', active: true }]}
        meta={<span className="mono">{meta[view]}</span>}
      />
      <div className="s16-training-body">
        {conform ? (
          <ConformFailed onShowReport={onShowReport} />
        ) : view === 'loading' ? (
          <>
            <Stage>Loading the training run · about 1 s</Stage>
            <div className="s16-chart is-loading" aria-hidden>
              <Block w="100%" h={12} style={{ position: 'absolute', left: 44, right: 14, top: 40, width: 'auto' }} />
            </div>
            <TrainFacts loading />
          </>
        ) : view === 'empty' ? (
          <>
            <div className="s16-train-empty">
              <span className="s16-empty-title">No training run yet.</span>
              <span>Pick a fixture subset to train a gate-group layer on this GPU. Loss and validation draw here as epochs finish.</span>
              <EditorButton onClick={onChooseSubset} style={{ background: 'var(--color-surface-inset)' }}>
                Choose a subset
              </EditorButton>
            </div>
          </>
        ) : view === 'queued' ? (
          <>
            <div className="s16-status-line">
              <StatusWord word="queued" gap={6} />
              <span>Starts when vLLM releases the GPU</span>
            </div>
            <div className="s16-facts">
              <Fact label="Model" value="gategroup-reversible-0.2" height={26} />
              <Fact label="Position" value="1 of 2" height={26} />
              <Fact label="Needs" value="11.2" unit="GB · 3.9 GB free" height={26} />
              <Fact label="Estimate once started" value="38" unit="min" height={26} last />
            </div>
            <span className="s16-sub-label">previous run · gategroup-reversible-0.1 · epoch 40 of 40</span>
            <LossChart />
          </>
        ) : view === 'stored' ? (
          <>
            <span className="s16-stored-line">Rates come from the 11:20 run, stored on this machine.</span>
            <div className="s16-facts is-two">
              <div>
                <Fact label="Read rates" value="works" mono={false} height={26} />
                <Fact label="Train" value="waits" mono={false} height={26} last />
              </div>
              <div>
                <Fact label="Evaluate" value="waits" mono={false} height={26} />
                <Fact label="qscore conform" value={<StatusWord word="queued" gap={4} />} mono={false} height={26} last />
              </div>
            </div>
            <LossChart />
          </>
        ) : view === 'training' ? (
          <>
            <Stage>Training gategroup-reversible-0.1 · epoch 23 of 40 · about 16 min</Stage>
            <LossChart upTo={23} label="0.25 nats per token · epoch 23" />
            <div className="s16-facts is-two">
              <div>
                <Fact label="Train loss now" value="0.25" unit="nats per token" />
                <Fact label="Validation loss" value="0.29" unit="nats per token · epoch 23" />
                <Fact label="Training set" value="6 200" unit="accepted rewrites" last />
              </div>
              <div>
                <Fact label="Wall time" value="22" unit="min · 57 s per epoch" />
                <Fact label="Held out" value="620" unit="rewrites · 10%" />
                <Fact label="Bench fixtures" value="0" unit="seen in training" last />
              </div>
            </div>
          </>
        ) : (
          <>
            <LossChart />
            <TrainFacts />
          </>
        )}
      </div>
    </section>
  )
}

function TrainFacts({ loading }: { loading?: boolean }) {
  const v = (value: string, w: number) => (loading ? <Block w={w} /> : value)
  return (
    <div className="s16-facts is-two">
      <div>
        <Fact label="Final train loss" value={v('0.21', 28)} unit={loading ? undefined : 'nats per token'} />
        <Fact label="Validation loss, kept" value={v('0.26', 28)} unit={loading ? undefined : 'nats per token · epoch 34'} />
        <Fact label="Training set" value={v('6 200', 40)} unit={loading ? undefined : 'accepted rewrites'} last />
      </div>
      <div>
        <Fact label="Wall time" value={v('38', 20)} unit={loading ? undefined : 'min · 57 s per epoch'} />
        <Fact label="Held out" value={v('620', 28)} unit={loading ? undefined : 'rewrites · 10%'} />
        <Fact label="Bench fixtures" value={v('0', 12)} unit={loading ? undefined : 'seen in training'} last />
      </div>
    </div>
  )
}

function ConformFailed({ onShowReport }: { onShowReport?: () => void }) {
  return (
    <>
      <Banner word="failed" action="Show report" onAction={onShowReport}>
        gategroup-reversible-0.1 edited gates outside its block on 3 fixtures
      </Banner>
      <div className="s16-failures">
        {CONFORM_FAILURES.map((f) => (
          <div key={f.fixture} className="s16-failure">
            <span className="s16-failure-word">
              <StatusWord word="failed" gap={4} />
            </span>
            <span className="s16-failure-main">
              <span className="s16-failure-top">
                <span className="s16-failure-what">
                  {f.what} <span className="mono">({f.code})</span>
                </span>
                <span className="mono s16-fixture is-white">{f.fixture}</span>
              </span>
              <span className="s16-failure-where">{f.where}</span>
            </span>
          </div>
        ))}
      </div>
      <span className="s16-fix">Fix: retrain with block masks so every edit stays inside its block, then run qscore conform again.</span>
      <span className="s16-sub-label">the layer stays off the leaderboard until qscore conform passes 12 of 12 fixtures · its training run</span>
      <LossChart />
    </>
  )
}

/* ── GPU tile ────────────────────────────────────────────────────────── */
export type GpuView = 'online' | 'busy' | 'off'

export function GpuTile({ view }: { view: GpuView }) {
  const busy = view === 'busy'
  const off = view === 'off'
  return (
    <section className="tile s16-gpu">
      <TileHeader tabs={[{ id: 'g', label: 'GPU', active: true }]} meta={<span className="mono">{off ? 'last seen 11:42' : 'W7900 · 48 GB'}</span>} />
      <div className="s16-gpu-body">
        <div className="s16-gpu-state">
          <span className="s16-gpu-online">
            <span className={`st-gpu-dot${off ? ' is-off' : ''}`} />
            {off ? 'GPU off' : 'GPU online'}
          </span>
          <span className="mono s16-gpu-job">{busy ? 'held by vLLM' : off ? 'machine is off' : 'bench job 7f3d·2a10'}</span>
        </div>
        <div className="s16-memory">
          <div className="s16-memory-head">
            <span className="s16-label">memory</span>
            {off ? (
              <StatusWord word="queued" gap={4} label="unavailable" />
            ) : (
              <span className="s16-inline">
                <span className="mono s16-val">{busy ? '44.1' : '9.4'}</span>
                <span className="mono s16-unit">of 48 GB</span>
              </span>
            )}
          </div>
          <div className="s16-memory-bar">{!off && <span className={busy ? 'is-busy' : ''} style={{ width: busy ? '91.9%' : '19.6%' }} />}</div>
          {!off && (
            <div className="s16-memory-legend">
              <span>
                <span className={`s16-swatch${busy ? ' is-busy' : ''}`} />
                {busy ? 'vLLM · 44.1 GB' : 'resident model · 9.4 GB'}
              </span>
              <span className="is-dim">
                <span className="s16-swatch is-free" />
                free · {busy ? '3.9' : '38.6'} GB
              </span>
            </div>
          )}
        </div>
        <div className="s16-facts">
          {off ? (
            <>
              <Fact label="Card" value="W7900 · 48 GB" height={26} />
              <Fact label="Resident model" value="none" height={26} />
              <Fact label="Queue" value="1" unit="job waiting · qscore conform" height={26} last />
            </>
          ) : (
            <>
              <Fact label="Card" value="W7900" height={26} />
              <Fact label="Memory" value="48" unit="GB" height={26} />
              <Fact label="Memory mode" value="exclusive" height={26} />
              <Fact label="Resident model" value={busy ? 'Qiskit/granite-3.3-8b-qiskit' : 'gategroup-linear-0.2'} height={26} />
              <Fact label="Tokens per second" value="212" unit={busy ? 'tok/s · vLLM' : 'tok/s'} height={26} />
              <Fact label="Queue" value={busy ? '2' : '0'} unit="jobs waiting" height={26} last />
            </>
          )}
        </div>
        <div className="s16-throughput">
          <div className="s16-memory-head">
            <span className="s16-label">throughput</span>
            <span className="mono s16-unit">{off ? 'none since 11:42' : 'tok/s · last 10 min'}</span>
          </div>
          <div className="s16-throughput-plot">
            <svg width="274" height="100" viewBox="0 0 274 100" preserveAspectRatio="none" aria-label="Throughput, last 10 minutes, about 212 tokens per second">
              <path d="M28 10H274M28 50H274M28 90H274" fill="none" stroke="var(--color-surface-app)" vectorEffect="non-scaling-stroke" />
              {!off && <path d={THROUGHPUT} fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
            </svg>
            <span className="mono s16-unit" style={{ top: 5 }}>
              300
            </span>
            <span className="mono s16-unit" style={{ top: 37 }}>
              150
            </span>
            <span className="mono s16-unit" style={{ top: 69 }}>
              0
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
