/*
 * The small-screen gate (S-20 phone 2MQY-0, S-21 tablet 2MXI-0, rules 2MZG-0). Phones and tablets get
 * this instead of the app; it is not a layout. It never touches the session, the saved runs or the
 * link: widen the window (or open the link on a desktop) and the app is where it was.
 */
import { LogoBurst } from '../../ui/icons'
import { EditorButton } from '../../ui/parts'
import { copyText } from '../account/hooks'
import './gate.css'

export function Gate() {
  return (
    <main className="gate" aria-labelledby="gate-title">
      <LogoBurst size={40} />
      <h1 id="gate-title" className="gate-title">
        Gatesmith is a desktop app.
      </h1>
      <p className="gate-body">Open it in a desktop browser.</p>
      <span className="mono gate-link">gatesmith.work</span>
      {/* DS-08 done state: "Copied ✓" for 1200 ms, in the same width */}
      <EditorButton doneLabel="Copied" onClick={() => copyText(window.location.href)}>
        Copy link
      </EditorButton>
    </main>
  )
}
