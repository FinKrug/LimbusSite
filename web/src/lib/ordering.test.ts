import { describe, expect, it } from 'vitest'
import { gameData } from './data'
import { lineupSuggestions, moveTo } from './ordering'
import type { Identity, Sinner } from './types'

const byId = (id: string) => {
  const i = gameData.identities.find((x) => x.id === id)
  if (!i) throw new Error(`no identity ${id}`)
  return i
}
const HEISHOU = [
  'heishou-pack-wu-branch-adept-yi-sang', 'heishou-pack-mao-branch-adept-faust', 'the-lord-of-hongyuan-hong-lu',
  'heishou-pack-mao-branch-ryoshu', 'heishou-pack-you-branch-adept-heathcliff', 'heishou-pack-si-branch-rodion',
  'heishou-pack-mao-branch-outis', 'lccb-assistant-manager-ishmael', 'heishou-pack-si-branch-gregor',
  'heishou-pack-you-branch-sinclair', 'heishou-pack-wei-branch-don-quixote', 'the-prince-of-la-manchaland-meursault',
].map(byId)

const apply = (lineup: Identity[], sinner: Sinner, to: number) => {
  const order = moveTo(lineup.map((i) => i.sinner), sinner, to)
  return order.map((s) => lineup.find((i) => i.sinner === s)!)
}

describe('lineup suggestions', () => {
  it('moves a sinner without touching the rest of the order', () => {
    expect(moveTo(['Yi Sang', 'Faust', 'Don Quixote', 'Ryōshū'], 'Ryōshū', 1)).toEqual(['Yi Sang', 'Ryōshū', 'Faust', 'Don Quixote'])
  })

  it('suggests You Branch Sinclair as first backup, then the next substitution unit', () => {
    const { suggestions } = lineupSuggestions(gameData, HEISHOU, 7, [])
    const sinclair = suggestions.find((s) => s.sinner === 'Sinclair')!
    expect(sinclair).toMatchObject({ to: 7, source: 'tip', title: 'Make Sinclair the first backup (#8)' })
    expect(sinclair.detail).toMatch(/Bloodflame/)
    const dq = suggestions.find((s) => s.sinner === 'Don Quixote')!
    expect(dq).toMatchObject({ to: 8, source: 'identity' })
    expect(dq.quote!.text).toMatch(/Substituted or Returned/)
    // Deployed units that also gain on substitution (You Branch Heathcliff) aren't benched.
    expect(suggestions.some((s) => s.sinner === 'Heathcliff' && s.to >= 7)).toBe(false)
  })

  it('passes on the Lord of Hongyuan tip, labelled as a player tip', () => {
    const { suggestions } = lineupSuggestions(gameData, HEISHOU, 7, [])
    const after = suggestions.filter((s) => s.id.startsWith('tip:the-lord-of-hongyuan'))
    expect(after.length).toBeGreaterThan(0)
    expect(after[0].title).toMatch(/right after Hong Lu/)
    expect(after[0].reason).toBe('Put your best Heishou units right after The Lord of Hongyuan.')
    expect(after[0].detail).toMatch(/^Player tip:/)
  })

  it('only uses slot gifts you own', () => {
    const lineup = ['heishou-pack-mao-branch-outis', 'heishou-pack-mao-branch-ryoshu', 'the-pequod-first-mate-yi-sang',
      'seven-assoc-south-section-4-faust', 'tingtang-gang-gangleader-hong-lu', 'seven-assoc-south-section-4-heathcliff',
      'liu-assoc-south-section-4-ishmael'].map(byId)
    expect(lineupSuggestions(gameData, lineup, 7, []).suggestions.filter((s) => s.source === 'gift')).toEqual([])
    const withGift = lineupSuggestions(gameData, lineup, 7, ['crushed-memory']).suggestions.filter((s) => s.source === 'gift')
    expect(withGift).toHaveLength(1)
    expect(withGift[0]).toMatchObject({ sinner: 'Ishmael', to: 0 })
    expect(withGift[0].reason).toMatch(/^Your Crushed Memory only works for #1–#2, and Ishmael can use it \(Blunt skills\)/)
  })

  it('puts an Ammo user first for Soldato II Sinclair', () => {
    const lineup = ['lcb-sinner-yi-sang', 'the-thumb-east-soldato-ii-sinclair', 'the-thumb-east-capo-iiii-meursault'].map(byId)
    const { suggestions } = lineupSuggestions(gameData, lineup, 7, [])
    expect(suggestions.find((s) => s.sinner === 'Meursault')).toMatchObject({ to: 0 })
  })

  it("doesn't move a #1 that already meets the #1 effect's condition", () => {
    // Blade Lineage Salsu Faust wants a Slash user first, and is one.
    const lineup = ['blade-lineage-salsu-faust', 'the-thumb-east-soldato-ii-sinclair', 'the-thumb-east-capo-iiii-meursault'].map(byId)
    expect(lineupSuggestions(gameData, lineup, 7, []).suggestions.some((s) => s.to === 0)).toBe(false)
  })

  it('settles: following the suggestions one by one ends with none left', () => {
    for (const owned of [[], ['crushed-memory', 'carpenter-s-nail', 'sundered-memory']]) {
      let lineup = HEISHOU
      for (let step = 0; step < 12; step++) {
        const first = lineupSuggestions(gameData, lineup, 7, owned).suggestions[0]
        if (!first) break
        lineup = apply(lineup, first.sinner, first.to)
      }
      expect(lineupSuggestions(gameData, lineup, 7, owned).suggestions).toEqual([])
    }
  })
})
