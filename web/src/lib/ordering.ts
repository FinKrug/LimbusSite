/**
 * Lineup suggestions: single moves ("Move Sinclair to #8") with the reason,
 * for you to accept or dismiss. Nothing is reordered automatically.
 *
 * Where suggestions come from, most specific first:
 *  1. Slot-limited gifts you own ("[Effects apply only to #1, #2 Deployed
 *     Identities]"): someone who can use the gift should sit in its slots.
 *  2. Player tips from src/data/order_tips.json: things the skill text doesn't
 *     spell out, like The Lord of Hongyuan's Exalted Command order or why You
 *     Branch Sinclair should be the first backup.
 *  3. Identity skills and passives that care about position (scraper/order.py):
 *     - it gains something when it substitutes in -> make it the first backup
 *     - an ally's passive rewards the unit that substitutes in -> put a unit
 *       that qualifies first on the bench
 *     - an effect aimed at the #1 / earliest-deployed ally with a condition
 *       (Slash skills, Tremor Burst, Ammo, a faction...) -> put a unit that
 *       meets it at #1
 *     - "allies with earlier Deployment order than this unit" -> move it
 *       behind the units it feeds
 * Position effects with no clear best unit are listed as info instead.
 *
 * As you pick up gifts or change identities, the suggestions update.
 */
import tipsJson from '../data/order_tips.json'
import { giftSlots, slotText } from './lineup'
import { strength, type TierOverrides } from './strength'
import { identityGiftFit } from './teambuilder'
import { CORE_KEYWORDS, type GameData, type Gift, type Identity, type OrderNote, type Sinner } from './types'

export interface LineupSuggestion {
  /** Stable id, so a dismissed suggestion stays dismissed. */
  id: string
  sinner: Sinner
  /** 0-based slot to move the sinner to. */
  to: number
  title: string
  reason: string
  /** Longer explanation, shown on request. */
  detail?: string
  /** The game text it's based on. */
  quote?: { text: string; from: string }
  source: 'gift' | 'identity' | 'tip'
}

export interface LineupInfo {
  id: string
  title: string
  quote: { text: string; from: string }
}

interface Tip {
  identity: string
  /** after_self: best `trait` units right after this one; first_backup: this one first on the bench. */
  kind: 'after_self' | 'first_backup'
  trait?: string
  count?: number
  tip: string
  why: string
  quote: string
  from: string
}
const TIPS = tipsJson as Tip[]

const slotName = (k: number, deployed: number) => (k === deployed ? `#${k + 1} (first backup)` : `#${k + 1}`)

/**
 * What the unit an order note affects must have: "using a Slash Skill", "triggers
 * Tremor Burst", "those using Ammo", "a Heishou Pack or a Jia Family unit".
 * Skill and keyword conditions all apply; affiliations are alternatives.
 * Returns null when the note names no condition.
 */
function noteCondition(text: string, traits: string[]): ((i: Identity) => boolean) | null {
  const all: ((i: Identity) => boolean)[] = []
  const atk = /\b(Slash|Pierce|Blunt)\s+(?:Attack\s+)?Skill/i.exec(text)
  if (atk) {
    const t = atk[1][0].toUpperCase() + atk[1].slice(1).toLowerCase()
    all.push((i) => (i.attack_types ?? []).includes(t as never))
  }
  for (const k of CORE_KEYWORDS) {
    const needs = new RegExp(
      `(?:trigger|triggers|have|has|using|gains?)\\s[^.]{0,30}\\b${k}\\b|\\b${k} Burst\\b|\\b${k} (?:Identity|Identities)\\b|Max ${k} Count`, 'i')
    if (needs.test(text)) all.push((i) => i.keywords.includes(k))
  }
  if (/\bAmmo\b/.test(text)) all.push((i) => i.status_effects.some((s) => /Ammo/.test(s)))
  const named: string[] = []
  for (const t of traits) {
    if (t.length > 4 && text.includes(t) && !named.some((n) => n.includes(t))) named.push(t)
  }
  if (!all.length && !named.length) return null
  return (i) => all.every((c) => c(i)) && (!named.length || named.some((t) => (i.traits ?? []).includes(t)))
}

function allTraits(identities: Identity[]): string[] {
  return [...new Set(identities.flatMap((i) => i.traits ?? []))].sort((a, b) => b.length - a.length)
}

export function lineupSuggestions(
  data: GameData, lineup: Identity[], deployed: number, owned: Iterable<string>, tiers: TierOverrides = {},
): { suggestions: LineupSuggestion[]; info: LineupInfo[] } {
  const ownedSet = new Set(owned)
  const out: LineupSuggestion[] = []
  const info: LineupInfo[] = []
  const n = lineup.length
  if (!n) return { suggestions: out, info }
  const dep = Math.min(deployed, n)
  const pos = new Map(lineup.map((i, k) => [i.sinner, k]))
  const power = (i: Identity) => strength(i, tiers)
  const traits = allTraits(data.identities)
  const usedSinners = new Set<Sinner>()
  const usedSlots = new Set<number>()
  const push = (s: LineupSuggestion) => {
    if (usedSinners.has(s.sinner) || usedSlots.has(s.to)) return
    usedSinners.add(s.sinner)
    usedSlots.add(s.to)
    if (pos.get(s.sinner) === s.to) return // already there: nothing to suggest, but the slot is taken
    out.push(s)
  }
  /** A rule that's already met keeps its unit and slot, so later rules don't undo it. */
  const keep = (i: Identity) => {
    usedSinners.add(i.sinner)
    usedSlots.add(pos.get(i.sinner)!)
  }

  // 1. Slot-limited gifts you own, best tier first.
  const giftsById = new Map(data.gifts.map((g) => [g.id, g]))
  const slotGifts = [...ownedSet].map((id) => giftsById.get(id)).filter((g): g is Gift => !!g && !!giftSlots(g))
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || Number(giftSlots(b)!.whole) - Number(giftSlots(a)!.whole))
  for (const g of slotGifts) {
    const { slots } = giftSlots(g)!
    const inRange = slots.map((s) => s - 1).filter((k) => k < dep)
    if (!inRange.length) continue
    const fit = (i: Identity) => identityGiftFit(g, i, data.identities)
    const holders = inRange.filter((k) => k < n).map((k) => ({ k, i: lineup[k], f: fit(lineup[k]) }))
    for (const h of holders) if (h.f.fit >= 0.6 && !usedSinners.has(h.i.sinner)) keep(h.i)
    const worst = holders.filter((h) => !usedSlots.has(h.k)).sort((a, b) => a.f.fit - b.f.fit)[0]
    if (!worst || worst.f.fit >= 0.6) continue
    const candidates = lineup
      .filter((i, k) => !inRange.includes(k) && !usedSinners.has(i.sinner))
      .map((i) => ({ i, f: fit(i) }))
      .filter((c) => c.f.fit >= 0.8 && c.f.fit > worst.f.fit + 0.3)
      .sort((a, b) => b.f.fit - a.f.fit || power(b.i) - power(a.i))
    const best = candidates[0]
    if (!best) continue
    push({
      id: `gift:${g.id}:${best.i.sinner}`, sinner: best.i.sinner, to: worst.k, source: 'gift',
      title: `Move ${best.i.sinner} to ${slotName(worst.k, dep)}`,
      reason: `Your ${g.name} only works for ${slotText(slots)}, and ${best.i.sinner} can use it` +
        `${best.f.why ? ` (${best.f.why})` : ''}` +
        `${worst.f.fit < 0.3 ? `. ${worst.i.sinner} in ${slotName(worst.k, dep)} gets little from it` : ''}.`,
      quote: { text: g.effect.split('\n').filter(Boolean).slice(0, 2).join(' '), from: g.name },
    })
  }

  const notesOf = (i: Identity) => i.order_notes ?? []
  const deployedIds = lineup.slice(0, dep)

  // 2. Player tips: specific knowledge beats the generic rules below.
  for (const tip of TIPS) {
    if (tip.kind === 'first_backup') {
      const unit = lineup.find((i) => i.id === tip.identity)
      if (!unit || n <= dep) continue
      const deployedNow = (pos.get(unit.sinner) ?? 0) < dep
      push({
        id: `tip:${tip.identity}:bench`, sinner: unit.sinner, to: dep, source: 'tip',
        title: `Make ${unit.sinner} the first backup (#${dep + 1})`,
        reason: `${tip.tip}${deployedNow ? ' This takes them out of the starting lineup.' : ''}`, detail: tip.why,
        quote: { text: tip.quote, from: tip.from },
      })
      continue
    }
    const lord = deployedIds.find((i) => i.id === tip.identity)
    if (!lord) continue
    const k = pos.get(lord.sinner)!
    const members = deployedIds.filter((i) => i !== lord && (i.traits ?? []).includes(tip.trait!))
      .sort((a, b) => power(b) - power(a)).slice(0, tip.count ?? 1)
    if (!members.length) continue
    if (k + members.length >= dep) {
      // Not enough room after them: move the leader up.
      push({
        id: `tip:${tip.identity}:lead`, sinner: lord.sinner, to: 0, source: 'tip',
        title: `Move ${lord.sinner} to #1`, reason: tip.tip, detail: tip.why, quote: { text: tip.quote, from: tip.from },
      })
      continue
    }
    members.forEach((m, j) => {
      if (pos.get(m.sinner) !== k + 1 + j) {
        push({
          id: `tip:${tip.identity}:${m.sinner}`, sinner: m.sinner, to: k + 1 + j, source: 'tip',
          title: `Move ${m.sinner} to #${k + 2 + j}, right after ${lord.sinner}`,
          reason: tip.tip, detail: tip.why, quote: { text: tip.quote, from: tip.from },
        })
      }
    })
  }


  // 3a. Units that gain something when they substitute in: first on the bench.
  const benchStart = dep
  if (n > dep) {
    const subProviders = deployedIds.flatMap((p) => notesOf(p).filter((x) => x.kind === 'sub_ally').map((x) => ({ p, x })))
    const boosts = (i: Identity) => subProviders.filter(({ p, x }) => p !== i && (noteCondition(x.text, traits)?.(i) ?? false))
    // Only arrange the bench: benching a deployed unit is a bigger trade-off than
    // a bonus on substitution, so deployed ones are left alone.
    const subSelf = lineup.slice(benchStart)
      .map((i) => ({ i, note: notesOf(i).find((x) => x.kind === 'sub_self') }))
      .filter((x): x is { i: Identity; note: OrderNote } => !!x.note)
      .sort((a, b) => boosts(b.i).length - boosts(a.i).length || power(b.i) - power(a.i))
    let slot = benchStart
    for (const { i, note } of subSelf) {
      if (usedSinners.has(i.sinner)) continue
      while (usedSlots.has(slot)) slot++
      if (slot >= n) break
      const extra = boosts(i)[0]
      push({
        id: `sub:${i.id}:${slot}`, sinner: i.sinner, to: slot, source: 'identity',
        title: `Make ${i.sinner} ${slot === benchStart ? 'the first backup' : 'the next backup'} (#${slot + 1})`,
        reason: `${i.sinner}'s "${note.source}" pays off when they substitute in, and backups come in from the front of the bench.` +
          (extra ? ` ${extra.p.sinner}'s "${extra.x.source}" also rewards them for substituting in.` : ''),
        quote: { text: note.text, from: `${i.name}: ${note.source}` },
      })
      slot++
    }

    // 3b. A deployed unit rewards whoever substitutes in: bench a unit that qualifies first.
    for (const { p, x } of subProviders) {
      if (usedSlots.has(benchStart)) break
      const cond = noteCondition(x.text, traits)
      if (!cond) continue
      const first = lineup[benchStart]
      if (first && cond(first)) continue
      const pick = lineup.slice(benchStart).filter((i) => cond(i) && !usedSinners.has(i.sinner))
        .sort((a, b) => power(b) - power(a))[0]
      if (!pick) continue
      push({
        id: `subally:${p.id}:${pick.sinner}`, sinner: pick.sinner, to: benchStart, source: 'identity',
        title: `Make ${pick.sinner} the first backup (#${benchStart + 1})`,
        reason: `${p.sinner}'s "${x.source}" rewards allies that substitute in, and ${pick.sinner} qualifies. The first backup substitutes in first.`,
        quote: { text: x.text, from: `${p.name}: ${x.source}` },
      })
    }
  }

  // 3c. Effects aimed at the #1 (or #1–#2) ally, from deployed units.
  for (const p of deployedIds) {
    for (const x of notesOf(p)) {
      if (x.kind === 'first') {
        const cond = noteCondition(x.text, traits)
        const width = Math.min(x.n ?? 1, dep)
        const current = deployedIds.slice(0, width)
        if (cond) {
          if (current.every(cond)) {
            current.forEach(keep)
            continue
          }
          const pick = deployedIds.slice(width).filter((i) => cond(i) && !usedSinners.has(i.sinner))
            .sort((a, b) => power(b) - power(a))[0]
          const to = current.findIndex((i) => !cond(i))
          if (pick && to >= 0) {
            push({
              id: `first:${p.id}:${x.source}:${pick.sinner}`, sinner: pick.sinner, to, source: 'identity',
              title: `Move ${pick.sinner} to #${to + 1}`,
              reason: `${p.sinner}'s "${x.source}" affects the ${width > 1 ? `first ${width} deployed allies` : 'first deployed ally'}, and ${pick.sinner} meets its condition${current[to] ? ` (${current[to].sinner} doesn't)` : ''}.`,
              quote: { text: x.text, from: `${p.name}: ${x.source}` },
            })
            continue
          }
        }
        info.push({
          id: `info:${p.id}:${x.source}:first`,
          title: `${p.sinner}'s "${x.source}" affects your #1${width > 1 ? `–#${width}` : ''} (now ${current.map((i) => i.sinner).join(', ')})`,
          quote: { text: x.text, from: p.name },
        })
      } else if (x.kind === 'before_self') {
        const k = pos.get(p.sinner)!
        const fed = deployedIds.filter((i, j) => j > k && i !== p && i.keywords.some((kw) => x.text.includes(kw)))
        if (fed.length && k < dep - 1) {
          push({
            id: `before:${p.id}`, sinner: p.sinner, to: dep - 1, source: 'identity',
            title: `Move ${p.sinner} to #${dep}`,
            reason: `${p.sinner}'s "${x.source}" helps allies deployed before them, and ${fed.map((i) => i.sinner).join(', ')} ${fed.length > 1 ? 'are' : 'is'} currently after.`,
            quote: { text: x.text, from: `${p.name}: ${x.source}` },
          })
        }
      } else if (x.kind === 'last' || x.kind === 'in_order') {
        info.push({
          id: `info:${p.id}:${x.source}:${x.kind}`,
          title: `${p.sinner}'s "${x.source}" ${x.kind === 'last' ? 'affects the ally deployed last' : 'affects allies in deployment order'}`,
          quote: { text: x.text, from: p.name },
        })
      }
    }
  }

  return { suggestions: out, info }
}

/** Move one sinner to a slot, shifting the others. */
export function moveTo(selection: Sinner[], sinner: Sinner, to: number): Sinner[] {
  const rest = selection.filter((s) => s !== sinner)
  rest.splice(Math.min(to, rest.length), 0, sinner)
  return rest
}
