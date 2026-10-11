/*
 * Toast (DS-08): the banner row, floated at the main column's foot (12px in from the right and the
 * bottom). Pass it to the Shell's `toast` slot. Fades in 200 in place, out 150.
 *
 *   <Shell toast={<Toast open={done}>Run <span className="mono">7f3c·1a02</span> finished</Toast>} … />
 */
import type { ReactNode } from 'react'
import { Banner, type BannerAction, type BannerKind } from './Banner'

export function Toast({
  open = true,
  kind = 'done',
  word,
  action,
  children,
}: {
  open?: boolean
  kind?: BannerKind
  word?: string
  action?: BannerAction
  children: ReactNode
}) {
  return (
    <Banner open={open} kind={kind} word={word} action={action} className="toast">
      {children}
    </Banner>
  )
}
