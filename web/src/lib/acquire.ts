// How to get a gift in Mirror Dungeon, from what the scraper knows: its pool,
// the theme packs that give or feature it, events, fusion recipes and other
// notes on the wiki's gift list.
import { floorText, type Gift, type ThemePack } from './types'

export interface AcquireLine {
  kind: 'fusion' | 'pack' | 'event' | 'pool' | 'other'
  text: string
  /** Gift ids in a fusion recipe, to show which you already own. */
  ingredients?: { id: string; name: string; owned: boolean }[]
  /** Theme packs to name (the first few). */
  packs?: ThemePack[]
  morePacks?: number
  link?: string | null
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

export function howToGet(
  gift: Gift, packsForGift: Map<string, ThemePack[]>, giftsById: Map<string, Gift>, owned: Set<string>,
): AcquireLine[] {
  const lines: AcquireLine[] = []
  if (gift.fusion_recipe?.length) {
    const ingredients = gift.fusion_recipe.map((id) => ({ id, name: giftsById.get(id)?.name ?? id, owned: owned.has(id) }))
    lines.push({ kind: 'fusion', text: 'Fuse', ingredients })
  }
  const packs = packsForGift.get(gift.id) ?? []
  const exclusive = packs.filter((p) => p.gifts.includes(gift.id))
  const featured = packs.filter((p) => !p.gifts.includes(gift.id))
  if (exclusive.length) {
    lines.push({
      kind: 'pack', packs: exclusive.slice(0, 4), morePacks: Math.max(0, exclusive.length - 4),
      text: exclusive.length === 1 ? 'Only from this theme pack' : 'Only from these theme packs',
    })
  }
  for (const e of gift.events) lines.push({ kind: 'event', text: e.name, link: e.wiki_url })
  const pools = gift.pools ?? []
  if (pools.includes('main')) {
    lines.push({ kind: 'pool', text: 'General pool: can show up in battle rewards and shops on any floor' })
  }
  if (pools.includes('extreme') && !exclusive.length) lines.push({ kind: 'pool', text: 'Extreme difficulty only' })
  if (pools.includes('cursed')) lines.push({ kind: 'pool', text: 'Cursed gift: it comes with a drawback' })
  if (featured.length) {
    lines.push({
      kind: 'pack', packs: featured.slice(0, 3), morePacks: Math.max(0, featured.length - 3),
      text: `Featured in ${featured.length} theme pack${featured.length > 1 ? 's' : ''}`,
    })
  }
  for (const o of gift.other_sources ?? []) lines.push({ kind: 'other', text: o })
  if (!lines.length) lines.push({ kind: 'other', text: 'No source listed on the wiki' })
  return lines
}
