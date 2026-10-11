/*
 * Banner (DS-08 Banners card, Save and sync card): one 28-tall row with a 2px signal edge, the status
 * word and icon, the message, and at most one action. Fades in 200 in place, out 150; never slides.
 * Error copy follows "<what failed> (<code>) · <where> · <the fix as a verb>", the code in mono
 * (codes come only from the registry: Q101 … Q905).
 *
 *   <Banner kind="warning" action={{ label: 'Retry', loadingLabel: 'Retrying', onClick: retry }}>
 *     Could not reach the database <ErrorCode code="Q901" />. Showing this machine's copy.
 *   </Banner>
 */
import type { ReactNode } from 'react'
import { EditorButton } from './parts'
import { usePresence } from './presence'
import { StatusIcon, type StatusWord } from './status'
import './feedback.css'

export type BannerKind = 'warning' | 'error' | 'offline' | 'done'

export type BannerAction = {
  label: ReactNode
  /** Return a promise to show the 14px spinner and `loadingLabel` until it settles; the width holds. */
  onClick: () => void | Promise<unknown>
  /** "Retrying" for Retry */
  loadingLabel?: ReactNode
  /** Fixed width so the label swap never moves the row; Retry is 84. */
  width?: number
  loading?: boolean
}

const ICON: Record<BannerKind, StatusWord> = { warning: 'warning', offline: 'warning', error: 'failed', done: 'passed' }
const WORD: Record<BannerKind, string> = { warning: 'warning', offline: 'warning', error: 'failed', done: 'done' }

/** The error code in mono, wrapped in parentheses: "(Q901)". */
export function ErrorCode({ code }: { code: string }) {
  return <span className="error-code">({code})</span>
}

export function Banner({
  kind = 'warning',
  open = true,
  word,
  action,
  children,
  className = '',
}: {
  kind?: BannerKind
  /** Closing fades it out over 150 ms, then it is removed. */
  open?: boolean
  /** Overrides the status word (engine vocabulary only). */
  word?: string
  action?: BannerAction
  children: ReactNode
  className?: string
}) {
  const { mounted, leaving } = usePresence(open)
  if (!mounted) return null
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`banner is-${kind}${leaving ? ' is-leaving' : ''} ${className}`}
    >
      <StatusIcon kind={ICON[kind]} size={10} />
      <span className="banner-word">{word ?? WORD[kind]}</span>
      <span className="banner-message">{children}</span>
      {action && (
        <EditorButton
          onInset
          className="banner-action"
          onClick={() => action.onClick()}
          loading={action.loading}
          loadingLabel={action.loadingLabel}
          style={{ width: action.width ?? (action.loadingLabel ? 84 : undefined) }}
        >
          {action.label}
        </EditorButton>
      )}
    </div>
  )
}
