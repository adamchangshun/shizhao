import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/safe-next'

describe('safeNext', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeNext('/projects/abc?step=2#top')).toBe('/projects/abc?step=2#top')
  })

  it.each([
    null,
    '',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
  ])('falls back to / for %j', (raw) => {
    expect(safeNext(raw)).toBe('/')
  })
})
