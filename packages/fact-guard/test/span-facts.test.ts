import { describe, expect, it } from 'vitest'
import {
  checkSentence,
  computeDocumentRefs,
  defaultRules,
  guardDocument,
  mergeRules,
  rulePacks,
} from '../src/index'

const rules = mergeRules(defaultRules, rulePacks.food)

describe('span-only evidence', () => {
  it.each([
    ['云南南路30号', '店在云南南路30号'],
    ['有机农场路6号', '店在有机农场路 ６ 號'],
    ['手工艺馆3号', '店在手工艺馆３号'],
    ['官方路1号', '店在官方路1号'],
    ['爆款街8号', '店在爆款街8号'],
    ['养生路2号', '店在养生路2号'],
    ['周末限定 10:00-18:00', '周末限定 １０：００—１８：００营业'],
    ['早8晚10', '早8晚10营业'],
  ])('grounds only complete display-equivalent occurrences of %s', (fact, sentence) => {
    const corpus = { facts: [], spanFacts: [fact] }
    expect(checkSentence(sentence, corpus, rules)).toEqual([])
  })

  it.each([
    ['云南南路30号', '店在云南南路30号，云南的阳光味道', '云南'],
    ['有机农场路6号', '店在有机农场路6号，有机面粉制作', '有机'],
    ['手工艺馆3号', '店在手工艺馆3号，手工制作', '手工'],
    ['官方路1号', '店在官方路1号，官方认证', '官方'],
    ['爆款街8号', '店在爆款街8号，全城爆款', '爆款'],
    ['养生路2号', '店在养生路2号，养生甜点', '养生'],
    ['周末限定 10:00-18:00', '周末限定 10:00-18:00营业，限定可颂', '限定'],
  ])('does not exempt another occurrence outside %s', (fact, sentence, term) => {
    const corpus = { facts: [], spanFacts: [fact] }
    const start = sentence.lastIndexOf(term)
    expect(checkSentence(sentence, corpus, rules)).toContainEqual(
      expect.objectContaining({ evidence: term, start, end: start + term.length }),
    )
  })

  it.each([
    ['人民路1号2楼', '买2送1'],
    ['文三路100号', '文三路1000号'],
    ['云南南路30号', '云南✨南路30号'],
    ['上海市黄浦区云南南路30号', '店在云南南路30号'],
  ])('does not derive partial or interference-altered evidence from %s', (fact, sentence) => {
    const corpus = { facts: [], spanFacts: [fact] }
    expect(checkSentence(sentence, corpus, rules).length).toBeGreaterThan(0)
  })

  it.each(['最好路1号', '转发领取路2号'])('cannot exempt always-blocked rules: %s', (fact) => {
    const corpus = { facts: [], spanFacts: [fact] }
    expect(checkSentence(`店在${fact}`, corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: fact.startsWith('最') ? 'absolute' : 'sharing' }),
    )
  })

  it('keeps default and supplied paths literal and tied to final text', () => {
    const corpus = {
      facts: ['可颂'],
      spanFacts: ['云南南路30号', '每天7:30-19:00'],
      spanPaths: ['shop.address'],
    }
    expect(
      computeDocumentRefs({ text: '云南南路30号。每天7:30-19:00。营业到19:00。' }, corpus),
    ).toEqual({
      text: [
        { sentence: '云南南路30号。', refs: ['shop.address'] },
        { sentence: '每天7:30-19:00。', refs: ['spanFacts.1'] },
        { sentence: '营业到19:00。', refs: [] },
      ],
    })
  })

  it('checks rewrites against span boundaries as well', async () => {
    const corpus = { facts: ['可颂'], spanFacts: ['云南南路30号'] }
    const result = await guardDocument({ text: '零糖可颂。' }, corpus, {
      rules,
      rewriter: async () => ['云南的阳光味道。'],
    })
    expect(result).toMatchObject({ fields: { text: '' }, rewritten: 0, removed: 1 })
  })

  it('keeps span evidence separate and available to both model callbacks', async () => {
    const corpus = { facts: ['可颂'], spanFacts: ['云南南路30号'] }
    const result = await guardDocument({ text: '店在云南南路30号。零糖可颂。' }, corpus, {
      rules,
      judge: async ({ sentences, facts, spanFacts }) => {
        expect(facts).toEqual(['可颂'])
        expect(spanFacts).toEqual(['云南南路30号'])
        return sentences.map(() => ({ unsupported: false }))
      },
      rewriter: async ({ facts, spanFacts }) => {
        expect(facts).toEqual(['可颂'])
        expect(spanFacts).toEqual(['云南南路30号'])
        return ['店在云南南路30号。']
      },
    })
    expect(result).toMatchObject({
      fields: { text: '店在云南南路30号。店在云南南路30号。' },
      rewritten: 1,
      removed: 0,
    })
  })

  it.each([
    [['7:30', '19:00'], '7:30-19:00营业'],
    [['7:30-12:00', '13:00-19:00'], '7:30-19:00营业'],
    [['7:30-19:00'], '19:00-7:30营业'],
  ])('does not synthesize ranges from %j', (spanFacts, sentence) => {
    expect(checkSentence(sentence, { facts: [], spanFacts }, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })
})

describe('07gap MEDIUM-1: rankings keep complete fact evidence', () => {
  it('does not borrow 爆款 from a product name for a citywide ranking', () => {
    expect(checkSentence('全城爆款', { facts: ['爆款草莓蛋糕'] }, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'ranking', evidence: '爆款' }),
    )
    expect(checkSentence('尝尝爆款草莓蛋糕', { facts: ['爆款草莓蛋糕'] }, rules)).toEqual([])
  })
})

describe('07gap MEDIUM-2: narrow atmosphere exemptions', () => {
  it.each([
    '低温的冬夜，来一杯热可可',
    '寒潮来袭，低温天气里暖一暖',
    '慢烤的时光',
    '这是我们的招牌笑容',
    '把限定的温柔留给你',
    '手工皂般细腻的奶油',
  ])('allows %s', (sentence) => {
    expect(checkSentence(sentence, { facts: ['黄油可颂'] }, rules)).toEqual([])
  })

  it.each([
    ['低温天气里暖一暖，低温发酵的可颂', '低温'],
    ['慢烤的时光，慢烤可颂', '慢烤'],
    ['招牌笑容，招牌可颂', '招牌'],
    ['限定的温柔，限定款可颂', '限定'],
    ['手工皂般细腻的奶油，手工制作', '手工'],
    ['低温✨天气里的可颂', '低温'],
    ['手工皂奶油', '手工'],
  ])('does not exempt a factual or noncontiguous hit: %s', (sentence, term) => {
    expect(checkSentence(sentence, { facts: ['黄油可颂'] }, rules)).toContainEqual(
      expect.objectContaining({ evidence: term }),
    )
  })
})
