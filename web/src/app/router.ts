import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

/** Every screen in SCREENS.md, keyed by its hash path. */
export const ROUTES = {
  template: '/template',
  newRun: '/new',
  repoScan: '/scan',
  preflight: '/preflight',
  workspace: '/workspace',
  estimate: '/estimate',
  fixReview: '/fix',
  loop: '/loop',
  report: '/report',
  export: '/export',
  prComment: '/pr',
  repo: '/repo',
  runs: '/runs',
  leaderboard: '/leaderboard',
  screening: '/screening',
  bench: '/bench',
  signIn: '/signin',
  signUp: '/signup',
  account: '/account',
  /** The small-screen gate (S-20/S-21) on its own, for previewing it on a desktop. */
  gate: '/gate',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

function current(): RoutePath {
  const path = window.location.hash.replace(/^#/, '').split('?')[0]
  const known = Object.values(ROUTES) as string[]
  return (known.includes(path) ? path : ROUTES.newRun) as RoutePath
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/* Where we are in this session's navigation, so Undo and Redo know what they can do. */
let position = 0
let furthest = 0
// Mark the entry the session started on, so coming back to it is recognised.
if ((history.state as { at?: number } | null)?.at == null) history.replaceState({ at: 0 }, '', location.href)
const historyListeners = new Set<() => void>()
const historySnapshot = { canUndo: false, canRedo: false }
function publishHistory() {
  historySnapshot.canUndo = position > 0
  historySnapshot.canRedo = position < furthest
  historyListeners.forEach((l) => l())
}
window.addEventListener('popstate', (e) => {
  const at = (e.state as { at?: number } | null)?.at
  if (typeof at === 'number') {
    position = at
    publishHistory()
  }
})

let historyVersion = 0
export function useHistoryPosition() {
  useSyncExternalStore(
    (cb) => {
      const l = () => {
        historyVersion++
        cb()
      }
      historyListeners.add(l)
      return () => historyListeners.delete(l)
    },
    () => historyVersion,
  )
  return { canUndo: historySnapshot.canUndo, canRedo: historySnapshot.canRedo }
}

export const undo = () => position > 0 && history.back()
export const redo = () => position < furthest && history.forward()

export function useRoute(): RoutePath {
  return useSyncExternalStore(subscribe, current)
}

/** Query params after the hash path, e.g. #/workspace?state=scoring */
export function useHashParams(): URLSearchParams {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return new URLSearchParams(hash.split('?')[1] ?? '')
}

type NavigateOptions = {
  /** Named transition, read by CSS as :root[data-transition="…"] during the view transition. */
  transition?: string
  replace?: boolean
}

let preload: (path: RoutePath) => Promise<unknown> = () => Promise.resolve()

/** App registers the screen loader so navigation can wait for the next screen's code. */
export function setPreloader(fn: (path: RoutePath) => Promise<unknown>) {
  preload = fn
}

/**
 * Navigate inside one document. When the browser supports view transitions, shared elements
 * (anything with a matching view-transition-name) carry across screens, as in M1, M3 and M5.
 */
export function navigate(path: RoutePath, opts: NavigateOptions = {}) {
  const apply = () => {
    const url = `#${path}`
    if (opts.replace) history.replaceState({ at: position }, '', url)
    else {
      position += 1
      furthest = position
      history.pushState({ at: position }, '', url)
    }
    publishHistory()
    flushSync(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
  }
  // Reduced motion still uses the transition: transitions.css turns it into one 80 ms crossfade.
  if (!doc.startViewTransition) {
    void preload(path).then(apply)
    return
  }
  const root = document.documentElement
  if (opts.transition) root.dataset.transition = opts.transition
  const vt = doc.startViewTransition(async () => {
    await preload(path)
    apply()
  })
  vt.finished.finally(() => {
    delete root.dataset.transition
  })
}
