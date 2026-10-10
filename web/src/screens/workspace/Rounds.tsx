/*
 * Rounds tile (S-04): one lane per layer, one block per attempt, and the two_qubit_count step line.
 * Blocks grow in as attempts reveal; the step line steps down with each accepted fix; the yellow
 * playhead glides to the current round on the slow curve. Transport replays rounds (1.2 s per round).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ATTEMPTS, type Attempt, type AttemptStatus } from '../../data/demo'

type Shown = AttemptStatus | 'hidden'

const LAYER_COLOR = {
  reference: { stroke: '#2EA3F8', fill: '#2EA3F85C', faint: '#2EA3F829', faintStroke: '#2EA3F880', chip: '#2E7FC0' },
  local: { stroke: '#867BFA', fill: '#867BFA5C', faint: '#867BFA29', faintStroke: '#867BFA80', chip: '#6A5FD6' },
} as const

/** Expected gain while an attempt is still being verified or proposed. */
const ESTIMATE: Record<number, number> = { 1: -4, 2: -1.3, 3: -1, 4: -4, 5: -2, 6: -3, 7: -2, 8: -2 }

const ZOOMS = [0.8, 0.9, 1, 1.1, 1.2]

type Props = {
  attempts: Record<number, Shown>
  liveRound: number
  started: boolean
  selected: string | null
  gpuOff?: boolean
}

export function Rounds({ attempts, liveRound, started, selected, gpuOff }: Props) {
  const [zoomIdx, setZoomIdx] = useState(2)
  const [viewRound, setViewRound] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | null>(null)
  const W = 200 * ZOOMS[zoomIdx]
  const round = viewRound ?? liveRound

  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setViewRound((v) => {
        const next = (v ?? 0) + 1
        if (next >= liveRound) {
          setPlaying(false)
          return null
        }
        return next
      })
    }, 1200)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, liveRound])

  const transport = {
    first: () => (setPlaying(false), setViewRound(1)),
    prev: () => (setPlaying(false), setViewRound(Math.max(1, round - 1))),
    play: () => {
      if (playing) return setPlaying(false)
      setViewRound(1)
      setPlaying(true)
    },
    next: () => (setPlaying(false), setViewRound(round + 1 >= liveRound ? null : round + 1)),
    last: () => (setPlaying(false), setViewRound(null)),
  }

  // two_qubit_count at the start of each round, from accepted attempts in earlier rounds
  const value = (k: number) =>
    44 + ATTEMPTS.filter((a) => a.round < k && attempts[a.n] === 'accepted').reduce((s, a) => s + (a.delta ?? 0), 0)

  const playX = 108 + (round - 1) * W - 1

  return (
    <section className="tile ws-rounds">
      <div className="tile-header">
        <div className="tile-tabs">
          <button className="tile-tab is-active" role="tab" aria-selected>
            Rounds
          </button>
        </div>
        <div className="ws-rounds-controls">
          <div className="ws-transport">
            <button aria-label="First round" onClick={transport.first}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M6 5v14" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M19 5l-10 7 10 7z" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
            <button aria-label="Previous round" onClick={transport.prev}>
              <svg width="16" height="14" viewBox="0 0 28 24">
                <path d="M13 5L3 12l10 7zM25 5l-10 7 10 7z" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
            <button aria-label={playing ? 'Pause playback' : 'Play rounds'} onClick={transport.play}>
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M8 5v14M16 5v14" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M7 5l12 7-12 7z" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <button aria-label="Next round" onClick={transport.next}>
              <svg width="16" height="14" viewBox="0 0 28 24">
                <path d="M3 5l10 7-10 7zM15 5l10 7-10 7z" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
            <button aria-label="Live round" onClick={transport.last}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M18 5v14" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M5 5l10 7-10 7z" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <span className="ws-divider" />
          <Zoom idx={zoomIdx} count={ZOOMS.length} width={56} step={11} onChange={setZoomIdx} />
        </div>
      </div>
      <div className="ws-rounds-axis">
        <span className="ws-rounds-axis-name">round</span>
        {[1, 2, 3, 4].map((r) => (
          <span key={r} className="ws-rounds-axis-r" style={{ width: W }}>
            R{r}
          </span>
        ))}
        <span className="ws-rounds-axis-stop">stop</span>
      </div>
      <div className="ws-lanes">
        {(['reference', 'local'] as const).map((layer) => (
          <div key={layer} className="ws-lane">
            <div className="ws-lane-head">
              <span className="ws-lane-dot" style={{ background: LAYER_COLOR[layer].stroke }} />
              <span>{layer === 'reference' ? 'reference-qiskit' : 'local'}</span>
              <span className="ws-lane-sep">|</span>
              <span>{layer === 'reference' ? 'engine' : 'granite-8b'}</span>
              <span className="ws-lane-sep">|</span>
              <span className="ws-lane-note">{layer === 'reference' ? 'deterministic' : 'proposes, engine verifies'}</span>
            </div>
            <div className="ws-lane-chart">
              <div className="ws-lane-axis">
                <span>−4</span>
                <span>−2</span>
                <span>0</span>
              </div>
              <svg width="894" height="92" viewBox="0 0 894 92" aria-hidden>
                <Grid W={W} h={92} />
                <path d="M0 86H894" fill="none" stroke="#162328" />
                {ATTEMPTS.filter((a) => a.layer === layer).map((a) => (
                  <Block
                    key={a.n}
                    a={a}
                    status={attempts[a.n]}
                    W={W}
                    selected={selected === 'D03' && a.n === 6}
                    dim={a.round > round}
                    gpuOff={gpuOff && layer === 'local'}
                  />
                ))}
              </svg>
            </div>
          </div>
        ))}
        <div className="ws-lane is-count">
          <div className="ws-lane-head">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <circle cx="2.5" cy="2.5" r="2" fill="#FFFFFF" />
              <circle cx="7.5" cy="2.5" r="2" fill="#FFFFFF" />
              <circle cx="2.5" cy="7.5" r="2" fill="#FFFFFF" />
              <circle cx="7.5" cy="7.5" r="2" fill="#FFFFFF" />
            </svg>
            <span>two_qubit_count</span>
            <span className="ws-lane-sep">|</span>
            <span>primary</span>
            <span className="ws-lane-sep">|</span>
            <span className="ws-lane-note">lower is better</span>
          </div>
          <div className="ws-lane-chart is-count">
            <div className="ws-lane-axis is-count">
              <span>48</span>
              <span>40</span>
              <span>32</span>
            </div>
            <svg width="894" height="72" viewBox="0 0 894 72" aria-hidden>
              <Grid W={W} h={72} />
              <CountLine W={W} started={started ? liveRound : 0} value={value} round={round} />
            </svg>
          </div>
        </div>
        {started && (
          <>
            <div className="ws-playhead" style={{ left: playX }} />
            <div className="ws-playhead-handle" style={{ left: playX - 5 }} />
          </>
        )}
      </div>
    </section>
  )
}

function Grid({ W, h }: { W: number; h: number }) {
  const minor: number[] = []
  const major: number[] = []
  for (let r = 0; r < 5; r++) {
    for (let i = 1; i < 5; i++) {
      const gx = r * W + (i * W) / 5
      if (gx < 894) minor.push(gx)
    }
    if (r > 0 && r < 4) major.push(r * W)
  }
  return (
    <>
      <path d={minor.map((g) => `M${g} 0V${h}`).join('')} fill="none" stroke="#162328" />
      <path d={major.map((g) => `M${g} 0V${h}`).join('')} fill="none" stroke="#0F1F23" />
      <path d={`M${4 * W} 0V${h}`} fill="none" stroke="#496166" strokeDasharray="2 3" />
    </>
  )
}

function curve(start: number, top: number, k: number) {
  const s = start
  return `M${s} 86 C ${s + 45 * k} 86, ${s + 55 * k} ${top}, ${s + 88 * k} ${top} C ${s + 121 * k} ${top}, ${s + 131 * k} 86, ${s + 176 * k} 86 Z`
}

const LABEL: Record<string, { glyph: string; color: string }> = {
  accepted: { glyph: '✓ accepted', color: '#5FEEA3' },
  rejected: { glyph: '× rejected', color: '#FF3478' },
  verifying: { glyph: '● verifying', color: '#2EA3F8' },
  proposed: { glyph: '✧ proposed', color: '#B3ACFC' },
}

function Block({ a, status, W, selected, dim, gpuOff }: { a: Attempt; status: Shown; W: number; selected: boolean; dim: boolean; gpuOff?: boolean }) {
  if (status === 'hidden') return null
  const k = W / 200
  const roundStart = (a.round - 1) * W
  const s = roundStart + 12 * k
  const peak = s + 88 * k
  const c = LAYER_COLOR[a.layer]
  const style: CSSProperties = { opacity: dim ? 0.25 : 1 }

  if (status === 'queued') {
    return (
      <g className="ws-block" style={style}>
        <path className="ws-block-shape" d={curve(s, 56, k)} style={{ d: `path('${curve(s, 56, k)}')` } as CSSProperties} fill="none" stroke="#496166" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x={s} y="16" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
          {gpuOff ? '○ waiting for GPU' : '○ queued'}
        </text>
      </g>
    )
  }

  const faint = status === 'rejected' || status === 'inconclusive'
  const delta = status === 'accepted' ? (a.delta ?? ESTIMATE[a.n]) : ESTIMATE[a.n]
  const top = status === 'rejected' ? 69.75 : status === 'inconclusive' ? 73.5 : 86 - 12.5 * Math.abs(delta)
  const d = curve(s, top, k)
  const showChip = !faint
  return (
    <g className="ws-block" style={style}>
      {selected && (
        <rect x={roundStart + 6.5 * k} y="2.5" width={187 * k} height="87" rx="2" fill="#F8D4411A" stroke="#F8D441" className="ws-block-select" />
      )}
      <path
        className="ws-block-shape"
        d={d}
        style={{ d: `path('${d}')` } as CSSProperties}
        fill={faint ? c.faint : c.fill}
        stroke={faint ? c.faintStroke : c.stroke}
        strokeWidth="1.5"
        strokeDasharray={faint ? '4 3' : undefined}
      />
      {showChip && (
        <g className="ws-block-chip">
          <rect x={peak - 11} y={top + 6} width="22" height="14" rx="2" fill={c.chip} />
          <text x={peak} y={top + 16.5} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
            {delta === -3 ? '−3' : delta === -4 ? '−4' : '−2'}
          </text>
        </g>
      )}
      <text x={s} y="16" fontFamily="JetBrains Mono" fontSize="11" fill={faint ? '#FFFFFFB3' : '#FFFFFF'}>
        {a.strategy}
      </text>
      {status === 'inconclusive' ? (
        <>
          <circle cx={s + 4} cy="26" r="3.5" fill="none" stroke="#FF986E" strokeWidth="1.3" strokeDasharray="1.6 1.6" />
          <text x={s + 12} y="30" fontFamily="Hanken Grotesk" fontSize="11" fill="#FF986E">
            inconclusive
          </text>
        </>
      ) : (
        <text x={s} y="30" fontFamily="Hanken Grotesk" fontSize="11" fill={LABEL[status].color} className="ws-block-status">
          {LABEL[status].glyph}
        </text>
      )}
    </g>
  )
}

const yOf = (v: number) => 23 + (44 - v) * 3.25

function CountLine({ W, started, value, round }: { W: number; started: number; value: (k: number) => number; round: number }) {
  const shown = Math.min(started, round)
  let solid = ''
  for (let k = 1; k <= shown; k++) {
    const y = yOf(value(k))
    solid += k === 1 ? `M0 ${y}H${W}` : `V${y}H${k * W}`
  }
  const lastV = shown ? value(shown) : 44
  const dashed = `M${shown * W} ${yOf(lastV)}H${4 * W}`
  return (
    <g>
      {solid && <path className="ws-count-line" d={solid} fill="none" stroke="#FFFFFF" strokeWidth="1.5" />}
      <path d={dashed} fill="none" stroke="#FFFFFF80" strokeWidth="1.5" strokeDasharray="3 4" />
      {Array.from({ length: shown }, (_, i) => {
        const k = i + 1
        const v = value(k)
        const cx = (k - 1) * W + 100 * (W / 200)
        const y = yOf(v)
        return (
          <g key={k} className="ws-count-chip">
            <rect x={cx - 12} y={y - 7} width="24" height="14" rx="2" fill="#0F1F23" stroke="#FFFFFF80" />
            <text x={cx} y={y + 3.5} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
              {v}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function Zoom({
  idx,
  count,
  width,
  step,
  onChange,
}: {
  idx: number
  count: number
  width: number
  /** knob travel per zoom level, in px */
  step: number
  onChange: (i: number) => void
}) {
  const knob = idx * step
  return (
    <div className="ws-zoom">
      <button aria-label="Zoom out" onClick={() => onChange(Math.max(0, idx - 1))}>
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path d="M6 12h12" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <span className="ws-zoom-track" style={{ width }}>
        <span className="ws-zoom-rail" />
        <span className="ws-zoom-knob" style={{ left: knob }} />
      </span>
      <button aria-label="Zoom in" onClick={() => onChange(Math.min(count - 1, idx + 1))}>
        <svg width="14" height="14" viewBox="0 0 24 24">
          <path d="M6 12h12M12 6v12" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
