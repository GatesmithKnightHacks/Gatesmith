/*
 * The sign-in tile (S-17 OVD-0, states QA6-0). S-19 shows it too once signed out.
 * States: empty, typing, wrong-password (Q905), signing-in, offline, session-ended; the main board
 * is the filled form.
 */
import { useRef, useState, type FormEvent } from 'react'
import { navigate, ROUTES } from '../../app/router'
import { AccountError, accountActions, DEMO_SIGN_IN, SYNC_FAILED_MESSAGE, useAccount } from '../../data/account'
import { PrimaryButton } from '../../ui/parts'
import { useAutoFocus, useRetry } from './hooks'
import { AuthTile, Banner, IconCross, IconDb, StageLine, TextField, TextLink } from './parts'

type Notice = null | 'session-ended' | 'reset' | 'unreachable'
type Wrong = { word: string; fix: string }

const WRONG_PASSWORD: Wrong = { word: 'Wrong password', fix: 'Try again or reset it.' }
const NO_ACCOUNT: Wrong = { word: 'No account for this email', fix: 'Check it or create an account.' }

export function SignInForm({ view, onSignedIn }: { view: string | null; onSignedIn: () => void }) {
  const acct = useAccount()
  // The filled form on first visit; after a sign-out the email stays and the password is asked again.
  const remembered = acct.live && acct.lastEmail
  const init = (() => {
    switch (view) {
      case 'empty':
        return { email: '', password: '' }
      case 'typing':
        return { email: 'dev@qlab', password: '' }
      case 'wrong-password':
      case 'session-ended':
      case 'signed-out':
        return { email: DEMO_SIGN_IN.email, password: '' }
      default:
        return remembered ? { email: acct.lastEmail, password: '' } : { ...DEMO_SIGN_IN }
    }
  })()

  const [email, setEmail] = useState(init.email)
  const [password, setPassword] = useState(init.password)
  const [busy, setBusy] = useState(view === 'signing-in')
  const [wrong, setWrong] = useState<Wrong | null>(view === 'wrong-password' ? WRONG_PASSWORD : null)
  const [notice, setNotice] = useState<Notice>(view === 'session-ended' || (!view && acct.sessionEnded) ? 'session-ended' : null)
  const [forcedOffline, setForcedOffline] = useState(view === 'offline')
  const offline = forcedOffline || !acct.online

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  useAutoFocus(emailRef, view === 'typing')
  useAutoFocus(passwordRef, view === 'wrong-password' || view === 'session-ended' || (!view && !!remembered))

  const retry = useRetry(() => {
    if (navigator.onLine) setForcedOffline(false)
  })

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy || offline) return
    if (!email.trim()) return emailRef.current?.focus()
    if (!password) return passwordRef.current?.focus()
    setBusy(true)
    setWrong(null)
    setNotice(null)
    try {
      await accountActions.signIn(email.trim(), password)
      onSignedIn()
    } catch (err) {
      setBusy(false)
      const code = err instanceof AccountError ? err.code : 'Q901'
      if (code === 'Q905') {
        setWrong(err instanceof Error && err.message.startsWith('No account') ? NO_ACCOUNT : WRONG_PASSWORD)
        setPassword('')
        window.requestAnimationFrame(() => passwordRef.current?.focus())
      } else if (code === 'offline') setForcedOffline(true)
      else setNotice('unreachable')
    }
  }

  const switchAccount = () => {
    setNotice(null)
    setEmail('')
    setPassword('')
    window.requestAnimationFrame(() => emailRef.current?.focus())
  }

  return (
    <AuthTile title="Sign in">
      <form className="acc-auth-body" style={{ padding: 0 }} onSubmit={submit} noValidate>
        {offline ? (
          <Banner kind="offline" action="Retry" onAction={retry.run} busy={retry.busy}>
            You are offline. Sign in when the connection returns.
          </Banner>
        ) : notice === 'unreachable' ? (
          <Banner kind="warning" action="Retry" onAction={() => void submit()}>
            {SYNC_FAILED_MESSAGE.replace(" Showing this machine's copy.", ' Sign in waits.')}
          </Banner>
        ) : notice === 'session-ended' ? (
          <Banner kind="info" action="Switch account" onAction={switchAccount}>
            Session ended. Sign in again to keep saving runs.
          </Banner>
        ) : notice === 'reset' ? (
          <Banner kind="info" action="Create account" onAction={() => navigate(ROUTES.signUp)}>
            Password reset is not in this build yet.
          </Banner>
        ) : null}

        <TextField
          name="signin-email"
          label="Email"
          type="email"
          autoComplete="username"
          placeholder="name@lab.org"
          value={email}
          onChange={(v) => {
            setEmail(v)
            if (wrong === NO_ACCOUNT) setWrong(null)
          }}
          disabled={busy}
          inputRef={emailRef}
        />
        <TextField
          name="signin-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(v) => {
            setPassword(v)
            if (wrong) setWrong(null)
          }}
          disabled={busy}
          inputRef={passwordRef}
          below={
            wrong && (
              <div className="acc-error-line" role="alert">
                <IconCross />
                <span className="acc-error-word">{wrong.word}</span>
                <span className="acc-error-code">(Q905)</span>
                <span className="acc-error-fix">{wrong.fix}</span>
              </div>
            )
          }
        />

        <div className="acc-actions">
          <PrimaryButton disabled={offline} style={busy ? { pointerEvents: 'none' } : undefined}>
            {busy ? 'Signing in' : 'Sign in'}
          </PrimaryButton>
          {busy ? (
            <StageLine word="Checking your account" estimate="about 1 s" />
          ) : (
            <div className="acc-row">
              <TextLink onClick={() => navigate(ROUTES.signUp)}>Create an account</TextLink>
              <TextLink onClick={() => setNotice('reset')}>Reset password</TextLink>
            </div>
          )}
          <div className="acc-continue">
            <TextLink strong onClick={() => navigate(ROUTES.newRun)}>
              Continue without an account
            </TextLink>
            <span className="acc-continue-tail">· runs stay on this machine</span>
          </div>
        </div>

        <div className="acc-note">
          <IconDb />
          Runs are saved to your account
        </div>
      </form>
    </AuthTile>
  )
}
