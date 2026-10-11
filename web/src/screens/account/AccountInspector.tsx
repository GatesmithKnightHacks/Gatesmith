/*
 * S-19 inspector (board PHB-0, states QQ3-0): the save block, Session, Password and Delete account.
 */
import { useRef, useState, type ReactNode } from 'react'
import { AccountError, accountActions, DELETE_NOTE, PASSWORD_RULE } from '../../data/account'
import { EditorButton, ModeBlock, ModeTabs, PoweredBy, PrimaryButton, Section } from '../../ui/parts'
import { Sk } from '../../ui/Skeleton'
import { useAutoFocus, useDone } from './hooks'
import { Banner, IconCheck, IconWarn, WithCodes } from './parts'

export type SaveLine =
  | { kind: 'clean' }
  | { kind: 'loading' }
  | { kind: 'dirty'; fields: string[]; waits?: boolean }
  | { kind: 'saved'; fields: string[]; at: string }
  | { kind: 'error'; text: string }

export function AccountInspector({
  line,
  canSave,
  justSaved,
  onSave,
  handle,
  syncLine,
  loading,
  passwordSetAt,
  counts,
  confirming,
  onConfirming,
  confirmTyped = '',
}: {
  line: SaveLine
  canSave: boolean
  /** Saved in the last 1200 ms: the button stays lit while it reads "Saved ✓". */
  justSaved: boolean
  /** Returns a promise: the button shows its spinner slot until it settles, then "Saved ✓" for 1200 ms. */
  onSave: () => Promise<boolean>
  handle: string
  syncLine: ReactNode
  loading: boolean
  passwordSetAt: string
  counts: { runs: number; exports: number }
  confirming: boolean
  onConfirming: (on: boolean) => void
  /** The states board draws the handle already typed. */
  confirmTyped?: string
}) {
  return (
    <>
      <ModeTabs />
      <ModeBlock line={<SaveStatus line={line} />} style={{ paddingTop: 18, paddingBottom: 14 }}>
        <PrimaryButton onClick={onSave} disabled={!canSave && !justSaved} doneLabel="Saved">
          Save changes
        </PrimaryButton>
        <PoweredBy />
      </ModeBlock>

      <Section icon={<IconSession />} title="Session" open>
        <div className="acc19-session">
          <div className="acc19-signed-in">
            <span>Signed in as</span>
            <span className="mono acc19-handle">{handle}</span>
          </div>
          {loading ? <Sk w={240} h={12} /> : syncLine}
          <div>
            <EditorButton onClick={() => void accountActions.signOut()}>Sign out</EditorButton>
          </div>
        </div>
      </Section>

      <Section icon={<IconLock />} title="Password" meta={`set ${passwordSetAt}`} open={false}>
        <PasswordChange />
      </Section>

      {confirming ? (
        <DeleteConfirm handle={handle} counts={counts} initialTyped={confirmTyped} onKeep={() => onConfirming(false)} />
      ) : (
        <button type="button" className="acc19-delete-row" onClick={() => onConfirming(true)}>
          <span className="acc19-delete-word">Delete account</span>
          <span className="acc-grow" />
          <span className="mono acc19-delete-note">irreversible</span>
        </button>
      )}
    </>
  )
}

function SaveStatus({ line }: { line: SaveLine }) {
  switch (line.kind) {
    case 'clean':
      return <>No unsaved changes</>
    case 'loading':
      return <>Loading your account</>
    case 'dirty':
      return (
        <>
          {line.fields.length === 1 ? 'Unsaved change' : 'Unsaved changes'} · {line.fields.join(', ')}
          {line.waits && <span className="acc19-waits"> · waits for the network</span>}
        </>
      )
    case 'saved':
      return (
        <span className="acc19-saved">
          <IconCheck size={12} />
          <span className="acc19-saved-word">{savedWords(line.fields)}</span>
          <span className="acc-grow" />
          <span className="mono acc19-saved-at">{line.at}</span>
        </span>
      )
    case 'error':
      return (
        <span className="acc19-saved">
          <IconWarn size={12} />
          <span className="acc19-error-text">
            <WithCodes text={line.text} />
          </span>
        </span>
      )
  }
}

const savedWords = (fields: string[]) =>
  fields.length === 1 ? `${fields[0]} saved` : `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1].toLowerCase()} saved`

function PasswordChange() {
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const done = useDone(2400)
  const ok = next.length >= PASSWORD_RULE
  const change = async () => {
    if (!ok || busy) return
    setBusy(true)
    setError('')
    try {
      await accountActions.changePassword(next)
      setNext('')
      done.flash()
    } catch (e) {
      setError(e instanceof AccountError && e.code === 'offline' ? 'You are offline. The password waits.' : 'Could not reach the database (Q901). Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="acc19-password">
      <div className="acc19-inline">
        <span className="acc-input-box acc19-input">
          <input
            className={`acc-input${next ? ' mono is-secret' : ''}`}
            type="password"
            aria-label="New password"
            placeholder="New password · 12 characters or more"
            autoComplete="new-password"
            value={next}
            disabled={busy}
            onChange={(e) => setNext(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void change()}
          />
        </span>
        <EditorButton onClick={() => void change()} disabled={!ok || busy}>
          {busy ? 'Changing' : 'Change password'}
        </EditorButton>
      </div>
      {next && !ok && (
        <div className="mono acc19-rule">
          {next.length} {next.length === 1 ? 'character' : 'characters'} · the rule is {PASSWORD_RULE} or more
        </div>
      )}
      {done.done && (
        <div className="acc19-saved acc-done">
          <IconCheck size={12} />
          <span className="acc19-saved-word">Password changed</span>
        </div>
      )}
      {error && <div className="acc19-error-text">{error}</div>}
    </div>
  )
}

function DeleteConfirm({
  handle,
  counts,
  initialTyped,
  onKeep,
}: {
  handle: string
  counts: { runs: number; exports: number }
  initialTyped: string
  onKeep: () => void
}) {
  const [typed, setTyped] = useState(initialTyped)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useAutoFocus(ref, true)
  const match = typed === handle
  const remove = async () => {
    if (!match || busy) return
    setBusy(true)
    try {
      await accountActions.deleteAccount(typed)
    } catch (e) {
      setBusy(false)
      setError(e instanceof AccountError && e.code === 'offline' ? 'You are offline. Nothing was deleted.' : 'Could not reach the database (Q901). Nothing was deleted.')
    }
  }
  return (
    <div className="acc19-confirm" role="group" aria-label="Delete account">
      <Banner kind="high" word="irreversible" action="Keep account" onAction={onKeep}>
        <span className="mono">
          {counts.runs} runs, {counts.exports} exports
        </span>
      </Banner>
      <label className="acc19-confirm-label" htmlFor="acc19-confirm">
        Type the handle to confirm
      </label>
      <div className="acc19-inline">
        <span className="acc-input-box acc19-input">
          <input
            id="acc19-confirm"
            ref={ref}
            className="acc-input mono"
            value={typed}
            placeholder={handle}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void remove()
              if (e.key === 'Escape') onKeep()
            }}
          />
        </span>
        <button type="button" className="acc19-delete-btn" disabled={!match || busy} onClick={() => void remove()}>
          {busy ? 'Deleting' : 'Delete account'}
        </button>
      </div>
      <div className="acc19-confirm-note">{error || DELETE_NOTE}</div>
    </div>
  )
}

function IconSession() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7.2" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" />
      <path d="M9 9.4a2.6 2.6 0 100-5.2a2.6 2.6 0 000 5.2zM4.6 14.2c.8-2 2.4-3 4.4-3s3.6 1 4.4 3" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="3.5" y="8" width="11" height="7.5" rx="1.2" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" />
      <path d="M6 8V5.8a3 3 0 016 0V8" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.4" />
    </svg>
  )
}
