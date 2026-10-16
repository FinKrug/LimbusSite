import { describe, expect, it } from 'vitest'
import {
  hasOrder, makePreset, movePreset, presetMatches, renamePreset, restoreSelection, restoreTeam, sameTeam, uniqueName,
  updatePreset, validPresets, type Equipped, type TeamPreset,
} from './presets'
import type { Sinner } from './types'

const team = (over: Equipped = {}): Equipped => ({ 'Yi Sang': 'a', Faust: 'b', Rodion: 'thumb-rodion', ...over })
const ORDER: Sinner[] = ['Rodion', 'Faust', 'Yi Sang']

describe('team presets', () => {
  it('gives each preset a unique name', () => {
    const one = makePreset('Burn team', team(), [], [], 1)
    const two = makePreset('burn team', team(), [], [one], 2)
    expect(two.name).toBe('burn team (2)')
    expect(uniqueName('  ', [one])).toBe('Team')
    expect(two.id).not.toBe(one.id)
  })

  it('copies identities and order so later changes do not touch the preset', () => {
    const t = team()
    const order = [...ORDER]
    const p = makePreset('A', t, order, [], 1)
    t.Rodion = 'other'
    order.reverse()
    expect(p.team.Rodion).toBe('thumb-rodion')
    expect(p.selection).toEqual(ORDER)
  })

  it('saves without an order, and then matches any order', () => {
    const p = makePreset('A', team(), [], [], 1)
    expect(hasOrder(p)).toBe(false)
    expect(presetMatches(p, team(), [])).toBe(true)
    expect(presetMatches(p, team(), ORDER)).toBe(true)
    expect(presetMatches(p, team({ Rodion: 'other' }), [])).toBe(false)
  })

  it('with an order saved, matches only that order', () => {
    const p = makePreset('A', team(), ORDER, [], 1)
    expect(hasOrder(p)).toBe(true)
    expect(presetMatches(p, team(), ORDER)).toBe(true)
    expect(presetMatches(p, team(), ['Faust', 'Rodion', 'Yi Sang'])).toBe(false)
    expect(presetMatches(p, team(), [])).toBe(false)
  })

  it('compares identities per sinner', () => {
    expect(sameTeam(team(), team({ Outis: null }))).toBe(true)
    expect(sameTeam(team(), team({ Outis: 'x' }))).toBe(false)
  })

  it('updates, renames and reorders', () => {
    const a = makePreset('A', team(), [], [], 1)
    const b = makePreset('B', team(), [], [a], 2)
    let list: TeamPreset[] = [a, b]
    list = updatePreset(list, a.id, team({ Rodion: 'x' }), ORDER, 9)
    expect(list[0]).toMatchObject({ name: 'A', savedAt: 9, team: { Rodion: 'x' }, selection: ORDER })
    list = renamePreset(list, a.id, 'B')
    expect(list[0].name).toBe('B (2)')
    expect(renamePreset(list, a.id, '   ')).toBe(list)
    list = movePreset(list, b.id, -1)
    expect(list.map((p) => p.name)).toEqual(['B', 'B (2)'])
    expect(movePreset(list, b.id, -1)).toBe(list)
  })

  it('drops identities and sinners the data no longer has when loading', () => {
    expect(restoreTeam(team(), new Set(['b', 'thumb-rodion']))).toEqual({ Faust: 'b', Rodion: 'thumb-rodion' })
    expect(restoreSelection(['Faust', 'Faust', 'Nobody', 'Outis'])).toEqual(['Faust', 'Outis'])
    expect(restoreSelection(undefined)).toEqual([])
  })

  it('ignores malformed stored presets and keeps ones saved before orders were added', () => {
    const good = makePreset('A', team(), [], [], 1)
    const { selection: _, ...noOrder } = makePreset('B', team(), [], [], 2)
    expect(validPresets([good, null, { id: 1 }, { id: 'x', name: 'y' }, noOrder])).toEqual([good, noOrder])
    expect(hasOrder(noOrder)).toBe(false)
    expect(validPresets('nope')).toEqual([])
  })
})
