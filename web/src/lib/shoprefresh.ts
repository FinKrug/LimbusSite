/**
 * Shop refreshes (Finley, 2026-11-15: "don't forget about shop refreshes. Sometimes the first few
 * won't have the gift you are looking for … there are 2 different types of shop refreshes").
 *
 * Wiki (Mirror Dungeon > Shop Functions):
 *  - A regular shop shows 4 E.G.O gifts (a Super Shop 7); Star of the Beginning and Binary
 *    Star-shop each add 1. It never shows gifts you have.
 *  - Refresh: 15 Cost, +15 for each refresh. New gifts, and a new Sinner for Skill Replacement
 *    (a regular shop offers it for 1 Sinner, a Super Shop for 2).
 *  - Keyword Refresh: 90 Cost, +15 for each refresh (the count is shared with Refresh). The same,
 *    but you pick a keyword the new gifts are more likely to have.
 *  - Free ones: Star of the Beginning (normal: 1, 1, 2), Moon Star-shop (keyword: 1, 1, 2).
 *
 * Not published, so estimated (REFRESH below): how strongly a keyword refresh leans (each gift
 * slot is taken to be the chosen keyword's `keywordShare` of the time), and whether free refreshes
 * raise the price of the paid ones (taken as no). Gifts are drawn evenly from what the shop can sell
 * (the game's tier odds per floor aren't published either).
 *
 * What a refresh is worth: each new roll can turn up a buy, or a Sinner to swap, that beats what you
 * can do for sure with the Cost (`fallback`: the best upgrade, or keeping the Cost for the next
 * floor). The expected gain, in the overview's units (value per Cost × Cost, 1 = a typical good shop
 * gift), is weighed against what the refresh's own Cost would do at the fallback rate. Paid refreshes
 * are suggested while the gain is bigger, the kind with the most gain per Cost first, and while
 * there's still Cost left to buy what turns up.
 */
import type { Buffs } from './buffeffects'
import { freeKeywordRefreshes, freeRefreshes } from './buffeffects'
import { shopBuys } from './shopadvice'
import type { ShopMove } from './shopoverview'
import { shopValue } from './upgrades'
import type { GiftScore, RunContext } from './scoring'
import { CORE_KEYWORDS, type Gift } from './types'
import { LIST_PRICES, pricesFor, type ShopPrices } from './shopprices'

export const REFRESH = {
  first: 15,
  step: 15,
  keyword: 90,
  /** Sinners a regular shop's Skill Replacement can be for. */
  sinners: 12,
  /** Estimate: share of a keyword refresh's gift slots that are the chosen keyword. */
  keywordShare: 0.6,
  /** Keeping Cost for the next floor's shop is worth about this much per Cost (an upgrade's "Good"). */
  save: 0.6,
  /** Paid refreshes looked at, at most. */
  maxPaid: 8,
}

export type RefreshKind = 'normal' | 'keyword'

export interface RefreshStep {
  kind: RefreshKind
  price: number
  free: boolean
  /** Chance this roll has a gift worth buying (better than the fallback). */
  giftChance: number
  /** Chance it offers Skill Replacement for a Sinner whose swap is worth it. */
  swapChance: number
  /** Expected gain, in the overview's units. */
  gain: number
}

export interface RefreshAdvice {
  /** Gifts the shop shows per roll, and how many it can pick from. */
  slots: number
  pool: number
  /** Buys that beat the fallback, best first. */
  wanted: { gift: Gift; ratio: number; price: number }[]
  fallback: number
  /** Chance one roll has at least one wanted gift / offers a wanted swap. */
  normal: { giftChance: number; swapChance: number }
  /** The best keyword to pick for a keyword refresh, and its chances. */
  keyword: { keyword: string; giftChance: number; swapChance: number } | null
  free: { normal: number; keyword: number }
  /** Free refreshes a shop gives with your buffs (before any are used). */
  freeTotal: { normal: number; keyword: number }
  /** What to do, in order: the free ones, then paid ones while they're worth it. */
  steps: RefreshStep[]
  /** The next paid refresh after the plan (where to stop), and why: not worth its price, or it
   *  would leave too little Cost to buy what turns up. */
  stop: RefreshStep | null
  stopReason: 'odds' | 'cost'
}

export function shopSlots(b: Buffs, superShop: boolean): number {
  return (superShop ? 7 : 4) + ((b['star-of-the-beginning'] ?? 0) > 0 ? 1 : 0) + ((b['binary-star-shop'] ?? 0) > 0 ? 1 : 0)
}

/** Price of the next refresh after `paid` paid ones (the +15 count is shared by both kinds), with
 *  Pre-order Discount's 30% off normal ones when you have it. */
export function refreshPrice(kind: RefreshKind, paid: number, prices: ShopPrices = LIST_PRICES): number {
  return prices.refresh(kind, (kind === 'keyword' ? REFRESH.keyword : REFRESH.first) + REFRESH.step * paid)
}

/** Chance at least one of `wanted` of `pool` shows up in `slots` slots drawn without repeats. */
export function atLeastOne(pool: number, wanted: number, slots: number): number {
  if (wanted <= 0 || pool <= 0) return 0
  if (slots >= pool - wanted + 1) return 1
  let miss = 1
  for (let i = 0; i < slots; i++) miss *= (pool - wanted - i) / (pool - i)
  return 1 - miss
}

export function refreshAdvice(
  ctx: RunContext, ranked: GiftScore[], availableNow: Set<string>, moves: ShopMove[],
  opts: {
    buffs?: Buffs; superShop?: boolean; cost?: number | null
    /** Paid refreshes already done at this shop (prices go on from there; free ones were used first). */
    paidDone?: number
    /** Free refreshes already used at this shop (Finley, 2026-11-19: say which free ones you used). */
    freeUsed?: { normal: number; keyword: number }
  } = {},
): RefreshAdvice {
  const buffs = opts.buffs ?? {}
  const superShop = !!opts.superShop
  const slots = shopSlots(buffs, superShop)
  const sellable = shopBuys(ctx, ranked, availableNow, shopValue(ctx), Infinity)
  const pool = sellable.length
  // What the Cost does for sure: the best upgrade, or keeping it for the next floor.
  const sure = Math.max(0, ...moves.filter((m) => !m.chance).map((m) => m.ratio))
  const fallback = Math.max(sure, REFRESH.save)
  const wanted = sellable.filter((b) => b.ratio > fallback).sort((a, b) => b.ratio - a.ratio)
  // What buying it adds over spending its price at the fallback rate (at the price you pay).
  const surplus = (b: { price: number; ratio: number }) => (b.ratio - fallback) * b.price / 100
  const prices = pricesFor(ctx)
  const swaps = moves.filter((m) => m.kind === 'swap' && m.ratio > fallback)
  const sinnersOffered = superShop ? 2 : 1
  const swapChance = Math.min(1, swaps.length * sinnersOffered / REFRESH.sinners)
  // A swap that shows up: any of them, equally likely.
  const swapGain = swaps.length ? swapChance * swaps.reduce((a, m) => a + (m.ratio - fallback) * m.cost / 100, 0) / swaps.length : 0

  // Per-slot chance of each wanted gift, normal and keyword (k).
  const byKeyword = new Map<string, number>()
  for (const b of sellable) if (b.gift.keyword) byKeyword.set(b.gift.keyword, (byKeyword.get(b.gift.keyword) ?? 0) + 1)
  const slotChance = (g: Gift, k: string | null) => {
    if (!k) return 1 / pool
    const nK = byKeyword.get(k) ?? 0
    return (g.keyword === k && nK ? REFRESH.keywordShare / nK : 0) + (1 - (nK ? REFRESH.keywordShare : 0)) / pool
  }
  // You buy the best that shows up (Cost runs out fast), so a roll is worth its best wanted gift:
  // the chance each one is the best on offer, times what it adds.
  const bySurplus = [...wanted].sort((a, b) => surplus(b) - surplus(a))
  const rollGain = (k: string | null) => {
    let none = 1
    let gain = 0
    for (const b of bySurplus) {
      const p = Math.min(1, slots * slotChance(b.gift, k))
      gain += none * p * surplus(b)
      none *= 1 - p
    }
    return gain
  }
  const rollChance = (k: string | null) => {
    if (!k) return atLeastOne(pool, wanted.length, slots)
    const p = wanted.reduce((a, b) => a + slotChance(b.gift, k), 0) // chance a slot is a wanted gift
    return 1 - Math.pow(1 - Math.min(1, p), slots)
  }
  const normal = { giftChance: rollChance(null), swapChance }
  const normalGain = rollGain(null) + swapGain
  const keywords = [...new Set([...CORE_KEYWORDS, ...byKeyword.keys()])].filter((k) => byKeyword.has(k))
  let keyword: RefreshAdvice['keyword'] = null
  let keywordGain = 0
  for (const k of keywords) {
    const g = rollGain(k) + swapGain
    if (g > keywordGain) { keywordGain = g; keyword = { keyword: k, giftChance: rollChance(k), swapChance } }
  }

  const done = opts.paidDone ?? 0
  const freeTotal = { normal: freeRefreshes(buffs), keyword: freeKeywordRefreshes(buffs) }
  const used = opts.freeUsed ?? { normal: 0, keyword: 0 }
  // Free ones left: what the buffs give less what you've used. Paid ones recorded without marking
  // the free ones: they came after the free ones, so those are gone.
  const free = done && !opts.freeUsed ? { normal: 0, keyword: 0 }
    : { normal: Math.max(0, freeTotal.normal - used.normal), keyword: Math.max(0, freeTotal.keyword - used.keyword) }
  const steps: RefreshStep[] = []
  const step = (kind: RefreshKind, price: number, isFree: boolean): RefreshStep => kind === 'keyword' && keyword
    ? { kind, price, free: isFree, giftChance: keyword.giftChance, swapChance, gain: keywordGain }
    : { kind: 'normal', price, free: isFree, giftChance: normal.giftChance, swapChance, gain: normalGain }
  // Free ones first; a keyword one before a normal one when you're after keyword gifts.
  const freeKw = keyword ? Array.from({ length: free.keyword }, () => step('keyword', 0, true)) : []
  const freeNormal = Array.from({ length: free.normal }, () => step('normal', 0, true))
  if (normalGain > 0 || keywordGain > 0) steps.push(...(keywordGain >= normalGain ? [...freeKw, ...freeNormal] : [...freeNormal, ...freeKw]))
  // Paid ones: every order of normal and keyword refreshes (the +15 count is shared, so doing
  // normal ones first makes a later keyword one dearer), each cut where it's worth the most.
  // A refresh only matters if nothing good has turned up yet, so each step counts for the chance
  // that the ones before it all missed. Only while there's still Cost to buy what turns up.
  const cheapest = Math.min(...wanted.map((b) => b.price), ...swaps.map((m) => m.cost))
  const budget = opts.cost ?? Infinity
  const hit = (x: RefreshStep) => 1 - (1 - x.giftChance) * (1 - x.swapChance)
  let missFree = 1
  for (const x of steps) missFree *= 1 - hit(x)
  const kinds: RefreshKind[] = keyword ? ['normal', 'keyword'] : ['normal']
  let bestPlan: RefreshStep[] = []
  let bestValue = 0
  const n = REFRESH.maxPaid
  for (let mask = 0; mask < kinds.length ** n; mask++) {
    let miss = missFree
    let value = 0
    let spent = 0
    const seq: RefreshStep[] = []
    for (let i = 0; i < n; i++) {
      const kind = kinds[Math.floor(mask / kinds.length ** i) % kinds.length]
      const x = step(kind, refreshPrice(kind, done + i, prices), false)
      if (budget - spent - x.price < cheapest) break
      seq.push(x)
      spent += x.price
      value += miss * (x.gain - x.price / 100 * fallback)
      miss *= 1 - hit(x)
      if (value > bestValue + 1e-9) { bestValue = value; bestPlan = seq.slice() }
    }
  }
  steps.push(...bestPlan)
  // Where to stop: the next refresh after the plan, the cheaper kind.
  const after = done + bestPlan.length
  const next = [step('normal', refreshPrice('normal', after, prices), false), ...(keyword ? [step('keyword', refreshPrice('keyword', after, prices), false)] : [])]
  const stop = next.sort((a, b) => a.price - b.price)[0]
  const spentPaid = bestPlan.reduce((a, x) => a + x.price, 0)
  const stopReason: RefreshAdvice['stopReason'] = budget - spentPaid - stop.price < cheapest ? 'cost' : 'odds'
  return { slots, pool, wanted, fallback, normal, keyword, free, freeTotal, steps, stop, stopReason }
}
