/*
 * What shows while a screen's code is still arriving: the real shell (top bar, rail, inspector
 * frame) with skeleton tiles in DS-08's grammar, so the first paint already has the workbench's
 * shape, and the stage word says what is happening.
 */
import { Content, Shell } from './Shell'
import { ModeTabs } from './parts'
import { Sk, SkRegion, SkTableRows } from './Skeleton'
import { Spinner } from './Spinner'

function StripHeader({ w, meta }: { w: number; meta?: boolean }) {
  return (
    <div className="tile-header">
      <div className="tile-tabs">
        <span className="tile-tab is-active">
          <Sk w={w} strip />
        </span>
      </div>
      {meta && (
        <div className="tile-meta">
          <Spinner stage="Loading" estimate="about 1 s" />
        </div>
      )}
    </div>
  )
}

export function ShellSkeleton() {
  return (
    <Shell
      rail="runs"
      tabs={
        <div className="tabstrip">
          <div className="tabstrip-tabs">
            <span className="run-tab">
              <Sk w={116} />
            </span>
          </div>
        </div>
      }
      inspector={
        <>
          <ModeTabs />
          <div className="mode-block">
            <Sk w={260} />
            <Sk w="100%" h={40} />
          </div>
          {[64, 72, 80].map((w) => (
            <div key={w} className="insp-section">
              <div className="insp-section-header">
                <Sk w={18} h={18} />
                <Sk w={w} h={16} />
              </div>
            </div>
          ))}
        </>
      }
    >
      <Content>
        <SkRegion label="Loading the workbench" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0' }}>
          <div className="tile" style={{ flex: '1 1 0' }}>
            <StripHeader w={72} meta />
            <div style={{ padding: '0 12px' }}>
              <SkTableRows rows={8} lanes={[0, 120, 120, 140]} height={44} />
            </div>
          </div>
          <div className="tile" style={{ flex: '0 0 300px' }}>
            <StripHeader w={56} />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Sk w="100%" h={240} />
            </div>
          </div>
        </SkRegion>
      </Content>
    </Shell>
  )
}
