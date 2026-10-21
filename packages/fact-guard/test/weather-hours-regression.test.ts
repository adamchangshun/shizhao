import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, guardText, mergeRules, rulePacks } from '../src/index'

const rules = mergeRules(defaultRules, rulePacks.food)
const corpus = { facts: ['黄油可颂'] }
const weatherClaims = [
  '低温下也能保鲜的奶油',
  '冷库低温下也新鲜',
  '低温天里慢慢发酵的面团',
  '低温的日子里冷藏一夜',
]

describe('ee4da65 MEDIUM: weather suffixes cannot hide process or storage claims', () => {
  it.each([
    ...weatherClaims,
    '低温天里烘焙的面包',
    '低温下也能慢慢熟成',
    '低温的日子里冷冻保存',
    '低温天里制作面团',
    '低温天气里慢慢发酵的面团',
    '低温来袭也能保鲜',
    '低温天里慢慢发✨酵的面团',
    '奶油保鲜在低温下也可行',
    '冷库低温下也能久放',
  ])('requires evidence and retains the original temperature span: %s', (sentence) => {
    const start = sentence.indexOf('低温')
    expect(checkSentence(sentence, corpus, rules)).toContainEqual({
      ruleId: 'process',
      reason: 'unsupported_claim',
      evidence: '低温',
      start,
      end: start + 2,
    })
  })

  it.each([
    '低温天里来块蛋糕',
    '低温下也要吃面包',
    '低温的日子里来坐坐',
    '寒潮低温，进店暖暖',
    '低温天气里制作一杯热可可',
    '低温 天气里制作一杯热可可',
    '低温天里来坐坐，慢慢发酵的面团',
  ])('retains weather context without extending across clauses: %s', (sentence) => {
    expect(checkSentence(sentence, corpus, rules)).toEqual([])
  })

  it.each(weatherClaims)('accepts actual merchant evidence for %s', (sentence) => {
    expect(checkSentence(sentence, { facts: [sentence] }, rules)).toEqual([])
  })

  it('does not let one weather occurrence exempt a later storage claim', () => {
    const sentence = '🍞低温天里来坐坐，低温下也能保鲜的奶油'
    const start = sentence.lastIndexOf('低温')
    expect(checkSentence(sentence, corpus, rules)).toEqual([
      { ruleId: 'process', reason: 'unsupported_claim', evidence: '低温', start, end: start + 2 },
    ])
  })

  it('keeps weather and storage occurrences separate within one clause', () => {
    const sentence = '低温天气里喝低温下也能保鲜的奶油'
    const start = sentence.lastIndexOf('低温')
    expect(checkSentence(sentence, corpus, rules)).toEqual([
      { ruleId: 'process', reason: 'unsupported_claim', evidence: '低温', start, end: start + 2 },
    ])
  })

  it('rejects the regressed weather claim after rewriting', async () => {
    const result = await guardText('无糖可颂。', corpus, {
      rules,
      rewriter: async () => ['低温下也能保鲜的奶油。'],
    })
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
    expect(result.hits).toContainEqual(
      expect.objectContaining({ phase: 'rewrite', evidence: '低温' }),
    )
  })
})

describe('A4 M9: shop clocks cannot support a promotion in the same clause', () => {
  const hours = { ...corpus, spanFacts: ['每天7:30-19:00'] }

  it.each([
    '7:30开抢，19:00秒杀结束',
    '7:30开抢',
    '19:00秒杀结束',
    '抢购到19:00',
    '限时到19:00',
    '活动7:30开始',
    '活动：7:30开始',
    '積分活動早上7:30见',
    '19:00结束',
    '活動７：３０開始',
    '搶購到１９：００',
    '秒✨杀19:00',
    '7:30-19:00秒杀',
  ])('rejects unsupported promotional clock context: %s', (sentence) => {
    expect(checkSentence(sentence, hours, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })

  it.each([
    '7:30开门',
    '19:00打烊',
    '营业到19:00',
    '７：３０开门，１９：００打烊',
    '7:30开门，活动另行通知',
    '活动结束，19:00打烊',
    '活动结束；19:00打烊',
    '活动结束\n19:00打烊',
  ])('retains opening hours and clause isolation: %s', (sentence) => {
    expect(checkSentence(sentence, hours, rules)).toEqual([])
  })

  it('checks only the promotional clock in a mixed sentence', () => {
    const sentence = '7:30开门，19:00秒杀结束'
    const hits = checkSentence(sentence, hours, rules)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.start >= sentence.indexOf('19:00'))).toBe(true)
  })

  it.each(['活动7:30开抢', '19:00秒杀结束', '7:30-19:00秒杀'])(
    'retains a complete explicit promotional fact: %s',
    (sentence) => {
      expect(checkSentence(sentence, { ...hours, facts: [sentence] }, rules)).toEqual([])
    },
  )

  it('does not borrow a complete bare clock fact for a promotion', () => {
    expect(checkSentence('7:30开抢', { facts: [], spanFacts: ['7:30'] }, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })

  it('does not use a grounded opening clause as evidence for a promotional suffix', () => {
    expect(checkSentence('7:30开门即秒杀', { facts: ['7:30开门'] }, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })

  it('rechecks promotional clocks after rewriting', async () => {
    const result = await guardText('无糖可颂。', hours, {
      rules,
      rewriter: async () => ['7:30开抢，19:00秒杀结束。'],
    })
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})
