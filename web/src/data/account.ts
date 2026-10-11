/*
 * Accounts (S-17 Sign in, S-18 Create account, S-19 Account) behind one interface.
 *
 * Data model, stated once and used by every sync message:
 *   Runs, scorecards and exports are saved to your account. A copy stays on this machine.
 *   Circuit source stays on this machine unless you export it.
 *
 * No account backend exists yet. `AccountApi` is the contract a real service implements. Until one
 * exists, `createMemoryAccountApi()` stands in for it: an in-memory mock that PERSISTS NOTHING ACROSS
 * RELOADS (no localStorage, no cookies, no IndexedDB, no server). A reload signs everyone out and
 * forgets every account created in this tab. The screens never claim a database: they speak of
 * "your account", and the sync line only reports what the mock actually did and when.
 */
import { useSyncExternalStore } from 'react'

/* ── Copy (verbatim, fix-round-1 D14 and fix-round-2 D26) ──────────────── */
export const ACCOUNT_DATA_MODEL =
  'Runs, scorecards and exports are saved to your account. A copy stays on this machine. Circuit source stays on this machine unless you export it.'
export const SYNC_FAILED_MESSAGE = "Could not reach the database (Q901). Showing this machine's copy."
export const OFFLINE_MESSAGE = 'You are offline · runs stay on this machine · syncs when the network is back'
export const DELETE_NOTE = "Deletes the account copy. This machine's copy stays."
export const PASSWORD_RULE = 12

/* ── Types ─────────────────────────────────────────────────────────────── */
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export type Profile = {
  handle: string
  email: string
  /** local time, "2026-10-08 14:20" */
  createdAt: string
  plan: string
  /** "2026-10-09" */
  passwordSetAt: string
}

export type SavedRun = {
  id: string
  item: string
  qubits: number
  state: JobState
  /** local time, "2026-10-10 11:42" */
  startedAt: string
  durationS: number | null
  twoQubitCount: number | null
  summary: string
  /** rounds and scorecards, in bytes */
  bytes: number
}

export type SavedExport = { file: string; fromRun: string; bytes: number }

export type ActivityIcon = 'running' | 'queued' | 'export' | 'done' | 'action' | 'token' | 'failed' | 'sign-in'
export type Activity = {
  day: 'today' | 'yesterday'
  time: string
  icon: ActivityIcon
  title: string
  detail: string
  value: string
}

export type Token = { name: string; last4: string; scope: string; usedAt: string | null }
/** A token as created: the secret is shown once, then only its last 4 characters. */
export type NewToken = Token & { secret: string }

export type Session = { token: string; handle: string; email: string; signedInAt: number }

/** The account copy: what the account holds as of the last sync. */
export type AccountCopy = {
  profile: Profile
  runs: SavedRun[]
  exports: SavedExport[]
  activity: Activity[]
  tokens: Token[]
}

export type AccountErrorCode =
  /** database unreachable (sync; copy stays on this machine) */
  | 'Q901'
  /** wrong email or password */
  | 'Q905'
  | 'offline'
  | 'email-in-use'
  | 'handle-in-use'
  | 'not-signed-in'
  | 'handle-mismatch'

export class AccountError extends Error {
  readonly code: AccountErrorCode
  constructor(code: AccountErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/* ── The contract a real account service implements ────────────────────── */
export interface AccountApi {
  signIn(email: string, password: string): Promise<Session>
  signUp(input: { handle: string; email: string; password: string }): Promise<Session>
  signOut(session: Session): Promise<void>
  listRuns(session: Session): Promise<SavedRun[]>
  saveRun(session: Session, run: SavedRun): Promise<void>
  /** Send this machine's runs that the account does not have yet; get the account copy back. */
  sync(session: Session, local: SavedRun[]): Promise<AccountCopy>
  /* S-19 needs these too. */
  updateProfile(session: Session, patch: Partial<Pick<Profile, 'handle' | 'email'>>): Promise<Profile>
  changePassword(session: Session, next: string): Promise<Profile>
  createToken(session: Session, name: string): Promise<NewToken>
  deleteAccount(session: Session, confirmHandle: string): Promise<void>
}

/* ── Seed: the demo account the boards draw (qlab-dev) ─────────────────── */
const KB = 1000
const MB = 1000 * KB

const DEMO_PROFILE: Profile = {
  handle: 'qlab-dev',
  email: 'dev@qlab.dev',
  createdAt: '2026-10-08 14:20',
  plan: 'hackathon',
  passwordSetAt: '2026-10-09',
}
/** 14 characters, the length the sign-in board draws. */
const DEMO_PASSWORD = 'qaoa-sidechain'
/** The filled sign-in form on S-17 (the board's main state) signs in to the mock's demo account. */
export const DEMO_SIGN_IN = { email: DEMO_PROFILE.email, password: DEMO_PASSWORD }

const run = (
  id: string,
  item: 'sidechain_qaoa.qasm' | 'sbox_oracle.qasm',
  state: JobState,
  startedAt: string,
  durationS: number | null,
  twoQubitCount: number | null,
  summary: string,
  kb: number,
): SavedRun => ({ id, item, qubits: item === 'sbox_oracle.qasm' ? 20 : 12, state, startedAt, durationS, twoQubitCount, summary, bytes: kb * KB })

/* sidechain_qaoa 8 runs = 1.3 MB, sbox_oracle 6 runs = 0.8 MB, 2.1 MB in all */
const DEMO_RUNS: SavedRun[] = [
  run('7f3c·1a02', 'sidechain_qaoa.qasm', 'running', '2026-10-10 11:42', null, 298, 'round 2 of 4', 168),
  run('7f3c·0e17', 'sbox_oracle.qasm', 'queued', '2026-10-10 11:40', null, null, 'waiting for GPU', 140),
  run('7f3b·0c5e', 'sidechain_qaoa.qasm', 'done', '2026-10-10 11:06', 492, 281, '2 accepted · from 321', 160),
  run('7f3a·0412', 'sidechain_qaoa.qasm', 'done', '2026-10-10 10:04', 490, 270, 'stopped by the engine', 164),
  run('7f39·5b08', 'sidechain_qaoa.qasm', 'failed', '2026-10-10 09:54', 63, null, 'WorkerStopped', 172),
  run('7f38·e801', 'sidechain_qaoa.qasm', 'done', '2026-10-09 18:04', 488, 281, 'stopped by the engine', 158),
  run('7f38·4d6a', 'sbox_oracle.qasm', 'done', '2026-10-09 17:38', 96, 1041, 'score only', 128),
  run('7f36·b1f4', 'sidechain_qaoa.qasm', 'done', '2026-10-09 15:12', 501, 284, 'stopped by the engine', 166),
  run('7f35·d2c4', 'sbox_oracle.qasm', 'done', '2026-10-09 14:30', 612, 1018, 'budget reached', 132),
  run('7f34·9a10', 'sbox_oracle.qasm', 'done', '2026-10-09 12:02', 640, 1009, 'budget reached', 136),
  run('7f33·6e21', 'sidechain_qaoa.qasm', 'done', '2026-10-08 19:20', 470, 290, 'stopped by the engine', 150),
  run('7f32·c7e3', 'sbox_oracle.qasm', 'cancelled', '2026-10-08 17:48', null, null, 'cancelled while queued', 130),
  run('7f31·0b9d', 'sidechain_qaoa.qasm', 'done', '2026-10-08 16:10', 98, 321, 'score only', 162),
  run('7f30·5a18', 'sbox_oracle.qasm', 'done', '2026-10-08 15:02', 101, 1041, 'score only', 134),
]

const DEMO_EXPORTS: SavedExport[] = [
  { file: 'sidechain_qaoa.final.qasm', fromRun: '7f3b·0c5e', bytes: 38 * KB },
  { file: 'sidechain_qaoa.final.qasm', fromRun: '7f3a·0412', bytes: 36 * KB },
  { file: 'sidechain_qaoa.final.qasm', fromRun: '7f38·e801', bytes: 37 * KB },
  { file: 'sidechain_qaoa.final.qasm', fromRun: '7f36·b1f4', bytes: 38 * KB },
  { file: 'sbox_oracle.final.qasm', fromRun: '7f35·d2c4', bytes: 124 * KB },
  { file: 'sbox_oracle.final.qasm', fromRun: '7f34·9a10', bytes: 131 * KB },
]

const DEMO_ACTIVITY: Activity[] = [
  { day: 'today', time: '11:42', icon: 'running', title: 'Run started', detail: 'sidechain_qaoa.qasm · round 2 of 4', value: '7f3c·1a02' },
  { day: 'today', time: '11:40', icon: 'queued', title: 'Run queued', detail: 'sbox_oracle.qasm · waiting for GPU', value: '7f3c·0e17' },
  { day: 'today', time: '11:16', icon: 'export', title: 'Export saved', detail: 'final.qasm · from 7f3b·0c5e', value: '38 KB' },
  { day: 'today', time: '11:14', icon: 'done', title: 'Run done', detail: '7f3b·0c5e · 2 accepted · from 321', value: '281 gates' },
  { day: 'today', time: '10:52', icon: 'action', title: 'Action enabled', detail: 'qlab/sidechain-packing', value: 'ci-bot' },
  { day: 'today', time: '10:50', icon: 'token', title: 'Token created', detail: 'ci-bot · runs:write', value: '····c41a' },
  { day: 'today', time: '10:12', icon: 'done', title: 'Run done', detail: '7f3a·0412 · stopped by the engine', value: '270 gates' },
  { day: 'today', time: '09:55', icon: 'failed', title: 'Run failed', detail: '7f39·5b08 · WorkerStopped', value: '1 m 03 s' },
  { day: 'today', time: '09:41', icon: 'sign-in', title: 'Sign-in', detail: 'from this machine', value: 'this session' },
  { day: 'yesterday', time: '18:20', icon: 'export', title: 'Export saved', detail: 'final.qasm · from 7f38·e801', value: '37 KB' },
  { day: 'yesterday', time: '18:12', icon: 'done', title: 'Run done', detail: '7f38·e801 · stopped by the engine', value: '281 gates' },
  { day: 'yesterday', time: '17:40', icon: 'done', title: 'Run done', detail: '7f38·4d6a · sbox_oracle · score only', value: '1041 gates' },
]

const DEMO_TOKENS: Token[] = [{ name: 'ci-bot', last4: 'c41a', scope: 'runs:write', usedAt: '11:42' }]

/* ── The in-memory mock ────────────────────────────────────────────────── */
type MemoryAccount = { password: string } & AccountCopy

/** Fault switches for the mock, so the sync-failed and offline paths can be exercised. */
export const mockNetwork = {
  /** false makes every call fail with Q901, as an unreachable account service would. */
  reachable: true,
}

const LATENCY = { signIn: 900, signUp: 1800, sync: 600, write: 400 }

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const clone = <T,>(v: T): T => structuredClone(v)
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)

/**
 * The stand-in account service. Everything lives in this closure, in this tab's memory, and is gone
 * on reload: nothing is written to disk, to browser storage or to any server.
 */
export function createMemoryAccountApi(): AccountApi & { demoSession(): Session } {
  const accounts = new Map<string, MemoryAccount>([
    [
      DEMO_PROFILE.email,
      { password: DEMO_PASSWORD, profile: { ...DEMO_PROFILE }, runs: clone(DEMO_RUNS), exports: clone(DEMO_EXPORTS), activity: clone(DEMO_ACTIVITY), tokens: clone(DEMO_TOKENS) },
    ],
  ])
  const sessions = new Map<string, string>() // session token → email

  async function reach(ms: number) {
    await wait(ms)
    if (!isOnline()) throw new AccountError('offline', OFFLINE_MESSAGE)
    if (!mockNetwork.reachable) throw new AccountError('Q901', SYNC_FAILED_MESSAGE)
  }
  function open(email: string, handle: string): Session {
    const token = Math.random().toString(36).slice(2)
    sessions.set(token, email)
    return { token, handle, email, signedInAt: Date.now() }
  }
  function owner(session: Session): MemoryAccount {
    const email = sessions.get(session.token)
    const acct = email ? accounts.get(email) : undefined
    if (!acct) throw new AccountError('not-signed-in', 'Session ended. Sign in again to keep saving runs.')
    return acct
  }
  const copyOf = (a: MemoryAccount): AccountCopy => clone({ profile: a.profile, runs: a.runs, exports: a.exports, activity: a.activity, tokens: a.tokens })

  return {
    /** A session on the demo account without the wait, for the account screen's snapshot. */
    demoSession() {
      const s = open(DEMO_PROFILE.email, DEMO_PROFILE.handle)
      return { ...s, signedInAt: Date.now() - 2 * 3600 * 1000 }
    },
    async signIn(email, password) {
      await reach(LATENCY.signIn)
      const acct = accounts.get(email.trim().toLowerCase())
      if (!acct) throw new AccountError('Q905', 'No account for this email (Q905)')
      if (acct.password !== password) throw new AccountError('Q905', 'Wrong password (Q905)')
      return open(acct.profile.email, acct.profile.handle)
    },
    async signUp({ handle, email, password }) {
      await reach(LATENCY.signUp)
      const key = email.trim().toLowerCase()
      if (accounts.has(key)) throw new AccountError('email-in-use', 'Already has an account')
      if ([...accounts.values()].some((a) => a.profile.handle === handle)) throw new AccountError('handle-in-use', 'Handle taken')
      const now = new Date()
      const day = localDay(now)
      accounts.set(key, {
        password,
        profile: { handle, email: key, createdAt: `${day} ${localTime(now)}`, plan: 'hackathon', passwordSetAt: day },
        runs: [],
        exports: [],
        activity: [],
        tokens: [],
      })
      return open(key, handle)
    },
    async signOut(session) {
      sessions.delete(session.token)
    },
    async listRuns(session) {
      await reach(LATENCY.sync)
      return clone(owner(session).runs)
    },
    async saveRun(session, r) {
      await reach(LATENCY.write)
      const acct = owner(session)
      acct.runs = [r, ...acct.runs.filter((x) => x.id !== r.id)]
    },
    async sync(session, local) {
      await reach(LATENCY.sync)
      const acct = owner(session)
      const known = new Set(acct.runs.map((r) => r.id))
      acct.runs = [...local.filter((r) => !known.has(r.id)), ...acct.runs.map((r) => local.find((l) => l.id === r.id) ?? r)]
      return copyOf(acct)
    },
    async updateProfile(session, patch) {
      await reach(LATENCY.write)
      const acct = owner(session)
      if (patch.email && patch.email !== acct.profile.email) {
        const key = patch.email.trim().toLowerCase()
        if (accounts.has(key)) throw new AccountError('email-in-use', 'Already has an account')
        accounts.delete(acct.profile.email)
        accounts.set(key, acct)
        sessions.set(session.token, key)
        acct.profile.email = key
      }
      if (patch.handle) acct.profile.handle = patch.handle
      return { ...acct.profile }
    },
    async changePassword(session, next) {
      await reach(LATENCY.write)
      const acct = owner(session)
      acct.password = next
      acct.profile.passwordSetAt = localDay(new Date())
      return { ...acct.profile }
    },
    async createToken(session, name) {
      await reach(LATENCY.write)
      const acct = owner(session)
      const secret = `gsk_${acct.profile.handle.replace(/[^a-z0-9]/g, '')}_${randomChars(20)}`
      const token: Token = { name, last4: secret.slice(-4), scope: 'runs:write', usedAt: null }
      acct.tokens = [...acct.tokens, token]
      return { ...token, secret }
    },
    async deleteAccount(session, confirmHandle) {
      await reach(LATENCY.write)
      const acct = owner(session)
      if (confirmHandle !== acct.profile.handle) throw new AccountError('handle-mismatch', 'Type the handle to confirm')
      accounts.delete(acct.profile.email)
      sessions.delete(session.token)
    },
  }
}

function randomChars(n: number) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/* ── The store ─────────────────────────────────────────────────────────── */
export type SyncStatus = 'never' | 'syncing' | 'synced' | 'failed' | 'offline'

export type AccountState = {
  session: Session | null
  /** The session ended without a sign-out (expired): the email is known, only the password is asked. */
  sessionEnded: boolean
  /** The last email used on this machine, kept for the sign-in form. */
  lastEmail: string
  /** The account copy as of the last sync. */
  copy: AccountCopy | null
  /** This machine's copy of the runs (in memory too: the mock persists nothing). */
  local: SavedRun[]
  /** Run ids on this machine the account does not have yet. */
  pending: string[]
  sync: { status: SyncStatus; lastSyncedAt: number | null; error: AccountError | null }
  online: boolean
  /** True once anyone signs in, signs up or signs out in this tab; until then routes show their snapshot. */
  live: boolean
}

const memory = createMemoryAccountApi()
const api: AccountApi = memory

let state: AccountState = {
  session: null,
  sessionEnded: false,
  lastEmail: '',
  copy: null,
  local: [],
  pending: [],
  sync: { status: 'never', lastSyncedAt: null, error: null },
  online: isOnline(),
  live: false,
}
const listeners = new Set<() => void>()

function set(patch: Partial<AccountState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => state)
}
export const getAccount = () => state

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set({ online: false, sync: { ...state.sync, status: state.session ? 'offline' : state.sync.status } }))
  // Back online: the runs that waited on this machine sync now.
  window.addEventListener('online', () => {
    set({ online: true })
    if (state.session) void accountActions.sync()
  })
}

/** The one warning a screen shows about sync, or null when the account copy is current. */
export function syncBanner(s: Pick<AccountState, 'online' | 'sync'>): { kind: 'warning' | 'offline'; message: string } | null {
  if (!s.online || s.sync.status === 'offline') return { kind: 'offline', message: OFFLINE_MESSAGE }
  if (s.sync.status === 'failed') return { kind: 'warning', message: SYNC_FAILED_MESSAGE }
  return null
}

/** "12 s ago", "4 m ago", "2 h ago", or "at 11:42" for anything older than a day. */
export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.floor(s / 60)} m ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `at ${localTime(new Date(at))}`
}

/** Sizes as the boards print them: one decimal in MB, whole KB below 1 MB. */
export function size(bytes: number): { value: string; unit: 'MB' | 'KB' } {
  if (bytes === 0) return { value: '0', unit: 'MB' }
  return bytes >= 100 * KB ? { value: (bytes / MB).toFixed(1), unit: 'MB' } : { value: String(Math.round(bytes / KB)), unit: 'KB' }
}

export const accountActions = {
  async signIn(email: string, password: string) {
    set({ live: true, lastEmail: email })
    if (!isOnline()) throw new AccountError('offline', OFFLINE_MESSAGE)
    const session = await api.signIn(email, password)
    set({ session, sessionEnded: false, lastEmail: session.email })
    await accountActions.sync()
    return session
  },

  async signUp(input: { handle: string; email: string; password: string }) {
    set({ live: true, lastEmail: input.email })
    if (!isOnline()) throw new AccountError('offline', OFFLINE_MESSAGE)
    const session = await api.signUp(input)
    set({ session, sessionEnded: false, lastEmail: session.email })
    await accountActions.sync()
    return session
  },

  /** Signs out of the account. This machine's copy of the runs stays. */
  async signOut() {
    const session = state.session
    set({ live: true, session: null, sessionEnded: false, copy: null, sync: { status: 'never', lastSyncedAt: null, error: null } })
    if (session) await api.signOut(session).catch(() => undefined)
  },

  /** Sends this machine's waiting runs and refreshes the account copy. Never reports a sync that did not happen. */
  async sync() {
    const session = state.session
    if (!session) return
    if (!isOnline()) {
      set({ online: false, sync: { ...state.sync, status: 'offline' } })
      return
    }
    set({ sync: { ...state.sync, status: 'syncing', error: null } })
    try {
      const copy = await api.sync(session, state.local)
      if (state.session?.token !== session.token) return
      set({ copy, pending: [], sync: { status: 'synced', lastSyncedAt: Date.now(), error: null } })
    } catch (e) {
      const err = e instanceof AccountError ? e : new AccountError('Q901', SYNC_FAILED_MESSAGE)
      if (err.code === 'not-signed-in') {
        set({ session: null, sessionEnded: true, copy: null })
        return
      }
      set({ sync: { ...state.sync, status: err.code === 'offline' ? 'offline' : 'failed', error: err } })
    }
  },

  /** A run finished on this machine: it joins this machine's copy and goes to the account when it can. */
  async saveRun(r: SavedRun) {
    set({ local: [r, ...state.local.filter((x) => x.id !== r.id)], pending: [...new Set([...state.pending, r.id])] })
    const session = state.session
    if (!session || !isOnline()) return
    try {
      await api.saveRun(session, r)
      set({ pending: state.pending.filter((id) => id !== r.id) })
    } catch (e) {
      set({ sync: { ...state.sync, status: 'failed', error: e instanceof AccountError ? e : new AccountError('Q901', SYNC_FAILED_MESSAGE) } })
    }
  },

  async updateProfile(patch: Partial<Pick<Profile, 'handle' | 'email'>>) {
    const session = state.session
    if (!session) throw new AccountError('not-signed-in', 'Session ended. Sign in again to keep saving runs.')
    if (!isOnline()) throw new AccountError('offline', OFFLINE_MESSAGE)
    const profile = await api.updateProfile(session, patch)
    set({
      session: { ...session, handle: profile.handle, email: profile.email },
      lastEmail: profile.email,
      copy: state.copy ? { ...state.copy, profile } : state.copy,
      sync: { status: 'synced', lastSyncedAt: Date.now(), error: null },
    })
    return profile
  },

  async changePassword(next: string) {
    const session = state.session
    if (!session) throw new AccountError('not-signed-in', 'Session ended. Sign in again to keep saving runs.')
    if (!isOnline()) throw new AccountError('offline', OFFLINE_MESSAGE)
    const profile = await api.changePassword(session, next)
    if (state.copy) set({ copy: { ...state.copy, profile } })
    return profile
  },

  async createToken(name: string) {
    const session = state.session
    if (!session) throw new AccountError('not-signed-in', 'Session ended. Sign in again to keep saving runs.')
    const token = await api.createToken(session, name)
    const stored: Token = { name: token.name, last4: token.last4, scope: token.scope, usedAt: token.usedAt }
    if (state.copy) set({ copy: { ...state.copy, tokens: [...state.copy.tokens, stored] } })
    return token
  },

  /** Deletes the account copy. This machine's copy stays. */
  async deleteAccount(confirmHandle: string) {
    const session = state.session
    if (!session) throw new AccountError('not-signed-in', 'Session ended. Sign in again to keep saving runs.')
    await api.deleteAccount(session, confirmHandle)
    set({ live: true, session: null, sessionEnded: false, copy: null, lastEmail: '', sync: { status: 'never', lastSyncedAt: null, error: null } })
  },
}

/**
 * Routes open on their design snapshot until someone acts in this tab (like the run store): the
 * account screen shows the demo account (qlab-dev, synced 12 s ago); sign in and create account
 * show no session. Nothing here touches the mock's data.
 */
export function ensureAccountSnapshot(path: string) {
  if (state.live) return
  if (path === '/account') {
    if (state.session) return
    set({
      session: memory.demoSession(),
      lastEmail: DEMO_PROFILE.email,
      copy: { profile: { ...DEMO_PROFILE }, runs: clone(DEMO_RUNS), exports: clone(DEMO_EXPORTS), activity: clone(DEMO_ACTIVITY), tokens: clone(DEMO_TOKENS) },
      local: clone(DEMO_RUNS),
      pending: [],
      sync: { status: 'synced', lastSyncedAt: Date.now() - 12_000, error: null },
    })
  } else if ((path === '/signin' || path === '/signup') && state.session) {
    set({ session: null, copy: null, sync: { status: 'never', lastSyncedAt: null, error: null } })
  }
}
