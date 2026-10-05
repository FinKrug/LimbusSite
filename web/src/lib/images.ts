// Identity art hot-linked from the Limbus Company Wiki. File names follow the
// wiki's convention: "<Identity name>.png" is the card art (537x827) and
// "<Identity name> Profile.png" the square portrait (256x256). The wiki drops
// ":", "【" and "】" from file names ("E.G.O::Solemn Lament" -> "E.G.O Solemn Lament").
// Images need an internet connection; components fall back to a plain tile.
import type { Gift, Identity } from './types'

const THUMBS = 'https://limbuscompany.wiki.gg/images/thumb/'

export function wikiFileName(name: string): string {
  return name.replace(/[:【】]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '_')
}

function thumb(file: string, width: number): string {
  const f = encodeURIComponent(file)
  return `${THUMBS}${f}/${width}px-${f}`
}

/** Base card art, or the Uptie III ("threadspun") version. */
export type ArtVariant = 'base' | 'uptie'

/** Portrait card art, like the formation screen (source is 537px wide).
 *  "<Name> Uptied.png" is the Uptie III art; base LCB Sinners don't have one. */
export function identityArt(i: Identity, width = 240, variant: ArtVariant = 'base'): string {
  return thumb(`${wikiFileName(i.name)}${variant === 'uptie' ? '_Uptied' : ''}.png`, Math.min(width, 537))
}

/** Square face portrait for small icons (source is 256px). */
export function identityProfile(i: Identity, width = 96): string {
  return thumb(`${wikiFileName(i.name)}_Profile.png`, Math.min(width, 256))
}

const FILE_PATH = 'https://limbuscompany.wiki.gg/wiki/Special:FilePath/'

/**
 * E.G.O gift icon (source is 256px square), best URL first. The direct thumbnail
 * is fastest; Special:FilePath follows file redirects (a couple of icons are
 * redirects from a curly to a straight apostrophe) and is the fallback.
 */
export function giftIcon(g: Gift, width = 64): string[] {
  const file = (g.icon ?? `${g.name} Gift.png`).replace(/ /g, '_')
  const w = Math.min(width, 256)
  return [thumb(file, w), `${FILE_PATH}${encodeURIComponent(file)}?width=${w}`]
}
