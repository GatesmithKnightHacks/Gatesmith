/*
 * S-16 · Model bench (stretch). Paper: 1CJS-0, states 1LWU-0.
 * Three in-house gate-group layers, each benched on its fixture subset with S-14's rate definitions,
 * ±CI95 and n on every rate; the white tick is reference-qiskit on the same fixtures. qscore conform
 * (12 fixtures × 20 attempts) decides whether a layer may be listed.
 */
import { useEffect, useRef, useState } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { BenchTile, type BenchView } from './s16/Bench'
import { type HistoryRow } from './s16/data'
import { S16Inspector } from './s16/Inspector'
import { GpuTile, TrainingTile, type GpuView, type TrainingView } from './s16/Training'
import { Banner } from './stretch/parts'
import './s16/s16.css'

/** ?state= names: the states board captions, kebab-cased, plus `offline` (network) and `gpu-off`. */
const STATES = ['training', 'evaluating', 'keyboard-focus', 'gpu-busy', 'conform-failed', 'loading', 'gpu-off', 'offline', 'empty'] as const
type State = (typeof STATES)[number]
const ALIASES: Record<string, State> = { 'qscore-conform-failed': 'conform-failed', 'kit-failed': 'conform-failed' }

const LINES: Partial<Record<State, string>> = {
  training: 'Training on this machine · GPU · epoch 23 of 40',
  evaluating: 'Bench on this machine · GPU · 2 of 3 layers benched',
  'gpu-busy': 'Bench on this machine · GPU held by vLLM · 2 queued',
  'conform-failed': 'gategroup-reversible-0.1 failed qscore conform · 9 of 12 fixtures',
  loading: 'Loading bench results from this machine',
  'gpu-off': 'Bench on this machine · GPU off · qscore conform queued',
  empty: 'Bench on this machine · GPU · 0 layers',
}

type Run = { kind: 'idle' } | { kind: 'running'; progress: number } | { kind: 'done' }

export function S16Bench() {
  const params = useHashParams()
  const raw = params.get('state') ?? ''
  const state: State | null = (STATES as readonly string[]).includes(raw) ? (raw as State) : (ALIASES[raw] ?? null)
  // a state link starts from its own snapshot
  return <Bench key={state ?? 'board'} state={state} />
}

function Bench({ state }: { state: State | null }) {
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [run, setRun] = useState<Run>({ kind: 'idle' })
  const [added, setAdded] = useState<HistoryRow | undefined>(undefined)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(timer.current), [])

  // qscore conform on this GPU: 12 fixtures × 20 attempts, about 12 s; the label carries the share.
  const start = () => {
    if (run.kind !== 'idle') return
    const t0 = performance.now()
    setRun({ kind: 'running', progress: 0 })
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / 12000)
      if (p >= 1) {
        window.clearInterval(timer.current)
        setRun({ kind: 'done' })
        setAdded({ at: 'now', job: '7f3e·0b14', word: 'passed', note: '12 of 12 fixtures' })
        timer.current = window.setTimeout(() => setRun({ kind: 'idle' }), 1200)
      } else setRun({ kind: 'running', progress: p })
    }, 250)
  }

  const bench: BenchView = state === 'evaluating' || state === 'keyboard-focus' || state === 'loading' || state === 'empty' ? state : 'board'
  const training: TrainingView =
    state === 'training' || state === 'loading' || state === 'empty' || state === 'conform-failed'
      ? state
      : state === 'gpu-busy'
        ? 'queued'
        : state === 'gpu-off'
          ? 'stored'
          : 'done'
  const gpu: GpuView = state === 'gpu-busy' ? 'busy' : state === 'gpu-off' ? 'off' : 'online'

  const primary =
    run.kind === 'running' ? `Run qscore conform (${Math.round(run.progress * 100)}%)` : run.kind === 'done' ? 'Ran qscore conform ✓' : 'Run qscore conform'
  const line = run.kind === 'running' ? `qscore conform on this machine · fixture ${Math.max(1, Math.ceil(run.progress * 12))} of 12` : (state && LINES[state]) || 'Bench on this machine · GPU · 3 layers · 180 proposals'
  const disabled = state === 'loading' || state === 'empty' || state === 'gpu-off' || state === 'training' || state === 'evaluating'

  const banner =
    state === 'gpu-busy' ? (
      <Banner word="warning" action="Show queue" onAction={() => navigate(ROUTES.runs)}>
        vLLM holds the GPU · GPU jobs will wait · 2 queued
      </Banner>
    ) : state === 'gpu-off' ? (
      <Banner word="offline" label="GPU off" action="Retry" onAction={() => navigate(ROUTES.bench, { replace: true })}>
        GPU machine is off · model proposals wait · the engine keeps running on CPU
      </Banner>
    ) : state === 'offline' ? (
      <Banner word="offline" action="Retry" onAction={() => navigate(ROUTES.bench, { replace: true })}>
        You are offline · runs stay on this machine · syncs when the network is back
      </Banner>
    ) : null

  return (
    <Shell
      context="Leaderboard"
      rail="leaderboard"
      gpu={gpu === 'off' ? 'off' : 'online'}
      tabs={
        <TabStrip
          tabs={[
            { id: 'board', label: 'Leaderboard', onClick: () => navigate(ROUTES.leaderboard) },
            { id: 'fixtures', label: 'Conformance fixtures', onClick: () => navigate(ROUTES.leaderboard) },
            { id: 'bench', label: 'Model bench', active: true },
          ]}
        />
      }
      inspector={
        <S16Inspector
          line={line}
          primary={primary}
          onPrimary={start}
          disabled={disabled}
          progress={run.kind === 'running' ? run.progress : undefined}
          extraHistory={added}
        />
      }
    >
      <Content className="s16">
        <BenchTile view={bench} selected={selected} onSelect={setSelected} onChooseSubset={() => navigate(ROUTES.leaderboard)} />
        {banner}
        <div className="s16-bottom">
          <TrainingTile view={training} onShowReport={() => navigate(ROUTES.runs)} onChooseSubset={() => navigate(ROUTES.leaderboard)} />
          <GpuTile view={gpu} />
        </div>
      </Content>
    </Shell>
  )
}
