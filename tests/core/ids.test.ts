import { describe, expect, it } from 'vitest'
import { isValidId, newId, newSlug } from '@/lib/core/ids'

describe('newSlug', () => {
  it('generates 1000 slugs of length 6 using only the contract alphabet', () => {
    const allowed = new Set('23456789abcdefghjkmnpqrstuvwxyz')
    for (let i = 0; i < 1000; i++) {
      const slug = newSlug()
      expect(slug).toHaveLength(6)
      for (const ch of slug) expect(allowed.has(ch)).toBe(true)
    }
  })

  it('never uses ambiguous characters 0, 1, i, l, o', () => {
    const joined = Array.from({ length: 1000 }, newSlug).join('')
    expect(joined).not.toMatch(/[01ilo]/)
  })
})

describe('newId / isValidId', () => {
  it('produces 12-character ids that pass validation', () => {
    const id = newId()
    expect(id).toHaveLength(12)
    expect(isValidId(id)).toBe(true)
  })

  it('rejects traversal and malformed ids', () => {
    for (const bad of ['../../etc/x', '..', 'abc', 'abcdefghijk/', 'abcdefghij.k', '']) {
      expect(isValidId(bad)).toBe(false)
    }
  })
})
