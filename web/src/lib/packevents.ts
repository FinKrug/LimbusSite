/**
 * Theme packs' "?" event nodes: are they worth walking into in this pack, for your team?
 *
 * You see a node is an event, not which one. Some packs swap most of their event nodes
 * for their own events (the pack's `event_note`: "75% chance to be one of the following
 * events", or "guaranteed"); the rest come from the usual pool every pack shares.
 *
 *   event worth = best choice's value for your team (adviseVariant, like the Events tab)
 *   expected    = share x mean(pack's own events) + (1 - share) x mean(usual events)
 *
 * and it's compared with the usual events (what an event node is worth anywhere else):
 *   better  when expected >= usual x GOOD_RATIO (and at least GOOD_GAIN more)
 *   worse   when expected <= usual x BAD_RATIO
 * Packs with no events of their own are "usual".
 */
import { adviseVariant, eventsForPack, type ChoiceAdvice, type EventVariant, type GameEvent } from './events'
import type { RunContext } from './scoring'
import type { Identity, ThemePack } from './types'

export const PACK_EVENT_WEIGHTS = {
  /** Share of event nodes that are the pack's own events when it has some but the wiki doesn't say. */
  unknownShare: 0.5,
  goodRatio: 1.3,
  goodGain: 0.3,
  badRatio: 0.7,
  /** An own event this much better than the usual ones is worth naming as "hope for it". */
  standout: 1.5,
}

export interface EventWorth {
  event: GameEvent
  /** The version of the event (a pack's events page lists several). */
  variant: EventVariant
  name: string
  value: number
  best: ChoiceAdvice | null
  /** The wiki doesn't say what its choices give: left out of the average. */
  unknown: boolean
}

export type PackEventVerdict = 'better' | 'usual' | 'worse'

export interface PackEvents {
  verdict: PackEventVerdict
  /** Share of event nodes that are the pack's own events (0 when it has none). */
  share: number
  /** True when the wiki says the share; false when it's our guess. */
  shareKnown: boolean
  /** The pack's own events, best first. */
  own: EventWorth[]
  expected: number
  usual: number
  /** One line for the pack card. */
  summary: string
}

/** Events that can show up in any pack: not tied to one, not a boss's own fight. */
export function usualEvents(events: GameEvent[], packs: ThemePack[]): GameEvent[] {
  const tied = new Set<string>()
  for (const p of packs) for (const e of eventsForPack(events, p)) tied.add(e.id)
  const packIds = new Set(packs.map((p) => p.id))
  return events.filter((e) => !tied.has(e.id) && !e.boss && !e.packs?.length
    // A pack's events page for a pack that's gone (Pilgrimage of Compassion).
    && !(e.pack && !packIds.has(e.pack)) && !/ Theme Pack$/.test(e.name))
}

function worth(e: GameEvent, v: EventVariant, ctx: RunContext, team: Identity[]): EventWorth {
  const advice = v.choices.length ? adviseVariant(v, ctx, team) : []
  const best = advice.reduce<ChoiceAdvice | null>((a, x) => (!a || x.value > a.value ? x : a), null)
  // A pack's events page lists its events as untitled versions: name them by their first choice,
  // which is also what you'd type on the Events tab.
  const dungeon = / Dungeon Event$/.test(v.name)
  const untitled = !v.name || v.name === 'Mirror Dungeon Event' || / Theme Pack$/.test(v.name) || dungeon
  const first = v.choices[0]?.label.split('\n')[0] ?? ''
  const name = !untitled ? v.name : (/ Theme Pack$/.test(e.name) || dungeon) && first ? `“${clip(first)}”` : e.name
  const unknown = !advice.length || advice.every((a) => a.unclear)
  return { event: e, variant: v, name, value: best?.value ?? 0, best, unknown }
}

const clip = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0)

/** The usual events' average worth for your team (the same for every pack). */
export function usualWorth(usual: GameEvent[], ctx: RunContext, team: Identity[]): number {
  return mean(usual.map((e) => Math.max(...e.variants.map((v) => worth(e, v, ctx, team).value), 0)))
}

/** Share of event nodes that are the pack's own, from its note ("75% chance", "guaranteed"). */
export function ownShare(pack: ThemePack): { share: number; known: boolean } {
  const note = (pack.event_note ?? '').toLowerCase()
  if (/guaranteed/.test(note)) return { share: 1, known: true }
  const m = /(\d+)\s*%/.exec(note)
  if (m) return { share: Math.min(1, Number(m[1]) / 100), known: true }
  return { share: PACK_EVENT_WEIGHTS.unknownShare, known: false }
}

/** The pack's own events (no boss fights), one entry per distinct version, best first. */
function ownEvents(events: GameEvent[], pack: ThemePack, ctx: RunContext, team: Identity[]): EventWorth[] {
  const seen = new Set<string>()
  const out: EventWorth[] = []
  for (const e of eventsForPack(events, pack)) {
    if (e.boss) continue
    for (const v of e.variants) {
      // A pack's page, its BokGak page and an event's own page can repeat the same event
      // under different names: the choices are the same.
      const key = v.choices.map((c) => c.label).join('|')
      if (seen.has(key) || !v.choices.length) continue
      seen.add(key)
      out.push(worth(e, v, ctx, team))
    }
  }
  return out.sort((a, b) => b.value - a.value)
}

export function packEvents(
  pack: ThemePack, events: GameEvent[], ctx: RunContext, team: Identity[], usual: number,
): PackEvents {
  const W = PACK_EVENT_WEIGHTS
  const own = ownEvents(events, pack, ctx, team)
  if (!own.length) {
    return { verdict: 'usual', share: 0, shareKnown: true, own, expected: usual, usual,
      summary: 'Events: only the usual ones, about average for your team.' }
  }
  const { share, known } = ownShare(pack)
  // Events the wiki doesn't spell out count as usual ones.
  const ownMean = mean(own.map((x) => (x.unknown ? usual : x.value)))
  const expected = share * ownMean + (1 - share) * usual
  const verdict: PackEventVerdict = expected >= usual * W.goodRatio && expected - usual >= W.goodGain ? 'better'
    : expected <= usual * W.badRatio ? 'worse' : 'usual'
  const pct = `${Math.round(share * 100)}%`
  const how = known ? (share >= 1 ? 'Every event node here is one of its own events' : `${pct} of event nodes here are its own events`)
    : 'Some event nodes here are its own events'
  const summary = verdict === 'better' ? `Go for events here: ${lower(how)}, and they're better than usual for your team.`
    : verdict === 'worse' ? `Skip events here if you can: ${lower(how)}, and they do little for your team. Take fights or shops instead.`
      : `Events here are about as good as usual for your team (${lower(how)}).`
  return { verdict, share, shareKnown: known, own, expected, usual, summary }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Own events to hope for (well above the usual ones) and ones that do nothing for you. */
export function eventHighlights(p: PackEvents): { hope: EventWorth[]; dud: EventWorth[] } {
  return {
    hope: p.own.filter((x) => !x.unknown && x.value >= Math.max(p.usual * PACK_EVENT_WEIGHTS.standout, p.usual + 0.5)),
    dud: p.own.filter((x) => !x.unknown && x.value <= 0.05),
  }
}

/** Every pack's event advice, by pack id. */
export function allPackEvents(packs: ThemePack[], events: GameEvent[], ctx: RunContext, team: Identity[]): Map<string, PackEvents> {
  const usual = usualWorth(usualEvents(events, packs), ctx, team)
  return new Map(packs.map((p) => [p.id, packEvents(p, events, ctx, team, usual)]))
}
