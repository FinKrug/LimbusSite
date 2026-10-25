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
}))

vi.mock('./cloud', () => {
  const copy = (): CloudCopy | null => fake.doc && { data: { ...fake.doc.data }, updatedAt: fake.doc.updatedAt, device: fake.doc.device, deviceId: fake.doc.deviceId }
  return {
    cloudUnavailable: () => null,
    deviceLabel: () => 'Test · Browser',
    // Like Firebase: the signed-in user stays signed in across page loads.
    watchUser: async (cb: (u: CloudUser | null) => void) => { fake.userCb = cb; cb(fake.user); return () => {} },
    signIn: async () => { fake.user = { uid: 'u1', name: 'Fin', email: 'fin@example.com' }; fake.userCb?.(fake.user) },
    signOut: async () => { fake.user = null; fake.userCb?.(null) },
    readCloud: async () => copy(),
    watchCloud: async (_uid: string, cb: (c: CloudCopy | null) => void) => {
      fake.cloudCbs.push(cb)
      return () => { fake.cloudCbs = fake.cloudCbs.filter((f) => f !== cb) }
    },
    writeCloud: async (_uid: string, changes: Record<string, string | null>, who: { device: string; deviceId: string }, replace = false) => {
      fake.writes++
      const data = replace || !fake.doc ? {} : { ...fake.doc.data }
      for (const [k, v] of Object.entries(changes)) { if (v === null) delete data[k]; else data[k] = v }
      fake.doc = { data, updatedAt: Date.now(), device: who.device, deviceId: who.deviceId }
    },
  }
})

const storage = new MemoryStorage()
vi.stubGlobal('localStorage', storage)

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
