import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, guardText, mergeRules, rulePacks } from '../src/index'

const rules = mergeRules(defaultRules, rulePacks.food)
describe('review R2: HIGH-2b whitelist boundaries', () => {
  it.each([
    '全城第一 次次爆满',
    '全城第一·次次爆满',
    '全城第一口福',
    '本地第一眼镜级精致',
    '第\u200b一次来',
    '第一✨口就爱上',
    '第一眼光独到',
    '全城第一口味',
  ])('blocks manufactured or noun-prefix whitelist matches: %s', (sentence) => {
    const hits = checkSentence(sentence, { facts: [sentence] }, rules)
    expect(hits.map((hit) => hit.reason)).toContain('ad_law_absolute')
    const hit = hits.find((hit) => hit.reason === 'ad_law_absolute')!
    expect(sentence.slice(hit.start, hit.end)).toBe(hit.evidence)
  })
  it.each([
    '第一口',
    '第一次。',
    '第一眼！',
    '第一口就爱上',
    '第一次来',
    '第一眼看见',
    '第一口便喜欢',
    '第一眼的心动',
  ])('allows contiguous whitelist words with positive following context: %s', (sentence) => {
    expect(checkSentence(sentence, { facts: [] }, rules)).toEqual([])
  })
  it('checks raw contiguity for both literal and regex whitelists', () => {
    const custom = {
      rules: [
        {
          id: 'custom',
          reason: 'ad_law_absolute' as const,
          terms: ['最', '第一'],
          always: true,
          whitelist: ['最近'],
          whitelistPatterns: ['第一次(?=来)'],
        },
      ],
    }
    expect(checkSentence('最 近', { facts: [] }, custom).map((hit) => hit.reason)).toContain(
      'ad_law_absolute',
    )
    expect(checkSentence('第一·次来', { facts: [] }, custom).map((hit) => hit.reason)).toContain(
      'ad_law_absolute',
    )
    expect(checkSentence('最近第一次来', { facts: [] }, custom)).toEqual([])
  })
  it('does not exempt a separate unsupported occurrence', () => {
    expect(
      checkSentence('第一口就爱上，全城第一口福', { facts: [] }, rules).filter(
        (hit) => hit.reason === 'ad_law_absolute',
      ),
    ).toHaveLength(1)
  })
  it('rechecks manufactured whitelists after rewriting', async () => {
    const result = await guardText(
      '最好吃。',
      { facts: [] },
      { rules, rewriter: async () => ['全城第一·次次爆满。'] },
    )
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})

describe('review R2: MEDIUM-3 literal fact coverage', () => {
  it.each([
    ['月销量300份的草莓奶油蛋糕', '月销量300份'],
    ['上过本地必吃榜的蛋糕', '本地必吃榜'],
    ['回头客很多的小店', '回头客很多'],
    ['蛋糕上过本地必吃榜', '本地必吃榜'],
    ['本地必吃榜的蛋糕也上过本地必吃榜', '本地必吃榜'],
  ])('allows decoration and reordering around a complete fact: %s', (sentence, fact) => {
    expect(checkSentence(sentence, { facts: [fact] }, rules)).toEqual([])
  })
  it.each([
    ['月销量300份全城领先', '月销量300份'],
    ['销量遥遥领先', '月销量300份'],
    ['上过全国必吃榜的蛋糕', '本地必吃榜'],
    ['获得全国金奖', '获得地区金奖'],
    ['官方指定供应商', '官方登记信息'],
    ['上过本地必吃榜的蛋糕也是冠军配方', '本地必吃榜'],
    ['上过本地必吃榜，也上过全国必吃榜', '本地必吃榜'],
    ['获得金奖', '没有获得金奖'],
  ])('does not authorize a claim outside the literal fact span: %s', (sentence, fact) => {
    expect(checkSentence(sentence, { facts: [fact] }, rules).map((hit) => hit.reason)).toContain(
      'unsupported_claim',
    )
  })
  it('reports only the unsupported claim with its original span', () => {
    expect(checkSentence('月销量300份全城领先', { facts: ['月销量300份'] }, rules)).toEqual([
      { reason: 'unsupported_claim', ruleId: 'ranking', evidence: '领先', start: 9, end: 11 },
    ])
  })
})
