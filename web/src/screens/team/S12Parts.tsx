/* S-12 small pieces drawn as on boards 1B78-0 and 1IR7-0: status icons, spinner, banner, top-bar account. */
import type { ReactNode } from 'react'
import { GpuStatus } from '../../ui/Shell'
import { EditorButton } from '../../ui/parts'
import type { Highest } from './repoData'
import { S12Icon } from './S12Icons'

/** Highest severity in a table cell: icon + word, the word in the signal color (none stays tertiary). */
export function HighestCell({ value, dim }: { value: Highest; dim?: boolean }) {
  return (
    <span className={`s12-highest is-${value}${dim ? ' is-dim' : ''}`}>
      {S12Icon[value]}
      <span>{value}</span>
    </span>
  )
}

/** Spinner ring, 2 px, 270°, linear 1000 ms per turn; a whole static ring under reduced motion. Always beside a stage word. */
export function S12Spinner({ size = 14 }: { size?: 14 | 20 | 28 }) {
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="s12-spinner">
      <circle cx={size / 2} cy={size / 2} r={r} className="s12-spinner-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="s12-spinner-arc" strokeDasharray={`${(c * 0.75).toFixed(2)} ${c.toFixed(2)}`} />
    </svg>
  )
}

/** Banner: 28 tall inset row, 2 px left rail in the signal color, 10 px icon, status word, message, editor button. */
export function S12Banner({
  tone,
  icon,
  word,
  children,
  action,
  onAction,
}: {
  tone: 'bad' | 'sec'
  icon: ReactNode
  word: string
  children: ReactNode
  action?: string
  onAction?: () => void
}) {
  return (
    <div className={`s12-banner is-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {icon}
      <span className="s12-banner-word">{word}</span>
      <span className="s12-banner-msg">{children}</span>
      <span className="s12-banner-gap" />
      {action && <EditorButton onClick={onAction}>{action}</EditorButton>}
    </div>
  )
}

/** Top bar right: GPU state, then the signed-in handle with its 18 px account disc. */
export function S12TopStatus({ gpuOnline = true }: { gpuOnline?: boolean }) {
  return (
    <>
      <GpuStatus online={gpuOnline} />
      <span className="s12-account">
        <span className="s12-account-disc">
          <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden className="s12i-sec">
            <path d="M7 7.2a2.4 2.4 0 100-4.8a2.4 2.4 0 000 4.8zM2.8 12.2c.6-2 2.2-3.1 4.2-3.1s3.6 1.1 4.2 3.1" fill="none" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="mono">qlab-dev</span>
      </span>
    </>
  )
}
