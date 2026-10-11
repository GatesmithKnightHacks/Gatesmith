/*
 * S-07 circuit canvas, drawn from the board: the final circuit, 12 q, 31 layers, with both D03 blocks
 * outlined. Block 2 carries its state: accepted R3 (the stop), proposed R3 (running), or still open.
 */

export type Block2 = 'accepted' | 'proposed' | 'open'

const GATES =
  'M52.8 22V36M52.8 50V64M52.8 78V92M52.8 106V120M52.8 134V148M71.6 162V176M71.6 36V50M71.6 64V78M71.6 92V106M71.6 120V134M90.4 148V162M90.4 22V50M90.4 64V92M90.4 106V134M109.2 148V176M109.2 36V64M109.2 78V106M128 120V148M128 50V78M128 22V36M128 162V176M146.8 92V120M146.8 134V162M146.8 22V64M165.6 78V120M165.6 134V176M184.4 36V78M184.4 92V134M203.2 50V92M203.2 106V148M222 64V106M222 120V162M240.8 22V78M240.8 92V148M259.6 36V92M259.6 106V162M278.4 50V106M278.4 120V176M297.2 64V120M334.8 22V36M334.8 78V92M334.8 134V148M353.6 50V64M353.6 106V120M353.6 162V176M372.4 36V50M372.4 92V106M372.4 148V162M391.2 64V78M391.2 120V134M391.2 22V50M410 78V106M410 134V162M410 36V64M428.8 92V120M428.8 148V176M428.8 50V78M447.6 106V134M447.6 64V92M447.6 22V36M466.4 120V148M466.4 78V92M466.4 50V64M485.2 134V148M485.2 106V120M485.2 162V176M504 36V50M504 92V106M504 148V162M522.8 64V78M522.8 120V134M522.8 22V50M541.6 78V106M541.6 134V162M541.6 36V64M560.4 92V120M560.4 148V176M560.4 50V78'

const DOTS =
  'M52.8 22h.01M52.8 36h.01M52.8 50h.01M52.8 64h.01M52.8 78h.01M52.8 92h.01M52.8 106h.01M52.8 120h.01M52.8 134h.01M52.8 148h.01M71.6 162h.01M71.6 176h.01M71.6 36h.01M71.6 50h.01M71.6 64h.01M71.6 78h.01M71.6 92h.01M71.6 106h.01M71.6 120h.01M71.6 134h.01M90.4 148h.01M90.4 162h.01M90.4 22h.01M90.4 50h.01M90.4 64h.01M90.4 92h.01M90.4 106h.01M90.4 134h.01M109.2 148h.01M109.2 176h.01M109.2 36h.01M109.2 64h.01M109.2 78h.01M109.2 106h.01M128 120h.01M128 148h.01M128 50h.01M128 78h.01M128 22h.01M128 36h.01M128 162h.01M128 176h.01M146.8 92h.01M146.8 120h.01M146.8 134h.01M146.8 162h.01M146.8 22h.01M146.8 64h.01M165.6 78h.01M165.6 120h.01M165.6 134h.01M165.6 176h.01M184.4 36h.01M184.4 78h.01M184.4 92h.01M184.4 134h.01M203.2 50h.01M203.2 92h.01M203.2 106h.01M203.2 148h.01M222 64h.01M222 106h.01M222 120h.01M222 162h.01M240.8 22h.01M240.8 78h.01M240.8 92h.01M240.8 148h.01M259.6 36h.01M259.6 92h.01M259.6 106h.01M259.6 162h.01M278.4 50h.01M278.4 106h.01M278.4 120h.01M278.4 176h.01M297.2 64h.01M297.2 120h.01M334.8 22h.01M334.8 36h.01M334.8 78h.01M334.8 92h.01M334.8 134h.01M334.8 148h.01M353.6 50h.01M353.6 64h.01M353.6 106h.01M353.6 120h.01M353.6 162h.01M353.6 176h.01M372.4 36h.01M372.4 50h.01M372.4 92h.01M372.4 106h.01M372.4 148h.01M372.4 162h.01M391.2 64h.01M391.2 78h.01M391.2 120h.01M391.2 134h.01M391.2 22h.01M391.2 50h.01M410 78h.01M410 106h.01M410 134h.01M410 162h.01M410 36h.01M410 64h.01M428.8 92h.01M428.8 120h.01M428.8 148h.01M428.8 176h.01M428.8 50h.01M428.8 78h.01M447.6 106h.01M447.6 134h.01M447.6 64h.01M447.6 92h.01M447.6 22h.01M447.6 36h.01M466.4 120h.01M466.4 148h.01M466.4 78h.01M466.4 92h.01M466.4 50h.01M466.4 64h.01M485.2 134h.01M485.2 148h.01M485.2 106h.01M485.2 120h.01M485.2 162h.01M485.2 176h.01M504 36h.01M504 50h.01M504 92h.01M504 106h.01M504 148h.01M504 162h.01M522.8 64h.01M522.8 78h.01M522.8 120h.01M522.8 134h.01M522.8 22h.01M522.8 50h.01M541.6 78h.01M541.6 106h.01M541.6 134h.01M541.6 162h.01M541.6 36h.01M541.6 64h.01M560.4 92h.01M560.4 120h.01M560.4 148h.01M560.4 176h.01M560.4 50h.01M560.4 78h.01'

const SQUARES = [313, 576.2]
  .map((x) => Array.from({ length: 12 }, (_, i) => `M${x} ${19 + i * 14}h6v6h-6z`).join(''))
  .join('')

const BLOCK2: Record<Block2, { cls: string; text: string; label: string }> = {
  accepted: { cls: 'cv-region-good', text: 'cv-text-good', label: 'D03 block 2 · accepted R3' },
  proposed: { cls: 'cv-region-ai', text: 'cv-text-ai', label: 'D03 block 2 · proposed R3' },
  open: { cls: 'cv-region-bad', text: 'cv-text-bad', label: 'D03 block 2 · open · R3 rejected' },
}

/** `none` draws the baseline circuit with no regions (no rounds yet). */
export function FinalCanvas({ block2 = 'accepted', label }: { block2?: Block2 | 'none'; label?: string }) {
  const b2 = block2 === 'none' ? null : BLOCK2[block2]
  return (
    <div className="lp-canvas">
      <svg width="622" height="210" viewBox="0 0 622 210" aria-label="Final circuit, 12 qubits, 31 layers">
        {b2 && (
          <>
            <rect x="45.8" y="14" width="258.4" height="170" rx="2" className="cv-region-good" />
            <rect x="327.8" y="14" width="239.6" height="170" rx="2" className={b2.cls} />
          </>
        )}
        <path
          d={Array.from({ length: 12 }, (_, i) => `M26 ${22 + i * 14}H616`).join('')}
          className="cv-wire"
        />
        <path d={GATES} className="cv-sec" strokeWidth="1.5" />
        <path d="M26 192H616" className="cv-ground" />
        <path d="M109.2 192V196M203.2 192V196M297.2 192V196M391.2 192V196M485.2 192V196M579.2 192V196" className="cv-ter" />
        <path d={SQUARES} className="cv-fill-sec" />
        <path d={DOTS} className="cv-sec" strokeWidth="5" strokeLinecap="round" />
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x="31" y={19 + i * 14} width="6" height="6" rx="1" className="cv-measure" />
        ))}
        <g className="cv-text">
          {Array.from({ length: 12 }, (_, i) => (
            <text key={i} x="22" y={25.5 + i * 14} textAnchor="end">
              q{i}
            </text>
          ))}
          <text x="2" y="205">
            layer
          </text>
          {[5, 10, 15, 20, 25, 30].map((n, i) => (
            <text key={n} x={109.2 + i * 94} y="205" textAnchor="middle">
              {n}
            </text>
          ))}
          {b2 && (
            <>
              <text x="47.8" y="11" className="cv-text-good">
                D03 block 1 · accepted R2
              </text>
              <text x="329.8" y="11" className={b2.text}>
                {label ?? b2.label}
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  )
}
