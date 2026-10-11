import { describe, expect, it } from 'vitest'
import { FixedWindowLimiter } from '@/lib/rate-limit'

describe('FixedWindowLimiter', () => {
  it('blocks after the limit and unblocks when the window ends', () => {
    const l = new FixedWindowLimiter(2, 1000)
    l.hit('k', 0)
    expect(l.isBlocked('k', 10)).toBe(false)
    l.hit('k', 20)
    expect(l.isBlocked('k', 30)).toBe(true)
    expect(l.isBlocked('k', 1000)).toBe(false)
  })

  it('evicts the oldest key once maxKeys is reached', () => {
    const l = new FixedWindowLimiter(1, 60_000, 3)
    for (const k of ['a', 'b', 'c', 'd']) l.hit(k, 0)
    expect(l.isBlocked('a', 1)).toBe(false)
    expect(l.isBlocked('d', 1)).toBe(true)
  })
})
