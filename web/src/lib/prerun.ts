/**
 * Before the run (Finley, 2026-10-27): the Starlight buffs to buy, the starting keyword and its
 * starting gifts, Perfected Possibility's Tier 3 picks and E.G.O Gift Search. From the wiki
 * (Mirror Dungeon > Starting E.G.O Gift Choice / E.G.O Gift Search; Mirror of Sisyphe > Starter Buffs):
 *
 *  - Starting gifts: pick a keyword (one of 10: the 7 statuses and 3 attack types), then take 1 of
 *    its 3 fixed Tier II gifts; Star-shower and Perfected Possibility each add one more choice.
 *    The keyword is "the selected Keyword" that Perfected Possibility and Chance Comet use.
 *  - Starter buffs ("Grace of the Star"): 10 listed, bought with Starlight, each enhanceable twice
 *    at the same price (starter_buffs.json). Leftover Starlight Bonus converts to Cost, 1 to 5.
 *  - E.G.O Gift Search: after the starting gifts, up to 3 gifts of Tier III or lower of your choice
 *    for 70 / 160 / 270 Starlight (the "Gift Search" picks: startgifts.ts).
 *
 * Buff advice: each level is valued in Cost (what it adds over the run, BUFF_VALUES: rough
 * estimates for things that aren't Cost, like Levels and refreshes), and is worth buying when that
 * beats what the Starlight would convert to (5 Cost each). Gift-related parts are valued for your
 * team: a gift's score / what 100 Cost buys in a shop (`shopValue`) x 100.
 */
import buffsJson from '../data/starter_buffs.json'
import { isGone, scoreGift, type GiftScore, type RunContext } from './scoring'
import type { StartPick } from './startgifts'
import type { Gift } from './types'
import { shopValue } from './upgrades'

export interface StarterBuff {
  id: string
  name: string
  /** Starlight per level (base, +, ++ all cost the same). */
  starlight: number
  /** Effect lines for base, + and ++. */
  levels: string[][]
}
export const BUFFS: StarterBuff[] = buffsJson as StarterBuff[]

/** Levels you took: 0 = not taken, 1 = base, 2 = +, 3 = ++. */
export type BuffLevels = Record<string, number>

export interface PreRunState {
  buffs: BuffLevels
  /** The starting keyword you picked (null: go with the advice). */
  keyword: string | null
  /** Starlight you can spend (null: not entered). */
  starlight: number | null
}
export const EMPTY_PRERUN: PreRunState = { buffs: {}, keyword: null, starlight: null }

/** Leftover Starlight Bonus converts to Cost at this rate: the bar a buff has to beat. */
export const COST_PER_STARLIGHT = 5
/** E.G.O Gift Search: Starlight for 1, 2 or 3 gifts. */
export const GIFT_SEARCH = [70, 160, 270]

export const START_KEYWORDS = ['Burn', 'Bleed', 'Tremor', 'Rupture', 'Sinking', 'Poise', 'Charge', 'Slash', 'Pierce', 'Blunt'] as const
export type StartKeyword = (typeof START_KEYWORDS)[number]
/** The 3 fixed Tier II starting gifts of each keyword (wiki: Starting E.G.O Gift Choice). */
export const STARTING_GIFTS: Record<StartKeyword, string[]> = {
  Burn: ['hellterfly-s-dream', 'fiery-down', 'pain-of-stifled-rage'],
  Bleed: ['wound-clerid', 'little-and-to-be-naughty-plushie', 'awe'],
  Tremor: ['oscillating-bracelet', 'reverberation', 'sour-liquor-aroma'],
  Rupture: ['barbed-lasso', 'fluorescent-lamp', 'smoking-gunpowder'],
  Sinking: ['red-order', 'melted-spring', 'grandeur'],
  Poise: ['cigarette-holder', 'stone-tomb', 'old-wooden-doll'],
  Charge: ['employee-card', 'portable-battery-socket', 'patrolling-flashlight'],
  Slash: ['dreaming-electric-sheep', 'short-cane-sword', 'resolution'],
  Pierce: ['gathering-skulls', 'plume-of-proof', 'torn-bandolier'],
  Blunt: ['today-s-expression', 'pocket-flashcards', 'temporal-bridle'],
}

/** How many starting gifts you take: 1, +1 with Star-shower, +1 with Perfected Possibility. */
export function startingChoices(buffs: BuffLevels): number {
  return 1 + Number((buffs['star-shower'] ?? 0) > 0) + Number((buffs['perfected-possibility'] ?? 0) > 0)
}
/** Tier 3 gifts of your keyword Perfected Possibility gives (1 / 2 / 3 by level). */
export function tier3Choices(buffs: BuffLevels): number {
  return buffs['perfected-possibility'] ?? 0
}

/** A gift's value for your team in Cost: its score / what 100 Cost buys in a shop x 100. */
export function costValue(score: number, shop: number): number {
  return shop > 0 ? Math.max(0, score) / shop * 100 : 0
}

// -- starting keyword ----------------------------------------------------------------------

export interface KeywordPlan {
  keyword: StartKeyword
  /** Its 3 starting gifts, best for your team first. */
  gifts: GiftScore[]
  /** The ones to take (as many as you have choices). */
  take: GiftScore[]
  /** Perfected Possibility's Tier 3 picks for this keyword, best first (as many as its level). */
  tier3: GiftScore[]
  /** Starting gifts + Tier 3 picks, in score. */
  value: number
  /** 0-100 against the best keyword. */
  rating: number
}

/** Tier 3 gifts you can pick for a keyword (Perfected Possibility), or the pool Chance Comet draws from. */
export function keywordTierGifts(ctx: RunContext, keyword: string, tier: number): Gift[] {
  const recipe = new Set(ctx.data.fusions.map((f) => f.result))
  return ctx.data.gifts.filter((g) => g.keyword === keyword && g.tier === tier && !g.fusion_recipe && !recipe.has(g.id)
    && !g.reward_only && !g.pools.includes('cursed') && !g.pools.includes('extreme') && !ctx.owned.has(g.id) && !isGone(ctx, g.id))
}

const scored = (g: Gift, ctx: RunContext): GiftScore => ({ ...scoreGift(g, ctx), rating: 0 })

/** The 10 starting keywords for your team, best first. */
export function rankStartKeywords(ctx: RunContext, picks: number, tier3: number): KeywordPlan[] {
  const plans = START_KEYWORDS.map((keyword) => {
    const gifts = STARTING_GIFTS[keyword].map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g)
      .map((g) => scored(g, ctx)).sort((a, b) => b.score - a.score)
    const take = gifts.filter((g) => !ctx.owned.has(g.gift.id)).slice(0, picks)
    const t3 = tier3 ? keywordTierGifts(ctx, keyword, 3).map((g) => scored(g, ctx)).sort((a, b) => b.score - a.score).slice(0, tier3) : []
    const value = [...take, ...t3].reduce((s, g) => s + Math.max(0, g.score), 0)
    return { keyword, gifts, take, tier3: t3, value, rating: 0 }
  })
  const max = Math.max(1e-9, ...plans.map((p) => p.value))
  return plans.map((p) => ({ ...p, rating: Math.round(p.value / max * 100) })).sort((a, b) => b.value - a.value)
}

// -- Starlight: buffs and Gift Search --------------------------------------------------------

/**
 * What the parts of a buff that aren't Cost are worth, in Cost (rough estimates; tune here).
 * "Per floor" values are multiplied by the run's floors (a shop and a pack choice on each).
 */
export const BUFF_VALUES = {
  /** One more theme pack to choose from, per floor. */
  packChoice: 8,
  /** One more theme pack refresh, per floor. */
  packRefresh: 4,
  /** One more gift on offer in each shop, per floor. */
  shopSlot: 10,
  /** A free normal shop refresh (the first costs 15), per floor. */
  refresh: 15,
  /** A free keyword refresh (90 Cost; you don't always want one), per floor. */
  keywordRefresh: 45,
  /** All Identities +1 Level. */
  level: 30,
  /** +1 Max Speed, per floor. */
  speed: 8,
  /** 1 Clash Power Up, Damage Up or Protection at the start of fights, per floor. */
  combatBuff: 6,
  /** Cost you usually carry from floor to floor (Cumulating Starcloud's % of it). */
  banked: 400,
  /** Extra Cost from the once-per-shop better sale price, per 50%, per floor. */
  sale: 25,
  /** Cost from encounter rewards per floor (Binary Star-shop's %). */
  fightCost: 300,
  /** Better odds of high-tier shop gifts, per floor. */
  shopTier: 5,
  /** Average Cost from Binary Star-shop+'s "Tier numbers as Cost" each shop (max 75 / 150). */
  tierCost: [40, 60],
  /** Starlight reward cards you take per floor (Star-shower + and ++ add Cost to them). */
  starlightCards: 0.5,
  /** A random Tier 1 gift; a random Tier 3 gift. */
  randomT1: 25,
  randomT3: 90,
  /** A For Fuse or Sale only gift each shop (fusion fodder or sale Cost), per floor; + / ++ have higher tiers. */
  fodder: [45, 55, 70],
  /** The fusion bonus gift (2 tiers below, then 1), per floor. */
  fusionBonus: [15, 25],
  /** A Super Shop (Hard): worth this much over a normal shop; Moon Star-shop + / ++ add 10% / 25% a shop. */
  superShop: 150,
  /** A Vestige per tier (Perfected Possibility's Dark / Faint / Twinkling). */
  vestige: 15,
}

export interface StarlightStep {
  kind: 'buff' | 'search'
  /** For buffs. */
  buff?: StarterBuff
  /** Buff level this step buys (1 = base, 2 = +, 3 = ++), or the Gift Search count (1-3). */
  level: number
  /** Starlight for this step. */
  starlight: number
  /** What it adds over the run, in Cost. */
  value: number
  /** value / (Starlight x 5): above 1 beats converting the Starlight to Cost. */
  ratio: number
  /** What the value is made of. */
  why: string[]
}

export interface StarlightPlan {
  /** Every step worth buying (ratio >= 1), best value first, prerequisites first. */
  steps: StarlightStep[]
  /** Steps worth less than the Cost the Starlight would convert to. */
  skip: StarlightStep[]
  /** With a budget: the steps it covers. */
  affordable: StarlightStep[] | null
  spent: number
  /** The keyword the gift parts were valued for. */
  keyword: KeywordPlan
  /** Gift Search picks (best first) the search steps were valued with. */
  search: StartPick[]
}

const r0 = (n: number) => Math.round(n)

/** Every buff level and Gift Search step, valued for your team and run. */
export function starlightSteps(ctx: RunContext, keyword: KeywordPlan, search: StartPick[]): StarlightStep[] {
  const V = BUFF_VALUES
  const F = Math.max(1, ctx.run.floors)
  const hard = ctx.run.difficulty !== 'normal'
  const shop = shopValue(ctx)
  const cost = (g: GiftScore | undefined) => (g ? costValue(g.score, shop) : 0)
  // Extra starting gift choices: the 2nd and 3rd best of the keyword (whichever buff you buy first gets the 2nd).
  const extraStart = (cost(keyword.gifts[1]) + cost(keyword.gifts[2])) / 2
  const t3 = keywordTierGifts(ctx, keyword.keyword, 3).map((g) => scored(g, ctx)).sort((a, b) => b.score - a.score)
  const avg = (list: GiftScore[]) => (list.length ? list.reduce((s, g) => s + cost(g), 0) / list.length : 0)
  const t3Avg = avg(t3)
  const t4Avg = avg(keywordTierGifts(ctx, keyword.keyword, 4).map((g) => scored(g, ctx)))
  const levels = (n: number) => n * V.level
  const kw = keyword.keyword

  // [value, why] for each buff level, in order.
  const parts: Record<string, [number, string[]][]> = {
    'star-of-the-beginning': [
      [150 + F * (V.packChoice + V.shopSlot + V.refresh), ['+150 starting Cost', '+1 theme pack choice, +1 shop gift, 1 free refresh each shop']],
      [100, ['+100 more starting Cost']],
      [F * V.refresh, ['A second free refresh each shop']],
    ],
    'cumulating-starcloud': [
      [Math.min(100, 0.1 * V.banked) * (F - 1) + F * V.sale, [`About ${r0(Math.min(100, 0.1 * V.banked))} Cost each new floor (10% of what you carry)`, 'Better sale price once per shop']],
      [(Math.min(125, 0.2 * V.banked) - Math.min(100, 0.1 * V.banked)) * (F - 1) + F * V.sale * 0.5, ['20% a floor instead of 10%']],
      [(Math.min(150, 0.3 * V.banked) - Math.min(125, 0.2 * V.banked)) * (F - 1) + F * V.sale * 0.5, ['30% a floor']],
    ],
    'interstellar-travel': [
      [F * (V.packChoice + 2 * V.packRefresh) + levels(Math.min(9, 3 * F)), ['+1 theme pack choice and 2 pack refreshes', `+${Math.min(9, 3 * F)} Levels over the first floors`]],
      [F * V.packRefresh + F * V.combatBuff * 0.5, ['One more pack refresh', '+1 Clash Power Up (needs 45+ theme packs unlocked)']],
      [F * V.packRefresh + F * V.combatBuff * 0.5, ['One more pack refresh', '+1 more Clash Power Up (45+ packs unlocked)']],
    ],
    'star-shower': [
      [400 + extraStart, ['+400 starting Cost', `+1 starting gift choice (another ${kw} gift)`]],
      [100 + 75 * V.starlightCards * F, ['+100 more starting Cost', '+75 Cost when you take a Starlight reward card']],
      [200 + 75 * V.starlightCards * F, ['+200 more starting Cost', '+150 Cost per Starlight reward card']],
    ],
    'binary-star-shop': [
      [F * (V.shopSlot + 0.2 * V.fightCost + V.shopTier), ['+1 shop gift', '+20% Cost from fights', 'Higher-tier gifts in shops']],
      [F * (0.1 * V.fightCost + V.tierCost[0]), ['+30% fight Cost', 'Your gifts\' tiers as Cost at each shop (max 75)']],
      [F * (0.1 * V.fightCost + V.tierCost[1] - V.tierCost[0]), ['+40% fight Cost', 'Tier Cost up to 150 a shop']],
    ],
    'moon-star-shop': [
      [F * V.keywordRefresh + V.randomT1, ['A free keyword refresh each shop', 'A random Tier 1 gift on floor 1']],
      [V.randomT1 + (hard ? F * 0.1 * V.superShop : 0), ['Another random Tier 1 gift', hard ? '+10% Super Shop chance' : 'Super Shop chance (Hard only)']],
      [V.randomT1 + F * V.keywordRefresh * 0.5 + (hard ? F * 0.15 * V.superShop : 0), ['A second free keyword refresh', 'A third Tier 1 gift', hard ? '+25% Super Shop chance' : 'Super Shop chance (Hard only)']],
    ],
    'favor-of-the-nebulae': [
      [levels(3 + Math.min(5, F - 1)), [`+${3 + Math.min(5, F - 1)} Levels for every Identity over the run`]],
      [levels(Math.max(0, Math.min(9, F - 1) - Math.min(5, F - 1))), ['Floor clears give Levels up to 9, not 5']],
      [levels(F >= 6 ? 3 : 0), [F >= 6 ? '+3 Levels on floor 6' : 'Its +3 Levels on floor 6 needs a 6+ floor run']],
    ],
    'starlight-guidance': [
      [F * (2 * V.speed + 3 * V.combatBuff), ['+2 Max Speed', '1 Clash Power Up, Damage Up and Protection']],
      [F * (V.speed + V.combatBuff), ['+1 more Max Speed', '+1 Clash Power Up']],
      [F * 2 * V.combatBuff, ['+1 Damage Up and Protection']],
    ],
    'chance-comet': [
      [F * (V.fodder[0] + V.fusionBonus[0]) + (F >= 3 ? V.randomT3 : 0), ['A For Fuse or Sale only gift each shop', 'A random Tier 3 gift on floor 3', 'A bonus gift when fusing']],
      [F * (V.fodder[1] - V.fodder[0]) + (F >= 3 ? t3Avg - V.randomT3 : 0) + (F >= 5 ? t3Avg : 0),
        [`Tier 3 ${kw} gifts on floors 3 and 5`, 'Better fodder gifts']],
      [F * (V.fodder[2] - V.fodder[1] + V.fusionBonus[1] - V.fusionBonus[0]) + (F >= 3 ? t4Avg - t3Avg : 0) + (F >= 5 ? t4Avg - t3Avg : 0) + (F >= 7 ? t4Avg : 0),
        [`Tier 4 ${kw} gifts on floors 3, 5 and 7`, 'Fusion bonus 1 tier below']],
    ],
    'perfected-possibility': [
      [F * V.packChoice + extraStart + cost(t3[0]) + V.vestige, ['+1 theme pack choice', `+1 starting gift choice`, t3[0] ? `A Tier 3 ${kw} gift of your choice: ${t3[0].gift.name}` : `A Tier 3 ${kw} gift`, 'A Dark Vestige']],
      [cost(t3[1]) + 2 * V.vestige, [t3[1] ? `A second Tier 3 pick: ${t3[1].gift.name}` : 'A second Tier 3 pick', 'A Faint Vestige']],
      [cost(t3[2]) + 3 * V.vestige, [t3[2] ? `A third Tier 3 pick: ${t3[2].gift.name}` : 'A third Tier 3 pick', 'A Twinkling Vestige']],
    ],
  }
  const steps: StarlightStep[] = []
  for (const buff of BUFFS) {
    (parts[buff.id] ?? []).forEach(([value, why], k) => {
      steps.push({ kind: 'buff', buff, level: k + 1, starlight: buff.starlight, value, ratio: value / (buff.starlight * COST_PER_STARLIGHT), why })
    })
  }
  search.slice(0, 3).forEach((p, k) => {
    const starlight = GIFT_SEARCH[k] - (k ? GIFT_SEARCH[k - 1] : 0)
    const value = costValue(p.value, shop)
    steps.push({ kind: 'search', level: k + 1, starlight, value, ratio: value / (starlight * COST_PER_STARLIGHT),
      why: [`Gift Search: ${p.score.gift.name}${p.why[0] ? ` (${p.why[0].charAt(0).toLowerCase()}${p.why[0].slice(1)})` : ''}`] })
  })
  return steps
}

const stepKey = (s: StarlightStep) => (s.kind === 'buff' ? s.buff!.id : 'search')

/**
 * The Starlight plan: steps worth more than their Starlight in Cost, best value first, each after
 * the step it needs (+ after base, a 2nd Gift Search after the 1st). With a budget, what it covers.
 */
export function planStarlight(ctx: RunContext, state: PreRunState,
  /** rankStartKeywords(ctx, 3, 3): gifts are valued as if you had every extra choice. */
  keywords: KeywordPlan[],
  /** E.G.O Gift Search picks (startingPicks), best first. */
  search: StartPick[]): StarlightPlan {
  const keyword = keywords.find((k) => k.keyword === state.keyword) ?? keywords[0]
  const all = starlightSteps(ctx, keyword, search)
  const order: StarlightStep[] = []
  const reached = new Map<string, number>()
  const left = [...all]
  for (;;) {
    const ready = left.filter((s) => s.level === (reached.get(stepKey(s)) ?? 0) + 1)
    if (!ready.length) break
    const best = ready.reduce((a, b) => (b.ratio > a.ratio ? b : a))
    if (best.ratio < 1) break
    order.push(best)
    reached.set(stepKey(best), best.level)
    left.splice(left.indexOf(best), 1)
  }
  const skip = left.filter((s) => !order.includes(s)).sort((a, b) => b.ratio - a.ratio)
  let affordable: StarlightStep[] | null = null
  let spent = 0
  if (state.starlight !== null) {
    affordable = []
    const got = new Map<string, number>()
    for (const s of order) {
      if (s.level !== (got.get(stepKey(s)) ?? 0) + 1 || spent + s.starlight > state.starlight) continue
      affordable.push(s)
      spent += s.starlight
      got.set(stepKey(s), s.level)
    }
  }
  return { steps: order, skip, affordable, spent, keyword, search }
}
