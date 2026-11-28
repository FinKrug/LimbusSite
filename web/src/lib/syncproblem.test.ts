import { describe, expect, it, vi } from 'vitest'
import { describeProblem, kindOf, retryDelay, withTimeout } from './syncproblem'

describe('sync problem messages (t11)', () => {
  it('sorts Firebase errors into what the player can do about them', () => {
    expect(kindOf({ code: 'auth/popup-blocked' })).toBe('popup-blocked')
    expect(kindOf({ code: 'auth/network-request-failed' })).toBe('offline')
    expect(kindOf({ code: 'unavailable' })).toBe('offline')
    expect(kindOf({ code: 'timeout' })).toBe('offline')
    expect(kindOf({ code: 'permission-denied' })).toBe('denied')
    expect(kindOf({ code: 'auth/unauthorized-domain' })).toBe('domain')
    expect(kindOf({ code: 'internal' })).toBe('failed')
    expect(kindOf({ code: 'internal' }, false)).toBe('offline')
  })

  it('says what happened to your data for each step', () => {
    expect(describeProblem({ code: 'unavailable' }, 'save', false).title).toMatch(/^You're offline/)
    expect(describeProblem({ code: 'unavailable' }, 'save', true).title).toMatch(/^Can't reach your account/)
    expect(describeProblem({ code: 'unavailable' }, 'save').detail).toMatch(/kept on this computer/)
    expect(describeProblem({ code: 'unavailable' }, 'choose').detail).toMatch(/Nothing was replaced/)
    expect(describeProblem({ code: 'auth/popup-blocked' }, 'sign-in').detail).toMatch(/Allow pop-ups/)
  })

  it('tidies Firebase\'s own wording', () => {
    const p = describeProblem({ code: 'auth/internal-error', message: 'Firebase: Something broke (auth/internal-error).' }, 'sign-in', true)
    expect(p.detail).toBe('Something broke. Your data is still saved on this computer.')
    expect(describeProblem({ code: 'x' }, 'save', true).detail).toMatch(/^Error code: x\./)
  })

  it('waits longer after each failed try, up to a minute', () => {
    expect([0, 1, 2, 3, 9].map(retryDelay)).toEqual([5000, 15000, 30000, 60000, 60000])
  })

  it('a call that never answers fails with a timeout', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise(() => {}), 1000)
    const caught = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await caught).toMatchObject({ code: 'timeout' })
    vi.useRealTimers()
  })
})
