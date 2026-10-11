/*
 * "QPU cost per run after each round": a white step line over five columns (baseline, rounds 1 to 4),
 * flat through round 4 when it accepts nothing. 932 × 170 inset with a 44 px axis gutter, as the board.
 */
import { usd } from './data'

const W = 930
const H = 168
const COL = 186
const TOP = 12
const SPAN = 126 // px between the top and bottom ticks

export function CostChart({ series }: { series: number[] }) {
  const max = Math.max(...series)
  const min = Math.min(...series)
  const hi = Math.ceil(max)
  let lo = Math.floor(min)
  if (hi - lo < 2) lo = hi - 2
  const per = SPAN / (hi - lo)
  const y = (v: number) => Math.round((TOP + (hi - v) * per) * 10) / 10
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => hi - i)
  // grid every half unit when the range is two units, every unit otherwise
  const step = hi - lo === 2 ? 0.5 : 1
  const grid: number[] = []
  for (let v = hi; v >= lo - 1e-9; v -= step) grid.push(y(v) + 0.5)

  const xs = series.map((_, i) => i * COL)
  const end = W - 8
  let d = `M0 ${y(series[0])}`
  for (let i = 1; i < series.length; i++) d += `H${xs[i]}V${y(series[i])}`
  d += `H${end}`

  const last = series.length - 1
  const flat = series[last] === series[last - 1]
  const label = (i: number) =>
    i === 0 ? `${usd(series[0])} $ baseline` : `${usd(series[i])} $ · R${i}${i === last && flat ? ' · no change' : ''}`

  return (
    <div className="est-chart">
      <svg width="44" height="170" viewBox="0 0 44 170" className="est-chart-axis" aria-hidden>
        <text x="10" y="85" transform="rotate(-90 10 85)" textAnchor="middle" className="est-chart-text">
          $ per run
        </text>
        {ticks.map((t) => (
          <text key={t} x="38" y={y(t) + 4.5} textAnchor="end" className="est-chart-text">
            {t}
          </text>
        ))}
      </svg>
      <div className="est-chart-plot">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`QPU cost per run: ${series.map(usd).join(', ')} $`}>
          <path d={grid.map((g) => `M0 ${g}H${W}`).join('')} fill="none" stroke="rgb(255 255 255 / 4%)" />
          <path d={xs.slice(1).map((x) => `M${x + 0.5} 0V${H}`).join('')} fill="none" stroke="var(--color-surface-app)" />
          <path d={d} fill="none" stroke="var(--color-text-primary)" strokeWidth="1.5" strokeLinejoin="round" />
          {xs.slice(1).map((x, i) => (
            <circle key={x} cx={x} cy={y(series[i + 1])} r="2.5" fill="var(--color-text-primary)" />
          ))}
          {series.map((v, i) => (
            <text
              key={i}
              x={xs[i] + 8}
              y={y(v) - 8}
              className="est-chart-value"
              fill={i === last && flat ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)'}
            >
              {label(i)}
            </text>
          ))}
          {series.map((_, i) => (
            <text key={`r${i}`} x={xs[i] + 8} y="160" className="est-chart-text">
              {i === 0 ? 'baseline' : `round ${i}`}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}
