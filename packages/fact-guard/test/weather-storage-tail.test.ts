import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, guardText, mergeRules, rulePacks } from '../src/index'
const rules = mergeRules(defaultRules, rulePacks.food)
const claims = [
  '低温下也能存放一周的奶油',
  '低温下也不变质的奶油',
  '低温天里慢慢醒发的面团',
  '低温下也能长久储存',
  '低温天里静置一夜的面团',
  '低温下也能久放的奶油',
]
describe('LOW-3: weather suffixes cannot hide the reported storage predicates', () => {
  it.each(claims)('requires temperature evidence for %s', (sentence) => {
    expect(checkSentence(sentence, { facts: [] }, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'process', start: 0, end: 2 }),
    )
    expect(checkSentence(sentence, { facts: [sentence] }, rules)).toEqual([])
  })
  it.each([
    '低温天里来块蛋糕',
    '低温下也要吃面包',
    '低温的日子里来坐坐',
    '寒潮低温，进店暖暖',
    '低温天气里制作一杯热可可',
    '低温天里来坐坐，面团慢慢醒发',
    '低温天里来聊聊储存心情的日记',
  ])('keeps unrelated weather context: %s', (sentence) =>
    expect(checkSentence(sentence, { facts: [] }, rules)).toEqual([]),
  )
  it('does not extend the storage predicate across another temperature occurrence', () => {
    const sentence = '低温天气里喝低温下也能久放的奶油'
    expect(checkSentence(sentence, { facts: [] }, rules)).toEqual([
      expect.objectContaining({ ruleId: 'process', start: 6, end: 8 }),
    ])
  })
  it('checks the same predicate after rewriting', async () => {
    expect(
      await guardText(
        '无糖奶油。',
        { facts: [] },
        { rules, rewriter: async () => ['低温下也能久放的奶油。'] },
      ),
    ).toMatchObject({ text: '', removed: 1, rewritten: 0 })
  })
})
