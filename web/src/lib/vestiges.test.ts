import { describe, expect, it } from 'vitest'
import { addGift, countOf, removeOne } from './vestiges'

describe('vestiges', () => {
  it('turns a duplicate into a vestige of its tier, and stacks vestiges', () => {
    let owned = addGift([], 'burn-2', 2)
    owned = addGift(owned, 'burn-2', 2)
    expect(owned).toEqual(['burn-2', 'faint-vestige'])
    owned = addGift(owned, 'faint-vestige', 2)
    expect(countOf(owned, 'faint-vestige')).toBe(2)
    expect(countOf(removeOne(owned, 'faint-vestige'), 'faint-vestige')).toBe(1)
  })
})
