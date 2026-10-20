import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, guardText, mergeRules, rulePacks } from '../src/index'

const rules = mergeRules(defaultRules, rulePacks.food)
const corpus = { facts: ['黄油可颂'] }

describe('07gap remaining MEDIUM-A: recognize atmosphere beyond exact phrases', () => {
  it.each([
    '低温的夜晚，来杯热可可',
    '低温来袭，暖暖身子',
    '慢烤般悠长的周末',
    '低温 天气',
    '冬日低温，来坐坐',
    '低温袭来的午后',
    '慢烤般的午后',
    '像慢烤一样悠长的时光',
    '慢烤的岁月',
    '天色经过了变化，慢烤般悠长的周末',
  ])('allows weather or an abstract metaphor: %s', (sentence) => {
    expect(checkSentence(sentence, corpus, rules)).toEqual([])
  })

  it.each([
    '低温发酵',
    '低温慢烤的可颂',
    '低温烘焙',
    '低温熟成',
    '低温萃取',
    '低温冷藏',
    '低温加工',
    '低温蛋糕',
    '低温黄油可颂',
    '低温✨发酵',
    '低温天气里暖一暖，低温发酵的可颂',
  ])('still requires process evidence: %s', (sentence) => {
    const start = sentence.lastIndexOf('低温')
    expect(checkSentence(sentence, corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'process', evidence: '低温', start, end: start + 2 }),
    )
  })
})

describe('07gap remaining MEDIUM-B: factual context overrides a metaphor', () => {
  it.each([
    ['每块都经慢烤的时光', '慢烤'],
    ['经过慢烤的时光沉淀', '慢烤'],
    ['模拟低温天气的慢发酵', '低温'],
    ['每块都经过慢烤的时光', '慢烤'],
    ['采用传统工艺慢烤的时光', '慢烤'],
    ['蛋糕都是慢烤的时光', '慢烤'],
    ['每份都用慢烤的岁月沉淀', '慢烤'],
    ['经过✨慢烤的时光', '慢烤'],
    ['慢烤的时光，慢烤可颂', '慢烤'],
  ])('blocks the actual process claim in %s', (sentence, term) => {
    const start = sentence.lastIndexOf(term)
    expect(checkSentence(sentence, corpus, rules)).toContainEqual(
      expect.objectContaining({
        ruleId: 'process',
        evidence: term,
        start,
        end: start + term.length,
      }),
    )
  })

  it.each([
    ['经过慢烤的时光沉淀', '本店采用慢烤工艺'],
    ['模拟低温天气的慢发酵', '低温发酵'],
  ])('allows the same process when ordinary facts support it: %s', (sentence, fact) => {
    expect(checkSentence(sentence, { facts: [fact] }, rules)).toEqual([])
  })

  it('does not let a rewrite introduce a process under a metaphor', async () => {
    const result = await guardText('无糖可颂。', corpus, {
      rules,
      rewriter: async () => ['经过慢烤的时光沉淀。'],
    })
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})

describe('clock evidence is not a loyalty-point amount', () => {
  const hours = { facts: ['黄油可颂'], spanFacts: ['每天8:00-22:00'] }
  it.each([
    '下单送8点积分',
    '下单送八点积分',
    '下单送８點積分',
    '下单送8点 积分',
    '下单送8点会员积分',
    '下单送8点奖励',
    '下单送22点积分',
    '8点开门，下单送8点积分',
  ])('rejects points borrowed from shop hours: %s', (sentence) => {
    expect(checkSentence(sentence, hours, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })

  it.each(['8点开门', '22点打烊', '每天8点至22点营业', '八点开门，二十二点打烊', '8点下单'])(
    'retains supported clock expressions: %s',
    (sentence) => {
      expect(checkSentence(sentence, hours, rules)).toEqual([])
    },
  )

  it('does not turn an ordinary points fact into a clock', () => {
    expect(checkSentence('8点开门', { facts: ['下单送8点积分'] }, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
    expect(checkSentence('下单送8点积分', { facts: ['下单送8点积分'] }, rules)).toEqual([])
  })

  it('does not let a rewrite borrow points from hours', async () => {
    const result = await guardText('无糖可颂。', hours, {
      rules,
      rewriter: async () => ['下单送8点积分。'],
    })
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})
