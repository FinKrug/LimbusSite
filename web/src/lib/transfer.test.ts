import { describe, expect, it } from 'vitest'
import { decodeKey, deviceLabel, encodeKey } from './cloud'
import { gameData } from './data'
import {
  changedKeys, compareRows, isBlank, isShared, makeBackup, parseBackup, planSync, summarize, takeSnapshot, writesFor,
  type KeyValueStore, type Snapshot, type SummaryLookups,
} from './transfer'

const look: SummaryLookups = {
  identities: new Map(gameData.identities.map((i) => [i.id, i])),
  gifts: new Map(gameData.gifts.map((g) => [g.id, g])),
  packs: new Map(gameData.themePacks.map((p) => [p.id, p])),
}

function store(entries: Record<string, string>): KeyValueStore {
  const keys = Object.keys(entries)
  return { length: keys.length, key: (k) => keys[k] ?? null, getItem: (k) => entries[k] ?? null }
}

const hongLu = gameData.identities.find((i) => i.sinner === 'Hong Lu')!
const gift = gameData.gifts.find((g) => g.id === 'thrill') ?? gameData.gifts[0]

/** A computer with a team, a run and a gift. */
const played: Snapshot = {
  'limbussite.team.v1': JSON.stringify({ 'Hong Lu': hongLu.id }),
  'limbussite.selection.v1': JSON.stringify(['Hong Lu']),
  'limbussite.owned.v1': JSON.stringify([gift.id, 'dark-vestige']),
  'limbussite.run.v1': JSON.stringify({ difficulty: 'hard', floors: 15, floor: 3, pack: null }),
  'limbussite.presets.v1': JSON.stringify([{ id: 'a', name: 'Heishou', team: {}, savedAt: 1 }]),
}
/** A fresh computer: the defaults the app writes on its first visit. */
const fresh: Snapshot = {
  'limbussite.team.v1': '{}', 'limbussite.selection.v1': '[]', 'limbussite.owned.v1': '[]',
  'limbussite.run.v1': JSON.stringify({ difficulty: 'normal', floors: 5, floor: null, pack: null }),
  'limbussite.presets.v1': '[]', 'limbussite.egos.v1': '{}',
}

describe('snapshots', () => {
  it('keeps saved values but not the open tab, view switches or sync bookkeeping', () => {
    const snap = takeSnapshot(store({
      'limbussite.team.v1': '{}', 'limbussite.tab.v1': '"gifts"', 'limbussite.skillsview.v1': '"backups"',
      'limbussite.sync.base': '{}', 'other-site': '1',
    }))
    expect(snap).toEqual({ 'limbussite.team.v1': '{}' })
    expect(isShared('limbussite.presets.active.v1')).toBe(true)
  })

  it('lists the writes that turn one copy into another', () => {
    const a = { 'limbussite.a': '1', 'limbussite.b': '2' }
    const b = { 'limbussite.b': '3', 'limbussite.c': '4' }
    expect(changedKeys(a, b)).toEqual(['limbussite.a', 'limbussite.b', 'limbussite.c'])
    expect(writesFor(a, b)).toEqual({ 'limbussite.a': null, 'limbussite.b': '3', 'limbussite.c': '4' })
  })
})

describe('backup files', () => {
  it('round-trips', () => {
    const text = JSON.stringify(makeBackup(played, 123))
    expect(parseBackup(text)).toEqual({ app: 'LimbusSite', version: 1, savedAt: 123, data: played })
  })

  it('drops keys that are not saved values and values that do not parse', () => {
    const text = JSON.stringify({ app: 'LimbusSite', version: 1, savedAt: 1, data: {
      'limbussite.team.v1': '{}', 'limbussite.tab.v1': '"team"', 'limbussite.sync.uid': '"x"', 'evil': '1', 'limbussite.owned.v1': '{nope',
    } })
    expect(parseBackup(text)).toMatchObject({ data: { 'limbussite.team.v1': '{}' } })
  })

  it('refuses other files', () => {
    expect(parseBackup('hello')).toHaveProperty('error')
    expect(parseBackup('{"app":"Other","data":{}}')).toHaveProperty('error')
    expect(parseBackup('{"app":"LimbusSite","version":99,"data":{}}')).toHaveProperty('error')
  })
})

describe('the side-by-side preview', () => {
  it('summarizes a copy', () => {
    const rows = Object.fromEntries(summarize(played, look).map((r) => [r.id, r]))
    expect(rows.team.text).toBe('1 in the lineup, 1 deployed')
    expect(rows.team.detail).toContain('Hong Lu')
    expect(rows.run.text).toBe('Hard · floor 3 of 15')
    expect(rows.gifts.text).toBe('1 gift + 1 Vestige')
    expect(rows.gifts.detail).toBe(gift.name)
    expect(rows.presets.detail).toBe('Heishou')
  })

  it('marks the rows that differ', () => {
    const other = { ...played, 'limbussite.owned.v1': '[]' }
    const rows = compareRows(played, other, look)
    expect(rows.filter((r) => r.differs).map((r) => r.id)).toEqual(['gifts'])
    expect(summarize(fresh, look).find((r) => r.id === 'team')!.text).toBe('No team yet')
  })

  it('counts settings changes under Settings', () => {
    const rows = compareRows({ ...played, 'limbussite.art.v2': '"base"' }, played, look)
    expect(rows.filter((r) => r.differs).map((r) => r.id)).toEqual(['other'])
  })

  it('knows a fresh computer from a played one', () => {
    expect(isBlank(fresh, look)).toBe(true)
    expect(isBlank({}, look)).toBe(true)
    expect(isBlank(played, look)).toBe(false)
  })
})

describe('planSync', () => {
  const changed = { ...played, 'limbussite.owned.v1': '[]' }

  it('uploads when the cloud has nothing', () => {
    expect(planSync(played, null, null, look)).toBe('push')
    expect(planSync(played, fresh, null, look)).toBe('push')
  })
  it('does nothing when both match', () => {
    expect(planSync(played, { ...played }, null, look)).toBe('same')
  })
  it('asks on the first sign-in on a computer, even a fresh one, so you see what comes in', () => {
    expect(planSync(fresh, played, null, look)).toBe('ask')
    expect(planSync(changed, played, null, look)).toBe('ask')
  })
  it('after a sync, the side that did not change takes the other one quietly', () => {
    expect(planSync(played, changed, played, look)).toBe('pull')
    expect(planSync(changed, played, played, look)).toBe('push')
  })
  it('asks when both changed', () => {
    const other = { ...played, 'limbussite.selection.v1': '[]' }
    expect(planSync(changed, other, played, look)).toBe('ask')
  })
})

describe('cloud field names', () => {
  it('round-trips keys with dots and underscores', () => {
    for (const k of ['limbussite.presets.active.v1', 'limbussite.team.v1', 'limbussite.a_b.v1']) {
      expect(decodeKey(encodeKey(k))).toBe(k)
      expect(encodeKey(k)).not.toContain('.')
    }
  })
  it('names the computer', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'))
      .toBe('Windows · Chrome')
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'))
      .toBe('Mac · Safari')
  })
})
