import { describe, expect, it } from 'vitest'
import { type FactSheet } from '@/lib/core/schemas'
import { buildFactCorpus, computeCopyRefs } from '@/lib/copy/facts'
import { guardWithRulesOnly } from '@/lib/copy'
import { checkSentence, defaultRules, mergeRules, rulePacks } from '@/packages/fact-guard/src'

const rules = mergeRules(defaultRules, rulePacks.food)
function sheet(shop: Partial<FactSheet['shop']> = {}): FactSheet {
  return {
    projectId: 'review-07gap',
    revision: 1,
    shop: { name: '小麦烘焙', ...shop },
    items: [{ id: 'croissant', name: '黄油可颂', tags: [], imageAssetIds: [], sources: {} }],
    extraClaims: [],
    confirmedAt: null,
  }
}

describe('07gap HIGH-1: shop metadata cannot authorize unrelated claims', () => {
  it.each([
    [{ address: '上海市黄浦区云南南路30号' }, '云南的阳光味道', 'origin'],
    [{ address: '虹口区进口商品直销中心日本馆1楼' }, '日本进口抹茶', 'origin'],
    [{ address: '有机农场路6号' }, '有机面粉制作', 'ingredients'],
    [{ address: '杭州市拱墅区手工艺活态馆3号' }, '每一块都是手工制作', 'process'],
    [{ address: '北京市东城区古法胡同8号' }, '古法熬制的红豆', 'process'],
    [{ address: '成都市锦江区人气广场B1' }, '人气爆棚的可颂', 'positioning'],
    [{ hours: '周末限定 10:00-18:00' }, '限定款可颂', 'positioning'],
    [{ hours: '每日限量 售完即止' }, '限量供应', 'positioning'],
    [{ address: '人民路1号2楼' }, '买2送1', 'numbers'],
    [{ address: '人民路1号' }, '买一送一', 'numbers'],
    [{ address: '文三路100号' }, '已服务100位顾客', 'numbers'],
    [{ hours: '早8晚10' }, '买8送10', 'numbers'],
  ] as const)('blocks %j -> %s', (shop, sentence, ruleId) => {
    expect(checkSentence(sentence, buildFactCorpus(sheet(shop)), rules)).toContainEqual(
      expect.objectContaining({ ruleId }),
    )
  })

  it.each([
    [{ address: '云南南路30号' }, '店在云南南路30号'],
    [{ address: '上海市黄浦区云南南路30号' }, '店在上海市黄浦区云南南路30号'],
    [{ address: '有机农场路6号' }, '店在有机农场路 ６ 号'],
    [{ hours: '每天7:30-19:00' }, '每天7:30-19:00营业'],
    [{ hours: '每天7:30-19:00' }, '营业时间 7:30 至 19:00'],
  ] as const)('preserves complete shop evidence: %j -> %s', (shop, sentence) => {
    expect(checkSentence(sentence, buildFactCorpus(sheet(shop)), rules)).toEqual([])
  })

  it('does not support an origin claim when no address exists', () => {
    expect(checkSentence('云南直供的鲜花饼', buildFactCorpus(sheet()), rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'origin' }),
    )
  })

  it('removes only the unsupported sentence and retains final literal source references', () => {
    const facts = sheet({ address: '云南南路30号', hours: '每天7:30-19:00' })
    const result = guardWithRulesOnly(
      {
        headline: '小麦烘焙',
        subhead: '店在云南南路30号。云南的阳光味道。',
        itemBlurbs: { croissant: '黄油可颂。' },
        closing: '每天7:30-19:00营业。',
      },
      buildFactCorpus(facts),
    )
    expect(result.copy.subhead).toBe('店在云南南路30号。')
    expect(result.removed).toBe(1)
    expect(result.copyRefs).toEqual(computeCopyRefs(result.copy, facts))
    expect(result.copyRefs.subhead).toEqual([
      { sentence: '店在云南南路30号。', refs: ['shop.address'] },
    ])
    expect(result.copyRefs.closing).toEqual([
      { sentence: '每天7:30-19:00营业。', refs: ['shop.hours'] },
    ])
  })
})

describe('07gap MEDIUM-3: time endpoints without recombining ranges', () => {
  const corpus = buildFactCorpus(sheet({ hours: '每天7:30-19:00' }))
  it.each(['营业到19:00', '早上7:30开门', '7:30开门，19:00打烊', '营业时间 7:30 至 19:00'])(
    'allows %s',
    (sentence) => {
      expect(checkSentence(sentence, corpus, rules)).toEqual([])
    },
  )
  it.each(['7:00-19:30营业', '7:30-19:30营业', '19:00-7:30营业', '买7送19', '只要30元'])(
    'rejects %s',
    (sentence) => {
      expect(checkSentence(sentence, corpus, rules)).toContainEqual(
        expect.objectContaining({ reason: 'unsupported_number' }),
      )
    },
  )
})

describe('07gap follow-up: real shop corpus and copy cleaning', () => {
  it('removes unsupported processes and points while retaining weather and opening time', () => {
    const facts = sheet({ hours: '每天8:00-22:00' })
    const result = guardWithRulesOnly(
      {
        headline: '小麦烘焙',
        subhead: '低温的夜晚，来杯热可可。经过慢烤的时光沉淀。',
        itemBlurbs: { croissant: '模拟低温天气的慢发酵。' },
        closing: '8点开门。下单送8点积分。',
      },
      buildFactCorpus(facts),
    )
    expect(result.copy).toEqual({
      headline: '小麦烘焙',
      subhead: '低温的夜晚，来杯热可可。',
      itemBlurbs: { croissant: '' },
      closing: '8点开门。',
    })
    expect(result.removed).toBe(3)
  })
})
