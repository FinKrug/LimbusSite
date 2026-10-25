// Cloud sync: keeps this computer's saved data and the cloud copy the same.
//
// - Signing in compares the two (planSync). A side that hasn't changed since this
//   computer last synced quietly takes the other's changes; when both changed, or on
//   the first sign-in here, you get the side-by-side preview and pick one.
// - After that, every change you make is saved to the cloud a second later, and
//   changes saved from another computer show up here live.
// - Replacing this computer's data (from the cloud or a backup file) keeps what was
//   here first, so "Undo" can put it back.
import { useSyncExternalStore } from 'react'
import * as cloud from './cloud'
import type { CloudCopy, CloudUnavailable, CloudUser } from './cloud'
import { onLocalWrite, writeStored } from './storage'
import {
  SYNC_PREFIX, changedKeys, planSync, takeSnapshot, writesFor, type Snapshot, type SummaryLookups,
} from './transfer'

export type SyncStatus =
  | { kind: 'unavailable'; why: CloudUnavailable }
  | { kind: 'signed-out'; error?: string }
  | { kind: 'working'; what: string }
  | { kind: 'ask'; user: CloudUser; cloud: CloudCopy; local: Snapshot; error?: string }
  | { kind: 'synced'; user: CloudUser; saving: boolean; savedAt: number | null; error?: string; lastIn?: { device: string | null; at: number } }

export interface UndoInfo {
  /** What "Undo" puts back. */
  what: string
  at: number
}

interface State {
  status: SyncStatus
  undo: UndoInfo | null
}

const K = {
  uid: `${SYNC_PREFIX}uid`,
  base: `${SYNC_PREFIX}base`,
  device: `${SYNC_PREFIX}device`,
  undo: `${SYNC_PREFIX}undo`,
}

/** How long after your last change the cloud copy is saved. */
const SAVE_DELAY = 1000
const RETRY_DELAY = 10000

function get(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage full / unavailable: sync still works for this visit
  }
}
function getJson<T>(key: string): T | null {
  const raw = get(key)
  if (raw === null) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

function deviceId(): string {
  let id = get(K.device)
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    set(K.device, id)
  }
  return id
}

function message(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('network') || code === 'unavailable') return "Can't reach the cloud right now (are you offline?)."
  if (code === 'permission-denied') return 'The cloud refused the request (permission denied).'
  if (code === 'auth/unauthorized-domain') return "Sign-in isn't allowed on this web address yet (add it under Authentication > Settings > Authorized domains in Firebase)."
  return (e as { message?: string })?.message ?? String(e)
}

class SyncEngine {
  private state: State = { status: { kind: 'signed-out' }, undo: null }
  private listeners = new Set<() => void>()
  private look: SummaryLookups | null = null
  private started = false
  private user: CloudUser | null = null
  private base: Snapshot = {}
  private stopLive: (() => void)[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private authStarted: Promise<void> | null = null
  private signingIn = false

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
  getState = () => this.state

  private setState(patch: Partial<State>) {
    this.state = { ...this.state, ...patch }
    for (const l of [...this.listeners]) l()
  }
  private setStatus(status: SyncStatus) { this.setState({ status }) }

  /** Start on page load. Firebase only loads if you've signed in on this computer before. */
  init(look: SummaryLookups) {
    this.look = look
    if (this.started) return
    this.started = true
    const undo = getJson<UndoInfo & { data: Snapshot }>(K.undo)
    if (undo) this.state = { ...this.state, undo: { what: undo.what, at: undo.at } }
    const why = cloud.cloudUnavailable()
    if (why) return this.setStatus({ kind: 'unavailable', why })
    if (get(K.uid)) void this.startAuth()
  }

  private startAuth(): Promise<void> {
    this.authStarted ??= (async () => {
      this.setStatus({ kind: 'working', what: 'Connecting…' })
      try {
        await cloud.watchUser((u) => void this.onUser(u))
      } catch (e) {
        this.authStarted = null
        this.setStatus({ kind: 'signed-out', error: message(e) })
      }
    })()
    return this.authStarted
  }

  async signIn() {
    await this.startAuth()
    if (this.user) return
    this.setStatus({ kind: 'working', what: 'Signing in with Google…' })
    this.signingIn = true
    try {
      await cloud.signIn() // onUser picks it up
    } catch (e) {
      const code = (e as { code?: string }).code
      const closed = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
      if (!this.user) this.setStatus({ kind: 'signed-out', error: closed ? undefined : message(e) })
    } finally {
      this.signingIn = false
    }
  }

  async signOut() {
    await this.flushNow()
    this.stop()
    try { await cloud.signOut() } catch { /* onUser(null) won't come; reset below */ }
    this.user = null
    set(K.uid, null)
    this.setStatus({ kind: 'signed-out' })
  }

  private async onUser(u: CloudUser | null) {
    if (!u) {
      this.stop()
      this.user = null
      set(K.uid, null)
      // The first "nobody" can arrive while the sign-in popup is still open.
      if (!this.signingIn) this.setStatus({ kind: 'signed-out' })
      return
    }
    if (this.user?.uid === u.uid && this.state.status.kind !== 'signed-out' && this.state.status.kind !== 'working') return
    this.user = u
    set(K.uid, u.uid)
    await this.check()
  }

  /** Compare this computer with the cloud and sync, or ask. */
  async check() {
    const u = this.user
    if (!u || !this.look) return
    this.stop()
    this.setStatus({ kind: 'working', what: 'Checking your cloud copy…' })
    try {
      const copy = await cloud.readCloud(u.uid)
      const local = takeSnapshot(localStorage)
      const saved = getJson<{ uid: string; data: Snapshot }>(K.base)
      const base = saved?.uid === u.uid ? saved.data : null
      const plan = planSync(local, copy?.data ?? null, base, this.look)
      if (plan === 'ask') return this.setStatus({ kind: 'ask', user: u, cloud: copy!, local })
      if (plan === 'push') await cloud.writeCloud(u.uid, local, this.who(), true)
      if (plan === 'pull') this.replaceLocal(copy!.data, 'This computer’s data from before it synced', false)
      this.setBase(plan === 'pull' ? copy!.data : local)
      this.goLive(plan === 'pull' && copy ? { device: copy.device, at: copy.updatedAt } : undefined)
    } catch (e) {
      this.setStatus({ kind: 'synced', user: u, saving: false, savedAt: null, error: message(e) })
      this.retry(() => this.check())
    }
  }

  /** Answer the side-by-side preview: keep this computer's data or the cloud's. */
  async choose(which: 'local' | 'cloud') {
    const s = this.state.status
    if (s.kind !== 'ask') return
    this.setStatus({ kind: 'working', what: which === 'local' ? 'Saving this computer’s data to the cloud…' : 'Loading the cloud copy…' })
    try {
      if (which === 'local') {
        const local = takeSnapshot(localStorage)
        await cloud.writeCloud(s.user.uid, local, this.who(), true)
        this.keepUndo(s.cloud.data, 'The cloud copy you replaced')
        this.setBase(local)
        this.goLive()
      } else {
        this.replaceLocal(s.cloud.data, 'This computer’s data from before it synced', false)
        this.setBase(s.cloud.data)
        this.goLive({ device: s.cloud.device, at: s.cloud.updatedAt })
      }
    } catch (e) {
      this.setStatus({ ...s, error: message(e) })
    }
  }

  /** Replace this computer's data with a backup file's (uploaded too, if synced). */
  loadBackup(data: Snapshot) {
    this.replaceLocal(data, 'This computer’s data from before you loaded the backup', true)
  }

  /** Put back what the last replace overwrote. */
  undo() {
    const saved = getJson<UndoInfo & { data: Snapshot }>(K.undo)
    if (!saved) return this.setState({ undo: null })
    const now = takeSnapshot(localStorage)
    writeStored(writesFor(now, saved.data), { asLocal: true })
    set(K.undo, null)
    this.setState({ undo: null })
  }

  private replaceLocal(data: Snapshot, what: string, asLocal: boolean) {
    const now = takeSnapshot(localStorage)
    if (changedKeys(now, data).length) this.keepUndo(now, what)
    writeStored(writesFor(now, data), { asLocal })
  }

  private keepUndo(data: Snapshot, what: string) {
    const at = Date.now()
    set(K.undo, JSON.stringify({ what, at, data }))
    this.setState({ undo: { what, at } })
  }

  private who() { return { device: cloud.deviceLabel(), deviceId: deviceId() } }

  private setBase(data: Snapshot) {
    this.base = { ...data }
    if (this.user) set(K.base, JSON.stringify({ uid: this.user.uid, data: this.base }))
  }

  private goLive(lastIn?: { device: string | null; at: number }) {
    const u = this.user
    if (!u) return
    this.stop()
    this.setStatus({ kind: 'synced', user: u, saving: false, savedAt: Date.now(), lastIn })
    this.stopLive.push(onLocalWrite(() => this.schedule()))
    let cancelled = false
    this.stopLive.push(() => { cancelled = true })
    cloud.watchCloud(u.uid, (c) => this.onRemote(c), (e) => this.patchSynced({ error: message(e) }))
      .then((unwatch) => { if (cancelled) unwatch(); else this.stopLive.push(unwatch) })
      .catch((e) => this.patchSynced({ error: message(e) }))
    // Changes made while it was checking.
    if (changedKeys(this.base, takeSnapshot(localStorage)).length) this.schedule()
  }

  private stop() {
    clearTimeout(this.timer)
    this.timer = undefined
    for (const f of this.stopLive.splice(0)) f()
  }

  private patchSynced(patch: Partial<Extract<SyncStatus, { kind: 'synced' }>>) {
    const s = this.state.status
    if (s.kind === 'synced') this.setStatus({ ...s, ...patch })
  }

  private schedule(delay = SAVE_DELAY) {
    if (this.state.status.kind !== 'synced') return
    clearTimeout(this.timer)
    this.patchSynced({ saving: true })
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  private retry(f: () => void) {
    clearTimeout(this.timer)
    this.timer = setTimeout(f, RETRY_DELAY)
  }

  /** Save anything not yet in the cloud right away (before signing out or closing the page). */
  async flushNow() {
    if (this.timer && this.state.status.kind === 'synced') {
      clearTimeout(this.timer)
      await this.flush()
    }
  }

  private async flush() {
    const u = this.user
    if (!u || this.state.status.kind !== 'synced') return
    this.timer = undefined
    const local = takeSnapshot(localStorage)
    const changes = writesFor(this.base, local)
    if (!Object.keys(changes).length) return this.patchSynced({ saving: false })
    try {
      await cloud.writeCloud(u.uid, changes, this.who())
      const next = { ...this.base }
      for (const [k, v] of Object.entries(changes)) { if (v === null) delete next[k]; else next[k] = v }
      this.setBase(next)
      this.patchSynced({ saving: false, savedAt: Date.now(), error: undefined })
      // Something changed while saving.
      if (changedKeys(this.base, takeSnapshot(localStorage)).length) this.schedule()
    } catch (e) {
      this.patchSynced({ error: message(e) })
      this.schedule(RETRY_DELAY)
    }
  }

  /** Another computer saved: bring its changes in (yours not yet saved win). */
  private onRemote(copy: CloudCopy | null) {
    if (!copy) return
    const incoming = writesFor(this.base, copy.data)
    if (!Object.keys(incoming).length) return
    const pending = new Set(changedKeys(this.base, takeSnapshot(localStorage)))
    const apply: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(incoming)) if (!pending.has(k)) apply[k] = v
    writeStored(apply)
    this.setBase(copy.data)
    const fromElsewhere = copy.deviceId !== deviceId()
    if (fromElsewhere) this.patchSynced({ lastIn: { device: copy.device, at: copy.updatedAt || Date.now() } })
    if (pending.size) this.schedule()
  }
}

export const sync = new SyncEngine()

export function useSync(): State {
  return useSyncExternalStore(sync.subscribe, sync.getState)
}

// Save the last change before the page closes.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void sync.flushNow())
}
