import { describe, expect, it } from 'vitest'
import { checkSentence } from '../src/index'

describe('NFKC symbols do not create numerical claims', () => {
  it.each([
    ['120㎡的大空间', ['店面120平米']],
    ['120㎥的大空间', ['店面120立方米']],
    ['120m²的大空间', ['店面120平米']],
    ['①号店今天也营业', []],
    ['⑴早餐套餐 ⑵下午茶', []],
    ['⒈ 早餐 ⒉ 午餐', []],
    ['加½份奶油更顺滑', []],
    ['双倍快乐²', []],
  ])('allows %s without treating compatibility symbols as digits', (sentence, facts) => {
    expect(checkSentence(sentence, { facts })).toEqual([])
  })

  it('still checks mathematical decimal digits against merchant facts', () => {
    expect(checkSentence('𝟙𝟡元', { facts: [] })).toEqual([
      expect.objectContaining({
        reason: 'unsupported_number',
        evidence: '𝟙𝟡元',
        start: 0,
        end: 5,
      }),
    ])
    expect(checkSentence('𝟙𝟡元', { facts: ['19元'] })).toEqual([])
  })
})
