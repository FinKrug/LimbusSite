// All game data is static JSON produced by the scraper and bundled at build time.
// Keeping access behind this module means it could move to an API later
// without touching the rest of the app.
import giftsJson from '@data/gifts.json'
import packsJson from '@data/theme_packs.json'
import fusionsJson from '@data/fusions.json'
import identitiesJson from '@data/identities.json'
import metaJson from '@data/meta.json'
// Hand-picked combos (not scraped): edit src/data/combos.json to add more.
import combosJson from '../data/combos.json'
import type { Combo, Fusion, GameData, Gift, Identity, ThemePack } from './types'

export const gameData: GameData = {
  gifts: giftsJson as unknown as Gift[],
  themePacks: packsJson as unknown as ThemePack[],
  fusions: fusionsJson as unknown as Fusion[],
  identities: identitiesJson as unknown as Identity[],
  combos: combosJson as Combo[],
  generatedAt: (metaJson as { generated_at?: string }).generated_at ?? null,
}
