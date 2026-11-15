import { describe, expect, it } from 'vitest'
import { authDomainFor } from './cloud'

describe('sign-in domain', () => {
  it('signs in through our own domain on gesellschaftmd.com', () => {
    expect(authDomainFor('gesellschaftmd.com', 'limbussite.firebaseapp.com')).toBe('gesellschaftmd.com')
  })

  it("uses the Firebase project's domain anywhere else", () => {
    expect(authDomainFor('localhost', 'limbussite.firebaseapp.com')).toBe('limbussite.firebaseapp.com')
    expect(authDomainFor('gesellschaftmd.finley-krug.workers.dev', 'limbussite.firebaseapp.com')).toBe('limbussite.firebaseapp.com')
    expect(authDomainFor(null, undefined)).toBeUndefined()
  })
})
