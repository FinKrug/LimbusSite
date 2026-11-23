/**
 * Save Cost or spend it? (Finley, 2026-11-23.)
 *
 * "On the earlier floors it is important to save Cost so that you can buy and refresh the shop to get
 * gifts that are exclusive to theme packs … Overall, we want to maximize super shops to get the most
 * amount of gifts, while also maximizing Cost to purchase the most amount of gifts." And: "On a run
 * that goes to 11-15, you would want to spend most of it before that range so that you do not get
 * wrecked by inflation and you can get the one or two things you need there. On 1-10 or 1-5 runs, you
 * want to have it all spent by the final floor since you cannot spend any Cost after the run ended."
 *
 * So each shop gets a bar: a buy (or upgrade, or swap) is worth its Cost now only if its value per
 * Cost (the shop overview's `ratio`, 1 = a typical good shop gift) beats what that Cost would buy on
 * a later floor. What it buys later: the best gifts you can still buy before the spend-by floor (the
 * main pool, and other theme packs' exclusive gifts, which their shops sell only on their floors),
 * times the chance you get to buy them (shops are random). The bar falls as the spend-by floor gets
 * close, and on that floor it's nearly 0: anything that helps.
 *
 * Super Shops (wiki, Shop Functions › Super Shops): Hard floors only; the chance of the next shop
 * being one starts at 3% and goes up 1% for every 20 Cost spent in shops, kept until a Super Shop
 * shows up (then back to 0). Moon Star-shop + / ++ add 10% / 25%. A Super Shop shows 7 gifts, has
 * 2 skill swaps + ID Skill Search and 5-slot fusion, so every Cost spent is also worth a little
 * toward the next one (`meterBonus`), as long as there's a shop after this one.
 */
import { isHiddenPack, intrinsicScore, packOnFloor, packPool, playedPacks, type GiftScore, type RunContext } from './scoring'
import { pricesFor } from './shopprices'
import type { Gift, ThemePack } from './types'
import { shopValue } from './upgrades'

export const SAVE = {
  /** A 15-floor run: spend most of it by this floor (adversities like Inflation come after). */
  extremeSpendBy: 10,
  /** Chance per floor of shops that one of the gifts you're saving for shows up when you have the Cost. */
  findPerFloor: 0.4,
  /** Another theme pack's exclusive gift: you only get its shop if the pack is offered and you pick it. */
  laterPackOdds: 0.5,
  /** How many of the best later gifts the saved Cost is for, per floor left. */
  perFloor: 3,
  /** The usual bar (a "Fair" buy) and the most a bar can be. */
  min: 0.35,
  /** Floors 11-14 of a 15-floor run: only the one or two things you need (a "Strong" buy). */
  lateBar: 0.9,
  /** The reserve for floors 11-15 is at most this share of your Cost: spend most of it by floor 10. */
  reserveShare: 0.3,
  max: 1.2,
  /** The spend-by floor: anything that helps at all. */
  lastFloorBar: 0.05,
  /** Super Shop chance: 1% per this much Cost spent (wiki), 3% to start. */
  superPer: 20,
  superBase: 3,
  /** A Super Shop over a regular one, in Cost (prerun.ts BUFF_VALUES.superShop). */
  superValue: 150,
  /** Cost to keep for floors 11-15 of a 15-floor run: about two good buys. */
  lateBuys: 2,
}

export type SaveStage = 'save' | 'last' | 'late'

export interface LaterGift {
  gift: Gift
  /** Value per Cost (1 = a typical good shop gift), at the price you'd pay. */
  ratio: number
  /** First floor its pack can be on, and the pack (null: the main pool, any floor). */
  floor: number | null
  pack: ThemePack | null
}

export interface SaveAdvice {
  stage: SaveStage
  /** A move needs this value per Cost (`ratio`) to be worth buying now. */
  bar: number
  /** The last floor to spend on: the run's last, or floor 10 of a 15-floor run. */
  spendBy: number
  /** Floors with shops after this one, up to `spendBy`. */
  floorsLeft: number
  /** What the saved Cost would buy later (average value per Cost), and the best of those gifts. */
  laterValue: number
  later: LaterGift[]
  /** Cost to hold back for the floors after `spendBy` (15-floor runs, on floor 10). */
  reserve: number
  /** Value per Cost every spend adds by raising the Super Shop chance (0 on Normal, or the last shop). */
  meterBonus: number
  /** The Super Shop chance you entered (%), and what the plan's spending would make it. */
  meter: number | null
}

/** The value per Cost of a gift at the price you'd pay, as the shop overview counts it. */
function ratioOf(g: Gift, ctx: RunContext, shop: number): number | null {
  const price = pricesFor(ctx).gift(g)
  if (!price || (g.tier ?? 9) > 4) return null
  return (intrinsicScore(g, ctx).score / Math.max(1, price) * 100) / (shop || 1)
}

export function saveAdvice(ctx: RunContext, ranked: GiftScore[], packsForGift: Map<string, ThemePack[]>,
  opts: { meter?: number | null } = {}): SaveAdvice {
  const run = ctx.run
  const floor = run.floor ?? 1
  const spendBy = run.floors >= 15 ? Math.min(SAVE.extremeSpendBy, run.floors) : run.floors
  const shop = shopValue(ctx)
  const hard = run.difficulty !== 'normal'
  const meter = opts.meter ?? null
  // Spending raises the next shop's Super Shop chance: worth this much per Cost, while there's a
  // next shop and the chance isn't already 100%.
  const meterBonus = hard && floor < run.floors && (meter === null || meter < 100) ? SAVE.superValue / (SAVE.superPer * 100) : 0
  const base = { spendBy, laterValue: 0, later: [] as LaterGift[], reserve: 0, meterBonus, meter }

  // Floors 11-15 of a 15-floor run: only what you really need, and on 15 whatever helps (the run ends).
  if (floor > spendBy) return { ...base, stage: 'late', bar: floor >= run.floors ? SAVE.lastFloorBar : SAVE.lateBar, floorsLeft: 0 }

  const floorsLeft = spendBy - floor
  // What's still to come: the main pool's best, and other packs' exclusives on the floors before spend-by.
  const played = playedPacks(run)
  const later: LaterGift[] = []
  for (const r of ranked) {
    const g = r.gift
    if (ctx.owned.has(g.id) || !(g.cost ?? 0)) continue
    const ratio = ratioOf(g, ctx, shop)
    if (ratio === null || ratio <= 0) continue
    if (g.pools.includes('main')) { later.push({ gift: g, ratio, floor: null, pack: null }); continue }
    const packs = (packsForGift.get(g.id) ?? []).filter((p) => !isHiddenPack(p) && !played.has(p.id) && p.id !== run.pack
      && packPool(p).includes(g.id))
    let first: { f: number; p: ThemePack } | null = null
    for (let f = floor + 1; f <= spendBy && !first; f++) {
      const p = packs.find((x) => packOnFloor(x, run.difficulty, f))
      if (p) first = { f, p }
    }
    if (first) later.push({ gift: g, ratio: ratio * SAVE.laterPackOdds, floor: first.f, pack: first.p })
  }
  later.sort((a, b) => b.ratio - a.ratio)

  // The 15-floor run's floor 10: keep enough for a couple of good buys on 11-15.
  const prices = pricesFor(ctx)
  const topPrices = later.filter((x) => !x.pack).slice(0, 6).map((x) => prices.gift(x.gift) ?? 0).sort((a, b) => a - b)
  const reserve = run.floors > spendBy && floorsLeft === 0
    ? Math.round(SAVE.lateBuys * (topPrices[topPrices.length >> 1] ?? 0) / 10) * 10 : 0

  if (floorsLeft <= 0) return { ...base, stage: 'last', bar: SAVE.lastFloorBar, floorsLeft: 0, reserve, later: later.filter((x) => x.pack).slice(0, 3) }

  const top = later.slice(0, Math.min(12, SAVE.perFloor * floorsLeft))
  const laterValue = top.length ? top.reduce((a, x) => a + x.ratio, 0) / top.length : 0
  const find = 1 - Math.pow(1 - SAVE.findPerFloor, floorsLeft)
  const bar = Math.min(SAVE.max, Math.max(SAVE.min, laterValue * find))
  return { ...base, stage: 'save', bar, floorsLeft, laterValue, later: later.filter((x) => x.pack).slice(0, 3) }
}

/** The Super Shop chance after spending `spent` Cost on top of `meter` %. */
export function meterAfter(meter: number, spent: number): number {
  return Math.min(100, meter + Math.floor(spent / SAVE.superPer))
}
