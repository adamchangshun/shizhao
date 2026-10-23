import { describe, expect, it } from 'vitest'
import { checkSentence, extractNumbers } from '../src/index'
import { normalizeText, originalSpan } from '../src/normalize'

describe('M6: invisible format characters cannot split claims', () => {
  it.each(['\u200b', '\u200c', '\u200d', '\u200e', '\u200f', '\u2060', '\ufeff', '\u00ad', '\u2063'])(
    'removes any run of %j at boundaries and between digits or Han', (gap) => {
      const run = gap.repeat(8)
      const input = `${run}零${run}糖${run}19${run}元${run}`
      expect(normalizeText(input).text).toBe('零糖19元')
      const hits = checkSentence(input, { facts: [] })
      expect(hits).toContainEqual(expect.objectContaining({ reason: 'unsupported_claim', start: 8, end: 18 }))
      expect(extractNumbers(input)).toContainEqual({ value: 19, unit: '元', raw: `19${run}元`, start: 26, end: 37 })
    },
  )
  it('joins invisible-separated digits into one amount and preserves original offsets', () => {
    const input = '🍞1\u200b\u200b\u200b\u200b9元'
    expect(extractNumbers(input)).toEqual([{ value: 19, unit: '元', raw: input.slice(2), start: 2, end: 9 }])
    expect(checkSentence(input, { facts: ['19元'] })).toEqual([])
    expect(checkSentence(input, { facts: ['9元'] })).toHaveLength(1)
    expect(originalSpan(normalizeText(input), 2, 5)).toEqual({ start: 2, end: 9 })
  })
  it('keeps the three-character limit for visible interference', () => {
    expect(normalizeText('零****糖').text).toBe('零****糖')
    expect(normalizeText('1 9元').text).toBe('1 9元')
  })
})
