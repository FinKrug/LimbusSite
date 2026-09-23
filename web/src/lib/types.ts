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
  custom?: boolean
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
  pools: Pool[]
  theme_packs: string[]
  events: { name: string; wiki_url: string | null }[]
  fusion_recipe: string[] | null
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
  wiki_url: string | null
}

export interface Fusion {
  result: string
  ingredients: string[]
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
  wiki_url: string
}

export interface GameData {
  gifts: Gift[]
  themePacks: ThemePack[]
  fusions: Fusion[]
  identities: Identity[]
  combos?: Combo[]
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
