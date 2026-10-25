// Moving your saved data between computers: a snapshot of every saved value,
// backup files, and the side-by-side preview of two copies (lib/sync.ts uses the
// same snapshots for cloud sync).
import { shortName } from './format'
import { PREFIX } from './storage'
import { isVestige } from './vestiges'
import type { Gift, Identity, Sinner, ThemePack } from './types'

/** Saved key (with the prefix) -> its stored JSON text. */
export type Snapshot = Record<string, string>

/** Keys that stay on each computer: the open tab and view switches, and sync's own bookkeeping. */
// welcomed.v1 too: a new computer still opens on the welcome screen, where the sign-in link is.
const LOCAL_ONLY = new Set([`${PREFIX}tab.v1`, `${PREFIX}subtab.v1`, `${PREFIX}skillsview.v1`, `${PREFIX}welcomed.v1`])
export const SYNC_PREFIX = `${PREFIX}sync.`

export function isShared(key: string): boolean {
  return key.startsWith(PREFIX) && !key.startsWith(SYNC_PREFIX) && !LOCAL_ONLY.has(key)
}

/** What a Storage-like object (localStorage, or a stand-in in tests) needs. */
export interface KeyValueStore {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
}

export function takeSnapshot(store: KeyValueStore): Snapshot {
  const out: Snapshot = {}
  try {
    for (let k = 0; k < store.length; k++) {
      const key = store.key(k)
      if (key && isShared(key)) {
        const v = store.getItem(key)
        if (v !== null) out[key] = v
      }
    }
  } catch {
    // storage unavailable
  }
  return out
}

/** Keys whose values differ between two snapshots (including keys only one has). */
export function changedKeys(a: Snapshot, b: Snapshot): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((k) => a[k] !== b[k]).sort()
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return changedKeys(a, b).length === 0
}

/** The writes that turn `from` into `to` (null = remove the key). */
export function writesFor(from: Snapshot, to: Snapshot): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const k of changedKeys(from, to)) out[k] = to[k] ?? null
  return out
}

// ---------- backup files ----------

export const BACKUP_APP = 'LimbusSite'
export const BACKUP_VERSION = 1

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  /** ms since epoch */
  savedAt: number
  data: Snapshot
}

export function makeBackup(snapshot: Snapshot, savedAt = Date.now()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, savedAt, data: snapshot }
}

export function backupFileName(savedAt = Date.now()): string {
  const d = new Date(savedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `LimbusSite-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

/** Reads a backup file's text. Returns an error message for anything that isn't one. */
export function parseBackup(text: string): Backup | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: "That file isn't a LimbusSite backup (it isn't JSON)." }
  }
  const b = raw as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || typeof b.data !== 'object' || b.data === null) {
    return { error: "That file isn't a LimbusSite backup." }
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    return { error: 'That backup was made by a newer version of LimbusSite. Reload the page and try again.' }
  }
  const data: Snapshot = {}
  for (const [k, v] of Object.entries(b.data)) {
    // Only saved values, and only ones that still parse.
    if (!isShared(k) || typeof v !== 'string') continue
    try { JSON.parse(v) } catch { continue }
    data[k] = v
  }
  return { app: BACKUP_APP, version: b.version, savedAt: typeof b.savedAt === 'number' ? b.savedAt : 0, data }
}

// ---------- the side-by-side preview ----------

export interface SummaryLookups {
  identities: Map<string, Identity>
  gifts: Map<string, Gift>
  packs: Map<string, ThemePack>
}

export interface SummaryRow {
  id: string
  label: string
  /** One line for each copy. */
  text: string
  /** Up to a few more names, shown smaller. */
  detail?: string
  /** The keys this row covers, to tell whether the two copies differ here. */
  keys: string[]
}

const key = (name: string) => `${PREFIX}${name}`

function parse<T>(snap: Snapshot, name: string, fallback: T): T {
  const raw = snap[key(name)]
  if (raw === undefined) return fallback
  try { return (JSON.parse(raw) as T) ?? fallback } catch { return fallback }
}

function list(names: string[], max = 4): string | undefined {
  if (!names.length) return undefined
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} +${names.length - max} more` : shown
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const DIFFICULTY: Record<string, string> = { normal: 'Normal', hard: 'Hard', extreme: 'Extreme' }

/** The rows of the side-by-side preview, for one copy of the data. */
export function summarize(snap: Snapshot, look: SummaryLookups): SummaryRow[] {
  const team = parse<Partial<Record<Sinner, string | null>>>(snap, 'team.v1', {})
  const selection = parse<Sinner[]>(snap, 'selection.v1', [])
  const deployed = parse<number>(snap, 'deployed.v3', 7)
  const owned = parse<string[]>(snap, 'owned.v1', [])
  const run = parse<{ difficulty?: string; floors?: number; floor?: number | null; pack?: string | null; struggling?: boolean } | null>(snap, 'run.v1', null)
  const presets = parse<{ name?: string }[]>(snap, 'presets.v1', [])
  const egos = parse<Record<string, Record<string, string>>>(snap, 'egos.v1', {})
  const swaps = parse<Record<string, unknown>>(snap, 'swaps.v1', {})
  const enhanced = parse<Record<string, number>>(snap, 'enhanced.v1', {})
  const offered = parse<string[]>(snap, 'offered.v1', [])

  const lineup = selection.filter((s, k) => selection.indexOf(s) === k)
  const deployedNames = lineup.slice(0, deployed).map((s) => {
    const i = team[s] ? look.identities.get(team[s]!) : undefined
    return i ? `${s} (${shortName(i)})` : s
  })
  const equippedCount = Object.values(team).filter((id) => id && look.identities.has(id)).length

  const giftNames = owned.filter((id) => !isVestige(id)).map((id) => look.gifts.get(id)?.name).filter((n): n is string => !!n)
  const vestiges = owned.filter(isVestige).length

  const runText = !run || run.floor === null || run.floor === undefined
    ? run?.difficulty ? `Not in a run (${DIFFICULTY[run.difficulty] ?? run.difficulty} picked)` : 'Not in a run'
    : `${DIFFICULTY[run.difficulty ?? ''] ?? run.difficulty ?? ''} · floor ${run.floor} of ${run.floors ?? '?'}`
  const pack = run?.pack ? look.packs.get(run.pack)?.name : undefined

  const egoCount = Object.values(egos).reduce((n, g) => n + Object.values(g ?? {}).filter(Boolean).length, 0)
  const swapCount = Object.keys(swaps).length
  const enhancedCount = Object.values(enhanced).filter((n) => n > 0).length

  const art = parse<string>(snap, 'art.v2', 'uptie')
  const dismissed = parse<unknown[]>(snap, 'dismissed.v1', [])
  const superShop = parse<boolean>(snap, 'supershop.v1', false)
  const settings = [
    `${art === 'base' ? 'Base' : 'Uptie'} art`,
    superShop ? 'Super Shop on' : '',
    dismissed.length ? `${plural(dismissed.length, 'dismissed suggestion')}` : '',
  ].filter(Boolean).join(' · ')

  const covered = ['team.v1', 'selection.v1', 'deployed.v3', 'owned.v1', 'run.v1', 'presets.v1', 'presets.active.v1',
    'egos.v1', 'swaps.v1', 'enhanced.v1', 'offered.v1'].map(key)

  return [
    {
      id: 'team', label: 'Team', keys: [key('team.v1'), key('selection.v1'), key('deployed.v3')],
      text: lineup.length ? `${lineup.length} in the lineup, ${Math.min(deployed, lineup.length)} deployed`
        : equippedCount ? `${plural(equippedCount, 'identity', 'identities')} picked, no lineup yet` : 'No team yet',
      detail: list(deployedNames, 7),
    },
    {
      id: 'run', label: 'Run', keys: [key('run.v1'), key('offered.v1')],
      text: runText,
      detail: [pack && `Pack: ${pack}`, offered.length ? `${plural(offered.length, 'pack')} on offer` : '', run?.struggling ? 'Struggling in fights' : '']
        .filter(Boolean).join(' · ') || undefined,
    },
    {
      id: 'gifts', label: 'Gifts you have', keys: [key('owned.v1'), key('enhanced.v1')],
      text: owned.length ? plural(owned.length - vestiges, 'gift') + (vestiges > 0 ? ` + ${plural(vestiges, 'Vestige')}` : '')
        + (enhancedCount ? ` · ${enhancedCount} enhanced` : '') : 'None',
      detail: list(giftNames, 5),
    },
    {
      id: 'presets', label: 'Saved lineups', keys: [key('presets.v1'), key('presets.active.v1')],
      text: presets.length ? plural(presets.length, 'lineup') : 'None',
      detail: list(presets.map((p) => p.name ?? '').filter(Boolean)),
    },
    {
      id: 'loadout', label: 'E.G.O and skill swaps', keys: [key('egos.v1'), key('swaps.v1')],
      text: egoCount || swapCount ? [egoCount ? `${egoCount} E.G.O equipped` : '', swapCount ? plural(swapCount, 'skill swap') : ''].filter(Boolean).join(' · ') : 'None',
    },
    {
      id: 'other', label: 'Settings', keys: Object.keys(snap).filter((k) => !covered.includes(k)),
      text: settings,
    },
  ]
}

/** Nothing worth keeping: no team, run, gifts or saved lineups. A fresh computer looks like this. */
export function isBlank(snap: Snapshot, look: SummaryLookups): boolean {
  const team = parse<Record<string, string | null>>(snap, 'team.v1', {})
  const run = parse<{ floor?: number | null } | null>(snap, 'run.v1', null)
  return !Object.values(team).some((id) => id && look.identities.has(id))
    && !parse<unknown[]>(snap, 'selection.v1', []).length
    && !parse<unknown[]>(snap, 'owned.v1', []).length
    && !parse<unknown[]>(snap, 'presets.v1', []).length
    && !Object.keys(parse<object>(snap, 'egos.v1', {})).length
    && (run?.floor ?? null) === null
}

/** The rows of both copies side by side, with whether each row differs. */
export function compareRows(mine: Snapshot, theirs: Snapshot, look: SummaryLookups) {
  const a = summarize(mine, look)
  const b = summarize(theirs, look)
  const diff = new Set(changedKeys(mine, theirs))
  return a.map((row, k) => {
    const other = b[k]
    const keys = row.id === 'other' ? [...new Set([...row.keys, ...other.keys])] : row.keys
    return { id: row.id, label: row.label, mine: row, theirs: other, differs: keys.some((x) => diff.has(x)) }
  })
}

// ---------- deciding what cloud sync does on its own ----------

export type SyncPlan = 'same' | 'push' | 'pull' | 'ask'

/**
 * What to do when this computer's data meets the cloud's.
 *
 * `base` is what both had at this computer's last sync, if it has synced with this
 * account before. With a base, whichever side didn't change since then takes the
 * other's changes without asking; only changes on both sides ask. Without one (first
 * sign-in here) it always asks when the two differ and the cloud has something, so you
 * see what you're about to bring in.
 */
export function planSync(local: Snapshot, cloud: Snapshot | null, base: Snapshot | null, look: SummaryLookups): SyncPlan {
  if (!cloud || isBlank(cloud, look) && !base) return sameSnapshot(local, cloud ?? {}) ? 'same' : 'push'
  if (sameSnapshot(local, cloud)) return 'same'
  if (base) {
    if (sameSnapshot(local, base)) return 'pull'
    if (sameSnapshot(cloud, base)) return 'push'
  }
  return 'ask'
}

/** "just now", "5 min ago", "yesterday 9:14 PM" */
export function timeAgo(ms: number, now = Date.now()): string {
  if (!ms) return 'unknown time'
  const s = Math.round((now - ms) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 6 * 3600) return `${Math.round(s / 3600)} h ago`
  const d = new Date(ms)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const today = new Date(now)
  const yesterday = new Date(now - 86400000)
  if (d.toDateString() === today.toDateString()) return `today ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${time}`
  return `${d.toLocaleDateString()} ${time}`
}
