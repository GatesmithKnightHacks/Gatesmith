/*
 * S-13 · Runs · states (Paper 1DH8-0). Each ?state= renders the whole screen with the panel that changes.
 * The words are the board's.
 */
import { useState } from 'react'
import { navigate, ROUTES } from '../../app/router'
import { PrimaryButton } from '../../ui/parts'
import { Sk } from '../../ui/Skeleton'
import { SpinnerRing } from '../../ui/Spinner'

/* ── Loading: the stage word with a spinner, then rows of shimmer sized to the content ── */
const SK_WIDTHS = [
  [64, 148, 52, 36, 52, 64],
  [64, 120, 52, 36, 52, 56],
  [64, 148, 52, 36, 28, 64],
  [64, 120, 52, 36, 52, 70],
]

export function LoadingRows() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <div className="s13-loading-row">
        <SpinnerRing size={14} />
        <span className="s13-loading-word">Loading runs from your account</span>
        <span className="s13-grow" />
        <span className="s13-loading-est mono">about 1 s · 14 runs</span>
      </div>
      {Array.from({ length: 14 }, (_, i) => SK_WIDTHS[i % SK_WIDTHS.length]).map((w, i) => (
        <div key={i} className="s13-row s13-sk-row" aria-hidden>
          <span className="s13-c-run">
            <Sk w={w[0]} h={10} />
          </span>
          <span className="s13-c-item">
            <Sk w={w[1]} h={10} />
          </span>
          <span className="s13-c-state">
            <Sk w={w[2]} h={10} />
          </span>
          <span className="s13-c-started">
            <Sk w={w[3]} h={10} />
          </span>
          <span className="s13-c-dur">
            <Sk w={w[4]} h={10} />
          </span>
          <span className="s13-c-result">
            <Sk w={w[5]} h={10} />
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Signed out: Runs live in the account, so the screen asks for it ── */
export function SignInTile() {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(false)
  return (
    <section className="tile s13-signin" aria-label="Sign in">
      <div className="tile-header">
        <div className="tile-tabs" role="tablist">
          <button role="tab" aria-selected className="tile-tab is-active">
            Sign in
          </button>
        </div>
      </div>
      <form
        className="s13-signin-body"
        onSubmit={(e) => {
          e.preventDefault()
          if (!password) return setError(true)
          // The account store is a mock: any password signs qlab-dev in.
          navigate(ROUTES.runs, { replace: true })
        }}
      >
        <label className="s13-field">
          <span className="s13-field-label">Email</span>
          <input className="s13-input" type="email" defaultValue="dev@qlab.dev" autoComplete="email" />
        </label>
        <label className="s13-field">
          <span className="s13-field-label">Password</span>
          <span className={`s13-input s13-input-pw${error ? ' is-error' : ''}`}>
            <input
              type={show ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              aria-invalid={error}
              onChange={(e) => {
                setPassword(e.target.value)
                if (e.target.value) setError(false)
              }}
            />
            <button type="button" className="s13-pw-toggle" onClick={() => setShow((v) => !v)}>
              {show ? 'Hide' : 'Show'}
            </button>
          </span>
          {error && <span className="s13-field-error">Enter the password for dev@qlab.dev</span>}
        </label>
        <div className="s13-signin-actions">
          <PrimaryButton>Sign in</PrimaryButton>
          <div className="s13-signin-links">
            <button type="button" className="s13-link" onClick={() => navigate(ROUTES.signUp)}>
              Create an account
            </button>
            <button type="button" className="s13-link" onClick={() => navigate(ROUTES.signIn)}>
              Reset password
            </button>
          </div>
        </div>
        <div className="s13-signin-note">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <ellipse cx="7" cy="3.5" rx="4.5" ry="1.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2.5 3.5v7c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-7M2.5 7c0 1 2 1.8 4.5 1.8S11.5 8 11.5 7" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span>Runs are saved to your account. A copy stays on this machine.</span>
        </div>
      </form>
    </section>
  )
}
