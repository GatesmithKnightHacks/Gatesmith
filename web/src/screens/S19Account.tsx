/*
 * S-19 · Account (board PHB-0, states QQ3-0): a signed-in researcher checks what the account keeps.
 * States: editing, saved, sync-failed (Q901), offline, signed-out, delete-confirmation, loading,
 * keyboard-focus, empty, token-created; the main board has no unsaved changes.
 */
import { useRef, useState } from 'react'
import { useHashParams } from '../app/router'
import {
  AccountError,
  accountActions,
  ago,
  clock,
  demoCopy,
  syncBanner,
  useAccount,
  type AccountCopy,
  type AccountState,
  type NewToken,
  type Profile,
  type SavedRun,
  type SyncStatus,
} from '../data/account'
import { Content, Shell, TabStrip } from '../ui/Shell'
import { AccountInspector, type SaveLine } from './account/AccountInspector'
import { AccountTile, ActivityTile, SessionsTile, StoredTile } from './account/AccountTiles'
import { useAutoFocus, useDone, useNow, useRetry } from './account/hooks'
import { Banner, IconCheck, IconWarn, Spinner, WithCodes } from './account/parts'
import { SignInForm } from './account/SignInForm'
import './account/s19.css'

export function S19Account() {
  const state = useHashParams().get('state')
  const acct = useAccount()
  if (state === 'signed-out' || !acct.session)
    return (
      <Shell context="Account" rail="account" tabs={<AccountTabs />} inspector={null}>
        <Content className="acc-center">
          {/* Signed out: the account page asks for sign in, the email stays. */}
          <SignInForm key={state ?? 'main'} view={state === 'signed-out' ? 'signed-out' : null} onSignedIn={() => undefined} />
        </Content>
      </Shell>
    )
  return <AccountScreen key={state ?? 'main'} view={state ? stateView(state) : null} acct={acct} />
}

function AccountTabs() {
  return <TabStrip tabs={[{ id: 'account', label: 'Account', active: true }]} />
}

/* ── What a states-board state changes ──────────────────────────────── */
type View = {
  copy?: AccountCopy
  loading?: boolean
  sync?: { status: SyncStatus; lastSyncedAt: number | null }
  pending?: SavedRun[]
  offline?: boolean
  email?: string
  saved?: { fields: string[]; at: string }
  confirming?: boolean
  focusHandle?: boolean
  newToken?: NewToken
}

const at1142 = () => new Date().setHours(11, 42, 0, 0)

function stateView(state: string): View | null {
  const copy = demoCopy()
  switch (state) {
    case 'editing':
      return { email: 'dev@qlab.org' }
    case 'saved':
      return { copy: { ...copy, profile: { ...copy.profile, email: 'dev@qlab.org' } }, saved: { fields: ['Email'], at: '11:42' } }
    case 'sync-failed':
      return { sync: { status: 'failed', lastSyncedAt: at1142() }, pending: copy.runs.filter((r) => r.id === '7f3c·1a02') }
    case 'offline':
      return { offline: true, email: 'dev@qlab.org', sync: { status: 'offline', lastSyncedAt: at1142() } }
    case 'delete-confirmation':
      return { confirming: true }
    case 'loading':
      return { loading: true }
    case 'keyboard-focus':
      return { focusHandle: true }
    case 'empty': {
      const now = new Date()
      const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      return {
        copy: {
          profile: { ...copy.profile, createdAt: `${day} ${clock(now.getTime())}`, passwordSetAt: day },
          runs: [],
          exports: [],
          activity: [{ day: 'today', date: day, time: clock(now.getTime()), icon: 'sign-in', title: 'Account created', detail: 'from this machine', value: 'this session' }],
          tokens: [],
        },
      }
    }
    case 'token-created':
      return { newToken: { name: 'deploy-bot', last4: 'e07b', scope: 'runs:write', usedAt: null, secret: 'gsk_qlab_9fT2wK7pX3mR8vQ1e07b' } }
    default:
      return null
  }
}

/** This machine's copy, labelled as such, when the account copy could not be fetched. */
function machineCopy(acct: AccountState): AccountCopy {
  const fallback = demoCopy()
  return {
    profile: acct.copy?.profile ?? { ...fallback.profile, handle: acct.session?.handle ?? '', email: acct.session?.email ?? '' },
    runs: acct.local,
    exports: acct.copy?.exports ?? [],
    activity: acct.copy?.activity ?? [],
    tokens: acct.copy?.tokens ?? [],
  }
}

/* ── The screen ─────────────────────────────────────────────────────── */
function AccountScreen({ view, acct }: { view: View | null; acct: AccountState }) {
  const now = useNow(5000)
  const v = view ?? {}
  const [recovered, setRecovered] = useState(false)
  const [forcedOffline, setForcedOffline] = useState(!!v.offline)

  const copy = v.copy ?? acct.copy ?? machineCopy(acct)
  const loading = !!v.loading || (!view && !acct.copy && acct.sync.status === 'syncing')
  const sync = v.sync && !recovered ? v.sync : acct.sync
  const online = !forcedOffline && acct.online
  const status: SyncStatus = !online ? 'offline' : sync.status
  const pending = v.pending && !recovered ? v.pending : acct.local.filter((r) => acct.pending.includes(r.id))
  const showingMachineCopy = status === 'failed' || status === 'offline'
  const lastSynced = sync.lastSyncedAt ? clock(sync.lastSyncedAt) : null

  // Profile form: what the account holds vs what is typed.
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null)
  const profile = (v.copy && savedProfile) || copy.profile
  const [handle, setHandle] = useState(profile.handle)
  const [email, setEmail] = useState(v.email ?? profile.email)
  const [saved, setSaved] = useState<{ fields: string[]; at: string } | null>(v.saved ?? null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const justSaved = useDone(1200)
  const changed = [handle.trim() !== profile.handle && 'Handle', email.trim() !== profile.email && 'Email'].filter(Boolean) as string[]
  const dirty = changed.length > 0
  const valid = /^[a-z0-9][a-z0-9-]{1,38}$/.test(handle.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const [confirming, setConfirming] = useState(!!v.confirming)
  const [newToken, setNewToken] = useState<NewToken | null>(v.newToken ?? null)
  const [creatingToken, setCreatingToken] = useState(false)

  const handleRef = useRef<HTMLInputElement>(null)
  useAutoFocus(handleRef, !!v.focusHandle)

  const retry = useRetry(async () => {
    if (!navigator.onLine) return
    setForcedOffline(false)
    await accountActions.sync()
    setRecovered(true)
  })

  /** Resolves false when nothing was saved, so the button skips its done face. */
  const save = async (): Promise<boolean> => {
    if (!dirty || !valid || saving || !online) return false
    setSaving(true)
    setSaveError('')
    try {
      const next = await accountActions.updateProfile({ handle: handle.trim(), email: email.trim() })
      // A states-board view keeps its own copy; the saved values carry into it.
      setSavedProfile(next)
      setSaving(false)
      justSaved.flash()
      setSaved({ fields: changed, at: clock(Date.now()) })
      return true
    } catch (e) {
      setSaving(false)
      const code = e instanceof AccountError ? e.code : 'Q901'
      setSaveError(code === 'email-in-use' ? 'That email already has an account.' : code === 'offline' ? 'You are offline. The change waits.' : 'Could not reach the database (Q901). The change waits.')
      return false
    }
  }

  const createToken = async () => {
    setCreatingToken(true)
    try {
      const taken = new Set([...copy.tokens.map((t) => t.name), newToken?.name])
      const name = ['deploy-bot', 'script-bot', 'ci-bot-2'].find((n) => !taken.has(n)) ?? `token-${taken.size + 1}`
      setNewToken(await accountActions.createToken(name))
    } catch {
      setSaveError('Could not reach the database (Q901). No token was created.')
    } finally {
      setCreatingToken(false)
    }
  }

  const line: SaveLine = loading
    ? { kind: 'loading' }
    : saveError
      ? { kind: 'error', text: saveError }
      : dirty
        ? { kind: 'dirty', fields: changed, waits: !online }
        : saved
          ? { kind: 'saved', ...saved }
          : { kind: 'clean' }

  const banner = syncBanner({ online, sync: { ...sync, status, error: null } })
  const accountMeta = loading
    ? profile.handle
    : status === 'synced' && sync.lastSyncedAt
      ? `${profile.handle} · synced ${ago(sync.lastSyncedAt, now)}`
      : status === 'syncing'
        ? `${profile.handle} · syncing`
        : lastSynced
          ? `${profile.handle} · last synced ${lastSynced}`
          : profile.handle
  const totalBytes = [...copy.runs, ...copy.exports].reduce((n, x) => n + x.bytes, 0)
  const storedMeta = showingMachineCopy ? `from this machine${lastSynced ? ` · last synced ${lastSynced}` : ''}` : `${(totalBytes / 1e6).toFixed(totalBytes ? 1 : 0)} MB · qscore-2026.1`
  const counts = `${copy.runs.length} ${copy.runs.length === 1 ? 'run' : 'runs'} · ${copy.exports.length} ${copy.exports.length === 1 ? 'export' : 'exports'}`

  const syncLine =
    status === 'synced' && sync.lastSyncedAt ? (
      <div className="acc19-sync">
        <IconCheck size={12} />
        <span className="mono">synced {ago(sync.lastSyncedAt, now)} · {counts}</span>
      </div>
    ) : status === 'syncing' ? (
      <div className="acc19-sync">
        <Spinner size={14} />
        <span className="mono">syncing · {counts}</span>
      </div>
    ) : (
      <div className="acc19-sync">
        <IconWarn size={12} />
        <span className="mono">
          {lastSynced ? `last synced ${lastSynced}` : 'not synced yet'} · {status === 'offline' ? 'offline' : 'sync failed'}
        </span>
      </div>
    )

  return (
    <Shell
      context="Account"
      rail="account"
     
      tabs={<AccountTabs />}
      inspector={
        <AccountInspector
          line={line}
          canSave={dirty && valid && online && !loading}
          justSaved={justSaved.done}
          onSave={save}
          handle={profile.handle}
          syncLine={syncLine}
          loading={loading}
          passwordSetAt={profile.passwordSetAt}
          counts={{ runs: copy.runs.length, exports: copy.exports.length }}
          confirming={confirming}
          onConfirming={setConfirming}
          confirmTyped={v.confirming ? profile.handle : ''}
        />
      }
    >
      <Content className="acc19-content">
        <div className="acc19-left">
          <AccountTile
            meta={accountMeta}
            loading={loading}
            handle={handle}
            email={email}
            onHandle={(x) => {
              setHandle(x)
              setSaveError('')
            }}
            onEmail={(x) => {
              setEmail(x)
              setSaveError('')
            }}
            createdAt={profile.createdAt}
            plan={profile.plan}
            disabled={saving}
            handleRef={handleRef}
          />
          <StoredTile
            copy={copy}
            meta={loading ? 'qscore-2026.1' : storedMeta}
            loading={loading}
            pending={showingMachineCopy ? pending : []}
            machineCopy={showingMachineCopy}
            banner={
              banner &&
              (banner.kind === 'offline' ? (
                // Offline needs no Retry: runs sync on their own when the network is back.
                <Banner kind="offline">{banner.message}</Banner>
              ) : (
                <Banner kind="warning" action="Retry" onAction={() => void retry.run()} busy={retry.busy}>
                  <WithCodes text={banner.message} />
                </Banner>
              ))
            }
          />
          <SessionsTile
            copy={copy}
            signedIn={ago(acct.session?.signedInAt ?? now - 2 * 3600 * 1000, now)}
            loading={loading}
            newToken={newToken}
            creating={creatingToken}
            onCreateToken={() => void createToken()}
          />
        </div>
        <ActivityTile activity={copy.activity} loading={loading} />
      </Content>
    </Shell>
  )
}
