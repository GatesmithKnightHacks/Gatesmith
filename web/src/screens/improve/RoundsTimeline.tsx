/*
 * S-07 Rounds timeline (978×554), redrawn from the board as live geometry:
 * one column per round (164 wide), a lane per layer, the two_qubit_count step line, and the
 * yellow playhead that glides to where the run is (--motion-slow, standard curve).
 */
import type { KeyboardEvent } from 'react'
import { ATTEMPTS, type Attempt, type AttemptStatus } from '../../data/demo'

export type BlockStatus = AttemptStatus | 'hidden' | 'cancelled' | 'worse'

export type TimelineProps = {
  status: Record<number, BlockStatus>
  /** last round whose two_qubit_count step is drawn (0–4) */
  stepThrough: number
  playheadX: number
  stopped: boolean
  focusAttempt?: number | null
  onFocusAttempt?: (n: number) => void
  onOpenAttempt?: (n: number) => void
  worse?: boolean
}

const PEAK: Record<number, number> = { 1: 86, 2: 309, 3: 146, 4: 254, 5: 136, 6: 269, 7: 156, 8: 319 }
const LANE = {
  reference: { name: 54, status: 70, base: 176, fill: '#2EA3F8' },
  local: { name: 222, status: 238, base: 344, fill: '#867BFA' },
} as const

const colX = (round: number) => 164 + (round - 1) * 164

function curve(x: number, base: number, peak: number, closed = true) {
  return `M${x} ${base}C${x + 40} ${base},${x + 40} ${peak},${x + 70} ${peak}C${x + 100} ${peak},${x + 100} ${base},${x + 140} ${base}${closed ? 'Z' : ''}`
}

function StatusLabel({ x, y, status }: { x: number; y: number; status: BlockStatus }) {
  switch (status) {
    case 'accepted':
      return (
        <g className="tl-label" key="accepted">
          <path d={`M${x + 1} ${y - 4}l2.5 2.5l5-5`} fill="none" stroke="#5FEEA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#5FEEA3">
            accepted
          </text>
        </g>
      )
    case 'rejected':
    case 'worse':
      return (
        <g className="tl-label" key={status}>
          <path d={`M${x + 1.5} ${y - 7.5}l6 6M${x + 7.5} ${y - 7.5}l-6 6`} fill="none" stroke="#FF3478" strokeWidth="1.5" strokeLinecap="round" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#FF3478">
            {status === 'worse' ? 'rejected · worse' : 'rejected'}
          </text>
        </g>
      )
    case 'inconclusive':
      return (
        <g className="tl-label" key="inconclusive">
          <circle cx={x + 4.5} cy={y - 4.5} r="3.75" fill="none" stroke="#FF986E" strokeWidth="1.4" strokeDasharray="2 1.6" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#FF986E">
            inconclusive
          </text>
        </g>
      )
    case 'verifying':
      return (
        <g className="tl-label" key="verifying">
          <circle cx={x + 4} cy={y - 4} r="3" fill="#2EA3F8" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#2EA3F8">
            verifying
          </text>
        </g>
      )
    case 'proposed':
      return (
        <g className="tl-label" key="proposed">
          <path d={`M${x + 4} ${y - 9}l1 3 3 1-3 1-1 3-1-3-3-1 3-1z`} fill="none" stroke="#B3ACFC" strokeWidth="1.1" strokeLinejoin="round" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#B3ACFC">
            proposed
          </text>
        </g>
      )
    case 'cancelled':
      return (
        <g className="tl-label" key="cancelled">
          <path d={`M${x + 1} ${y - 4}h7`} stroke="#667E83" strokeWidth="1.5" strokeLinecap="round" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#667E83">
            cancelled
          </text>
        </g>
      )
    case 'queued':
      return (
        <g className="tl-label" key="queued">
          <circle cx={x + 4} cy={y - 4} r="3" fill="none" stroke="#667E83" strokeWidth="1.2" />
          <text x={x + 14} y={y} fontFamily="Hanken Grotesk" fontSize="12" fill="#667E83">
            queued
          </text>
        </g>
      )
    default:
      return null
  }
}

function Block({ a, status, focused, onFocus, onOpen }: { a: Attempt; status: BlockStatus; focused: boolean; onFocus: () => void; onOpen: () => void }) {
  if (status === 'hidden') return null
  const lane = LANE[a.layer]
  const x = colX(a.round)
  const peak = PEAK[a.n]
  const solid = status === 'accepted'
  const faint = status === 'queued' || status === 'cancelled'
  const worse = status === 'worse'
  const color = worse ? '#FF3478' : lane.fill
  const fill = solid ? `${color}5C` : faint ? 'transparent' : worse ? '#FF34781F' : `${color}29`
  const stroke = solid ? 'none' : faint ? '#496166' : worse ? '#FF3478' : `${color}80`
  const shownPeak = faint ? lane.base - 20 : worse ? peak - 17 : peak
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') onOpen()
  }
  return (
    <g
      className="tl-block"
      tabIndex={0}
      role="button"
      aria-label={`#${a.n} ${a.strategy}, ${status}`}
      onFocus={onFocus}
      onClick={onOpen}
      onKeyDown={onKey}
    >
      {/* the whole block is the hit target, not just the painted curve */}
      <rect x={x - 6} y={lane.name - 16} width="152" height={lane.base - lane.name + 22} fill="transparent" />
      {focused && (
        <rect x={x - 6} y={lane.name - 16} width="152" height={lane.base - lane.name + 22} rx="2" fill="none" stroke="#5FEEA3" strokeWidth="2" />
      )}
      <text x={x} y={lane.name} fontFamily="JetBrains Mono" fontSize="11" fill="#FFFFFF">
        {a.strategy}
      </text>
      <StatusLabel x={x} y={lane.status} status={status} />
      <path
        className="tl-curve"
        d={curve(x, lane.base, shownPeak, !faint)}
        style={{
          fill,
          stroke,
          strokeWidth: faint ? 1.2 : 1.5,
          strokeDasharray: solid ? 'none' : faint ? '3 3' : '4 3',
          transformOrigin: `${x + 70}px ${lane.base}px`,
        }}
      />
      {!faint && (
        <text x={x + 140} y={lane.base - 6} textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="#ADC5CA">
          #{a.n}
        </text>
      )}
      {solid && a.delta != null && (
        <g className="tl-chip" style={{ transformOrigin: `${x + 70}px ${peak + 20}px` }}>
          <rect x={x + 56} y={peak + 12} width="28" height="16" rx="2" fill="#0F1F23" />
          <text x={x + 70} y={peak + 24} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#FFFFFF">
            {a.delta === -4 ? '−4' : '−3'}
          </text>
        </g>
      )}
      {worse && (
        <g>
          <rect x={x + 40} y={shownPeak + 12} width="60" height="16" rx="2" fill="#0F1F23" />
          <text x={x + 70} y={shownPeak + 24} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#FF3478">
            depth +5
          </text>
        </g>
      )}
    </g>
  )
}

const STEP_Y = [404, 440, 476, 503] // 44, 40, 36, 33
const STEP_X = [152, 316, 480, 644, 808]

export function RoundsTimeline({ status, stepThrough, playheadX, stopped, focusAttempt, onFocusAttempt, onOpenAttempt, worse }: TimelineProps) {
  // Step line: horizontal at each level until the round that changed it.
  const levels = Math.min(stepThrough, 3)
  let d = `M152 ${STEP_Y[0]}`
  for (let i = 1; i <= levels; i++) d += `H${STEP_X[i]}V${STEP_Y[i]}`
  const lineEnd = stepThrough >= 4 ? 808 : STEP_X[Math.min(stepThrough, 4)]
  d += `H${Math.max(lineEnd, STEP_X[levels])}`

  return (
    <svg width="978" height="554" viewBox="0 0 978 554" className="tl" role="group" aria-label="Rounds timeline">
      <rect width="978" height="554" fill="#0F1F23" />
      <path d="M152.5 28V554M316.5 28V554M480.5 28V554M644.5 28V554" fill="none" stroke="#162328" />
      <path d="M0 28.5H978M0 196.5H978M0 364.5H978" fill="none" stroke="#061419" />
      <text x="12" y="18" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        round
      </text>
      {['R1', 'R2', 'R3', 'R4', 'stop'].map((t, i) => (
        <text key={t} x={164 + i * 164} y="18" fontFamily="Hanken Grotesk" fontSize="11" fill="#C2DADF">
          {t}
        </text>
      ))}

      {/* lane captions */}
      <circle cx="16" cy="50" r="4" fill="#2EA3F8" />
      <text x="28" y="54" fontFamily="Hanken Grotesk" fontSize="12" fill="#FFFFFF">
        reference-qiskit
      </text>
      <text x="28" y="70" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        engine · deterministic
      </text>
      <circle cx="16" cy="218" r="4" fill="#867BFA" />
      <text x="28" y="222" fontFamily="Hanken Grotesk" fontSize="12" fill="#FFFFFF">
        local · granite-8b
      </text>
      <text x="28" y="238" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        proposes fixes
      </text>
      <text x="28" y="252" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        engine verifies
      </text>
      <path d="M11 386H21" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x="28" y="390" fontFamily="JetBrains Mono" fontSize="11" fill="#FFFFFF">
        two_qubit_count
      </text>
      <text x="28" y="406" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        primary metric
      </text>
      <text x="28" y="420" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
        lower is better
      </text>

      {ATTEMPTS.map((a) => (
        <Block
          key={a.n}
          a={a}
          status={status[a.n] ?? 'hidden'}
          focused={focusAttempt === a.n}
          onFocus={() => onFocusAttempt?.(a.n)}
          onOpen={() => onOpenAttempt?.(a.n)}
        />
      ))}

      {/* the stop column */}
      {stopped && !worse && (
        <g className="tl-fade">
          <text x="820" y="54" fontFamily="Hanken Grotesk" fontSize="11" fill="#667E83">
            not run
          </text>
          <path d="M820 176C860 176,860 168,890 168C920 168,920 176,960 176" fill="none" stroke="#496166" strokeWidth="1.2" strokeDasharray="3 3" />
          <text x="820" y="222" fontFamily="Hanken Grotesk" fontSize="11" fill="#667E83">
            not run
          </text>
          <path d="M820 344C860 344,860 336,890 336C920 336,920 344,960 344" fill="none" stroke="#496166" strokeWidth="1.2" strokeDasharray="3 3" />
        </g>
      )}
      {worse && (
        <g className="tl-fade">
          <text x="820" y="222" fontFamily="Hanken Grotesk" fontSize="12" fill="#FFFFFF">
            Your circuit did not change.
          </text>
          <text x="820" y="240" fontFamily="Hanken Grotesk" fontSize="11" fill="#FF3478">
            #8 was worse than before:
          </text>
          <text x="820" y="254" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
            depth rose 22 → 27 layers,
          </text>
          <text x="820" y="268" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
            so the original is kept.
          </text>
          <text x="820" y="282" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
            Auto mode carries on.
          </text>
        </g>
      )}

      {/* two_qubit_count */}
      <path className="tl-step" d={d} fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
      {stopped && (
        <g className="tl-fade">
          <path d="M808 503H966" fill="none" stroke="#FFFFFF80" strokeWidth="1.5" strokeDasharray="3 4" />
          <text x="820" y="465" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
            2 more rounds
          </text>
          <text x="820" y="481" fontFamily="Hanken Grotesk" fontSize="11" fill="#ADC5CA">
            under 1% · about 3 min
          </text>
        </g>
      )}
      {/* playhead: where you are (under the value boxes, so it never cuts a number) */}
      <g className="tl-playhead" style={{ transform: `translateX(${playheadX}px)` }}>
        <path d="M0 14V554" fill="none" stroke="#F8D441" strokeWidth="1.5" />
        <circle cx="0" cy="14" r="5" fill="#F8D441" />
      </g>
      <ValueBox x={180} y={396} value="44" />
      {stepThrough >= 1 && <ValueBox x={316} y={432} value="40" check />}
      {stepThrough >= 2 && <ValueBox x={480} y={468} value="36" check />}
      {stepThrough >= 3 && <ValueBox x={644} y={495} value="33" check />}

    </svg>
  )
}

function ValueBox({ x, y, value, check }: { x: number; y: number; value: string; check?: boolean }) {
  return (
    <g className="tl-value" key={value}>
      <rect x={x - 13} y={y} width="26" height="16" rx="2" fill="#0F1F23" stroke="#FFFFFF80" />
      <text x={x} y={y + 12} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
        {value}
      </text>
      {check && (
        <path d={`M${x - 4.5} ${y + 28}l3 3l6-6`} fill="none" stroke="#5FEEA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </g>
  )
}
