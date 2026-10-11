/*
 * S-12 states (board 1IR7-0), at #/repo?state=<name>. Each state renders the whole screen with the
 * panel that changes: no-runs-yet, one-run, many, action-not-installed, loading, error, offline,
 * gpu-off, keyboard-focus. The main board (3 circuits, 5 runs) is the default view.
 */
import type { ReactNode } from 'react'
import { navigate, ROUTES } from '../../app/router'
import type { ChartConfig } from './S12Chart'
import { S12Icon } from './S12Icons'
import { S12Banner } from './S12Parts'
import {
  CIRCUITS,
  DAY_TICKS,
  HEAD,
  HOUR_TICKS,
  MANY_CIRCUITS,
  MANY_SERIES,
  ONE_RUN_SERIES,
  REPO,
  SERIES,
  WEEK_TICKS,
  type RepoCircuit,
} from './repoData'

export type TableMode = 'live' | 'never' | 'loading' | 'readonly'
export type ChartSpec = Omit<ChartConfig, 'selected' | 'onSelect'>
export type Legend = 'main' | 'many' | null

export type RepoView = {
  circuits: RepoCircuit[]
  table: TableMode
  /** row highlighted on arrival; null draws no selection */
  selected: number | null
  /** keyboard focus state: the first row takes focus, no selection fill */
  focus?: boolean
  circuitsMeta: string
  circuitsBanner?: ReactNode
  mainBanner?: ReactNode
  timeline: 'chart' | 'empty' | 'loading'
  chart: ChartSpec
  timelineMeta: string
  legend: Legend
  footnote?: string
  inspector: {
    mode: 'laptop' | 'platform'
    modeLine: string
    loading?: boolean
    actionInstalled: boolean
    /** first-run facts instead of the main board's */
    runs: 'none' | 'one' | 'many'
  }
  gpuOnline: boolean
}

export const MAIN_CHART: ChartSpec = {
  ticks: DAY_TICKS,
  rightPad: 140,
  yMax: 5,
  yMin: -20,
  grid: [5, -5, -10, -15, -20],
  yLabels: [5, 0, -5, -10, -15, -20],
  series: SERIES,
  needle: { x: 6, label: 'Oct 10 · 11:42 · latest run' },
}

const MAIN: RepoView = {
  circuits: CIRCUITS,
  table: 'live',
  selected: 0,
  circuitsMeta: `main · ${HEAD} · 3 circuits · times local`,
  timeline: 'chart',
  chart: MAIN_CHART,
  timelineMeta: 'two_qubit_count · change vs first run · lower is better',
  legend: 'main',
  inspector: { mode: 'laptop', modeLine: `Scores main at ${HEAD} on this machine`, actionInstalled: true, runs: 'many' },
  gpuOnline: true,
}

const ONE_RUN_CIRCUITS: RepoCircuit[] = [
  { ...CIRCUITS[0], gates: '321 gates', trend: '1 run', trendTone: 'one', open: 4, lastTime: '12:10', lastWhat: 'push main', latest: '321 gates', runs: '1 run · Oct 10' },
  { ...CIRCUITS[1], trend: '1 run', trendTone: 'one', lastTime: '10:30', lastWhat: 'push main', runs: '1 run · Oct 10' },
  { ...CIRCUITS[2], lastTime: '09:20', lastWhat: 'push main', runs: '1 run · Oct 10' },
]

export const STATE_NAMES = [
  'no-runs-yet',
  'one-run',
  'many',
  'action-not-installed',
  'loading',
  'error',
  'offline',
  'gpu-off',
  'keyboard-focus',
] as const

export function repoView(state: string | null): RepoView {
  switch (state) {
    case 'no-runs-yet':
      return {
        ...MAIN,
        table: 'never',
        selected: null,
        circuitsMeta: `main · ${HEAD} · 3 circuits · 0 runs`,
        timeline: 'empty',
        timelineMeta: 'two_qubit_count · change vs first run',
        legend: null,
        inspector: { ...MAIN.inspector, runs: 'none' },
      }
    case 'one-run':
      return {
        ...MAIN,
        circuits: ONE_RUN_CIRCUITS,
        timelineMeta: 'two_qubit_count · 1 run per circuit',
        legend: null,
        footnote: 'One run per circuit. The trend starts with the second run.',
        chart: {
          ticks: HOUR_TICKS,
          rightPad: 60,
          yMax: 5,
          yMin: -5,
          grid: [5, -5],
          yLabels: [5, 0, -5],
          series: ONE_RUN_SERIES,
          needle: { x: 19 / 6, label: 'Oct 10 · 12:10 · latest run' },
        },
        inspector: { ...MAIN.inspector, runs: 'one' },
      }
    case 'many':
      return {
        ...MAIN,
        circuits: MANY_CIRCUITS,
        circuitsMeta: `main · ${HEAD} · 8 circuits · times local`,
        timelineMeta: 'two_qubit_count · change vs first run · 30 days',
        legend: 'many',
        chart: {
          ticks: WEEK_TICKS,
          rightPad: 40,
          yMax: 5,
          yMin: -20,
          grid: [5, -5, -10, -15, -20],
          yLabels: [5, 0, -10, -20],
          series: MANY_SERIES,
          dense: true,
          needle: { x: 4, label: 'Oct 10 · 11:42 · latest run' },
        },
      }
    case 'action-not-installed':
      return { ...MAIN, inspector: { ...MAIN.inspector, actionInstalled: false } }
    case 'loading':
      return {
        ...MAIN,
        table: 'loading',
        selected: null,
        circuitsMeta: `main · ${HEAD}`,
        timeline: 'loading',
        timelineMeta: 'two_qubit_count · change vs first run',
        legend: null,
        inspector: { ...MAIN.inspector, loading: true },
      }
    case 'error':
      return {
        ...MAIN,
        table: 'readonly',
        selected: null,
        circuitsMeta: 'last read 11:45 · read-only',
        circuitsBanner: (
          <S12Banner tone="bad" icon={S12Icon.failed} word="failed" action="Retry" onAction={() => navigate(ROUTES.repo, { replace: true })}>
            GitHub returned 404 (<span className="mono">Q902</span>) · {REPO} · Reinstall the Gatesmith app on this repo
          </S12Banner>
        ),
      }
    case 'offline':
      return {
        ...MAIN,
        mainBanner: (
          <S12Banner tone="sec" icon={S12Icon.offline} word="offline">
            You are offline · runs stay on this machine · syncs when the network is back
          </S12Banner>
        ),
      }
    case 'gpu-off':
      return {
        ...MAIN,
        gpuOnline: false,
        mainBanner: (
          <S12Banner tone="sec" icon={S12Icon.power} word="GPU off" action="Switch to Laptop" onAction={() => navigate(ROUTES.repo, { replace: true })}>
            GPU machine is off · model proposals wait · the engine keeps running on CPU
          </S12Banner>
        ),
        inspector: { ...MAIN.inspector, mode: 'platform', modeLine: 'Queued on the platform · position 1' },
      }
    case 'keyboard-focus':
      return { ...MAIN, selected: null, focus: true, circuitsMeta: `main · ${HEAD} · 3 circuits` }
    default:
      return MAIN
  }
}
