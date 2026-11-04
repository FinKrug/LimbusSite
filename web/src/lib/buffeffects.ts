/**
 * What the Starlight buffs you took (Before the run) do during the run, where the site needs to know
 * (Finley: "I keep getting Faint Vestiges when I check the shop. If that's a Starlight buff, others
 * likely aren't accounted for in other spots"). Texts: starter_buffs.json.
 *
 * At a shop: Chance Comet's For Fuse or Sale only gift (a Vestige), Binary Star-shop's Cost from your
 * gifts' tiers, free refreshes (Star of the Beginning, Moon Star-shop), Cumulating Starcloud's better
 * first sale, Chance Comet's bonus gift from the first fusion. On entering a floor: Moon Star-shop's
 * Tier 1 gifts, Perfected Possibility's Vestiges, Chance Comet's Tier 3 / 4 gifts. Before the shop:
 * the starting Cost (Star of the Beginning, Star-shower). Cumulating Starcloud's Cost to keep is in
 * costkeep.ts.
 */
import { VESTIGE_BY_TIER } from './vestiges'

export type Buffs = Record<string, number>
const lv = (b: Buffs, id: string) => b[id] ?? 0
const plus = (n: number) => '+'.repeat(Math.max(0, n - 1))

/** Cost you start a run with: 200, + Star of the Beginning, + Star-shower. */
export function startingCost(b: Buffs): number {
  return 200 + ([0, 150, 250, 250][lv(b, 'star-of-the-beginning')] ?? 0) + ([0, 400, 500, 700][lv(b, 'star-shower')] ?? 0)
}

/** Free normal refreshes at each shop (Star of the Beginning: 1, 1, 2). */
export function freeRefreshes(b: Buffs): number {
  return [0, 1, 1, 2][lv(b, 'star-of-the-beginning')] ?? 0
}

/** Free keyword refreshes at each shop (Moon Star-shop: 1, 1, 2). */
export function freeKeywordRefreshes(b: Buffs): number {
  return [0, 1, 1, 2][lv(b, 'moon-star-shop')] ?? 0
}

/** Binary Star-shop + / ++: Cost on entering a shop, the Tier numbers of the gifts you own added up (max 75 / 150). */
export function shopTierCost(b: Buffs, tiers: number[]): { cost: number; sum: number; cap: number } | null {
  const cap = [0, 0, 75, 150][lv(b, 'binary-star-shop')] ?? 0
  if (!cap) return null
  const sum = tiers.reduce((a, t) => a + t, 0)
  return { cost: Math.min(cap, sum), sum, cap }
}

/** Chance Comet: the tiers of the For Fuse or Sale only gift (a Vestige) you get on entering a shop. */
export function shopVestigeTiers(b: Buffs, floor: number): number[] {
  const l = lv(b, 'chance-comet')
  if (l === 1) return [1, 2, 3]
  if (l === 2) return floor >= 6 ? [2, 3] : [1, 2, 3]
  if (l === 3) return floor >= 6 ? [3, 4] : [2, 3]
  return []
}

/** Cumulating Starcloud: your first sale at each shop sells for this much more (0.5 / 0.75 / 1). */
export function saleBonus(b: Buffs): number {
  return [0, 0.5, 0.75, 1][lv(b, 'cumulating-starcloud')] ?? 0
}

/** Chance Comet: the first fusion at each shop into a Tier 3+ gift also gives a gift this many tiers below it. */
export function fusionBonusTiers(b: Buffs): number | null {
  const l = lv(b, 'chance-comet')
  return l ? (l === 3 ? 1 : 2) : null
}

export interface BuffNote {
  /** The buff, with its level ("Chance Comet+"). */
  buff: string
  text: string
  /** Vestiges you might have got from it (one of them), to add with a click. */
  vestiges?: string[]
  /** Vestiges you got, all of them. */
  allVestiges?: string[]
}

const name = (b: Buffs, id: string, n: string) => `${n}${plus(lv(b, id))}`

/** What your buffs did at this shop, and what to keep in mind there. */
export function shopNotes(b: Buffs, floor: number, ownedTiers: number[]): BuffNote[] {
  const out: BuffNote[] = []
  const vt = shopVestigeTiers(b, floor)
  if (vt.length) {
    out.push({ buff: name(b, 'chance-comet', 'Chance Comet'), vestiges: vt.map((t) => VESTIGE_BY_TIER[t]),
      text: `Entering this shop gave you a For Fuse or Sale only gift: a Vestige of Tier ${vt.map(roman).join(', ')}. Add the one you got:` })
  }
  const bin = shopTierCost(b, ownedTiers)
  if (bin) {
    out.push({ buff: name(b, 'binary-star-shop', 'Binary Star-shop'), text: bin.sum >= bin.cap
      ? `Entering a shop gives you ${bin.cap} Cost (your gifts' tiers add up to ${bin.sum}, max ${bin.cap}). You're over the max, so selling or fusing costs you nothing there.`
      : `Entering a shop gives you ${bin.cost} Cost: your gifts' tiers add up to ${bin.sum} (max ${bin.cap}). Every tier you sell or fuse away is 1 Cost less at the next shop; more gifts, more Cost.` })
  }
  const free = freeRefreshes(b)
  const kw = freeKeywordRefreshes(b)
  if (free || kw) {
    out.push({ buff: [free && name(b, 'star-of-the-beginning', 'Star of the Beginning'), kw && name(b, 'moon-star-shop', 'Moon Star-shop')].filter(Boolean).join(', '),
      text: `Free here: ${[free && `${free} normal refresh${free > 1 ? 'es' : ''}`, kw && `${kw} keyword refresh${kw > 1 ? 'es' : ''}`].filter(Boolean).join(' and ')}. Use them before paying for one.` })
  }
  const sale = saleBonus(b)
  if (sale) {
    out.push({ buff: name(b, 'cumulating-starcloud', 'Cumulating Starcloud'),
      text: `Your first sale here sells for ${Math.round(sale * 100)}% more: if you're selling, sell your priciest spare gift first.` })
  }
  const fb = fusionBonusTiers(b)
  if (fb) {
    out.push({ buff: name(b, 'chance-comet', 'Chance Comet'),
      text: `Your first fusion here into a Tier III+ gift also gives a random gift ${fb} tier${fb > 1 ? 's' : ''} below it: add it after fusing.` })
  }
  return out
}

/** What your buffs gave you on entering this floor (and, on floor 1, at the start of the run). */
export function floorNotes(b: Buffs, floor: number, keyword: string | null): BuffNote[] {
  const out: BuffNote[] = []
  const kwText = keyword ? `${keyword} ` : ''
  if (floor === 1) {
    const pp = lv(b, 'perfected-possibility')
    if (pp) {
      const v = ['dark-vestige', 'faint-vestige', 'twinkling-vestige'].slice(0, pp)
      out.push({ buff: name(b, 'perfected-possibility', 'Perfected Possibility'), allVestiges: v,
        text: `At the start you got ${pp} random Tier III ${kwText}gift${pp > 1 ? 's' : ''} (add ${pp > 1 ? 'them' : 'it'} in the Got a gift? box) and ${v.length === 1 ? 'a Dark Vestige' : v.length === 2 ? 'a Dark and a Faint Vestige' : 'a Dark, a Faint and a Twinkling Vestige'}.` })
    }
    const moon = lv(b, 'moon-star-shop')
    if (moon) {
      out.push({ buff: name(b, 'moon-star-shop', 'Moon Star-shop'),
        text: `Floor 1 gave you ${moon} random Tier I gift${moon > 1 ? 's' : ''}: add ${moon > 1 ? 'them' : 'it'} in the Got a gift? box.` })
    }
  }
  const cc = lv(b, 'chance-comet')
  const ccFloors = cc === 1 ? [3] : cc === 2 ? [3, 5] : cc === 3 ? [3, 5, 7] : []
  if (ccFloors.includes(floor)) {
    out.push({ buff: name(b, 'chance-comet', 'Chance Comet'),
      text: `Entering floor ${floor} gave you a ${cc === 1 ? 'random Tier III gift' : cc === 2 ? `Tier III ${kwText}gift` : `random Tier IV ${kwText}gift`}: add it in the Got a gift? box.` })
  }
  return out
}

function roman(t: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][t] ?? String(t)
}
