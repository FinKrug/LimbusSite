import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudCopy, CloudUser } from './cloud'
import { gameData } from './data'
import type { Snapshot, SummaryLookups } from './transfer'

// ---- a stand-in for localStorage and for the Firebase-backed cloud module ----

class MemoryStorage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

const fake = vi.hoisted(() => ({
  doc: null as null | { data: Record<string, string>; updatedAt: number; device: string; deviceId: string },
  userCb: null as null | ((u: CloudUser | null) => void),
  user: null as CloudUser | null,
  cloudCbs: [] as ((c: CloudCopy | null) => void)[],
  writes: 0,
  /** t11: make the next calls fail. `writeErrors` are used one per write; 'hang' never answers. */
  writeErrors: [] as (unknown | 'hang')[],
  readErrors: [] as unknown[],
  signInErrors: [] as unknown[],
  signIns: 0,
  redirects: 0,
}))

vi.mock('./cloud', () => {
  const copy = (): CloudCopy | null => fake.doc && { data: { ...fake.doc.data }, updatedAt: fake.doc.updatedAt, device: fake.doc.device, deviceId: fake.doc.deviceId }
  return {
    cloudUnavailable: () => null,
    deviceLabel: () => 'Test · Browser',
    // Like Firebase: the signed-in user stays signed in across page loads.
    watchUser: async (cb: (u: CloudUser | null) => void) => { fake.userCb = cb; cb(fake.user); return () => {} },
    signIn: async () => {
      fake.signIns++
      const err = fake.signInErrors.shift()
      if (err) throw err
      fake.user = { uid: 'u1', name: 'Fin', email: 'fin@example.com' }; fake.userCb?.(fake.user)
    },
    signInOnGooglePage: async () => { fake.redirects++ },
    redirectError: async () => null,
    signOut: async () => { fake.user = null; fake.userCb?.(null) },
    readCloud: async () => {
      const err = fake.readErrors.shift()
      if (err) throw err
      return copy()
    },
    watchCloud: async (_uid: string, cb: (c: CloudCopy | null) => void) => {
      fake.cloudCbs.push(cb)
      return () => { fake.cloudCbs = fake.cloudCbs.filter((f) => f !== cb) }
    },
    writeCloud: async (_uid: string, changes: Record<string, string | null>, who: { device: string; deviceId: string }, replace = false) => {
      fake.writes++
      const err = fake.writeErrors.shift()
      if (err === 'hang') return new Promise<void>(() => {})
      if (err) throw err
      const data = replace || !fake.doc ? {} : { ...fake.doc.data }
      for (const [k, v] of Object.entries(changes)) { if (v === null) delete data[k]; else data[k] = v }
      fake.doc = { data, updatedAt: Date.now(), device: who.device, deviceId: who.deviceId }
    },
  }
})

const storage = new MemoryStorage()
vi.stubGlobal('localStorage', storage)
// The browser's connection state and online/offline events (t11).
const net = { onLine: true }
vi.stubGlobal('navigator', net)
const win = new EventTarget()
vi.stubGlobal('window', win)
function goOffline() { net.onLine = false; win.dispatchEvent(new Event('offline')) }
function goOnline() { net.onLine = true; win.dispatchEvent(new Event('online')) }

const look: SummaryLookups = {
  identities: new Map(gameData.identities.map((i) => [i.id, i])),
  gifts: new Map(gameData.gifts.map((g) => [g.id, g])),
  packs: new Map(gameData.themePacks.map((p) => [p.id, p])),
}
const hongLu = gameData.identities.find((i) => i.sinner === 'Hong Lu')!

const flush = () => new Promise((r) => setTimeout(r, 0))

/** A fresh engine each test (the module keeps one). */
async function engine() {
  vi.resetModules()
  const mod = await import('./sync')
  const storageMod = await import('./storage')
  mod.sync.init(look)
  return { sync: mod.sync, writeStored: storageMod.writeStored }
}

/** Another computer saving to the cloud and the change arriving here. */
function remoteSave(changes: Record<string, string>) {
  fake.doc = { data: { ...fake.doc!.data, ...changes }, updatedAt: Date.now(), device: 'Laptop · Firefox', deviceId: 'other' }
  const c: CloudCopy = { data: { ...fake.doc.data }, updatedAt: fake.doc.updatedAt, device: fake.doc.device, deviceId: fake.doc.deviceId }
  for (const cb of fake.cloudCbs) cb(c)
}

const team = JSON.stringify({ 'Hong Lu': hongLu.id })

beforeEach(() => {
  vi.useRealTimers()
  storage.clear()
  fake.doc = null
  fake.userCb = null
  fake.user = null
  fake.cloudCbs = []
  fake.writes = 0
  fake.writeErrors = []
  fake.readErrors = []
  fake.signInErrors = []
  fake.signIns = 0
  fake.redirects = 0
  net.onLine = true
})

describe('cloud sync', () => {
  it('uploads this computer on the first sign-in when the cloud is empty, then saves changes', async () => {
    storage.setItem('limbussite.team.v1', team)
    storage.setItem('limbussite.tab.v1', '"gifts"')
    const { sync, writeStored } = await engine()
    await sync.signIn()
    await flush()
    expect(sync.getState().status.kind).toBe('synced')
    expect(fake.doc!.data).toEqual({ 'limbussite.team.v1': team })

    vi.useFakeTimers()
    writeStored({ 'limbussite.owned.v1': '["thrill"]' }, { asLocal: true })
    expect(sync.getState().status).toMatchObject({ saving: true })
    await vi.advanceTimersByTimeAsync(1500)
    expect(fake.doc!.data['limbussite.owned.v1']).toBe('["thrill"]')
    expect(sync.getState().status).toMatchObject({ saving: false })
  })

  it('shows the preview on a fresh computer and loads the cloud copy when picked', async () => {
    fake.doc = { data: { 'limbussite.team.v1': team, 'limbussite.selection.v1': '["Hong Lu"]' }, updatedAt: 1, device: 'PC', deviceId: 'pc' }
    storage.setItem('limbussite.team.v1', '{}')
    const { sync } = await engine()
    await sync.signIn()
    await flush()
    const s = sync.getState().status
    expect(s.kind).toBe('ask')
    await sync.choose('cloud')
    expect(storage.getItem('limbussite.team.v1')).toBe(team)
    expect(storage.getItem('limbussite.selection.v1')).toBe('["Hong Lu"]')
    expect(sync.getState().status.kind).toBe('synced')
    expect(sync.getState().undo?.what).toMatch(/before it synced/)
  })

  it('keeping this computer replaces the cloud copy, and Undo brings the cloud copy back', async () => {
    fake.doc = { data: { 'limbussite.team.v1': team }, updatedAt: 1, device: 'PC', deviceId: 'pc' }
    storage.setItem('limbussite.owned.v1', '["thrill"]')
    storage.setItem('limbussite.selection.v1', '["Faust"]')
    const { sync } = await engine()
    await sync.signIn()
    await flush()
    await sync.choose('local')
    expect(fake.doc!.data).toEqual({ 'limbussite.owned.v1': '["thrill"]', 'limbussite.selection.v1': '["Faust"]' })
    vi.useFakeTimers()
    sync.undo()
    expect(storage.getItem('limbussite.team.v1')).toBe(team)
    await vi.advanceTimersByTimeAsync(1500)
    expect(fake.doc!.data).toEqual({ 'limbussite.team.v1': team })
  })

  it('brings in another computer’s changes live, without touching ones not yet saved here', async () => {
    storage.setItem('limbussite.team.v1', team)
    const { sync, writeStored } = await engine()
    await sync.signIn()
    await flush()
    vi.useFakeTimers()
    writeStored({ 'limbussite.owned.v1': '["mine"]' }, { asLocal: true }) // not saved yet
    remoteSave({ 'limbussite.owned.v1': '["theirs"]', 'limbussite.run.v1': '{"floor":4}' })
    expect(storage.getItem('limbussite.run.v1')).toBe('{"floor":4}')
    expect(storage.getItem('limbussite.owned.v1')).toBe('["mine"]')
    expect(sync.getState().status).toMatchObject({ lastIn: { device: 'Laptop · Firefox' } })
    await vi.advanceTimersByTimeAsync(1500)
    expect(fake.doc!.data['limbussite.owned.v1']).toBe('["mine"]')
    expect(fake.doc!.data['limbussite.run.v1']).toBe('{"floor":4}')
  })

  it('on a later visit, takes the cloud’s changes quietly when this computer made none', async () => {
    storage.setItem('limbussite.team.v1', team)
    let { sync } = await engine()
    await sync.signIn()
    await flush()
    // Page closed; another computer saves.
    fake.cloudCbs = []
    fake.doc!.data['limbussite.owned.v1'] = '["thrill"]'
    ;({ sync } = await engine())
    await flush()
    await flush()
    expect(sync.getState().status.kind).toBe('synced')
    expect(storage.getItem('limbussite.owned.v1')).toBe('["thrill"]')
  })

  it('asks when both changed since the last sync', async () => {
    storage.setItem('limbussite.team.v1', team)
    let { sync } = await engine()
    await sync.signIn()
    await flush()
    fake.cloudCbs = []
    fake.doc!.data['limbussite.owned.v1'] = '["theirs"]'
    storage.setItem('limbussite.owned.v1', '["mine"]')
    ;({ sync } = await engine())
    await flush()
    await flush()
    const s = sync.getState().status
    expect(s.kind).toBe('ask')
    if (s.kind === 'ask') {
      expect(s.local['limbussite.owned.v1']).toBe('["mine"]')
      expect(s.cloud.data['limbussite.owned.v1']).toBe('["theirs"]')
    }
  })

  it('loading a backup replaces local data, uploads it and can be undone', async () => {
    storage.setItem('limbussite.team.v1', team)
    const { sync } = await engine()
    await sync.signIn()
    await flush()
    vi.useFakeTimers()
    const backup: Snapshot = { 'limbussite.owned.v1': '["thrill"]' }
    sync.loadBackup(backup)
    expect(storage.getItem('limbussite.team.v1')).toBeNull()
    await vi.advanceTimersByTimeAsync(1500)
    expect(fake.doc!.data).toEqual(backup)
    sync.undo()
    expect(storage.getItem('limbussite.team.v1')).toBe(team)
    expect(sync.getState().undo).toBeNull()
  })

  it('signing out keeps the data here and stops saving', async () => {
    storage.setItem('limbussite.team.v1', team)
    const { sync, writeStored } = await engine()
    await sync.signIn()
    await flush()
    await sync.signOut()
    expect(sync.getState().status.kind).toBe('signed-out')
    const before = fake.writes
    vi.useFakeTimers()
    writeStored({ 'limbussite.owned.v1': '["x"]' }, { asLocal: true })
    await vi.advanceTimersByTimeAsync(1500)
    expect(fake.writes).toBe(before)
    expect(storage.getItem('limbussite.team.v1')).toBe(team)
  })
})

describe('sync problems: a specific message, Try again, and changes kept here until saved (t11)', () => {
  async function signedIn() {
    storage.setItem('limbussite.team.v1', team)
    const e = await engine()
    await e.sync.signIn()
    await flush()
    expect(e.sync.getState().status).toMatchObject({ kind: 'synced' })
    return e
  }
  const owned = 'limbussite.owned.v1'
  type Engine = Awaited<ReturnType<typeof engine>>['sync']
  const errorOf = (sync: Engine) => { const s = sync.getState().status; return 'error' in s ? s.error : undefined }

  it('a failed save says so, keeps the change here and tries again on its own', async () => {
    const { sync, writeStored } = await signedIn()
    vi.useFakeTimers()
    fake.writeErrors.push({ code: 'internal', message: 'Firebase: Error (firestore/internal).' })
    writeStored({ [owned]: '["thrill"]' }, { asLocal: true })
    await vi.advanceTimersByTimeAsync(1500)
    const s = sync.getState().status
    expect(s).toMatchObject({ kind: 'synced', saving: true, error: { kind: 'failed', during: 'save', next: 'soon' } })
    if (s.kind === 'synced') expect(s.error!.title).toMatch(/Couldn't save your latest changes/)
    expect(storage.getItem(owned)).toBe('["thrill"]')
    expect(fake.doc!.data[owned]).toBeUndefined()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fake.doc!.data[owned]).toBe('["thrill"]')
    expect(sync.getState().status).toMatchObject({ kind: 'synced', saving: false })
    expect(errorOf(sync)).toBeUndefined()
  })

  it('Try again saves right away', async () => {
    const { sync, writeStored } = await signedIn()
    vi.useFakeTimers()
    fake.writeErrors.push({ code: 'permission-denied' })
    writeStored({ [owned]: '["thrill"]' }, { asLocal: true })
    await vi.advanceTimersByTimeAsync(1500)
    expect(sync.getState().status).toMatchObject({ error: { kind: 'denied', during: 'save' } })
    await sync.retryNow()
    expect(fake.doc!.data[owned]).toBe('["thrill"]')
    expect(sync.getState().status).toMatchObject({ saving: false })
    expect(errorOf(sync)).toBeUndefined()
  })

  it('a save that never answers counts as failed after 15 s', async () => {
    const { sync, writeStored } = await signedIn()
    vi.useFakeTimers()
    fake.writeErrors.push('hang')
    writeStored({ [owned]: '["thrill"]' }, { asLocal: true })
    await vi.advanceTimersByTimeAsync(1000 + 14000)
    expect(sync.getState().status).toMatchObject({ saving: true })
    expect(errorOf(sync)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1500)
    const s = sync.getState().status
    expect(s).toMatchObject({ error: { kind: 'offline', during: 'save', next: 'soon' } })
    if (s.kind === 'synced') expect(s.error!.title).toMatch(/Can't reach your account/)
  })

  it('offline: says so at once, waits without trying, and saves when the connection is back', async () => {
    const { sync, writeStored } = await signedIn()
    vi.useFakeTimers()
    goOffline()
    expect(sync.getState().status).toMatchObject({ error: { kind: 'offline', during: 'live', next: 'online' } })
    const before = fake.writes
    writeStored({ [owned]: '["thrill"]' }, { asLocal: true })
    await vi.advanceTimersByTimeAsync(120000)
    expect(fake.writes).toBe(before)
    expect(sync.getState().status).toMatchObject({ saving: true, error: { kind: 'offline', during: 'save', next: 'online' } })
    expect(storage.getItem(owned)).toBe('["thrill"]')
    goOnline()
    await vi.advanceTimersByTimeAsync(10)
    expect(fake.doc!.data[owned]).toBe('["thrill"]')
    expect(sync.getState().status).toMatchObject({ kind: 'synced', saving: false })
    expect(errorOf(sync)).toBeUndefined()
  })

  it('changes not yet saved survive closing the page: the next visit uploads them', async () => {
    let { sync, writeStored } = await signedIn()
    vi.useFakeTimers()
    fake.writeErrors.push({ code: 'unavailable' }, { code: 'unavailable' })
    writeStored({ [owned]: '["thrill"]' }, { asLocal: true })
    await vi.advanceTimersByTimeAsync(1500)
    expect(sync.getState().status).toMatchObject({ error: { during: 'save' } })
    // Page closed before a retry worked; opened again later.
    vi.clearAllTimers()
    vi.useRealTimers()
    fake.cloudCbs = []
    fake.writeErrors = []
    ;({ sync, writeStored } = await engine())
    await flush()
    await flush()
    expect(sync.getState().status).toMatchObject({ kind: 'synced' })
    expect(errorOf(sync)).toBeUndefined()
    expect(fake.doc!.data[owned]).toBe('["thrill"]')
  })

  it('loading the cloud copy fails: this computer keeps working, Try again finishes syncing', async () => {
    storage.setItem('limbussite.team.v1', team)
    const { sync } = await engine()
    fake.readErrors.push({ code: 'unavailable' })
    vi.useFakeTimers()
    await sync.signIn()
    await vi.advanceTimersByTimeAsync(10)
    expect(sync.getState().status).toMatchObject({ kind: 'synced', error: { during: 'load', next: 'soon' } })
    expect(storage.getItem('limbussite.team.v1')).toBe(team)
    await sync.retryNow()
    expect(sync.getState().status).toMatchObject({ kind: 'synced' })
    expect(errorOf(sync)).toBeUndefined()
    expect(fake.doc!.data['limbussite.team.v1']).toBe(team)
  })

  it('a blocked sign-in popup explains why; Try again opens it again, or use Google\'s page', async () => {
    const { sync } = await engine()
    fake.signInErrors.push({ code: 'auth/popup-blocked' })
    await sync.signIn()
    const s = sync.getState().status
    expect(s).toMatchObject({ kind: 'signed-out', error: { kind: 'popup-blocked', during: 'sign-in' } })
    if (s.kind === 'signed-out') expect(s.error!.title).toMatch(/blocked the Google sign-in window/)
    await sync.retryNow()
    await flush()
    expect(fake.signIns).toBe(2)
    expect(sync.getState().status.kind).toBe('synced')
    await sync.signOut()
    fake.signInErrors.push({ code: 'auth/popup-blocked' })
    await sync.signIn()
    await sync.signInOnGooglePage()
    expect(fake.redirects).toBe(1)
  })

  it('closing the popup isn\'t an error; signing in offline says so without opening it', async () => {
    const { sync } = await engine()
    fake.signInErrors.push({ code: 'auth/popup-closed-by-user' })
    await sync.signIn()
    expect(sync.getState().status).toEqual({ kind: 'signed-out', error: undefined })
    net.onLine = false
    await sync.signIn()
    expect(fake.signIns).toBe(1)
    expect(sync.getState().status).toMatchObject({ kind: 'signed-out', error: { kind: 'offline', during: 'sign-in' } })
    goOnline()
    expect(sync.getState().status).toEqual({ kind: 'signed-out', error: undefined })
  })
})
