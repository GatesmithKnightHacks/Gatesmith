/*
 * S-06 Diff canvas, drawn from the board: the original D03 block 2 (left, swaps inside the region the
 * model changed) and the candidate on a line layout (right). The candidate's outline carries the
 * engine's word: violet dashed while proposed, mint when accepted, pink when rejected.
 */
import type { ReactNode } from 'react'
import { FIX } from './fixPaths'

export type CandidateLook = 'accepted' | 'proposed' | 'rejected' | 'inconclusive' | 'invalid' | 'waiting'

const REGION: Record<'accepted' | 'proposed' | 'rejected' | 'inconclusive', { cls: string; legend: string }> = {
  accepted: { cls: 'cv-region-good', legend: 'engine decision · accepted' },
  proposed: { cls: 'cv-region-ai', legend: 'proposed by the model · verifying' },
  rejected: { cls: 'cv-region-bad', legend: 'engine decision · rejected' },
  inconclusive: { cls: 'cv-region-warn', legend: 'engine decision · inconclusive' },
}

export function FixCanvas({ look, overlay }: { look: CandidateLook; overlay?: ReactNode }) {
  const drawn = look !== 'invalid' && look !== 'waiting'
  const half = (i: 0 | 1) => (k: keyof typeof FIX) => FIX[k][i]
  const L = half(0)
  const R = half(1)
  const region = drawn ? REGION[look] : null
  return (
    <div className="fr-canvas">
      <svg width="976" height="382" viewBox="0 0 976 382" aria-label="Original and candidate for D03 block 2">
        {/* original: the region the model changed */}
        <rect x="126" y="34" width="324" height="288" rx="2" className="cv-region-ai" />
        <rect x="487" y="0" width="1" height="382" className="cv-fill-ground" />
        {region && <rect x="615" y="34" width="280" height="288" rx="2" className={region.cls} />}

        <path d={drawn ? L('wires') + R('wires') : L('wires')} className="cv-wire" />
        <path d={drawn ? L('greyGates') + R('greyGates') : L('greyGates')} className="cv-grey" strokeWidth="2" />
        <path d={drawn ? L('whiteGates') + R('whiteGates') : L('whiteGates')} className="cv-white" strokeWidth="2" />
        <path d={L('swapLines')} className="cv-sec" strokeWidth="1.5" />
        <path d={L('swapX')} className="cv-sec" strokeWidth="1.6" strokeLinecap="round" />
        <path d={L('axis') + R('axis')} className="cv-ground" />
        <path d={L('ticks') + R('ticks')} className="cv-ter" />
        <path d="M30 368H44" className="cv-white" strokeWidth="1.5" />
        <path d={drawn ? L('squares') + R('squares') : L('squares')} className="cv-fill-sec" />
        <path d={drawn ? L('greyDots') + R('greyDots') : L('greyDots')} className="cv-grey" strokeWidth="6" strokeLinecap="round" />
        <path d={drawn ? L('whiteDots') + R('whiteDots') : L('whiteDots')} className="cv-white" strokeWidth="6" strokeLinecap="round" />
        <path d="M30 368h.01M44 368h.01" className="cv-white" strokeWidth="5" strokeLinecap="round" />

        <g className="cv-text">
          {['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11'].map((q, i) => (
            <text key={q} x="22" y={49.5 + i * 24} textAnchor="end">
              {q}
            </text>
          ))}
          <text x="2" y="346">layer</text>
          {[15, 20, 25, 30].map((n, i) => (
            <text key={n} x={90 + i * 110} y="346" textAnchor="middle">
              {n}
            </text>
          ))}
          <text x="479" y="13" textAnchor="end">
            lines 48–86
          </text>
          <text x="52" y="371">rzz(γ)</text>
          <text x="117" y="371">swap</text>
          <text x="172" y="371">rx(β)</text>
          <text x="244" y="371">changed by the model</text>
          <text x="8" y="13" className="cv-text-white">
            original · R2 · 281 gates
          </text>
          <text x="128" y="29" className="cv-text-ai">
            D03 block 2 · layers 17–31 · 39 rzz · 6 swaps
          </text>

          {drawn &&
            ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11'].map((q, i) => (
              <text key={`r${q}`} x="511" y={49.5 + i * 24} textAnchor="end">
                {q}
              </text>
            ))}
          <text x="491" y="346">layer</text>
          {[15, 20, 25, 30].map((n, i) => (
            <text key={`r${n}`} x={579 + i * 110} y="346" textAnchor="middle">
              {n}
            </text>
          ))}
          <text x="497" y="13" className="cv-text-white">
            {drawn ? 'candidate · local · attempt 6 · 270 gates' : 'candidate · local · attempt 6'}
          </text>
          {drawn && (
            <>
              <text x="968" y="13" textAnchor="end">
                line layout
              </text>
              <text x="940" y="181" textAnchor="middle">
                −2 layers
              </text>
              <text x="617" y="29" className={`cv-text-${look === 'accepted' ? 'good' : look === 'proposed' ? 'ai' : look === 'rejected' ? 'bad' : 'warn'}`}>
                D03 block 2 · layers 17–29 · 39 rzz · no swaps
              </text>
              <text x="701" y="371">{region!.legend}</text>
              <text x="539" y="371">block 1 · accepted R2</text>
            </>
          )}
        </g>
        <rect x="222" y="363" width="16" height="10" rx="2" className="cv-region-ai" />
        {region && (
          <>
            <path d="M517 368H531" className="cv-grey" strokeWidth="1.5" />
            <path d="M517 368h.01M531 368h.01" className="cv-grey" strokeWidth="5" strokeLinecap="round" />
            <rect x="679" y="363" width="16" height="10" rx="2" className={region.cls} />
          </>
        )}
      </svg>
      {overlay && <div className="fr-canvas-overlay">{overlay}</div>}
    </div>
  )
}
