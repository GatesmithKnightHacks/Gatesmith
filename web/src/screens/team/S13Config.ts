/* S-13 · Runs · states (Paper 1DH8-0): what each ?state= changes. The words are the board's. */
import type { JobState } from './runsData'

export const RUNS_STATES = [
  'no-runs-yet',
  'loading',
  'sync-failed',
  'signed-out',
  'no-match',
  'focus',
  'offline',
  'gpu-off',
  'run-failed',
] as const
export type RunsState = 'main' | (typeof RUNS_STATES)[number]

export type StateFilter = 'all' | JobState
export type ItemFilter = 'all' | 'sidechain_qaoa.qasm' | 'sbox_oracle.qasm'

export type StateConfig = {
  /** tile header meta */
  meta: string
  /** which list the table shows */
  list: 'all' | 'none' | 'loading' | 'gpu-off'
  banner?: 'sync-failed' | 'offline' | 'gpu-off'
  query?: string
  state?: StateFilter
  selectedId: string | null
  /** focus the filter on arrival (keyboard focus state) */
  focusFilter?: boolean
  signedOut?: boolean
  /** the Synced row in the Account section */
  synced: 'ok' | 'empty' | 'failed' | 'offline' | 'loading'
  gpu: boolean
}

const SAVED_14 = 'saved to qlab-dev · 14 runs'
const MAIN_META = 'saved to qlab-dev · qscore-2026.1 · newest first · times local'
const LOCAL_META = 'from this machine · last synced 11:42'

export function stateConfig(state: RunsState): StateConfig {
  const base: StateConfig = { meta: MAIN_META, list: 'all', selectedId: '7f3b·0c5e', synced: 'ok', gpu: true }
  switch (state) {
    case 'no-runs-yet':
      return { ...base, meta: 'saved to qlab-dev · 0 runs', list: 'none', selectedId: null, synced: 'empty' }
    case 'loading':
      return { ...base, meta: 'saved to qlab-dev', list: 'loading', selectedId: null, synced: 'loading' }
    case 'sync-failed':
      return { ...base, meta: LOCAL_META, banner: 'sync-failed', synced: 'failed' }
    case 'signed-out':
      return { ...base, meta: '', list: 'none', selectedId: null, signedOut: true, synced: 'empty' }
    case 'no-match':
      return { ...base, meta: SAVED_14, query: '7f40', state: 'failed' }
    case 'focus':
      return { ...base, meta: SAVED_14, focusFilter: true }
    case 'offline':
      return { ...base, meta: LOCAL_META, banner: 'offline', synced: 'offline' }
    case 'gpu-off':
      return { ...base, meta: 'saved to qlab-dev · 15 runs', list: 'gpu-off', banner: 'gpu-off', gpu: false }
    case 'run-failed':
      return { ...base, meta: SAVED_14, selectedId: '7f39·5b08' }
    default:
      return base
  }
}

export function isRunsState(s: string | null): s is RunsState {
  return s === 'main' || (RUNS_STATES as readonly string[]).includes(s ?? '')
}

/** Empty words when filters leave nothing: names what was asked for. */
export function noMatchWords(query: string, state: StateFilter, item: ItemFilter) {
  const parts = [query && `match ${query}`, state !== 'all' && `with state ${state}`, item !== 'all' && `in ${item}`].filter(Boolean)
  return `No runs ${parts.join(' ')}.`
}
