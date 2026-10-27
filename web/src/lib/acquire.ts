// How to get a gift in Mirror Dungeon, in as much detail as the wiki gives: inside
// which theme pack, and how there (its own events: which choice, which check;
// battle rewards and the shop), from random "?" events on any floor, from the
// general pool, or by fusing.
import { allOutcomes, RETRY_TRIES, type EventCheck, type EventChoice, type EventOutcome, type EventVariant, type GameEvent } from './events'
import { floorText, type Gift, type ThemePack } from './types'
import { isHiddenPack, rarityText } from './scoring'

export interface AcquireLine {
  kind: 'fusion' | 'pack' | 'event' | 'pool' | 'other'
  text: string
  /** Gift ids in a fusion recipe, to show which you already own. */
  ingredients?: { id: string; name: string; owned: boolean }[]
  /** Theme packs to name (the first few). */
  packs?: ThemePack[]
  morePacks?: number
  link?: string | null
  /** The steps: "Event "The Chicken Strife": pick "…" (Sloth check …)", "Battle rewards and the shop". */
  details?: string[]
  /** How sure you can be: in every run of this pack, only by chance, or in the general pool. */
  odds?: 'sure' | 'chance' | 'common'
}

function floors(p: ThemePack): string {
  const parts = [
    floorText(p.floors?.normal) && `Normal ${floorText(p.floors?.normal)}`,
    floorText(p.floors?.hard) && `Hard ${floorText(p.floors?.hard)}`,
    floorText(p.floors?.extreme) && `Extreme ${floorText(p.floors?.extreme)}`,
  ].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

export function packLabel(p: ThemePack): string {
  return `${p.name}${floors(p)}`
}

// -- where events give a gift ---------------------------------------------------------

export interface EventSource {
  event: GameEvent
  variant: EventVariant
  /** Theme pack this version of the event belongs to, or null for a random "?" event. */
  pack: ThemePack | null
  /** "pick "Nod." → "Shake your head."", "…, then pass a Sloth check (12+ …)". */
  how: string
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function checkText(c: EventCheck): string {
  if (!c.sins.length || c.adv === null) return 'a gamble with no sin check'
  const sins = c.sins.map(cap).join('/')
  return `a ${sins} check (${c.adv}+ with a ${c.sins.map(cap).join(' or ')} skill, ${c.disadv}+ without)`
}

/** How a result (and its follow-up roll) leads to the gift: "" when it's right there, a suffix
 *  like ", then win the 50% roll" for a follow-up, or null when it doesn't give it. */
function outcomeRoute(o: EventOutcome | undefined, id: string): string | null {
  if (!o) return null
  if (o.gifts.includes(id)) return o.combat ? ' and win the fight' : ''
  const t = o.then
  if (!t) return null
  const roll = t.check ? checkText(t.check) : `the ${Math.round((t.chance ?? 0.5) * 100)}% roll`
  const pass = outcomeRoute(t.pass, id)
  const fail = outcomeRoute(t.fail, id)
  if (t.retry) return null  // routes() words retries itself
  if (pass !== null && fail !== null) return ''
  if (pass !== null) return `, then ${t.check ? 'pass' : 'win'} ${roll}${pass}`
  if (fail !== null) return `, then ${t.check ? 'fail' : 'lose'} ${roll}${fail}`
  return null
}

/** How to reach a gift through one choice (and its follow-ups). */
function routes(c: EventChoice, id: string, path: string[]): string[] {
  const here = [...path, `"${c.label}"`]
  const pick = `pick ${here.join(' → ')}`
  const has = (o?: EventOutcome) => !!o && o.gifts.includes(id)
  const out: string[] = []
  if (c.check) {
    const pass = outcomeRoute(c.pass, id)
    const retry = c.fail?.then?.retry ? c.fail.then : null
    const outOfTries = retry ? outcomeRoute(retry.fail, id) : null
    const fail = outcomeRoute(c.fail, id)
    if (pass === '' && fail === '') out.push(`${pick} (you get it either way)`)
    else if (pass !== null) out.push(`${pick}, then pass ${checkText(c.check)}${pass}`)
    else if (fail !== null) out.push(`${pick} (it comes from failing ${checkText(c.check)}${fail})`)
    if (outOfTries !== null) out.push(`${pick}, then fail ${checkText(c.check)} ${RETRY_TRIES} times${outOfTries}`)
  } else if (has(c.result)) {
    out.push(c.result!.combat ? `${pick} and win the fight` : pick)
  }
  for (const n of c.next ?? []) out.push(...routes(n, id, here))
  return out
}

const indexCache = new WeakMap<GameEvent[], Map<string, EventSource[]>>()

/** gift id -> every event choice that gives it, with the pack it belongs to. */
export function eventSources(events: GameEvent[], packs: ThemePack[]): Map<string, EventSource[]> {
  const hit = indexCache.get(events)
  if (hit) return hit
  const byId = new Map(packs.map((p) => [p.id, p]))
  // Longest names first, so "Nocturnal Sweeping BokGak" wins over "Nocturnal Sweeping".
  const named = [...packs].sort((a, b) => b.name.length - a.name.length)
  const packOf = (e: GameEvent, v: EventVariant): ThemePack | null => {
    if (e.pack) return byId.get(e.pack) ?? null
    const note = v.note.toLowerCase()
    return note ? named.find((p) => note.includes(p.name.toLowerCase())) ?? null : null
  }
  const out = new Map<string, EventSource[]>()
  for (const e of events) {
    for (const v of e.variants) {
      const ids = new Set<string>()
      const walk = (c: EventChoice) => {
        for (const o of [c.result, c.pass, c.fail].flatMap(allOutcomes)) for (const g of o.gifts) ids.add(g)
        for (const n of c.next ?? []) walk(n)
      }
      v.choices.forEach(walk)
      for (const id of ids) {
        const how = v.choices.flatMap((c) => routes(c, id, []))
        if (!how.length) continue
        const list = out.get(id) ?? []
        list.push({ event: e, variant: v, pack: packOf(e, v), how: how.slice(0, 2).join('; or ') })
        out.set(id, list)
      }
    }
  }
  indexCache.set(events, out)
  return out
}

/** "75% of its "?" nodes are its own events" / "its "?" nodes are always its own events". */
export function packEventOdds(p: ThemePack): string | null {
  const n = p.event_note
  if (!n) return null
  const pct = n.match(/(\d+)%/)
  if (pct) return `${pct[1]}% of its "?" event nodes are its own events`
  if (/guaranteed|always/i.test(n)) return `its "?" event nodes are always its own events`
  return null
}

const eventName = (s: EventSource) =>
  s.variant.name && !/^Mirror Dungeon Event$/i.test(s.variant.name) ? s.variant.name : s.event.name.replace(/ Theme Pack$/, '')

export function howToGet(
  gift: Gift, packsForGift: Map<string, ThemePack[]>, giftsById: Map<string, Gift>, owned: Set<string>,
  events: GameEvent[] = [], allPacks: ThemePack[] = [],
): AcquireLine[] {
  const lines: AcquireLine[] = []
  // Reward-only gifts: nothing else gives them (not shops, battle rewards or random fusions).
  if (gift.reward_only === 'hidden_boss') {
    lines.push({ kind: 'other', text: 'EXTREME hidden boss reward', details: [
      'On EXTREME floors any node (not a boss or shop) has a 10% chance to turn into an optional hidden boss; beating it gives this gift, 1,000 Cost and a full heal.',
      'Not from shops, battle rewards or fusing.'] })
    return lines
  }
  if (gift.reward_only === 'clear') {
    const pack = allPacks.find((p) => p.clear_rewards?.includes(gift.id))
    lines.push({ kind: 'pack', packs: pack ? [pack] : [], text: 'Clear reward', details: [
      'Given automatically when you clear this pack (EXTREME floors 11–15).',
      'Not from shops, battle rewards or fusing.'] })
    return lines
  }
  if (gift.fusion_recipe?.length) {
    const ingredients = gift.fusion_recipe.map((id) => ({ id, name: giftsById.get(id)?.name ?? id, owned: owned.has(id) }))
    lines.push({ kind: 'fusion', text: 'Fuse', ingredients })
  }
  const packs = packsForGift.get(gift.id) ?? []
  const exclusive = packs.filter((p) => p.gifts.includes(gift.id))
  const featured = packs.filter((p) => !p.gifts.includes(gift.id))
  const sources = eventSources(events, allPacks.length ? allPacks : packs).get(gift.id) ?? []

  // Inside each pack that has it: its own events first, then battle rewards and the shop.
  const packEvents = (p: ThemePack) => sources.filter((s) => s.pack?.id === p.id)
  const shown = [...exclusive, ...packs.filter((p) => !exclusive.includes(p) && packEvents(p).length)].slice(0, 4)
  for (const p of shown) {
    const details: string[] = []
    const evs = packEvents(p)
    for (const s of evs) details.push(`Event "${eventName(s)}": ${s.how}`)
    const odds = packEventOdds(p)
    if (evs.length && odds) details.push(cap(odds))
    if (isHiddenPack(p)) details.push(`A rare hidden pack: it shows up in place of a normal pack ${rarityText(p)}`)
    if ((p.clear_rewards ?? []).includes(gift.id)) details.push(p.reward_auto ? 'Given automatically when you clear it' : 'Always offered when you clear it')
    if (p.gifts.includes(gift.id)) {
      details.push(p.layout?.shop === false ? 'Battle rewards in this pack' : 'Battle rewards in this pack, and its shop before the boss')
    }
    lines.push({
      kind: 'pack', packs: [p], details,
      text: exclusive.length > 1 || !p.gifts.includes(gift.id) ? 'In this theme pack' : 'Only in this theme pack',
      odds: evs.length && /always/.test(odds ?? '') ? 'sure' : undefined,
    })
  }
  if (exclusive.length > shown.length) {
    lines.push({ kind: 'pack', text: 'Also in', packs: exclusive.filter((p) => !shown.includes(p)).slice(0, 3),
      morePacks: Math.max(0, exclusive.length - shown.length - 3) })
  }

  // Random "?" events, any floor.
  const random = sources.filter((s) => !s.pack)
  for (const s of random.slice(0, 3)) {
    lines.push({ kind: 'event', text: eventName(s), link: s.event.wiki_url, details: [cap(s.how)], odds: 'chance' })
  }
  // Events the wiki lists for the gift that we couldn't read choices for.
  for (const e of gift.events) {
    if (sources.some((s) => s.event.name === e.name)) continue
    lines.push({ kind: 'event', text: e.name, link: e.wiki_url, odds: 'chance' })
  }

  const pools = gift.pools ?? []
  if (pools.includes('main')) {
    lines.push({ kind: 'pool', text: 'General pool: battle rewards and shops on any floor', odds: 'common' })
  }
  if (pools.includes('extreme') && !exclusive.length) lines.push({ kind: 'pool', text: 'Extreme difficulty only' })
  if (pools.includes('cursed')) lines.push({ kind: 'pool', text: 'Cursed gift: it comes with a drawback' })
  if (featured.length) {
    lines.push({
      kind: 'pack', packs: featured.filter((p) => !shown.includes(p)).slice(0, 3),
      morePacks: Math.max(0, featured.filter((p) => !shown.includes(p)).length - 3),
      text: `Boosted odds in ${featured.length} theme pack${featured.length > 1 ? 's' : ''}`,
    })
  }
  for (const o of gift.other_sources ?? []) lines.push({ kind: 'other', text: o })
  if (!lines.length) lines.push({ kind: 'other', text: 'No source listed on the wiki' })
  return lines
}
