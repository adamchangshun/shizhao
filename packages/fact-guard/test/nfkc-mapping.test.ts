import { describe, expect, it } from 'vitest'
import {
  checkSentence,
  defaultRules,
  extractNumbers,
  guardText,
  mergeRules,
  rulePacks,
} from '../src/index'
import { normalizeText, originalSpan } from '../src/normalize'

const foodRules = mergeRules(defaultRules, rulePacks.food)

describe('M7: NFKC claims retain source ranges', () => {
  it('recognizes supplementary mathematical digits as one price', () => {
    const text = '🍞𝟙𝟡元'
    expect(extractNumbers(text)).toEqual([{ value: 19, unit: '元', raw: '𝟙𝟡元', start: 2, end: 7 }])
    expect(checkSentence(text, { facts: [] })).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number', start: 2, end: 7 }),
    )
    expect(checkSentence(text, { facts: ['19元'] })).toEqual([])
    expect(checkSentence('19元', { facts: ['𝟙𝟡元'] })).toEqual([])
  })
  it('maps compatibility expansion and composition to whole source clusters', () => {
    const text = '🍞㍑e\u0301Ａ'
    const result = normalizeText(text)
    expect(result.text).toBe('🍞リットルéa')
    expect(originalSpan(result, 2, 6)).toEqual({ start: 2, end: 3 })
    expect(originalSpan(result, 6, 7)).toEqual({ start: 3, end: 5 })
    expect(originalSpan(result, 7, 8)).toEqual({ start: 5, end: 6 })
  })
  it('normalizes compatibility units and reports their original width', () => {
    expect(extractNumbers('重２㎏')).toEqual([
      { value: 2, unit: 'kg', raw: '２㎏', start: 1, end: 3 },
    ])
  })
  it('preserves horizontal ellipsis code points through compatibility normalization', () => {
    expect(normalizeText('…‥').text).toBe('…‥')
  })
  it('combines normalization with invisible removal and retains multiple source occurrences', () => {
    const text = '𝟙\u200b𝟡元，𝟚𝟡元'
    expect(extractNumbers(text)).toEqual([
      { value: 19, unit: '元', raw: '𝟙\u200b𝟡元', start: 0, end: 6 },
      { value: 29, unit: '元', raw: '𝟚𝟡元', start: 7, end: 12 },
    ])
    expect(checkSentence(text, { facts: ['19元'] })).toEqual([
      expect.objectContaining({ reason: 'unsupported_number', start: 7, end: 12 }),
    ])
  })
  it.each(['慢烤的时光……才出炉的面包', '低温天里……慢慢发酵的面团'])(
    'does not turn horizontal ellipses into clause boundaries: %s',
    (text) => {
      expect(checkSentence(text, { facts: [] }, foodRules)).toContainEqual(
        expect.objectContaining({ ruleId: 'process' }),
      )
    },
  )
  it('removes both unsupported process sentences separated by punctuation', async () => {
    const result = await guardText(
      '低温天里……慢慢发酵的面团。慢烤的时光……才出炉的面包。',
      { facts: [] },
      { rules: foodRules },
    )
    expect(result.text).toBe('')
    expect(result.hits.map((hit) => hit.ruleId)).toEqual(['process', 'process'])
  })
})
