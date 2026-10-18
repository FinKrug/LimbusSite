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
import { isGone, scoreGift, type RunContext } from './scoring'
import type { Identity, Sin } from './types'

export interface EventOutcome {
  text: string
  gifts: string[]
  unknown_gifts: string[]
  cost: number
  combat: boolean
  hurts: boolean
  lasting: boolean
  nothing: boolean
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
      value += W.duplicate
      why.push(`${g.name}: you already have it`)
      continue
    }
    if (isGone(ctx, id)) {
      why.push(`${g.name}: you can't get it any more (you have ${ctx.gone.get(id)})`)
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
    const all = /All (?:Allies|Deployed)|Identities without|Allies without|Other Identities/i.test(t)
    value -= all ? W.hurtAll : W.hurtOne
    why.push(all ? 'Hurts your whole team' : 'Hurts one unit')
  }
  if (o.lasting && o.hurts) { value -= W.lasting; why.push('Leaves a lasting penalty') }
  if (o.combat) { value -= W.fight; why.push('A fight') }
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
    const sinSkills = skills.filter((s) => s.sin && c.sins.includes(s.sin))
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

export function adviseChoice(c: EventChoice, ctx: RunContext, team: Identity[]): Omit<ChoiceAdvice, 'verdict'> {
  const then = (c.next ?? []).map((n) => adviseChoice(n, ctx, team)).sort((a, b) => b.value - a.value)
    .map((a, k) => ({ ...a, verdict: (k === 0 ? 'best' : 'ok') as ChoiceAdvice['verdict'] }))
  const own = (o: EventOutcome | undefined) => outcomeValue(o, ctx)
  let value: number
  let why: string[]
  let odds: CheckOdds | null = null
  let unclear = false
  if (c.check) {
    odds = checkOdds(c.check, team)
    const pass = own(c.pass)
    const fail = own(c.fail)
    value = odds.chance * pass.value + (1 - odds.chance) * fail.value
    why = [...pass.why.map((w) => `Pass: ${w}`), ...fail.why.filter((w) => !pass.why.includes(w)).map((w) => `Fail: ${w}`)]
    unclear = !c.pass?.text || !c.fail?.text
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
  return raw
    .map((r) => ({
      ...r,
      verdict: (r.value === best ? 'best' : r.value < best - EVENT_WEIGHTS.avoidGap ? 'avoid' : 'ok') as ChoiceAdvice['verdict'],
    }))
}

/** Events whose name, gifts or theme pack match a search. */
export function searchEvents(events: GameEvent[], q: string, giftName: (id: string) => string | undefined): GameEvent[] {
  const s = q.trim().toLowerCase()
  if (!s) return events
  return events.filter((e) => e.name.toLowerCase().includes(s)
    || e.gifts.some((id) => giftName(id)?.toLowerCase().includes(s))
    || e.variants.some((v) => v.note.toLowerCase().includes(s) || v.choices.some((c) => c.label.toLowerCase().includes(s))))
}

/** Events tied to a theme pack (their page or a version's note names it). */
export function eventsForPack(events: GameEvent[], packName: string): GameEvent[] {
  const p = packName.toLowerCase()
  return events.filter((e) => e.name.toLowerCase().startsWith(p) || e.variants.some((v) => v.note.toLowerCase().includes(p)))
}
