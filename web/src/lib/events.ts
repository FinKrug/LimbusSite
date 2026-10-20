/**
 * Mirror Dungeon events (the "?" encounters): which choice to make for your team.
 *
 * data/events.json (scraper/events.py) has each event's choices, the sin check some
 * of them run, and what each result gives. A choice is worth:
 *
 *   value(result) = the gifts it gives (scored for your team, like Best gifts, so
 *                   Lunar Memory pieces and keyword fit count) + Cost - harm
 *   check         = chance x value(pass) + (1 - chance) x value(fail)
 *   fight         = the gifts if you win, minus the cost of a fight
 *   follow-ups    = the best of the choices it leads to
 *
 * Check chance (an estimate; the game shows the exact one when you pick a sinner):
 * the sinner you send rolls one of their skills (base power + coin power for each
 * heads, 50% heads). With a skill of a checked sin they need the lower number
 * (`adv`), without one the higher (`disadv`). Some checks add a bonus for certain
 * identities. We pick the sinner on your team with the best odds.
 */
import { FUSION_POINTS } from './fusion'
import { isGone, scoreGift, type RunContext } from './scoring'
import { tierLabel, type Identity, type Sin } from './types'

export interface EventOutcome {
  text: string
  gifts: string[]
  unknown_gifts: string[]
  cost: number
  combat: boolean
  hurts: boolean
  lasting: boolean
  nothing: boolean
  /** A boss loses a passive ("All enemies have lost their [Upgrade Factory at Work] Passives!"). */
  weakens?: boolean
  /** A second roll after this result: Cozy Bed's pass is a 50% roll between Snuffed Lantern and
   *  Snuffed Candlestick; Sign of Roses' fail can be retried while fewer than 3 checks have failed. */
  then?: EventFollowUp
}

export interface EventFollowUp {
  /** A sin check, or null for a plain roll. */
  check: EventCheck | null
  /** Fixed odds of the pass side (0.5), when the wiki gives them. */
  chance: number | null
  /** The wiki's condition ("Cumulative Checks Failed < 3"), or "". */
  condition: string
  /** Pass = you get to try the check again (after `pass`'s small penalty); fail = out of tries. */
  retry: boolean
  pass: EventOutcome
  fail: EventOutcome
}

/** Attempts a "Cumulative Checks Failed < 3" retry allows. */
export const RETRY_TRIES = 3

/** Every result an outcome can lead to (itself and its follow-up rolls). */
export function allOutcomes(o: EventOutcome | undefined): EventOutcome[] {
  if (!o) return []
  return [o, ...(o.then ? [...allOutcomes(o.then.pass), ...allOutcomes(o.then.fail)] : [])]
}

export interface EventCheck {
  sins: Sin[]
  adv: number | null
  disadv: number | null
  bonuses: { who: string; mod: number }[]
}

export interface EventChoice {
  label: string
  desc: string
  check: EventCheck | null
  result?: EventOutcome
  pass?: EventOutcome
  fail?: EventOutcome
  next?: EventChoice[]
}

export interface EventVariant {
  name: string
  /** Where this version appears ("only available within The Dusk of Amber Theme Pack"), or "". */
  note: string
  story: string
  choices: EventChoice[]
}

export interface GameEvent {
  id: string
  name: string
  /** Theme pack id when this is a pack's own events page ("Hell's Chicken Theme Pack"). */
  pack?: string
  gifts: string[]
  variants: EventVariant[]
  wiki_url: string
  /** A boss fight's own events (from the enemy's page); `packs` are the theme packs it's the boss of. */
  boss?: boolean
  packs?: string[]
}

export const EVENT_WEIGHTS = {
  /** Value of 1 Cost (100 Cost is about a third of a decent gift). */
  cost: 0.006,
  /** A one-off hit (damage, SP loss) to one or all units. */
  hurtOne: 0.25,
  hurtAll: 0.6,
  /** A penalty that lasts (every combat phase, the rest of the floor). */
  lasting: 1.0,
  /** Healing, levels. */
  heal: 0.2,
  levels: 0.9,
  /** A fight: time, HP and the chance it goes badly. */
  fight: 0.6,
  /** Gifts from winning a fight: assume you usually win. */
  winChance: 0.9,
  /** A gift you already own comes back as a vestige-like duplicate. */
  duplicate: 0.3,
  /** A gift the app doesn't know (story-only). */
  unknownGift: 0.6,
  /** The best choice by at least this much is "clearly best"; this far below it, avoid. */
  avoidGap: 1.2,
  /** A boss loses a passive (no more revives) or gets weak to an attack type. */
  bossWeaken: 1.5,
  /** A duplicate becomes a Vestige of its tier: worth this per fusion point it adds. */
  vestigePoint: 0.06,
}

export interface Valued {
  value: number
  /** Lines explaining the value, best first. */
  why: string[]
}

export function outcomeValue(o: EventOutcome | undefined, ctx: RunContext): Valued {
  if (!o) return { value: 0, why: [] }
  const W = EVENT_WEIGHTS
  let value = 0
  const why: string[] = []
  for (const id of o.gifts) {
    const g = ctx.giftsById.get(id)
    if (!g) continue
    if (ctx.owned.has(id)) {
      // A duplicate turns into a Vestige of its tier: fusion fuel, not nothing.
      const points = FUSION_POINTS[g.tier ?? 1] ?? 3
      value += Math.max(W.duplicate, points * W.vestigePoint)
      why.push(`${g.name}: you already have it, so it becomes a Tier ${tierLabel(g.tier)} Vestige (${points} fusion points)`)
      continue
    }
    if (isGone(ctx, id)) {
      why.push(`${g.name}: already part of ${ctx.gone.get(id)}, which you have`)
      continue
    }
    const s = scoreGift(g, ctx)
    value += s.score * (o.combat ? W.winChance : 1)
    const reason = s.reasons.find((r) => r.kind === 'good') ?? s.reasons[0]
    why.push(`${g.name}${reason ? `: ${reason.text}` : ''}`)
  }
  value += o.unknown_gifts.length * W.unknownGift
  if (o.cost) {
    value += o.cost * W.cost
    why.push(o.cost > 0 ? `${o.cost} Cost` : `Lose ${-o.cost} Cost`)
  }
  const t = o.text
  if (/heal/i.test(t)) value += W.heal
  if (/gain \d+ Levels?/i.test(t)) { value += W.levels; why.push('Levels for your deployed units') }
  if (o.hurts) {
    const all = /All (?:Allies|Deployed|Identities|Sinners)|Identities without|Allies without|Other Identities/i.test(t)
    value -= all ? W.hurtAll : W.hurtOne
    why.push(all ? 'Hurts your whole team' : 'Hurts one unit')
  }
  if (o.lasting && o.hurts) { value -= W.lasting; why.push('Leaves a lasting penalty') }
  if (o.combat) { value -= W.fight; why.push('A fight') }
  if (o.weakens) { value += W.bossWeaken; why.push('Weakens the boss (it loses a passive)') }
  // "Spiral of Contempt's Slash Resistance becomes 1.5": worth as much as your team hits with Slash.
  const weak = t.match(/\b(Slash|Pierce|Blunt) Resistance becomes (\d+(?:\.\d+)?)/i)
  if (weak && Number(weak[2]) > 1 && ctx.profile.attackKnown) {
    const type = weak[1][0].toUpperCase() + weak[1].slice(1).toLowerCase()
    const n = ctx.profile.attackCounts.get(type) ?? 0
    value += W.bossWeaken * n / ctx.profile.attackKnown
    why.push(`Makes the boss weak to ${type} (${n}/${ctx.profile.attackKnown} of your team use ${type} skills)`)
  }
  return { value, why }
}

/** P(base + heads x coinPower + bonus >= need), heads ~ Binomial(coins, 0.5). */
export function rollChance(base: number, coinPower: number, coins: number, need: number): number {
  let p = 0
  let comb = 1
  for (let h = 0; h <= coins; h++) {
    if (h > 0) comb = (comb * (coins - h + 1)) / h
    if (base + h * coinPower >= need) p += comb / 2 ** coins
  }
  return p
}

const fold = (s: string) => s.toLowerCase().replace(/identities?|identity/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** The check bonus this identity gets ("+12 for Limbus Company Identities"). */
function bonusFor(i: Identity, c: EventCheck): number {
  let bonus = 0
  for (const b of c.bonuses) {
    const who = fold(b.who)
    if (!who) continue
    if ((i.traits ?? []).some((t) => fold(t) === who || fold(t).startsWith(who) || who.startsWith(fold(t)))) bonus += b.mod
    else if (fold(i.name).includes(who)) bonus += b.mod
  }
  return bonus
}

export interface CheckOdds {
  /** Chance with the best sinner to send (0-1), or 0.5 for a check with no sins (luck). */
  chance: number
  best: Identity | null
  /** Your units with a skill of a checked sin. */
  withSin: Identity[]
  luck: boolean
}

export function checkOdds(c: EventCheck, team: Identity[]): CheckOdds {
  if (!c.sins.length || c.adv === null) return { chance: 0.5, best: null, withSin: [], luck: true }
  let chance = 0
  let best: Identity | null = null
  const withSin: Identity[] = []
  for (const i of team) {
    const skills = (i.skills ?? []).filter((s) => s.base !== null)
    // "sin1=All" (Spiral of Contempt's gaze): any skill counts as the checked sin.
    const sinSkills = skills.filter((s) => s.sin && (c.sins.includes(s.sin) || (c.sins as string[]).includes('all')))
    if (sinSkills.length) withSin.push(i)
    const bonus = bonusFor(i, c)
    const rolls = [
      ...sinSkills.map((s) => rollChance((s.base ?? 0) + bonus, Math.max(0, s.coin_power ?? 0), s.coins ?? 1, c.adv!)),
      ...skills.map((s) => rollChance((s.base ?? 0) + bonus, Math.max(0, s.coin_power ?? 0), s.coins ?? 1, c.disadv ?? c.adv! * 2)),
    ]
    const p = Math.max(0, ...rolls)
    if (p > chance) { chance = p; best = i }
  }
  return { chance, best, withSin, luck: false }
}

export interface ChoiceAdvice {
  choice: EventChoice
  value: number
  odds: CheckOdds | null
  why: string[]
  /** For a choice that leads to more choices: the best follow-up. */
  then: ChoiceAdvice[]
  /** "best" | "ok" | "avoid" */
  verdict: 'best' | 'ok' | 'avoid'
  /** Results the wiki doesn't spell out (a step we can't read). */
  unclear: boolean
}

/** Odds of the pass side of a follow-up roll. */
export function followUpChance(t: EventFollowUp, team: Identity[]): number {
  return t.check ? checkOdds(t.check, team).chance : t.chance ?? 0.5
}

/** An outcome's value including its follow-up roll (not a retry: adviseChoice handles those). */
export function resolvedValue(o: EventOutcome | undefined, ctx: RunContext, team: Identity[]): Valued {
  const base = outcomeValue(o, ctx)
  const t = o?.then
  if (!t || t.retry) return base
  const p = followUpChance(t, team)
  const pass = resolvedValue(t.pass, ctx, team)
  const fail = resolvedValue(t.fail, ctx, team)
  const pct = Math.round(p * 100)
  return {
    value: base.value + p * pass.value + (1 - p) * fail.value,
    why: [...base.why, ...pass.why.map((w) => `${pct}%: ${w}`), ...fail.why.map((w) => `${100 - pct}%: ${w}`)],
  }
}

/** Is any part of this result missing on the wiki? */
function unclearOutcome(o: EventOutcome | undefined): boolean {
  if (!o) return true
  if (o.then) return unclearOutcome(o.then.pass) || unclearOutcome(o.then.fail)
  return !o.text
}

export function adviseChoice(c: EventChoice, ctx: RunContext, team: Identity[]): Omit<ChoiceAdvice, 'verdict'> {
  const then = (c.next ?? []).map((n) => adviseChoice(n, ctx, team)).sort((a, b) => b.value - a.value)
    .map((a, k) => ({ ...a, verdict: (k === 0 ? 'best' : 'ok') as ChoiceAdvice['verdict'] }))
  const own = (o: EventOutcome | undefined) => resolvedValue(o, ctx, team)
  let value: number
  let why: string[]
  let odds: CheckOdds | null = null
  let unclear = false
  if (c.check) {
    odds = checkOdds(c.check, team)
    const pass = own(c.pass)
    const retry = c.fail?.then?.retry ? c.fail.then : null
    if (retry) {
      // Failing lets you try again (taking retry.pass's small hit) until you run out of tries.
      const q = 1 - odds.chance
      const hit = own(retry.pass)
      const out = own(retry.fail)
      const qN = q ** RETRY_TRIES
      let retries = 0
      for (let k = 1; k < RETRY_TRIES; k++) retries += q ** k
      value = (1 - qN) * pass.value + qN * out.value + retries * hit.value
      why = [...pass.why.map((w) => `Pass: ${w}`),
        `Fail: you can try again (${retry.condition || `up to ${RETRY_TRIES} tries`}): about ${Math.round((1 - qN) * 100)}% to pass in the end`,
        ...out.why.filter((w) => !pass.why.includes(w)).map((w) => `Out of tries: ${w}`)]
      unclear = unclearOutcome(c.pass) || unclearOutcome(retry.pass) || unclearOutcome(retry.fail)
    } else {
      const fail = own(c.fail)
      value = odds.chance * pass.value + (1 - odds.chance) * fail.value
      why = [...pass.why.map((w) => `Pass: ${w}`), ...fail.why.filter((w) => !pass.why.includes(w)).map((w) => `Fail: ${w}`)]
      unclear = unclearOutcome(c.pass) || unclearOutcome(c.fail)
    }
  } else {
    const r = own(c.result)
    value = r.value
    why = r.why
    unclear = !c.result?.text && !then.length
  }
  if (then.length) {
    value += then[0].value
    why = [...why, `Then: ${then[0].choice.label}`]
  }
  return { choice: c, value, odds, why, then, unclear }
}

/** Every choice of one version of the event, best first, with a verdict. */
export function adviseVariant(v: EventVariant, ctx: RunContext, team: Identity[]): ChoiceAdvice[] {
  const raw = v.choices.map((c) => adviseChoice(c, ctx, team))
  const best = Math.max(...raw.map((r) => r.value))
  // Every choice worth the same (Hurtily's "Investigate" vs "Keep fighting" on paper): don't call one best.
  if (raw.length > 1 && raw.every((r) => Math.abs(r.value - best) < 0.01)) return raw.map((r) => ({ ...r, verdict: 'ok' as const }))
  return raw
    .map((r) => ({
      ...r,
      verdict: (r.value === best ? 'best' : r.value < best - EVENT_WEIGHTS.avoidGap ? 'avoid' : 'ok') as ChoiceAdvice['verdict'],
    }))
}

/** Events whose name, gifts or theme pack match a search. */
/** Lower case, plain quotes and apostrophes, single spaces: "We can’t…" matches "we can't". */
export function normText(s: string): string {
  return s.toLowerCase().replace(/[‘’`´'"“”]/g, '').replace(/[…]/g, '...')
    .replace(/[^a-z0-9?!.,:;()\-\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface EventHit {
  event: GameEvent
  /** What matched, best first: a choice ("Investigate the factory."), the event's name, a gift... */
  matched: string | null
  /** Lower is better: 0 a choice the event offers, 1 its name, 2 a gift, 3 its story or notes. */
  rank: number
}

function allChoices(cs: EventChoice[]): EventChoice[] {
  return cs.flatMap((c) => [c, ...allChoices(c.next ?? [])])
}

/**
 * Find the event you're in by what's on screen: one of its choices (the first option you see is
 * the quickest thing to type), its name, a gift it gives, or words from its story. Every word typed
 * has to appear; choices are matched before names and stories.
 */
export function findEvents(events: GameEvent[], q: string, giftName: (id: string) => string | undefined): EventHit[] {
  const words = normText(q).split(' ').filter(Boolean)
  if (!words.length) return events.map((event) => ({ event, matched: null, rank: 9 }))
  const has = (text: string) => { const t = normText(text); return words.every((w) => t.includes(w)) }
  const out: EventHit[] = []
  for (const e of events) {
    const choices = e.variants.flatMap((v) => allChoices(v.choices))
    const c = choices.find((x) => has(x.label)) ?? choices.find((x) => has(`${x.label} ${x.desc}`))
    if (c) { out.push({ event: e, matched: c.label, rank: 0 }); continue }
    if (has(e.name)) { out.push({ event: e, matched: null, rank: 1 }); continue }
    const g = e.gifts.map((id) => giftName(id) ?? '').find((n) => n && has(n))
    if (g) { out.push({ event: e, matched: g, rank: 2 }); continue }
    const v = e.variants.find((x) => has(`${x.name} ${x.story} ${x.note}`))
    if (v) out.push({ event: e, matched: null, rank: 3 })
  }
  return out.sort((a, b) => a.rank - b.rank || a.event.name.localeCompare(b.event.name))
}

export function searchEvents(events: GameEvent[], q: string, giftName: (id: string) => string | undefined): GameEvent[] {
  return findEvents(events, q, giftName).map((h) => h.event)
}

/** Events tied to a theme pack: its own events page, a version whose note names it, or its boss. */
export function eventsForPack(events: GameEvent[], pack: { id: string; name: string }): GameEvent[] {
  const p = pack.name.toLowerCase()
  return events.filter((e) => e.packs?.includes(pack.id) || (!e.boss && (e.pack === pack.id
    || e.name.toLowerCase().startsWith(p) || e.variants.some((v) => v.note.toLowerCase().includes(p)))))
}
