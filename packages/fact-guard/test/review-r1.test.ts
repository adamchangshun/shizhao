import { describe, expect, it } from 'vitest'
import {
  checkSentence,
  defaultRules,
  guardText,
  mergeRules,
  parseCnNumber,
  rulePacks,
} from '../src/index'

const rules = mergeRules(defaultRules, rulePacks.food)
describe('review R1 regressions (reviewer probes, not held-out evaluation)', () => {
  it.each(['全城第一口碑的蛋糕店', '最终极口感', '全城第 一 口碑的蛋糕店', '最 終 極口感'])(
    'blocks whitelist-prefix abuse even with merchant evidence: %s',
    (sentence) => {
      expect(
        checkSentence(sentence, { facts: [sentence] }, rules).map((hit) => hit.reason),
      ).toContain('ad_law_absolute')
    },
  )
  it.each([
    '最近天气转凉',
    '最后来一杯',
    '最初的味道',
    '最终选择了这家',
    '第一口就爱上',
    '第一次来',
    '第一眼就是心动',
  ])('keeps legitimate whitelist use: %s', (sentence) =>
    expect(checkSentence(sentence, { facts: [] }, rules)).toEqual([]),
  )
  it('still blocks a second occurrence outside the whitelist', () => {
    expect(
      checkSentence('第一眼就是第一名', { facts: [] }, rules).filter(
        (hit) => hit.reason === 'ad_law_absolute',
      ),
    ).toHaveLength(1)
  })
  it.each([
    ['销量遥遥领先', '月销量300份'],
    ['获得全国金奖', '获得地区金奖'],
    ['官方指定供应商', '官方登记信息'],
  ])('does not borrow a keyword to authorize a different claim: %s', (sentence, fact) => {
    expect(checkSentence(sentence, { facts: [fact] }, rules).map((hit) => hit.reason)).toContain(
      'unsupported_claim',
    )
  })
  it.each(['月销量300份', '获得地区金奖', '官方指定供应商'])(
    'allows the supported complete phrase: %s',
    (sentence) =>
      expect(checkSentence(`${sentence}，香气扑鼻。`, { facts: [sentence] }, rules)).toEqual([]),
  )
  it.each(['扫码关注送甜品', '邀请好友一起来，立减'])(
    'blocks inducement regardless of merchant evidence: %s',
    (sentence) =>
      expect(checkSentence(sentence, { facts: [sentence] }, rules).length).toBeGreaterThan(0),
  )
  it('does not confuse a social invitation with an incentive', () => {
    expect(checkSentence('邀请好友一起来坐坐', { facts: [] }, rules)).toEqual([])
  })
  it.each(['冠军配方', '业内领先的手艺'])(
    'requires evidence for additional honors and ranking terms: %s',
    (sentence) => {
      expect(checkSentence(sentence, { facts: [] }, rules).length).toBeGreaterThan(0)
      expect(checkSentence(sentence, { facts: [sentence] }, rules)).toEqual([])
    },
  )
  it.each(['一年四季都有好心情', '约上三五好友来坐坐', '十全十美的周末'])(
    'allows mood idioms without exempting nearby actual numbers: %s',
    (sentence) => {
      expect(checkSentence(sentence, { facts: [] }, rules)).toEqual([])
      expect(
        checkSentence(`${sentence}，每天限量50个`, { facts: [] }, rules).map((hit) => hit.reason),
      ).toContain('unsupported_number')
    },
  )
  it.each(['128元', '128块', '128块钱', '¥128', '￥128', '¥ 128', '１２８元'])(
    'supports currency aliases in either corpus or copy: %s',
    (price) => {
      expect(checkSentence(price, { facts: ['128元'] }, rules)).toEqual([])
      expect(checkSentence('128元', { facts: [price] }, rules)).toEqual([])
      expect(checkSentence(price, { facts: ['28元'] }, rules).map((hit) => hit.reason)).toContain(
        'unsupported_number',
      )
    },
  )
  it('preserves currency spans and keeps piece counts separate', () => {
    expect(parseCnNumber('¥128')).toMatchObject({ value: 128, unit: '元', start: 0, end: 4 })
    expect(checkSentence('售价¥128', { facts: [] }, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number', evidence: '¥128', start: 2, end: 6 }),
    )
    expect(
      checkSentence('128块蛋糕', { facts: ['128元'] }, rules).map((hit) => hit.reason),
    ).toContain('unsupported_number')
    expect(checkSentence('128年', { facts: ['¥128'] }, rules).map((hit) => hit.reason)).toContain(
      'unsupported_number',
    )
  })
  it('rechecks rewritten whitelist bypasses', async () => {
    const result = await guardText(
      '最好吃。',
      { facts: [] },
      { rules, rewriter: async () => ['全城第一口碑。'] },
    )
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})
