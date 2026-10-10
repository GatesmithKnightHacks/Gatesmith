/*
 * S-06 Diff tile drawings (483×218 each), copied from the board. The candidate side has three
 * moments (M3/M4): the model writing, a violet dashed proposal, and the mint accepted region.
 */
import { useEffect, useState } from 'react'

const WIRES = 'M40 46H471M40 88H471M40 130H471M40 172H471'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg width="483" height="218" viewBox="0 0 483 218" className="fr-svg" aria-hidden>
      <rect width="483" height="218" fill="#2C3456" />
      {(['q3', 'q4', 'q5', 'q6'] as const).map((q, i) => (
        <text key={q} x="12" y={50 + i * 42} fontFamily="JetBrains Mono" fontSize="11" fill="#ADC5CA">
          {q}
        </text>
      ))}
      <path d={WIRES} fill="none" stroke="#496166" />
      {children}
    </svg>
  )
}

export function OriginalCircuit() {
  return (
    <Frame>
      <rect x="57.5" y="26.5" width="395" height="165" fill="#FF34781A" stroke="#FF3478" strokeDasharray="4 3" />
      <path d="M79 46V96M167 46V96M211 88V138M299 88V138M343 130V180M431 130V180" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
      <path
        d="M75 46a4 4 0 108 0a4 4 0 10-8 0M163 46a4 4 0 108 0a4 4 0 10-8 0M207 88a4 4 0 108 0a4 4 0 10-8 0M295 88a4 4 0 108 0a4 4 0 10-8 0M339 130a4 4 0 108 0a4 4 0 10-8 0M427 130a4 4 0 108 0a4 4 0 10-8 0"
        fill="#FFFFFF"
      />
      <path
        d="M71 88a8 8 0 1016 0a8 8 0 10-16 0M159 88a8 8 0 1016 0a8 8 0 10-16 0M203 130a8 8 0 1016 0a8 8 0 10-16 0M291 130a8 8 0 1016 0a8 8 0 10-16 0M335 172a8 8 0 1016 0a8 8 0 10-16 0M423 172a8 8 0 1016 0a8 8 0 10-16 0"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.4"
      />
      <path
        d="M71 88H87M79 80V96M159 88H175M167 80V96M203 130H219M211 122V138M291 130H307M299 122V138M335 172H351M343 164V180M423 172H439M431 164V180"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.4"
      />
      <path d="M109 78h28v20h-28zM241 120h28v20h-28zM373 162h28v20h-28z" fill="#0F1F23" stroke="#C2DADF" />
      <text x="123" y="91.5" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
        RZ
      </text>
      <text x="255" y="133.5" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
        RZ
      </text>
      <text x="387" y="175.5" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
        RZ
      </text>
    </Frame>
  )
}

export type CandidateLook = 'writing' | 'proposed' | 'accepted'

/** Seconds the model has been writing, counted honestly from when the pane appeared. */
function useSeconds(active: boolean) {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!active) return
    const t0 = performance.now()
    const id = window.setInterval(() => setS((performance.now() - t0) / 1000), 100)
    return () => window.clearInterval(id)
  }, [active])
  return s
}

export function CandidateCircuit({ look, showTag }: { look: CandidateLook; showTag?: boolean }) {
  const seconds = useSeconds(look === 'writing')
  return (
    <Frame>
      {look === 'writing' ? (
        <g className="fr-writing">
          <rect x="151.5" y="76" width="180" height="70" fill="#2C3456" />
          <text x="241.5" y="96" textAnchor="middle" fontFamily="Hanken Grotesk" fontSize="12" fill="#B3ACFC">
            ✧ local · granite-8b
          </text>
          <text x="241.5" y="118" textAnchor="middle" fontFamily="Hanken Grotesk" fontSize="12" fill="#C2DADF">
            writing a candidate
          </text>
          <text x="241.5" y="136" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="11" fill="#FFFFFF">
            {seconds.toFixed(1)} s
          </text>
        </g>
      ) : (
        <g className="fr-candidate">
          <rect className={`fr-region is-${look}`} x="57.5" y="26.5" width="307" height="165" />
          {showTag && (
            <g className="fr-tag">
              <rect x="57.5" y="12.5" width="58" height="14" rx="1" fill="#0F1F23" stroke="#5FEEA3" />
              <text x="86.5" y="23" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#5FEEA3">
                accepted
              </text>
            </g>
          )}
          <path d="M79 46V96M167 46V96M255 130V180M343 130V180" fill="none" stroke="#FFFFFF" strokeWidth="1.4" />
          <path
            d="M75 46a4 4 0 108 0a4 4 0 10-8 0M163 46a4 4 0 108 0a4 4 0 10-8 0M251 130a4 4 0 108 0a4 4 0 10-8 0M339 130a4 4 0 108 0a4 4 0 10-8 0"
            fill="#FFFFFF"
          />
          <path
            d="M71 88a8 8 0 1016 0a8 8 0 10-16 0M159 88a8 8 0 1016 0a8 8 0 10-16 0M247 172a8 8 0 1016 0a8 8 0 10-16 0M335 172a8 8 0 1016 0a8 8 0 10-16 0"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.4"
          />
          <path
            d="M71 88H87M79 80V96M159 88H175M167 80V96M247 172H263M255 164V180M335 172H351M343 164V180"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.4"
          />
          <path d="M109 78h28v20h-28zM197 120h28v20h-28zM285 162h28v20h-28z" fill="#0F1F23" stroke="#C2DADF" />
          <text x="123" y="91.5" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
            RZ
          </text>
          <text x="211" y="133.5" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
            RZ
          </text>
          <text x="299" y="175.5" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#FFFFFF">
            RZ
          </text>
        </g>
      )}
    </Frame>
  )
}
