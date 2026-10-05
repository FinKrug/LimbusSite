import { describe, expect, it } from 'vitest'
import { PACK_GIFTS_FIRST, nextShown } from './format'

describe('pack gift paging', () => {
  it('shows 5, then 30 more at a time, capped at the total', () => {
    const steps = [PACK_GIFTS_FIRST]
    while (steps[steps.length - 1] < 100) steps.push(nextShown(steps[steps.length - 1], 100))
    expect(steps).toEqual([5, 35, 65, 95, 100])
  })
})
