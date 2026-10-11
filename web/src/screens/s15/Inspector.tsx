/*
 * S-15 inspector (Paper 1BKK-0): the one mint "Verify top 2", Budget, Selected candidate with the
 * verification ladder, Findings and Screening history (closed by default).
 */
import { useState, type KeyboardEvent } from 'react'
import { EditorButton, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section } from '../../ui/parts'
import { Block, LayerDot, ProbBar, StatusWord, type Word } from '../stretch/parts'
import { Icons } from '../stretch/icons'
import { CANDIDATES, FINDINGS, HISTORY, LADDER, LAYER_KIND, NOW_GATES, type Candidate } from './data'

export type InspectorView = 'board' | 'loading' | 'empty' | 'screening' | 'verified-wrong' | 'no-predictor' | 'gpu-off'

export function S15Inspector({
  view,
  line,
  selected,
  onSelect,
  sent,
  onVerifyTop,
  onVerifyOne,
  canVerify,
  verifyLabel,
}: {
  view: InspectorView
  line: string
  selected: number
  onSelect: (rank: number) => void
  sent: number[]
  onVerifyTop: () => void
  onVerifyOne: (rank: number) => void
  canVerify: boolean
  verifyLabel: string
}) {
  const [max, setMax] = useState(8)
  const sel = CANDIDATES.find((c) => c.rank === selected) ?? CANDIDATES[0]
  const other = CANDIDATES.find((c) => c.rank === (selected === 1 ? 2 : 1)) ?? CANDIDATES[1]
  const onMaxKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      setMax((m) => Math.max(1, Math.min(8, m + (e.key === 'ArrowUp' ? 1 : -1))))
    }
  }
  return (
    <>
      <ModeTabs />
      <ModeBlock line={line} style={{ padding: '18px 16px 14px' }}>
        <PrimaryButton onClick={onVerifyTop} disabled={!canVerify}>
          {verifyLabel}
        </PrimaryButton>
        <PoweredBy />
      </ModeBlock>
      <Section icon={Icons.clock} title="Budget" meta={`312 s GPU left · ${max} max`} bodyStyle={{ padding: '0 16px 12px', gap: 0 }}>
        <div className="s15-budget-row" style={{ height: 30 }}>
          <span className="st-fact-label">GPU time left</span>
          <span className="st-fact-value">
            <span className="mono">312</span>
            <span className="mono st-unit">s of 900 s</span>
          </span>
        </div>
        <div className="s15-budget-row" style={{ height: 34 }}>
          <label className="st-fact-label" htmlFor="s15-max">
            Max candidates
          </label>
          <span className="s15-field-wrap">
            <span className="s15-field">
              <input
                id="s15-max"
                className="mono"
                inputMode="numeric"
                value={max}
                onKeyDown={onMaxKey}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ''))
                  if (n >= 1 && n <= 8) setMax(n)
                }}
                aria-label="Max candidates"
              />
              <span className="mono st-unit">candidates</span>
            </span>
            <span className="s15-lock-slot" />
          </span>
        </div>
      </Section>
      <Section
        icon={Icons.target}
        title="Selected candidate"
        meta={view === 'empty' ? 'none yet' : view === 'loading' ? 'loading' : `#${sel.rank} of 8 · round 4`}
        bodyStyle={{ padding: '0 16px 16px', gap: 8 }}
      >
        {view === 'empty' ? (
          <p className="s15-insp-empty">No candidates for finding #3 yet. Request a fix and the model proposes in round 4.</p>
        ) : view === 'loading' ? (
          <div className="s15-sel-card is-loading" aria-hidden>
            <Block w={120} />
            <Block w={180} h={14} />
            <Block w={260} />
            <Block w={220} />
          </div>
        ) : (
          <>
            <SelectedCard c={sel} view={view} status={statusOf(sel.rank, sent, view)} onVerifyOne={onVerifyOne} />
            <OtherCard c={other} status={statusOf(other.rank, sent, view)} onShow={() => onSelect(other.rank)} view={view} />
          </>
        )}
      </Section>
      <Section icon={Icons.list} title="Findings" meta="3 open · 1 accepted" open={false} bodyStyle={{ padding: '0 16px 12px', gap: 0 }}>
        {FINDINGS.map((f, i) => (
          <div key={f.id} className={`s15-list-row${i === FINDINGS.length - 1 ? ' is-last' : ''}`}>
            <span className="mono s15-list-id">{f.id}</span>
            <span className="s15-list-main">{f.rule}</span>
            <span className="mono s15-list-note">{f.note}</span>
            {f.state === 'high' ? <StatusWord word="failed" label="high" className="s15-high" /> : <StatusWord word="accepted" />}
          </div>
        ))}
      </Section>
      <Section icon={Icons.history} title="Screening history" meta="2 rounds · 11 candidates" open={false} bodyStyle={{ padding: '0 16px 12px', gap: 0 }}>
        {HISTORY.map((h, i) => (
          <div key={h.round} className={`s15-list-row${i === HISTORY.length - 1 ? ' is-last' : ''}`}>
            <span className="mono s15-list-id is-wide">{h.round}</span>
            <span className="s15-list-main">{h.note}</span>
          </div>
        ))}
      </Section>
    </>
  )
}

function statusOf(rank: number, sent: number[], view: InspectorView): Word {
  if (view === 'verified-wrong') return rank === 1 ? 'failed' : rank === 2 ? 'verifying' : 'queued'
  if (view === 'screening') return 'screening'
  return sent.includes(rank) ? 'verifying' : 'queued'
}

function SelectedCard({ c, view, status, onVerifyOne }: { c: Candidate; view: InspectorView; status: Word; onVerifyOne: (rank: number) => void }) {
  const failed = status === 'failed'
  const ladder: Word[] = failed ? ['passed', 'failed', 'queued', 'queued'] : status === 'verifying' ? ['verifying', 'queued', 'queued', 'queued'] : ['queued', 'queued', 'queued', 'queued']
  const predicted = view !== 'screening' && view !== 'no-predictor'
  return (
    <article className="s15-sel-card is-selected">
      <div className="s15-card-top">
        <span className="mono s15-card-rank">#{c.rank}</span>
        <StatusWord word={status} gap={4} />
        <span className="s15-grow" />
        <span className="s15-card-layer">
          <LayerDot layer={LAYER_KIND[c.layer]} />
          <span className="mono">{c.layer} · D03 block 2</span>
        </span>
      </div>
      <div className="mono s15-card-title">{c.strategy}</div>
      <div className="s15-card-rows">
        <div className="s15-card-row">
          <span className="s15-card-key">Predicted</span>
          {predicted ? (
            <span className="s15-inline">
              <span className="mono s15-val">{c.predicted}</span>
              <span className="mono s15-unit">±{c.ci} gates · n={c.n} · two_qubit_count</span>
            </span>
          ) : (
            <span className="mono s15-unit">{view === 'screening' ? 'screening · about 6 s' : 'unavailable · no predictor'}</span>
          )}
        </div>
        <div className="s15-card-row">
          <span className="s15-card-key">Now</span>
          <span className="s15-inline">
            <span className="mono s15-val">{NOW_GATES}</span>
            <span className="mono s15-unit">gates · after round 2</span>
          </span>
        </div>
        <div className="s15-card-row">
          <span className="s15-card-key">Verifies</span>
          {predicted ? (
            <span className="s15-inline is-center">
              <ProbBar value={c.verify} />
              <span className="mono s15-val">{c.verify.toFixed(2)}</span>
              <span className="mono s15-unit">predicted</span>
            </span>
          ) : (
            <span className="mono s15-unit">unavailable</span>
          )}
        </div>
        <div className="s15-card-row">
          <span className="s15-card-key">Region</span>
          <span className="mono s15-id">layers 17 to 31 · lines 48 to 86</span>
        </div>
        <div className="s15-ladder">
          <span className="s15-ladder-label">Verification</span>
          {LADDER.map((step, i) => (
            <span key={step} className={`s15-step is-${ladder[i]}`}>
              <span className="s15-step-bar" />
              <span className="s15-step-name">{step}</span>
              <span className="s15-step-word">
                <svg width="8" height="8" viewBox="0 0 12 12" aria-hidden>
                  {ladder[i] === 'passed' ? (
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  ) : ladder[i] === 'failed' ? (
                    <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  ) : ladder[i] === 'verifying' ? (
                    <circle cx="6" cy="6" r="3.5" fill="currentColor" />
                  ) : (
                    <circle cx="6" cy="6" r="3.5" fill="none" stroke="var(--color-text-disabled)" strokeWidth="1.6" />
                  )}
                </svg>
                {ladder[i]}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="s15-card-foot">
        <span className="s15-card-hint">{failed ? 'Not equivalent · kept 281 gates' : 'The prediction only orders the queue'}</span>
        <EditorButton onClick={() => onVerifyOne(c.rank)} disabled={status !== 'queued'}>
          Verify only this
        </EditorButton>
      </div>
    </article>
  )
}

function OtherCard({ c, status, onShow, view }: { c: Candidate; status: Word; onShow: () => void; view: InspectorView }) {
  const predicted = view !== 'screening' && view !== 'no-predictor'
  return (
    <article className="s15-sel-card">
      <div className="s15-card-top">
        <span className="mono s15-card-rank">#{c.rank}</span>
        <StatusWord word={status} gap={4} />
        <span className="s15-grow" />
        <span className="s15-card-layer">
          <LayerDot layer={LAYER_KIND[c.layer]} />
          <span className="mono">{c.layer === 'reference-qiskit' ? 'reference-qiskit · engine' : `${c.layer} · proposes`}</span>
        </span>
      </div>
      <div className="mono s15-card-title">{c.strategy}</div>
      <div className="s15-card-foot is-tight">
        <span className="s15-inline s15-grow">
          {predicted ? (
            <>
              <span className="mono s15-val">{c.predicted}</span>
              <span className="mono s15-unit">
                ±{c.ci} gates · n={c.n} · verifies {c.verify.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="mono s15-unit">{view === 'screening' ? 'screening' : 'no prediction · proposal order'}</span>
          )}
        </span>
        <EditorButton onClick={onShow}>Show</EditorButton>
      </div>
    </article>
  )
}

