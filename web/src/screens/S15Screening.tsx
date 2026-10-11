/*
 * S-15 · Candidate screening (stretch). Paper: 1BKI-0, states 1LVA-0.
 * Round 4 of run 7f3a·0412 at 400 s: the predictor ranks eight candidates for finding #3 "D03 block 2";
 * only the top two go to the engine, which still verifies, re-scores and decides every one.
 */
import { useEffect, useRef, useState } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { CandidatesTile, type CandidatesView } from './s15/Candidates'
import { S15Inspector, type InspectorView } from './s15/Inspector'
import { PredictorTile } from './s15/Predictor'
import { RoundsTile } from './s15/Rounds'
import { AccountStatus } from './stretch/parts'
import './s15/s15.css'

/** ?state= names: the captions of the states board, kebab-cased, plus `offline` (network) and `gpu-off`. */
const STATES = ['no-predictor', 'screening', 'all-screened', 'verified-wrong', 'loading', 'keyboard-focus', 'gpu-off', 'offline', 'empty'] as const
type State = (typeof STATES)[number]

const LINES: Partial<Record<State, string>> = {
  'no-predictor': 'Finding #3 · D03 block 2 · proposal order · no predictor',
  screening: 'Finding #3 · D03 block 2 · 0 of 8 screened',
  'all-screened': 'Finding #3 · D03 block 2 · 8 of 8 screened',
  'verified-wrong': 'Finding #3 · D03 block 2 · #1 failed · #2 verifying',
  loading: 'Loading candidates for finding #3',
  empty: 'Finding #3 · D03 block 2 · 0 candidates',
}

export function S15Screening() {
  const params = useHashParams()
  const raw = params.get('state') ?? ''
  const state: State | null = (STATES as readonly string[]).includes(raw) ? (raw as State) : null
  // a state link starts from its own snapshot
  return <Screening key={state ?? 'board'} state={state} />
}

function Screening({ state }: { state: State | null }) {
  const [selected, setSelected] = useState(1)
  const [sent, setSent] = useState<number[]>(state === 'verified-wrong' ? [1, 2] : [])
  const [justSent, setJustSent] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const view: CandidatesView = state ?? 'board'
  const disabledStates: (State | null)[] = ['screening', 'loading', 'empty', 'verified-wrong']
  const canVerify = !disabledStates.includes(state) && sent.length === 0

  const verifyTop = () => {
    setSent([1, 2])
    setJustSent(true)
    timer.current = window.setTimeout(() => setJustSent(false), 1200)
  }
  const verifyOne = (rank: number) => setSent((s) => (s.includes(rank) ? s : [...s, rank]))

  const line =
    sent.length && state !== 'verified-wrong'
      ? `Finding #3 · D03 block 2 · ${sent.map((r) => `#${r}`).join(' and ')} sent to the engine · verifying`
      : (state && LINES[state]) || 'Finding #3 · D03 block 2 · 4 screened · 4 screening'

  const inspectorView: InspectorView =
    state === 'loading' || state === 'empty' || state === 'screening' || state === 'verified-wrong' || state === 'no-predictor' || state === 'gpu-off' ? state : 'board'

  const reset = () => navigate(ROUTES.screening, { replace: true })

  return (
    <Shell
      context="Leaderboard"
      rail="leaderboard"
      status={<AccountStatus gpu={state === 'gpu-off' ? 'off' : 'online'} />}
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: true },
            { id: 'b', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={
        <S15Inspector
          view={inspectorView}
          line={line}
          selected={selected}
          onSelect={setSelected}
          sent={sent}
          onVerifyTop={verifyTop}
          onVerifyOne={verifyOne}
          canVerify={canVerify || justSent}
          verifyLabel={justSent ? 'Sent top 2 ✓' : 'Verify top 2'}
        />
      }
    >
      <Content className="s15">
        <div className="s15-top">
          <CandidatesTile
            view={view}
            selected={selected}
            onSelect={setSelected}
            sent={sent}
            onRequestFix={() => navigate(ROUTES.fixReview)}
            onInstall={reset}
            onRetry={reset}
          />
          <PredictorTile installed={state !== 'no-predictor'} gpu={state !== 'gpu-off'} />
        </div>
        <RoundsTile />
      </Content>
    </Shell>
  )
}
