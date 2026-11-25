/**
 * Hidden stages (Finley, 2026-11-24: "when you are in parallel superposition, you should be able to
 * know if doing a dimension reversal zone is worth it or not").
 *
 * Not on the wiki yet, so from Finley's screenshots (EXTREME, floor 12, Line 4 - Section #3; he got it
 * in Line 4 - Section #4 too on 2026-11-25): one of
 * the pack's fights turned into a hidden stage, "Dimension Reversal Zone - COGNITION ERROR WARNING":
 *  - "Upon entry, you will not be able to leave the Stage until its Combat Encounter is cleared."
 *  - "Clearing this Stage will heal allies to their max HP and revive any defeated allies."
 *  - Clear Rewards: 1000 Cost. Skip or Enter.
 *  - Winning also gave A Maestro's Ring-Turned-Artwork (Finley; gifts.json lists it as the reward for
 *    defeating the hidden boss, Callisto, since the Mirror of Names and Spiders).
 *  - The fight: one wave, The Ring Nursefather - Callisto (24,200 HP) and The Ring Apprentice -
 *    Albina (15,093 HP).
 *
 * Worth it? 1000 Cost is a lot on any floor: the pack's shop comes right after its events, so it can
 * be spent on this floor. The full heal and revive come before the pack's boss. The risk is the fight
 * itself: two bosses you can't back out of. So the advice is to enter unless fights are going badly
 * (Run settings: struggling), and what the Cost would buy you is spelled out.
 */
import { intrinsicScore, type RunContext } from './scoring'
import { tierLabel, type Gift } from './types'
import { pricesFor } from './shopprices'
import { shopBaseline } from './upgrades'
import { SAVE } from './costsave'

export interface HiddenStage {
  /** Theme packs it's been seen in. */
  packs: string[]
  name: string
  /** What the game warns before you enter. */
  rules: string[]
  enemies: { name: string; hp: number }[]
  /** Gifts: ids from gifts.json. */
  reward: { cost: number; healAll: boolean; gifts: string[] }
  /** Where it's been seen, for the "not on the wiki yet" note. */
  seen: string
}

export const HIDDEN_STAGES: HiddenStage[] = [{
  packs: ['line-4-section-3', 'line-4-section-4'],
  name: 'Dimension Reversal Zone - Cognition Error Warning',
  rules: [
    'You can\'t leave until its fight is won.',
    'Winning heals every ally to full HP and revives the defeated ones.',
  ],
  enemies: [{ name: 'The Ring Nursefather - Callisto', hp: 24200 }, { name: 'The Ring Apprentice - Albina', hp: 15093 }],
  reward: { cost: 1000, healAll: true, gifts: ['a-maestro-s-ring-turned-artwork'] },
  seen: 'EXTREME, Line 4 - Section #3 and #4',
}]

/** The hidden stages a pack can turn up. */
export function hiddenStagesFor(packId: string | null | undefined): HiddenStage[] {
  return packId ? HIDDEN_STAGES.filter((s) => s.packs.includes(packId)) : []
}

export interface HiddenStageAdvice {
  verdict: 'enter' | 'skip'
  /** What the reward Cost buys at this floor's prices: about how many of your best-value gifts. */
  gifts: number
  examples: string[]
  /** Inflation's multiplier on this floor's prices (the Cost buys less with it). */
  scale: number
  /** Super Shop chance the Cost adds once spent (%), when there's a shop after this floor's. */
  superShop: number
  /** The reward gifts you don't have yet: their value to your team, and the Cost a typical good
   *  shop gift with the same value would cost (what the gift saves you buying). */
  rewardGifts: { gift: Gift; score: number; costWorth: number }[]
  /** Why, in order. */
  why: string[]
}

/** Enter or skip, and why. `down`: allies are down or low on HP (the heal and revive count for more). */
export function hiddenStageAdvice(ctx: RunContext, stage: HiddenStage, opts: { down?: boolean } = {}): HiddenStageAdvice {
  const run = ctx.run
  const prices = pricesFor(ctx)
  const best = shopBaseline(ctx, prices).gifts.slice(0, 5)
  const avg = best.length ? best.reduce((a, x) => a + x.price, 0) / best.length : 250 * prices.scale
  const gifts = Math.floor(stage.reward.cost / Math.max(1, avg))
  // Value per 100 Cost of a typical good buy at this floor's prices (shopValue): a gift worth `score`
  // is worth about score / that × 100 Cost of shopping.
  const shop = shopBaseline(ctx, prices).value || 1
  const rewardGifts = stage.reward.gifts.map((id) => ctx.giftsById.get(id)).filter((g): g is Gift => !!g && !ctx.owned.has(g.id))
    .map((g) => { const score = intrinsicScore(g, ctx).score; return { gift: g, score, costWorth: Math.round(score / shop * 100 / 10) * 10 } })
  const hard = run.difficulty !== 'normal'
  const shopsAfter = hard && run.floor !== null && run.floor < run.floors
  const superShop = shopsAfter ? Math.min(100, Math.floor(stage.reward.cost / SAVE.superPer)) : 0
  const struggling = !!run.struggling
  const enemyHp = stage.enemies.reduce((a, e) => a + e.hp, 0)
  const why: string[] = []
  why.push(`${stage.reward.cost} Cost: about ${gifts} of your best-value gifts at this floor's prices${prices.scale > 1 ? ` (Inflation makes them ${prices.scale === 2 ? 'double' : 'triple'})` : ''}. This pack's shop comes right after its events, so you can spend it on this floor.`)
  for (const r of rewardGifts) why.push(`Plus ${r.gift.name} (Tier ${tierLabel(r.gift.tier)}, not sold in shops): worth ${r.score.toFixed(1)} to your team, about what ${r.costWorth} Cost buys in good gifts here.`)
  if (superShop > 0) why.push(`Spending it adds about ${superShop}% to the next shop's Super Shop chance.`)
  if (stage.reward.healAll) why.push(opts.down
    ? 'Your allies are down or hurt: winning revives them and heals everyone to full right before the boss. That alone can save the run.'
    : 'Winning also heals everyone to full and revives anyone down, right before the boss.')
  why.push(`The catch: you can't leave once you're in. It's one wave against ${stage.enemies.map((e) => `${e.name} (${e.hp.toLocaleString('en-US')} HP)`).join(' and ')}, ${enemyHp.toLocaleString('en-US')} HP in all.`)
  if (struggling) why.push('Your fights are going badly (Run settings), so a boss fight you can\'t leave is too likely to end the run. Skip it.')
  return { verdict: struggling ? 'skip' : 'enter', gifts, examples: best.slice(0, 3).map((x) => x.gift.name), scale: prices.scale, superShop, rewardGifts, why }
}
