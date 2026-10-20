import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, guardText, mergeRules, rulePacks } from '../src/index'

const vocabulary = [
  ['process', '手作'],
  ['process', '手工'],
  ['process', '现烤'],
  ['process', '现做'],
  ['process', '现磨'],
  ['process', '手切'],
  ['process', '慢烤'],
  ['process', '低温'],
  ['process', '古法'],
  ['process', '秘制'],
  ['positioning', '招牌'],
  ['positioning', '热销'],
  ['positioning', '人气'],
  ['ranking', '爆款'],
  ['positioning', '必点'],
  ['positioning', '限量'],
  ['positioning', '限定'],
  ['positioning', '本周限定'],
  ['positioning', '新鲜出炉'],
] as const

describe('A2 rules gap: base process and positioning claims', () => {
  it.each(vocabulary)('blocks ungrounded %s: %s without the food pack', (ruleId, term) => {
    expect(checkSentence(`${term}蛋糕`, { facts: ['蛋糕'] })).toContainEqual(
      expect.objectContaining({ ruleId, reason: 'unsupported_claim', evidence: term }),
    )
  })

  it.each(vocabulary)('grounds %s: %s with the required scope', (ruleId, term) => {
    const corpus = { facts: [`${term}黄油可颂`] }
    const sentence = ruleId === 'ranking' ? `尝尝${term}黄油可颂` : `尝尝${term}的暖香`
    expect(checkSentence(sentence, corpus)).toEqual([])
    expect(checkSentence(sentence, corpus, mergeRules(defaultRules, rulePacks.food))).toEqual([])
  })

  it.each(['不是手作', '并非招牌', '没有现烤', '非爆款'])(
    'does not treat negated merchant text as evidence: %s',
    (fact) => {
      const term = fact.replace(/^(不是|并非|没有|非)/u, '')
      expect(checkSentence(`${term}蛋糕`, { facts: [fact] }).length).toBeGreaterThan(0)
    },
  )

  it.each([
    ['現烤', 'process'],
    ['熱銷', 'positioning'],
    ['人氣', 'positioning'],
    ['祕製', 'process'],
    ['新鮮出爐', 'positioning'],
    ['必點', 'positioning'],
  ])('normalizes new traditional vocabulary: %s', (term, ruleId) => {
    expect(checkSentence(`尝尝${term}`, { facts: [] })).toContainEqual(
      expect.objectContaining({ ruleId, evidence: term, start: 2, end: 2 + term.length }),
    )
  })

  it('retains original offsets after interference removal', () => {
    expect(checkSentence('🍞尝尝手✨作可颂', { facts: [] })).toEqual([
      { ruleId: 'process', reason: 'unsupported_claim', evidence: '手✨作', start: 4, end: 7 },
    ])
  })

  it('does not let a grounded positioning term support additional rankings or restrictions', () => {
    expect(checkSentence('本周限定', { facts: ['限定蛋糕'] })).toContainEqual(
      expect.objectContaining({ ruleId: 'positioning', evidence: '本周限定' }),
    )
    expect(checkSentence('人气持续攀升', { facts: ['人气蛋糕'] })).toContainEqual(
      expect.objectContaining({ ruleId: 'ranking' }),
    )
  })

  it('still rejects absolute terms in grounded product names', () => {
    expect(checkSentence('招牌最好吃的蛋糕', { facts: ['招牌最好吃的蛋糕'] })).toContainEqual(
      expect.objectContaining({ reason: 'ad_law_absolute' }),
    )
  })

  it('rechecks the new claims after rewriting', async () => {
    const result = await guardText(
      '零糖蛋糕。',
      { facts: ['蛋糕'] },
      {
        rewriter: async () => ['手作招牌蛋糕。'],
      },
    )
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})

describe('A2 rules gap: time and address evidence intervals', () => {
  it.each([
    ['每天 7:30 — 19:00', '每天7:30-19:00'],
    ['每天 ７：３０ ～ １９：００', '每天7:30-19:00'],
    ['每天7:30〜19:00', '每天7:30-19:00'],
    ['每天7:30－19:00', '每天7:30-19:00'],
    ['每天7:30−19:00', '每天7:30-19:00'],
    ['每天7:30–19:00', '每天7:30-19:00'],
    ['每天7点30分到19点', '每天7:30-19:00'],
    ['每天7时30分至19时', '每天7:30-19:00'],
    ['每天七点三十分至十九点', '每天7:30-19:00'],
    ['每天7点半至19点整', '每天07:30-19:00'],
    ['营业时间：7:30—19:00', '每天7时30分至19时'],
    ['每天 ０７ 時 ３０ 分 ～ １９ 時', '每天7:30-19:00'],
    ['西湖区文三路 １００ 号', '西湖区文三路100号'],
    ['西湖区文三路 100 號', '西湖区文三路１００号'],
    ['西湖区文三路 １００ ～ １０２ 号', '西湖区文三路100-102号'],
    ['杭州 · 西湖区文三路 100 号', '杭州市西湖区文三路100号'],
  ])('allows equivalent display: %s', (sentence, fact) => {
    expect(checkSentence(sentence, { facts: [fact] })).toEqual([])
  })

  it.each([
    ['每天7点30分至19点', []],
    ['西湖区文三路 100 号', []],
    ['每天7:00-19:30', ['每天7:30-19:00']],
    ['每天7:30-19:30', ['每天7:30-19:00']],
    ['每天7:30-19:00', ['7', '30', '19', '0']],
    ['仅售30元', ['每天7:30-19:00']],
    ['限量30个', ['每天7:30-19:00']],
    ['西湖区文三路1000号', ['西湖区文三路100号']],
    ['西湖区文三路100-102号', ['西湖区文三路100号']],
  ])('does not manufacture evidence: %s', (sentence, facts) => {
    expect(checkSentence(sentence, { facts })).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })

  it('does not allow a supported interval to hide another number or an absolute term', () => {
    const sentence = '🍞每天７点３０分—１９点，限量88个，最好。'
    const hits = checkSentence(sentence, { facts: ['每天7:30-19:00', '限量'] })
    expect(hits).toHaveLength(2)
    expect(hits).toContainEqual({
      ruleId: 'numbers',
      reason: 'unsupported_number',
      evidence: '88个',
      start: sentence.indexOf('88'),
      end: sentence.indexOf('88') + 3,
    })
    expect(hits).toContainEqual(
      expect.objectContaining({ reason: 'ad_law_absolute', evidence: '最' }),
    )
  })

  it.each([
    ['三点五元', '3.5元'],
    ['三点五倍', '3.5倍'],
    ['３．５元', '三点五元'],
    ['三点五年', '3.5年'],
    ['三点五分钟', '3.5分钟'],
    ['三点五米', '3.5米'],
    ['三点五小时', '3.5小时'],
  ])('keeps numeric quantities distinct from clocks: %s', (sentence, fact) => {
    expect(checkSentence(sentence, { facts: [fact] })).toEqual([])
  })
})

describe('A2 rules gap: preserve ingredient vocabulary', () => {
  it.each([
    ['拿铁', '咖啡与奶轻柔相融，温润醇香。'],
    ['芝士蛋糕', '芝士柔滑，香气轻盈。'],
    ['柠檬茶', '柠檬清香浮沉于茶汤，酸与甘悄然平衡。'],
  ])('keeps ordinary ingredients of %s outside unsupported-claim rules', (name, sentence) => {
    expect(
      checkSentence(sentence, { facts: [name] }, mergeRules(defaultRules, rulePacks.food)),
    ).toEqual([])
  })

  it('still requires evidence for a dietary claim attached to an ordinary ingredient', () => {
    expect(checkSentence('无糖拿铁，咖啡与奶香交织', { facts: ['拿铁'] })).toContainEqual(
      expect.objectContaining({ ruleId: 'ingredients', evidence: '无糖' }),
    )
  })
})
