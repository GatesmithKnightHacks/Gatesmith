import { Component, lazy, Suspense, useLayoutEffect, type ComponentType, type ReactNode } from 'react'
import { ensureSnapshot } from '../data/run'
import { ROUTES, useRoute, type RoutePath } from './router'
import './transitions.css'

/* Each screen loads on its own, so one broken screen never takes the others down. */
const SCREENS: Record<RoutePath, ComponentType> = {
  [ROUTES.template]: lazy(() => import('../screens/S00Template').then((m) => ({ default: m.S00Template }))),
  [ROUTES.newRun]: lazy(() => import('../screens/S01NewRun').then((m) => ({ default: m.S01NewRun }))),
  [ROUTES.repoScan]: lazy(() => import('../screens/S02RepoScan').then((m) => ({ default: m.S02RepoScan }))),
  [ROUTES.preflight]: lazy(() => import('../screens/S03Preflight').then((m) => ({ default: m.S03Preflight }))),
  [ROUTES.workspace]: lazy(() => import('../screens/S04Workspace').then((m) => ({ default: m.S04Workspace }))),
  [ROUTES.estimate]: lazy(() => import('../screens/S05Estimate').then((m) => ({ default: m.S05Estimate }))),
  [ROUTES.fixReview]: lazy(() => import('../screens/S06FixReview').then((m) => ({ default: m.S06FixReview }))),
  [ROUTES.loop]: lazy(() => import('../screens/S07Loop').then((m) => ({ default: m.S07Loop }))),
  [ROUTES.report]: lazy(() => import('../screens/S09Report').then((m) => ({ default: m.S09Report }))),
  [ROUTES.export]: lazy(() => import('../screens/S10Export').then((m) => ({ default: m.S10Export }))),
  [ROUTES.prComment]: lazy(() => import('../screens/S11PrComment').then((m) => ({ default: m.S11PrComment }))),
  [ROUTES.repo]: lazy(() => import('../screens/S12Repo').then((m) => ({ default: m.S12Repo }))),
  [ROUTES.runs]: lazy(() => import('../screens/S13Runs').then((m) => ({ default: m.S13Runs }))),
  [ROUTES.leaderboard]: lazy(() => import('../screens/S14Leaderboard').then((m) => ({ default: m.S14Leaderboard }))),
  [ROUTES.screening]: lazy(() => import('../screens/S15Screening').then((m) => ({ default: m.S15Screening }))),
  [ROUTES.bench]: lazy(() => import('../screens/S16Bench').then((m) => ({ default: m.S16Bench }))),
}

class ScreenBoundary extends Component<{ children: ReactNode; route: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { route: string }) {
    if (prev.route !== this.props.route && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error)
      return (
        <pre style={{ padding: 24, color: 'var(--color-signal-bad)', whiteSpace: 'pre-wrap' }}>
          {this.props.route} failed to render: {this.state.error.message}
        </pre>
      )
    return this.props.children
  }
}

export function App() {
  const route = useRoute()
  useLayoutEffect(() => ensureSnapshot(route), [route])
  const Screen = SCREENS[route]
  return (
    <ScreenBoundary route={route}>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </ScreenBoundary>
  )
}
