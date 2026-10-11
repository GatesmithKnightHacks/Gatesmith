/*
 * What shows while a screen's code is still arriving: the real shell (top bar, rail, inspector
 * frame) with skeleton tiles, so the first paint already has the workbench's shape.
 */
import { Content, Shell } from './Shell'
import { ModeTabs } from './parts'
import { Sk, SkRegion, SkTableRows } from './Skeleton'

export function ShellSkeleton() {
  return (
    <Shell
      rail="runs"
      tabs={<div className="tabstrip" />}
      inspector={
        <>
          <ModeTabs />
          <div className="mode-block">
            <Sk w={220} />
            <Sk w="100%" h={40} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 16px' }}>
            {[148, 196, 120, 172, 136].map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Sk w={w * 0.6} />
                <Sk w={w * 0.45} />
              </div>
            ))}
          </div>
        </>
      }
    >
      <Content>
        <SkRegion label="Loading the workbench" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0' }}>
          <div className="tile" style={{ flex: '1 1 0' }}>
            <div className="tile-header" />
            <div style={{ padding: '0 12px' }}>
              <SkTableRows rows={8} lanes={[0, 120, 120, 140]} />
            </div>
          </div>
          <div className="tile" style={{ flex: '0 0 300px' }}>
            <div className="tile-header" />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Sk w="100%" h={240} radius={2} />
            </div>
          </div>
        </SkRegion>
      </Content>
    </Shell>
  )
}
