import { lazy, type ComponentType } from 'react'
import { ROUTES, type RoutePath } from './router'

type Loader = () => Promise<{ default: ComponentType }>

const LOADERS: Record<RoutePath, Loader> = {
  [ROUTES.template]: () => import('../screens/S00Template').then((m) => ({ default: m.S00Template })),
  [ROUTES.newRun]: () => import('../screens/S01NewRun').then((m) => ({ default: m.S01NewRun })),
  [ROUTES.repoScan]: () => import('../screens/S02RepoScan').then((m) => ({ default: m.S02RepoScan })),
  [ROUTES.preflight]: () => import('../screens/S03Preflight').then((m) => ({ default: m.S03Preflight })),
  [ROUTES.workspace]: () => import('../screens/S04Workspace').then((m) => ({ default: m.S04Workspace })),
  [ROUTES.estimate]: () => import('../screens/S05Estimate').then((m) => ({ default: m.S05Estimate })),
  [ROUTES.fixReview]: () => import('../screens/S06FixReview').then((m) => ({ default: m.S06FixReview })),
  [ROUTES.loop]: () => import('../screens/S07Loop').then((m) => ({ default: m.S07Loop })),
  [ROUTES.report]: () => import('../screens/S09Report').then((m) => ({ default: m.S09Report })),
  [ROUTES.export]: () => import('../screens/S10Export').then((m) => ({ default: m.S10Export })),
  [ROUTES.prComment]: () => import('../screens/S11PrComment').then((m) => ({ default: m.S11PrComment })),
  [ROUTES.repo]: () => import('../screens/S12Repo').then((m) => ({ default: m.S12Repo })),
  [ROUTES.runs]: () => import('../screens/S13Runs').then((m) => ({ default: m.S13Runs })),
  [ROUTES.leaderboard]: () => import('../screens/S14Leaderboard').then((m) => ({ default: m.S14Leaderboard })),
  [ROUTES.screening]: () => import('../screens/S15Screening').then((m) => ({ default: m.S15Screening })),
  [ROUTES.bench]: () => import('../screens/S16Bench').then((m) => ({ default: m.S16Bench })),
}

const loaded = new Map<RoutePath, Promise<unknown>>()

/** Load a screen's code once; navigation awaits this so a view transition never captures a blank frame. */
export function preloadScreen(path: RoutePath) {
  if (!loaded.has(path)) loaded.set(path, LOADERS[path]())
  return loaded.get(path)!
}

/** After first paint, fetch every screen in the background. */
export function preloadAll() {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200))
  idle(() => (Object.keys(LOADERS) as RoutePath[]).forEach(preloadScreen))
}

export const SCREENS = Object.fromEntries(
  (Object.keys(LOADERS) as RoutePath[]).map((p) => [p, lazy(() => preloadScreen(p) as Promise<{ default: ComponentType }>)]),
) as unknown as Record<RoutePath, ComponentType>
