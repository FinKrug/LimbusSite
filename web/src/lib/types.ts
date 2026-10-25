// Shapes of the JSON files written by the scraper (see ../../README.md).

export const SINS = ['wrath', 'lust', 'sloth', 'gluttony', 'gloom', 'pride', 'envy'] as const
export type Sin = (typeof SINS)[number]

/** Status keywords that Mirror Dungeon gift builds revolve around. */
export const CORE_KEYWORDS = ['Burn', 'Bleed', 'Tremor', 'Rupture', 'Sinking', 'Poise', 'Charge'] as const
export type CoreKeyword = (typeof CORE_KEYWORDS)[number]

export const SINNERS = [
  'Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū', 'Meursault', 'Hong Lu',
  'Heathcliff', 'Ishmael', 'Rodion', 'Sinclair', 'Outis', 'Gregor',
] as const
export type Sinner = (typeof SINNERS)[number]

export const ATTACK_TYPES = ['Slash', 'Pierce', 'Blunt'] as const
export type AttackType = (typeof ATTACK_TYPES)[number]

/** when: "always" | "keyword:Bleed" | "attack:Blunt" | "sin:Gluttony" */
export interface GiftApply {
  status: string
  when: string
}

/** A set of gifts that are much better together. */
export interface Combo {
  id: string
  name: string
  gifts: string[]
  why: string
  source?: string
  /** Keyword-free sets (Folmore's guide): they work for any team, whatever its keywords. */
  any_team?: boolean
  /** 1 = most important set; lower sets are worth less to a run. */
  rank?: number
  /** The keyword its gifts share (they apply it themselves). */
  keyword?: string
  /** Advice that goes with it ("Don't bring White Gossypium"). */
  note?: string
}

export type Pool = 'main' | 'themed' | 'extreme' | 'cursed' | 'fusion'

export interface Gift {
  id: string
  name: string
  sin: Sin | null
  tier: number | null // 1-5, 6 = EX
  cost: number | null
  /** Core keyword, a damage type (Slash/Pierce/Blunt), or null for general gifts. */
  keyword: string | null
  secondary_keyword: string | null
  status_effects: string[]
  /** Affiliations the effect is built around, e.g. "The Thumb". */
  traits: string[]
  /** Statuses that must already be on the enemy for the effect to work, e.g. "Tremor Burst". */
  needs?: string[]
  /** Statuses the gift inflicts/triggers itself, and under what condition. */
  applies?: GiftApply[]
  /** Attack types the effect is about ("Blunt Skills deal +10% damage"). */
  attack_types?: AttackType[]
  /** Sin affinities the effect is about ("Gloom Affinity Skill"), lower-case. */
  affinities?: Sin[]
  /** Only switches on when enough of your identities meet a condition. */
  team_gate?: boolean
  effect: string
  max_level: number
  /** Effect text at + and ++ (enhanced in a shop), when the wiki lists them. */
  upgrades?: string[]
  pools: Pool[]
  theme_packs: string[]
  events: { name: string; wiki_url: string | null }[]
  fusion_recipe: string[] | null
  /** Other plain-text sources on the wiki's gift list ("Obtain a duplicate of a Tier I E.G.O Gift"). */
  other_sources?: string[]
  /** Icon file on the wiki, e.g. "Ebony Brooch Gift.png" (from the scraper). */
  icon?: string
  wiki_url: string
}

export type FloorRange = [number, number] | null

export interface ThemePack {
  id: string
  name: string
  pool: 'themed' | 'extreme' | 'cursed'
  /** Section of the wiki's floor theme list, e.g. "Canto Themes". */
  group: string | null
  /** Floors the pack can appear on, per difficulty (null = unknown / not offered). */
  floors: { normal: FloorRange; hard: FloorRange; extreme?: FloorRange } | null
  /** Gifts exclusive to this pack. */
  gifts: string[]
  /** Every gift the pack can give, exclusives included. */
  gift_pool: string[]
  /** Node layout from its wiki page ("6 nodes: 4 dungeon nodes, a shop, the boss"). */
  layout?: { nodes: number | null; dungeon_nodes: number | null; shop: boolean | null } | null
  /** How often its own events show up ("...have a 75% chance to generate as one of..."). */
  event_note?: string | null
  /** A Hidden Theme Pack (The B.E.): it only replaces a generated pack now and then. */
  hidden?: boolean
  /** Chance it replaces any generated pack ("hiddenThemeRate"; The B.E.: 0.0002 = 1 in 5,000). */
  appear_rate?: number | null
  /** Gifts always offered after clearing it (The B.E.: Bongy Plush, Lunar Memory, ...). */
  clear_rewards?: string[]
  wiki_url: string | null
}

export interface Fusion {
  result: string
  /** Fixed ingredients. */
  ingredients: string[]
  /** Plus `count` more from this list (Lunar Memory: any 2 Sin Fragments). */
  any_of?: { count: number; from: string[] }
  /** Needs more than 3 slots, so only a Super Shop (Hard floors) can fuse it. */
  super_shop?: boolean
}

/** One of an identity's attack skills (skill 1-3), from its wiki page. */
export interface Skill {
  slot: 1 | 2 | 3
  name: string
  sin: Sin | null
  type: string | null
  base: number | null
  coin_power: number | null
  coins: number | null
  /** Copies in the identity's deck (usually 3 / 2 / 1). */
  copies: number | null
  weight: number | null
  /** The most "Atk Weight +N" its text grants (usually conditional, e.g. in a Volatile E.G.O state). */
  weight_bonus?: number
  statuses: string[]
  /** Statuses it inflicts on (or triggers/uses on) the enemy: "Tremor", "Tremor - Scorch", "Tremor Burst". */
  enemy?: string[]
  /** Statuses it gains or spends on the unit itself (Spicebush Yi Sang's Tremor). */
  self?: string[]
}

/** An identity's defense skill: not in the deck, usable in any skill slot instead of a hand skill. */
export interface DefenseSkill {
  name: string
  sin: Sin | null
  /** Guard / Evade, or an attack type for a Counter. */
  type: string | null
  kind: 'guard' | 'evade' | 'counter'
  base: number | null
  coin_power: number | null
  coins: number | null
  statuses: string[]
}

export interface Identity {
  id: string
  name: string
  sinner: Sinner
  rarity: number | null
  affinities: Sin[]
  keywords: CoreKeyword[]
  status_effects: string[]
  /** Affiliations, e.g. "The Thumb", "Heishou Pack - Mao Branch". */
  traits: string[]
  /** Attack types of its skills, most used first (empty if unknown). */
  attack_types?: AttackType[]
  /** Skills per attack type, e.g. { Slash: 2, Pierce: 1 } (defense skills included). */
  attack_counts?: Partial<Record<AttackType, number>>
  /** Lines from its skills and passives about lineup position (scraper/order.py). */
  order_notes?: OrderNote[]
  skills?: Skill[]
  /** Its defense skill (scraper/skills.py), if known. */
  defense?: DefenseSkill | null
  wiki_url: string
}

export interface OrderNote {
  /** first: #1 / earliest deployed; last: deployed last; before_self: allies earlier than it;
   *  in_order: allies in deployment order; sub_self: it gains something when substituting in;
   *  sub_ally: allies that substitute in gain something. */
  kind: 'first' | 'last' | 'before_self' | 'in_order' | 'sub_self' | 'sub_ally'
  /** How many from the front (e.g. 2 for "#1 and #2 Deployed allies"). */
  n?: number
  text: string
  /** The skill or passive it comes from. */
  source: string
}

export interface GameData {
  gifts: Gift[]
  themePacks: ThemePack[]
  fusions: Fusion[]
  identities: Identity[]
  combos?: Combo[]
  /** The sinners' E.G.O (data/egos.json; empty until the scraper has fetched them). */
  egos?: import('./ego').Ego[]
  /** Mirror Dungeon events (data/events.json, scraper/events.py). */
  events?: import('./events').GameEvent[]
  generatedAt: string | null
}

export function isCoreKeyword(k: string | null): k is CoreKeyword {
  return k !== null && (CORE_KEYWORDS as readonly string[]).includes(k)
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'EX']
export function tierLabel(tier: number | null): string {
  return tier === null ? '?' : (ROMAN[tier] ?? String(tier))
}

/** "1F", "1–2F", or null. */
export function floorText(range: FloorRange | undefined): string | null {
  if (!range) return null
  return range[0] === range[1] ? `${range[0]}F` : `${range[0]}–${range[1]}F`
}

/** Keyword categories on the fusion screen: a random fusion only gives gifts of one of these. */
export const FUSION_KEYWORDS = ['Burn', 'Bleed', 'Tremor', 'Rupture', 'Sinking', 'Poise', 'Charge', 'Slash', 'Pierce', 'Blunt'] as const

/** Can a random fusion give this gift? Only gifts with a fusion keyword (not General ones). */
export function fusableKeyword(g: Pick<Gift, 'keyword'>): boolean {
  return !!g.keyword && (FUSION_KEYWORDS as readonly string[]).includes(g.keyword)
}
