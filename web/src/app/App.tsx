import { Component, createElement, useEffect, useLayoutEffect, useReducer, type ReactNode } from 'react'
import { ensureAccountSnapshot } from '../data/account'
import { ensureSnapshot } from '../data/run'
import { Gate } from '../screens/gate/Gate'
import { useGate } from '../screens/gate/useGate'
import { setPreloader, useRoute } from './router'
import { loadedScreen, preloadAll, preloadScreen } from './screens'
import { ShellSkeleton } from '../ui/ShellSkeleton'
import './transitions.css'

setPreloader(preloadScreen)

/** Keyed by route, so a screen that failed to render gets a fresh try on the next screen. */
class ScreenBoundary extends Component<{ children: ReactNode; route: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
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
  // Phones, tablets and windows under 1280 px get the gate (S-20/S-21) instead of any screen. The gate
  // only swaps what is drawn: the route, the session and the saved runs stay as they are.
  const gated = useGate()
  useLayoutEffect(() => {
    ensureSnapshot(route)
    ensureAccountSnapshot(route)
  }, [route])
  // The gate never needs the workbench screens, so they load only on a desktop.
  useEffect(() => {
    if (!gated) preloadAll()
  }, [gated])
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const Screen = loadedScreen(route)
  // First visit to a screen that was not preloaded (a cold deep link): load it, then render. Until
  // then the real shell with skeleton tiles holds the place.
  useEffect(() => {
    if (!gated && !Screen) void preloadScreen(route).then(rerender)
  }, [route, Screen, gated])
  if (gated) return <Gate />
  // Screen changes run inside navigate()'s view transition: transitions.css fades the main column
  // (.shell-content) over 400 ms while the chrome holds still.
  return (
    <ScreenBoundary key={route} route={route}>
      {Screen ? createElement(Screen) : <ShellSkeleton />}
    </ScreenBoundary>
  )
}
