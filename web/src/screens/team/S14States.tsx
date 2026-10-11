/*
 * S-14 states (board "S-14 · Leaderboard · states"), each applied to the whole screen:
 *   #/leaderboard?state=loading | no-conformance-runs | error | one-layer-only | no-match | sorted-by-latency
 *                       | focus | failed-kit | gpu-off | stale | offline
 * The main board (six ranked layers, granite p-2026.1 selected) is the screen without a state.
 */
import { FAILED_LAYER, LAYERS, type LayerRow } from './boardData'

export type SortKey = 'proposals' | 'parse' | 'verified' | 'vir' | 'latency' | 'tokens' | 'cost'
export type Filter = 'all' | 'local' | 'platform' | 'engine'

export type BoardState = {
  /** the rows behind the table (before the filter) */
  rows: LayerRow[]
  /** what the Layers tile body holds */
  body: 'table' | 'loading' | 'empty' | 'error'
  filter: Filter
  sort: SortKey
  selectedId: string | null
  /** row drawn with the keyboard focus outline on arrival */
  focusId?: string
  /** a banner above the table */
  banner?: 'stale' | 'offline'
  /** the Layers tile meta */
  meta: 'full' | 'short' | 'stale' | 'offline'
  /** filter tabs carry counts */
  counts: boolean
  /** a note row under the table rows */
  note?: string
  inspector: 'layer' | 'loading' | 'none'
  gpuOff?: boolean
}

const MAIN: BoardState = {
  rows: LAYERS,
  body: 'table',
  filter: 'all',
  sort: 'vir',
  selectedId: 'granite',
  meta: 'full',
  counts: true,
  inspector: 'layer',
}

const ALIASES: Record<string, string> = {
  empty: 'no-conformance-runs',
  'no-runs-yet': 'no-conformance-runs',
  'keyboard-focus': 'focus',
  'filter-no-match': 'no-match',
  sorted: 'sorted-by-latency',
  'gpu-machine-off': 'gpu-off',
  'failed-the-kit': 'failed-kit',
  'stale-data': 'stale',
  'one-layer': 'one-layer-only',
}

export const S14_STATES = [
  'loading',
  'no-conformance-runs',
  'error',
  'one-layer-only',
  'no-match',
  'sorted-by-latency',
  'focus',
  'failed-kit',
  'gpu-off',
  'stale',
  'offline',
] as const

export function boardState(name: string | null): BoardState {
  const key = name ? (ALIASES[name] ?? name) : null
  switch (key) {
    case 'loading':
      return { ...MAIN, body: 'loading', selectedId: null, meta: 'short', counts: false, inspector: 'loading' }
    case 'no-conformance-runs':
      return { ...MAIN, rows: [], body: 'empty', selectedId: null, meta: 'short', inspector: 'none' }
    case 'error':
      return { ...MAIN, rows: [], body: 'error', selectedId: null, meta: 'short', counts: false, inspector: 'none' }
    case 'one-layer-only':
      return {
        ...MAIN,
        rows: LAYERS.filter((r) => r.id === 'reference'),
        selectedId: 'reference',
        note: '1 layer has run the kit. Run qscore conform on another layer to compare.',
      }
    case 'no-match':
      // the hf router has not run the kit, so the Platform filter is empty
      return { ...MAIN, rows: LAYERS.filter((r) => r.layer !== 'hf'), filter: 'platform' }
    case 'sorted-by-latency':
      return { ...MAIN, sort: 'latency' }
    case 'focus':
      return { ...MAIN, selectedId: null, focusId: LAYERS[0].id, inspector: 'none' }
    case 'failed-kit':
      return { ...MAIN, rows: [...LAYERS, FAILED_LAYER], selectedId: FAILED_LAYER.id }
    case 'gpu-off':
      return { ...MAIN, gpuOff: true }
    case 'stale':
      return { ...MAIN, banner: 'stale', meta: 'stale' }
    case 'offline':
      return { ...MAIN, banner: 'offline', meta: 'offline' }
    default:
      return MAIN
  }
}
