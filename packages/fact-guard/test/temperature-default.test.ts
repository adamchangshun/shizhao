import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, guardText, mergeRules, rulePacks } from '../src/index'

const rules = mergeRules(defaultRules, rulePacks.food)
const corpus = { facts: ['黄油可颂'] }
const regressedClaims = [
  '低温鲜奶',
  '低温吐司',
  '低温奶油',
  '低温长时间醒面',
  '低温慢煮的牛排',
  '低温烤出的可颂',
  '低温冷冻锁鲜',
]

describe('22006fc HIGH: temperature requires evidence by default', () => {
  it.each(regressedClaims)('restores the 1752933 block: %s', (sentence) => {
    expect(checkSentence(sentence, corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'process', evidence: '低温', start: 0, end: 2 }),
    )
  })

  it.each(['低温云朵酥', '低温未来工艺', '低温', '低温天然奶油', '寒潮低温鲜奶'])(
    'does not require an enumerated product or process to trigger: %s',
    (sentence) => {
      expect(checkSentence(sentence, corpus, rules)).toContainEqual(
        expect.objectContaining({ ruleId: 'process', evidence: '低温' }),
      )
    },
  )

  it.each(regressedClaims)('retains real merchant evidence for %s', (sentence) => {
    expect(checkSentence(sentence, { facts: [sentence] }, rules)).toEqual([])
  })

  it.each([
    '低温天里来块蛋糕',
    '寒潮低温，进店暖暖',
    '低温下也要吃面包',
    '低温天气适合来杯热拿铁',
    '低温的夜晚，来杯热可可',
    '低温天气里制作一杯热可可',
    '低温 天气',
    '冬日低温，来坐坐',
    '低温的早晨，来杯咖啡',
    '低温的日子，暖暖身子',
  ])('exempts an explicit weather context: %s', (sentence) => {
    expect(checkSentence(sentence, corpus, rules)).toEqual([])
  })

  it.each([
    '低温发酵',
    '低温慢烤的可颂',
    '低温✨发酵',
    '模拟低温天气的慢发酵',
    '模拟低温天气里发酵',
    '控制低温天气里发酵',
    '模 拟低温 天气里发酵',
    '低温下发酵',
    '低温天气发酵',
    '低温✨天气',
    '低温\u200b天气',
  ])('does not manufacture a weather exemption: %s', (sentence) => {
    expect(checkSentence(sentence, corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'process', evidence: '低温' }),
    )
  })

  it('exempts only the weather occurrence and preserves original offsets', () => {
    const sentence = '🍞低温 天气里来坐坐，低温鲜奶'
    expect(checkSentence(sentence, corpus, rules)).toEqual([
      {
        ruleId: 'process',
        reason: 'unsupported_claim',
        evidence: '低温',
        start: sentence.lastIndexOf('低温'),
        end: sentence.lastIndexOf('低温') + 2,
      },
    ])
  })

  it('keeps absolute-term whitespace bypasses closed', () => {
    expect(checkSentence('低温 天气，第一 次次爆满', corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'absolute', reason: 'ad_law_absolute' }),
    )
    expect(checkSentence('低温的冬日最好', corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'absolute', evidence: '最' }),
    )
  })

  it('rechecks a rewrite with a previously unlisted temperature claim', async () => {
    const result = await guardText('无糖可颂。', corpus, {
      rules,
      rewriter: async () => ['低温鲜奶。'],
    })
    expect(result).toMatchObject({ text: '', rewritten: 0, removed: 1 })
  })
})

describe('optional MEDIUM: process cues around a slow-roast metaphor', () => {
  it.each([
    '通过慢烤的时光沉淀',
    '靠慢烤的时光沉淀',
    '以慢烤的时光沉淀',
    '全程慢烤的时光',
    '每一块都慢烤的时光',
    '可颂慢烤的时光里出炉',
    '吐司慢烤的时光里出炉',
  ])('requires process evidence for %s', (sentence) => {
    expect(checkSentence(sentence, corpus, rules)).toContainEqual(
      expect.objectContaining({ ruleId: 'process', evidence: '慢烤' }),
    )
  })

  it.each(['用心感受慢烤般的午后', '和朋友共度慢烤般的周末'])(
    'retains mood language: %s',
    (sentence) => {
      expect(checkSentence(sentence, corpus, rules)).toEqual([])
    },
  )
})

describe('optional MEDIUM: points before the number', () => {
  const hours = { ...corpus, spanFacts: ['每天8:00-22:00'] }
  it.each([
    '下单送积分8点',
    '积分送8点',
    '下单送8点会员分',
    '下单送8点福利',
    '積分送８點',
    '积分：8点',
  ])('does not use hours for the reward: %s', (sentence) => {
    expect(checkSentence(sentence, hours, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
    expect(checkSentence(sentence, { facts: [sentence] }, rules)).toEqual([])
  })

  it.each(['早上8点见', '8点准时开门', '22点前到店', '营业到22点', '积分活动另行通知，早上8点见'])(
    'retains genuine clock references: %s',
    (sentence) => {
      expect(checkSentence(sentence, hours, rules)).toEqual([])
    },
  )

  it('does not reuse a points prefix as opening-time evidence', () => {
    expect(checkSentence('8点开门', { facts: ['下单送积分8点'] }, rules)).toContainEqual(
      expect.objectContaining({ reason: 'unsupported_number' }),
    )
  })
})
