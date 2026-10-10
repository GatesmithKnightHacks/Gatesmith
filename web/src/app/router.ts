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

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Navigate inside one document. When the browser supports view transitions, shared elements
 * (anything with a matching view-transition-name) carry across screens, as in M1, M3 and M5.
 */
export function navigate(path: RoutePath, opts: NavigateOptions = {}) {
  const apply = () => {
    const url = `#${path}`
    if (opts.replace) history.replaceState(null, '', url)
    else history.pushState(null, '', url)
    flushSync(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
  }
  if (!doc.startViewTransition || reduceMotion()) {
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
