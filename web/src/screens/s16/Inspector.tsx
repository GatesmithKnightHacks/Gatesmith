/*
 * S-16 inspector (Paper 1CJU-0): the one mint "Run qscore conform", Bench facts, the qscore conform
 * kit (12 fixtures × 20 attempts), Fixtures (closed) and History.
 */
import type { ReactNode } from 'react'
import { ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section } from '../../ui/parts'
import { Fact, StatusWord } from '../stretch/parts'
import { Icons } from '../stretch/icons'
import { FIXTURE_SUBSETS, HISTORY, KIT, type HistoryRow } from './data'

export function S16Inspector({
  line,
  primary,
  onPrimary,
  disabled,
  progress,
  extraHistory,
}: {
  line: string
  primary: ReactNode
  onPrimary: () => void
  disabled?: boolean
  progress?: number
  extraHistory?: HistoryRow
}) {
  const history = extraHistory ? [extraHistory, ...HISTORY] : HISTORY
  return (
    <>
      <ModeTabs />
      <ModeBlock line={line} style={{ padding: '18px 16px 14px' }}>
        <PrimaryButton onClick={onPrimary} disabled={disabled} progress={progress}>
          {primary}
        </PrimaryButton>
        <PoweredBy />
      </ModeBlock>
      <Section icon={Icons.bars} title="Bench facts" meta="qscore-2026.1" bodyStyle={{ padding: '0 16px 10px', gap: 0 }}>
        <Fact label="Score version" value="qscore-2026.1" height={28} />
        <Fact label="Prompt version" value="p-2026.1" height={28} />
        <Fact label="Target" value="FakeTorino · 133 q" height={28} />
        <Fact label="Seeds" value="8" unit="per fixture" height={28} />
        <Fact label="Fixtures" value="9 of 12 · 3 subsets" height={28} />
        <Fact label="Proposals" value="20" unit="per fixture · 180 in all" height={28} />
        <Fact label="qscore conform" value="12" unit="fixtures × 20 attempts" height={28} />
        <Fact label="Last run" value="11:20 · 7f3d·2a10" height={28} last />
      </Section>
      <Section icon={Icons.check} title="qscore conform" meta="12 fixtures" bodyStyle={{ padding: '0 16px 10px', gap: 0 }}>
        {KIT.map((k, i) => (
          <Fact key={k.label} label={k.label} value={k.value} height={28} small last={i === KIT.length - 1} />
        ))}
      </Section>
      <Section icon={Icons.lines} title="Fixtures" meta="9 of 12 · 3 subsets" open={false} bodyStyle={{ padding: '0 16px 10px', gap: 0 }}>
        {FIXTURE_SUBSETS.map((f, i) => (
          <div key={f.layer} className={`s16-subset${i === FIXTURE_SUBSETS.length - 1 ? ' is-last' : ''}`}>
            <span className="mono s16-subset-layer">{f.layer}</span>
            <span className="mono s16-subset-fixtures">{f.fixtures}</span>
          </div>
        ))}
      </Section>
      <Section icon={Icons.clock} title="History" meta={`${history.length} runs`} bodyStyle={{ padding: '0 16px 10px', gap: 0 }}>
        {history.map((h, i) => (
          <div key={h.job} className={`s16-history${i === history.length - 1 ? ' is-last' : ''}`}>
            <span className="mono s16-history-at">{h.at}</span>
            <span className="mono s16-history-job">{h.job}</span>
            <span className="s16-history-word">
              <StatusWord word={h.word} gap={4} />
            </span>
            <span className="mono s16-history-note">{h.note}</span>
          </div>
        ))}
      </Section>
    </>
  )
}
