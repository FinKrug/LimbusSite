/**
 * Pack route (internal): which theme pack to aim for on each floor of the run. Not shown
 * as a timeline; it decides the order and verdicts on the Theme packs tab
 * (`prioritizePacks`), so a pack that's about to stop showing up is taken before one
 * that will still be around later.
 *
 * Packs only show up on some floors (the wiki's "Featured Floors"): some only on
 * floors 1-2, others anywhere from 5 to 10. Taking a pack that's around for the
 * rest of the run on a floor where a short-window pack is your last chance means
 * missing that pack's gifts for good. So the route is planned for the whole run
 * at once, one pack per floor and each pack at most once:
 *  - a pack's value is its theme pack score for your team (rankThemePacks), and a
 *    pack on an earlier floor is worth a little more (its gifts help for longer):
 *    value x (1 + early x floors after it);
 *  - the best total is found with an assignment (Hungarian) over floors x packs, so a
 *    strong pack with a long window waits for later when something short-lived needs
 *    the earlier floor.
 * Floors you've played keep the pack you picked there (`run.visited`), and those packs
 * aren't planned again. Hidden packs (The B.E., 1 in 5,000) are never planned: they're
 * only taken when one actually shows up.
 */
import { isHiddenPack, packInDifficulty, packOnFloor, playedPacks, rankThemePacks, type PackScore, type RunContext, type RunSettings } from './scoring'
import type { ThemePack } from './types'

export const ROUTE_WEIGHTS = {
  /** Value bonus per later floor a pack's gifts get to help (gifts early are worth more). */
  early: 0.03,
  /** Fallbacks listed per floor. */
  fallbacks: 3,
  /** A fallback has to be worth this share of the floor's pick to be listed. */
  fallbackMin: 0.35,
  /** Packs worth this share of the best one are "missed" when the route has no room for them. */
  missedAt: 0.6,
}

/** Floors of this run the pack can show up on. */
export function packFloors(pack: ThemePack, run: Pick<RunSettings, 'difficulty' | 'floors'>): number[] {
  const out: number[] = []
  for (let f = 1; f <= run.floors; f++) if (packOnFloor(pack, run.difficulty, f)) out.push(f)
  return out
}

/** "floor 3", "floors 1–2", "floors 1–2, 5" */
export function floorsText(floors: number[]): string {
  if (!floors.length) return 'no floor of this run'
  const runs: [number, number][] = []
  for (const f of floors) {
    const last = runs[runs.length - 1]
    if (last && f === last[1] + 1) last[1] = f
    else runs.push([f, f])
  }
  const text = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')
  return floors.length === 1 ? `floor ${text}` : `floors ${text}`
}

export interface RouteOption {
  score: PackScore
  floors: number[]
  /** Floor the route puts it on, if any. */
  planned: number | null
  /** This floor is the last one it can show up on, and the route doesn't use it elsewhere. */
  lastChance: boolean
  note: string
}

export interface RouteFloor {
  floor: number
  /** past: already played; current: the floor you're on; next: later floors. */
  status: 'past' | 'current' | 'next'
  /** The pack to aim for (or the one you picked, on past floors and the current floor). */
  pick: PackScore | null
  /** The pack you picked here (past floors, and the current floor once picked). */
  picked: ThemePack | null
  why: string[]
  fallbacks: RouteOption[]
}

export interface PackRoute {
  floors: RouteFloor[]
  /** Strong packs the route has no floor for. */
  missed: RouteOption[]
  /** Total route value (for comparing picks). */
  total: number
  /** pack id -> floors of this run it shows up on. */
  windows: Map<string, number[]>
}

/** Maximum-weight assignment of rows to columns (n rows <= m columns); weight -Infinity = not allowed. */
export function assign(weights: number[][]): number[] {
  const n = weights.length
  if (!n) return []
  const m = weights[0].length
  // Hungarian algorithm on costs (minimise -weight); forbidden pairs cost a lot.
  const BIG = 1e9
  const cost = (i: number, j: number) => (Number.isFinite(weights[i][j]) ? -weights[i][j] : BIG)
  const u = new Array(n + 1).fill(0)
  const v = new Array(m + 1).fill(0)
  const p = new Array(m + 1).fill(0)
  const way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(Infinity)
    const used = new Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const rowTo = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) rowTo[p[j] - 1] = j - 1
  return rowTo
}

export interface RouteInput {
  /** Every pack scored for your team (rankThemePacks over the difficulty's packs). */
  scores: PackScore[]
  run: RunSettings
  /** Force this pack on the current floor (to compare offered packs). */
  pickNow?: string
}

/** The packs worth scoring for a route: this difficulty's packs that can show up in this run. */
export function routeScores(ctx: RunContext): PackScore[] {
  const packs = ctx.data.themePacks.filter((p) => packInDifficulty(p, ctx.run.difficulty) && packFloors(p, ctx.run).length > 0)
  return rankThemePacks(ctx, packs)
}

export function planRoute({ scores, run, pickNow }: RouteInput): PackRoute {
  const start = run.floor ?? 1
  const visited = run.visited ?? {}
  const byId = new Map(scores.map((s) => [s.pack.id, s]))
  const visitedIds = new Set(Object.entries(visited).filter(([f]) => Number(f) < start).map(([, id]) => id))
  // The current floor's pack: forced (offered comparison), or the one you picked.
  const fixed = pickNow ?? (run.floor !== null ? run.pack : null)
  const floors: number[] = []
  for (let f = start; f <= run.floors; f++) floors.push(f)
  // Hidden packs only when you've actually got one (picked or being compared).
  const candidates = scores.filter((s) => !visitedIds.has(s.pack.id) && (!isHiddenPack(s.pack) || s.pack.id === fixed))
  const windows = new Map(scores.map((s) => [s.pack.id, packFloors(s.pack, run)]))
  const valueAt = (s: PackScore, f: number) => s.score * (1 + ROUTE_WEIGHTS.early * (run.floors - f))
  // Rows: floors; columns: packs plus one "nothing" column per floor.
  const weights = floors.map((f, row) => [
    ...candidates.map((s) => {
      if (fixed && f === start) return s.pack.id === fixed ? 1e6 : -Infinity
      if (fixed && s.pack.id === fixed) return -Infinity
      return windows.get(s.pack.id)!.includes(f) ? valueAt(s, f) : -Infinity
    }),
    ...floors.map((_, k) => (k === row && !(fixed && f === start && byId.has(fixed)) ? 0 : -Infinity)),
  ])
  const cols = assign(weights)
  const planned = new Map<number, PackScore>()
  let total = 0
  floors.forEach((f, row) => {
    const c = cols[row]
    if (c >= 0 && c < candidates.length) {
      planned.set(f, candidates[c])
      total += valueAt(candidates[c], f)
    }
  })
  const plannedFloor = new Map([...planned].map(([f, s]) => [s.pack.id, f]))
  const best = Math.max(0, ...candidates.map((s) => s.score))

  const option = (s: PackScore, f: number): RouteOption => {
    const w = windows.get(s.pack.id) ?? []
    const at = plannedFloor.get(s.pack.id) ?? null
    const lastChance = at === null && w[w.length - 1] === f
    const note = at !== null && at !== f ? `Planned for floor ${at} (shows up on ${floorsText(w)})`
      : lastChance ? `Last chance: it only shows up on ${floorsText(w)}`
        : `If ${planned.get(f)?.pack.name ?? 'the pick'} isn't offered`
    return { score: s, floors: w, planned: at, lastChance, note }
  }

  const out: RouteFloor[] = []
  for (let f = 1; f <= run.floors; f++) {
    if (f < start) {
      const id = visited[f]
      out.push({ floor: f, status: 'past', pick: id ? byId.get(id) ?? null : null, picked: id ? byId.get(id)?.pack ?? null : null, why: [], fallbacks: [] })
      continue
    }
    const pick = planned.get(f) ?? null
    const why: string[] = []
    if (pick) {
      const w = windows.get(pick.pack.id)!
      const fitting = pick.highlights.filter((h) => h.kind === 'exclusive' && h.fits).map((h) => h.gift.gift.name)
      const yours = f === start && fixed === pick.pack.id && !pickNow
      if (yours) why.push('Your pick for this floor')
      else if (w.length <= 2) why.push(`Only shows up on ${floorsText(w)}`)
      else if (w[w.length - 1] === f) why.push(`Last floor it can show up on (${floorsText(w)})`)
      // Better packs on this floor that the route saves for later.
      const waiting = candidates
        .filter((s) => s.score > pick.score && s.pack.id !== pick.pack.id && windows.get(s.pack.id)!.includes(f))
        .map((s) => ({ s, at: plannedFloor.get(s.pack.id) }))
        .filter((x) => x.at !== undefined && x.at > f)
      const earlier = candidates
        .filter((s) => s.score > pick.score && windows.get(s.pack.id)!.includes(f) && (plannedFloor.get(s.pack.id) ?? f) < f)
      if (yours) {
        // Your own pick: no "ahead of" story, just whether something better was on offer.
      } else if (waiting.length) {
        const x = waiting[0]
        why.push(`Ahead of ${x.s.pack.name}, which also shows up on ${floorsText(windows.get(x.s.pack.id)!)}: it's planned for floor ${x.at}`)
      } else if (!why.length) {
        const better = candidates.some((s) => s.score > pick.score && windows.get(s.pack.id)!.includes(f) && !earlier.includes(s))
        if (!better) {
          why.push(earlier.length
            ? `Best one left: ${earlier.slice(0, 2).map((s) => s.pack.name).join(' and ')} ${earlier.length > 1 ? 'are' : 'is'} planned earlier`
            : 'Best pack for your team on this floor')
        }
      }
      if (fitting.length) why.push(`Exclusive for your team: ${fitting.slice(0, 3).join(', ')}`)
      else if (pick.top[0]) why.push(`Best gift for you there: ${pick.top[0].gift.name}`)
    }
    // Once you've picked this floor's pack, there's nothing to fall back to.
    const settled = f === start && !!fixed && !pickNow && pick?.pack.id === fixed
    const fallbacks = settled ? [] : candidates
      .filter((s) => s !== pick && windows.get(s.pack.id)!.includes(f) && s.score >= ROUTE_WEIGHTS.fallbackMin * (pick?.score ?? 0))
      .map((s) => option(s, f))
      // Last chances first, then packs not needed later, then ones planned elsewhere.
      .sort((a, b) => Number(b.lastChance) - Number(a.lastChance)
        || Number(a.planned !== null) - Number(b.planned !== null) || b.score.score - a.score.score)
      .slice(0, ROUTE_WEIGHTS.fallbacks)
    const pickedId = f === start && run.floor !== null ? run.pack : null
    out.push({
      floor: f,
      status: f === start && run.floor !== null ? 'current' : 'next',
      pick,
      picked: pickedId ? byId.get(pickedId)?.pack ?? null : null,
      why,
      fallbacks,
    })
  }

  const missed = candidates
    .filter((s) => !plannedFloor.has(s.pack.id) && s.score >= ROUTE_WEIGHTS.missedAt * best)
    .map((s): RouteOption => {
      const w = windows.get(s.pack.id)!.filter((f) => f >= start)
      const taken = w.map((f) => planned.get(f)?.pack.name).filter(Boolean)
      return {
        score: s, floors: w, planned: null, lastChance: false,
        note: w.length ? `Shows up on ${floorsText(w)}, which go to ${[...new Set(taken)].slice(0, 3).join(', ')}` : 'No floor left where it shows up',
      }
    })
  return { floors: out, missed, total, windows }
}

export interface PackAdvice {
  /** best: take it now; last: last floor it shows up on; wait: it shows up later too. */
  kind: 'best' | 'last' | 'wait'
  note: string
  /** Route value lost over the run by taking it now instead of the best pick. */
  loss: number
}

/**
 * Order the packs in view (this floor's, or the ones you're offered) by what taking each one
 * now does for the whole run: each pack is forced on this floor and the rest of the route
 * re-planned. A slightly weaker pack that's your last chance beats a stronger one that will
 * still show up later. Verdicts follow the value lost: Go within 15% of the best pack's score,
 * Skip past 50%. Hidden packs (The B.E.) go last unless they're among the offered packs, i.e.
 * you've found one.
 */
export function prioritizePacks(
  scores: PackScore[], inView: PackScore[], run: RunSettings, offered: boolean,
): { order: PackScore[]; advice: Map<string, PackAdvice> } {
  const advice = new Map<string, PackAdvice>()
  const hiddenLast = (list: PackScore[]) => offered ? list
    : [...list.filter((p) => !isHiddenPack(p.pack)), ...list.filter((p) => isHiddenPack(p.pack)).map((p) => ({ ...p, rating: Math.min(100, p.rating) }))]
  if (run.floor === null || !scores.length || !inView.length) return { order: hiddenLast(inView), advice }
  const floor = run.floor
  const byId = new Map(scores.map((s) => [s.pack.id, s]))
  const all = [...scores, ...inView.filter((p) => !byId.has(p.pack.id))]
  const routeRun = { ...run, pack: null }
  // A pack you've already played can't be picked again: never plan it (planRoute can't place it).
  const played = playedPacks(run)
  const rows = inView
    .filter((p) => (offered || !isHiddenPack(p.pack)) && !played.has(p.pack.id))
    .map((p) => ({ p, total: planRoute({ scores: all, run: routeRun, pickNow: p.pack.id }).total }))
  if (!rows.length) return { order: hiddenLast(inView), advice }
  const top = Math.max(...rows.map((r) => r.total))
  const maxScore = Math.max(1e-9, ...rows.map((r) => r.p.score))
  rows.sort((a, b) => b.total - a.total || b.p.score - a.p.score)
  const best = rows[0]
  const later = (p: PackScore) => packFloors(p.pack, run).filter((f) => f > floor)
  const verdictOf = (loss: number) => loss <= 0.15 * maxScore ? 'go' : loss >= 0.5 * maxScore ? 'skip' : 'maybe'
  const order: PackScore[] = []
  const rate = (p: PackScore) => Math.min(100, Math.round((p.score / maxScore) * 100))
  for (const r of rows) {
    const loss = top - r.total
    const l = later(r.p)
    const w = packFloors(r.p.pack, run)
    let a: PackAdvice
    if (r === best) {
      const stronger = rows.find((x) => x !== r && x.p.score > r.p.score && later(x.p).length)
      a = {
        kind: 'best', loss,
        note: stronger ? `Best pick now: ${stronger.p.pack.name} is stronger, but it also shows up on ${floorsText(later(stronger.p))}`
          : l.length ? 'Best pick now: the later floors it shows up on have better packs for you'
            : `Best pick now, and the last floor it shows up on (${floorsText(w)})`,
      }
    } else if (isHiddenPack(r.p.pack)) {
      a = { kind: 'last', loss, note: "Rare find: you won't see it again this run" }
    } else if (!l.length) {
      a = { kind: 'last', loss, note: `Last floor it shows up on (${floorsText(w)})` }
    } else {
      a = { kind: 'wait', loss, note: `Can wait: it also shows up on ${floorsText(l)}` }
    }
    advice.set(r.p.pack.id, a)
    // Rare finds keep their own verdict; everything else follows the route.
    // A strong pack that can wait isn't a Skip: it's for a later floor.
    let verdict: PackScore['verdict'] = verdictOf(loss)
    if (a.kind === 'wait' && verdict === 'skip' && r.p.verdict === 'go') verdict = 'maybe'
    order.push(isHiddenPack(r.p.pack) ? { ...r.p, rating: rate(r.p) } : { ...r.p, rating: rate(r.p), verdict })
  }
  // Hidden packs you haven't found: last, and no bigger than the best pack here.
  const rest = inView.filter((p) => !advice.has(p.pack.id) && !played.has(p.pack.id)).map((p) => ({ ...p, rating: Math.min(100, p.rating) }))
  return { order: [...order, ...rest], advice }
}
