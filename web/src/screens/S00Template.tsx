import { useState } from 'react'
import { FINDINGS, SUPPRESSED } from '../data/demo'
import { SectionIcons } from '../ui/icons'
import {
  Field,
  FieldRow,
  FindingCard,
  ModeBlock,
  ModeTabs,
  PoweredBy,
  PrimaryButton,
  Section,
  SuppressedRow,
  Tile,
} from '../ui/parts'
import { Content, Shell, TabStrip } from '../ui/Shell'
import './intake/intake.css'
import './intake/s00.css'

const MEASURED: [string, string][] = [
  ['Top bar', '52'],
  ['Rail', '50'],
  ['Inspector', '380'],
  ['Tab strip · tabs', '36 · 28'],
  ['Tile header', '28'],
  ['Section header', '40'],
  ['Data row · list row', '28 · 32 to 36'],
  ['Field', '26'],
  ['Ground gutter', '4'],
]

const TYPE_SCALE: [string, string, string][] = [
  ['20', 'Board title', 's00-type-20'],
  ['14', 'Section title', 's00-type-14'],
  ['12', 'Body and data rows', 's00-type-12'],
  ['11', 'meta · ids · units', 's00-type-11'],
]

const RULES = [
  'One mint fill per view: the primary action',
  'Yellow only marks where you are',
  'Status is a word, an icon and a color',
]

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="#C2DADF" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** S-00 · Shell template: the measured grammar every screen is built from. */
export function S00Template() {
  const [open, setOpen] = useState({ budget: true, resources: true, findings: true })
  const [dataTab, setDataTab] = useState<'data' | 'second'>('data')
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  return (
    <Shell
      rail="runs"
      tabs={
        <TabStrip
          tabs={[
            { id: 'a', label: 'sidechain_qaoa.qasm', active: true },
            { id: 'b', label: 'sbox_oracle.qasm' },
          ]}
        />
      }
      inspector={
        <>
          <ModeTabs />
          <ModeBlock line="Runs on this machine">
            <PrimaryButton>Confirm and score</PrimaryButton>
            <PoweredBy />
          </ModeBlock>
          <div className="s00-insp-body">
            <Section icon={SectionIcons.clock} title="Budget" open={open.budget} onToggle={() => toggle('budget')} bodyStyle={{ paddingBottom: 16 }}>
              <FieldRow label="Target">
                <Field value="FakeTorino" select />
              </FieldRow>
              <FieldRow label="Seeds">
                <Field value="8" unit="seeds" />
              </FieldRow>
              <FieldRow label="Max rounds">
                <Field value="4" unit="rounds" />
              </FieldRow>
            </Section>
            <Section
              icon={SectionIcons.chip}
              title="Resources"
              open={open.resources}
              onToggle={() => toggle('resources')}
              bodyStyle={{ paddingBottom: 16, gap: 0 }}
            >
              <div className="ik-insp-rows">
                <div className="ik-insp-row">
                  <span className="ik-insp-row-label">CPU</span>
                  <span className="ik-insp-row-value">8 cores · 40 s</span>
                </div>
                <div className="ik-insp-row">
                  <span className="ik-insp-row-label">GPU</span>
                  <span className="ik-insp-row-value">48 GB · online</span>
                </div>
              </div>
            </Section>
            <div className="s00-findings">
              <Section
                icon={SectionIcons.list}
                title="Findings"
                meta="3 open · 1 suppressed"
                open={open.findings}
                onToggle={() => toggle('findings')}
                bodyStyle={{ paddingBottom: 16 }}
              >
                {FINDINGS.map((f) => (
                  <FindingCard key={f.rule} finding={f} selected={f.rule === 'D03'} />
                ))}
                <SuppressedRow rule={SUPPRESSED.rule} label={SUPPRESSED.label} />
              </Section>
            </div>
          </div>
        </>
      }
    >
      <Content className="s00-content">
        <Tile
          className="s00-canvas-tile"
          tabs={[{ id: 'canvas', label: 'Canvas', active: true }]}
          meta={<span className="ik-meta-mono">tile header 28 · meta 11 mono</span>}
          bodyClassName="s00-canvas-body"
        >
          <div className="s00-canvas-slot">
            <div className="s00-canvas-title">Canvas slot</div>
            <div className="mono s00-canvas-sub">wires and gates · fills the tile · 12 px inset</div>
          </div>
        </Tile>
        <div className="s00-right">
          <Tile
            tabs={[
              { id: 'data', label: 'Data', active: dataTab === 'data', onClick: () => setDataTab('data') },
              { id: 'second', label: 'Second tab', active: dataTab === 'second', onClick: () => setDataTab('second') },
            ]}
            meta={<span className="ik-meta-mono">12 px padding</span>}
            className="s00-data-tile"
            bodyClassName="s00-data-body"
          >
            <div className="ik-row">
              <span className="ik-row-label ik-row-head" style={{ color: 'var(--color-text-tertiary)' }}>
                Measured size
              </span>
              <span className="ik-row-value ik-row-head" style={{ width: 120, fontFamily: 'var(--font-ui)', color: 'var(--color-text-tertiary)' }}>
                Value
              </span>
              <span className="ik-row-unit" style={{ fontFamily: 'var(--font-ui)' }}>
                Unit
              </span>
            </div>
            {MEASURED.map(([label, value], i) => (
              <div key={label} className={`ik-row${i === MEASURED.length - 1 ? ' is-last' : ''}`}>
                <span className="ik-row-label">{label}</span>
                <span className="ik-row-value" style={{ width: 120 }}>
                  {value}
                </span>
                <span className="ik-row-unit">px</span>
              </div>
            ))}
          </Tile>
          <Tile
            tabs={[{ id: 'reading', label: 'Reading', active: true }]}
            meta={<span className="ik-meta-mono">16 px padding</span>}
            className="s00-reading-tile"
            bodyClassName="s00-reading-body"
          >
            <div className="s00-reading-head">
              <div className="s00-reading-title">One padding value per tile</div>
              <p className="s00-reading-text">
                Data tiles use 12 px and reading tiles use 16 px. Text starts on one left lane. Numbers sit right-aligned, units in their own slot.
              </p>
            </div>
            <div className="s00-type">
              {TYPE_SCALE.map(([size, label, cls]) => (
                <div key={size} className="s00-type-row">
                  <span className="mono s00-type-size">{size}</span>
                  <span className={cls}>{label}</span>
                </div>
              ))}
            </div>
            <div className="s00-rules">
              {RULES.map((r) => (
                <div key={r} className="s00-rule">
                  <Check />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </Tile>
        </div>
      </Content>
    </Shell>
  )
}
