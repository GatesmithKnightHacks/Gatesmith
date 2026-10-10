import { Component, useEffect, useLayoutEffect, useReducer, type ReactNode } from 'react'
import { ensureSnapshot } from '../data/run'
import { setPreloader, useRoute } from './router'
import { loadedScreen, preloadAll, preloadScreen } from './screens'
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
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const Screen = loadedScreen(route)
  // First visit to a screen that was not preloaded (a cold deep link): load it, then render.
  useEffect(() => {
    if (!Screen) void preloadScreen(route).then(rerender)
  }, [route, Screen])
  return <ScreenBoundary route={route}>{Screen ? <Screen /> : null}</ScreenBoundary>
}
