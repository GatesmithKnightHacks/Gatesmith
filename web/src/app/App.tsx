import { Component, Suspense, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { ensureSnapshot } from '../data/run'
import { setPreloader, useRoute } from './router'
import { preloadAll, preloadScreen, SCREENS } from './screens'
import './transitions.css'

setPreloader(preloadScreen)

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
  useEffect(() => preloadAll(), [])
  const Screen = SCREENS[route]
  return (
    <ScreenBoundary route={route}>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </ScreenBoundary>
  )
}
