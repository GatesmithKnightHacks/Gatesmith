/*
 * S-18 · Create account (board PBH-0, states QJH-0): a new user decides what Gatesmith keeps.
 * States: empty, invalid-email, weak-password, creating, created, email-in-use, keyboard-focus,
 * offline; the main board is the filled form.
 */
import { useRef, useState, type FormEvent } from 'react'
import { navigate, ROUTES, useHashParams } from '../app/router'
import { ACCOUNT_DATA_MODEL, AccountError, accountActions, PASSWORD_RULE, SYNC_FAILED_MESSAGE, useAccount } from '../data/account'
import { PrimaryButton } from '../ui/parts'
import { Content, Shell } from '../ui/Shell'
import { useAutoFocus, useRetry } from './account/hooks'
import { AccountStatus, AuthTile, Banner, IconCheck, IconDb, StageLine, TextField, TextLink } from './account/parts'

export function S18CreateAccount() {
  const state = useHashParams().get('state')
  return (
    <Shell context="Account" rail="account" status={<AccountStatus />} tabs={<div className="tabstrip" aria-hidden />} inspector={null}>
      <Content className="acc-center">
        <CreateAccount key={state ?? 'main'} view={state} />
      </Content>
    </Shell>
  )
}

type FieldError = { kind: 'invalid' | 'warning'; text: string } | null
type Errors = { handle: FieldError; email: FieldError; password: FieldError }
const NO_ERRORS: Errors = { handle: null, email: null, password: null }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const HANDLE = /^[a-z0-9][a-z0-9-]{1,38}$/

const INVALID_EMAIL: FieldError = { kind: 'invalid', text: 'Invalid email · add the domain' }
const EMAIL_IN_USE: FieldError = { kind: 'invalid', text: 'Already has an account' }
const WEAK: FieldError = { kind: 'warning', text: 'warning' }

function checkHandle(v: string): FieldError {
  if (!v.trim()) return { kind: 'invalid', text: 'Add a handle' }
  if (!HANDLE.test(v)) return { kind: 'invalid', text: 'Use a to z, 0 to 9 and hyphens' }
  return null
}
const checkEmail = (v: string): FieldError => (!v.trim() ? { kind: 'invalid', text: 'Add an email' } : EMAIL.test(v.trim()) ? null : INVALID_EMAIL)
const checkPassword = (v: string): FieldError => (v.length < PASSWORD_RULE ? WEAK : null)

function CreateAccount({ view }: { view: string | null }) {
  const acct = useAccount()
  const filled = { handle: 'qlab-dev', email: 'dev@qlab.dev', password: 'sidechain-qaoa' }
  const init = (() => {
    switch (view) {
      case 'empty':
      case 'keyboard-focus':
        return { handle: '', email: '', password: '' }
      case 'invalid-email':
        return { handle: 'qlab-dev', email: 'dev@qlab', password: '' }
      case 'weak-password':
        return { handle: 'qlab-dev', email: 'dev@qlab.dev', password: 'sidechai' }
      default:
        return filled
    }
  })()

  const [handle, setHandle] = useState(init.handle)
  const [email, setEmail] = useState(init.email)
  const [password, setPassword] = useState(init.password)
  const [errors, setErrors] = useState<Errors>({
    ...NO_ERRORS,
    email: view === 'invalid-email' ? INVALID_EMAIL : view === 'email-in-use' ? EMAIL_IN_USE : null,
    password: view === 'weak-password' ? WEAK : null,
  })
  const [phase, setPhase] = useState<'form' | 'creating' | 'created'>(view === 'creating' ? 'creating' : view === 'created' ? 'created' : 'form')
  const [createdAs, setCreatedAs] = useState(view === 'created' ? 'qlab-dev' : '')
  const [unreachable, setUnreachable] = useState(false)
  const [forcedOffline, setForcedOffline] = useState(view === 'offline')
  const offline = forcedOffline || !acct.online
  const creating = phase === 'creating'

  const handleRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  useAutoFocus(handleRef, view === 'keyboard-focus')
  useAutoFocus(passwordRef, view === 'invalid-email' || view === 'weak-password')

  const retry = useRetry(() => {
    if (navigator.onLine) setForcedOffline(false)
  })

  const setError = (k: keyof Errors, e: FieldError) => setErrors((prev) => (prev[k] === e ? prev : { ...prev, [k]: e }))

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (creating || offline) return
    const next: Errors = { handle: checkHandle(handle), email: checkEmail(email), password: checkPassword(password) }
    setErrors(next)
    const first = next.handle ? handleRef : next.email ? emailRef : next.password ? passwordRef : null
    if (first) return first.current?.focus()
    setPhase('creating')
    setUnreachable(false)
    try {
      const session = await accountActions.signUp({ handle, email: email.trim(), password })
      setCreatedAs(session.handle)
      setPhase('created')
    } catch (err) {
      setPhase('form')
      const code = err instanceof AccountError ? err.code : 'Q901'
      if (code === 'email-in-use') {
        setError('email', EMAIL_IN_USE)
        emailRef.current?.focus()
      } else if (code === 'handle-in-use') {
        setError('handle', { kind: 'invalid', text: 'Handle taken' })
        handleRef.current?.focus()
      } else if (code === 'offline') setForcedOffline(true)
      else setUnreachable(true)
    }
  }

  if (phase === 'created')
    return (
      <AuthTile title="Create account">
        <div className="acc-done">
          <IconCheck />
          <span>Account created. Runs from now on are saved to your account.</span>
        </div>
        <div className="acc-signed-in-as">
          Signed in as <span className="mono">{createdAs}</span>
        </div>
        <div className="acc-actions" style={{ gap: 0 }}>
          <PrimaryButton onClick={() => navigate(ROUTES.newRun)}>Start a run</PrimaryButton>
        </div>
      </AuthTile>
    )

  return (
    <AuthTile title="Create account">
      <form className="acc-auth-body" style={{ padding: 0 }} onSubmit={submit} noValidate>
        {offline ? (
          <Banner kind="offline" action="Retry" onAction={retry.run} busy={retry.busy}>
            You are offline. Create the account when it returns.
          </Banner>
        ) : unreachable ? (
          <Banner kind="warning" action="Retry" onAction={() => void submit()}>
            {SYNC_FAILED_MESSAGE.replace(" Showing this machine's copy.", ' Nothing was created.')}
          </Banner>
        ) : null}

        <TextField
          name="signup-handle"
          label="Handle"
          mono
          autoComplete="username"
          placeholder="lab-name"
          value={handle}
          signal={errors.handle}
          onChange={(v) => {
            setHandle(v)
            if (errors.handle) setError('handle', checkHandle(v))
          }}
          onBlur={() => handle && setError('handle', checkHandle(handle))}
          disabled={creating}
          inputRef={handleRef}
        />
        <TextField
          name="signup-email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="name@lab.org"
          value={email}
          signal={errors.email}
          below={errors.email === EMAIL_IN_USE && <div className="acc-below">Sign in instead, or use another email.</div>}
          onChange={(v) => {
            setEmail(v)
            if (errors.email) setError('email', errors.email === EMAIL_IN_USE ? null : checkEmail(v))
          }}
          onBlur={() => email && setError('email', errors.email === EMAIL_IN_USE ? EMAIL_IN_USE : checkEmail(email))}
          disabled={creating}
          inputRef={emailRef}
        />
        <TextField
          name="signup-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="12 characters or more"
          value={password}
          signal={errors.password}
          below={
            errors.password === WEAK && (
              <div className="acc-below mono">
                {password.length} {password.length === 1 ? 'character' : 'characters'} · the rule is {PASSWORD_RULE} or more
              </div>
            )
          }
          onChange={(v) => {
            setPassword(v)
            if (errors.password) setError('password', checkPassword(v))
          }}
          onBlur={() => password && setError('password', checkPassword(password))}
          disabled={creating}
          inputRef={passwordRef}
        />

        <div className="acc-stored">
          <IconDb />
          <div className="acc-stored-text">
            <div className="acc-stored-title">Stored in your account</div>
            <div className="acc-stored-body">{ACCOUNT_DATA_MODEL}</div>
          </div>
        </div>

        <div className="acc-actions">
          <PrimaryButton disabled={offline} style={creating ? { pointerEvents: 'none' } : undefined}>
            {creating ? 'Creating account' : 'Create account'}
          </PrimaryButton>
          {creating ? (
            <StageLine word="Saving your account" estimate="about 2 s" />
          ) : (
            !offline && (
              <div className="acc-row">
                <TextLink onClick={() => navigate(ROUTES.signIn)}>Sign in instead</TextLink>
              </div>
            )
          )}
        </div>
      </form>
    </AuthTile>
  )
}
