import { readFileSync, writeSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as guard from '../src/index'
import cases from './cases.zh.json'

describe('normalization and original UTF-16 spans', () => {
  it.each(['零 糖', '零*糖', '零✨糖', '零糖', '零\u200b糖', '零🌿糖'])(
    'catches %s at its full original span',
    (text) => {
      const hits = guard.checkSentence(`尝尝${text}配方`, { facts: [] })
      expect(hits).toContainEqual(
        expect.objectContaining({ reason: 'unsupported_claim', start: 2, end: 2 + text.length }),
      )
    },
  )
  it('limits interference to three characters', () => {
    expect(guard.checkSentence('零***糖', { facts: [] }).length).toBeGreaterThan(0)
    expect(guard.checkSentence('零****糖', { facts: [] })).toEqual([])
  })
  it('handles traditional characters, fullwidth Latin letters and numeric punctuation', () => {
    expect(guard.checkSentence('銷量第一', { facts: [] }).map((h) => h.reason)).toContain(
      'ad_law_absolute',
    )
    expect(guard.checkSentence('ＴＯＰ１', { facts: [] }).length).toBeGreaterThan(0)
    expect(guard.checkSentence('２８元', { facts: ['28元'] })).toEqual([])
  })
  it('applies whitelists only to the matching span, never to the entire sentence', () => {
    expect(guard.checkSentence('最近第一口就爱上', { facts: [] })).toEqual([])
    expect(
      guard
        .checkSentence('最近吃到最好吃的蛋糕，第一口就是全城第一', { facts: ['全城第一'] })
        .filter((h) => h.reason === 'ad_law_absolute'),
    ).toHaveLength(2)
  })
})

describe('number parsing', () => {
  it('checks bare Chinese numerical claims while allowing common idioms', () => {
    expect(guard.checkSentence('仅售三十', { facts: ['28元'] }).map((h) => h.reason)).toContain(
      'unsupported_number',
    )
    expect(guard.checkSentence('价格三', { facts: [] }).map((h) => h.reason)).toContain(
      'unsupported_number',
    )
    expect(guard.checkSentence('一如既往香气十足，三言两语道不尽', { facts: [] })).toEqual([])
  })
  it.each([
    ['零', 0, ''],
    ['九十九', 99, ''],
    ['两百', 200, ''],
    ['三年', 3, '年'],
    ['百分之九十', 90, '%'],
    ['三成', 30, '%'],
    ['八折', 80, '%'],
    ['半天', 0.5, '天'],
    ['拾贰小时', 12, '小时'],
    ['二〇一八年', 2018, '年'],
    ['壹万贰仟', 12000, ''],
    ['一亿零三万', 100030000, ''],
    ['半', 0.5, ''],
    ['三点五倍', 3.5, '倍'],
    ['１２．５元', 12.5, '元'],
    ['百分之百', 100, '%'],
  ])('parses %s', (input, value, unit) => {
    expect(guard.parseCnNumber(input)).toMatchObject({ value, unit, start: 0, end: input.length })
  })
  it.each(['几个', '一百百', '两半', '三点', '一亿亿', '', '十十', '点五'])(
    'does not guess %s',
    (input) => {
      expect(guard.parseCnNumber(input)).toBeNull()
    },
  )
  it('does not borrow prices for duration, or partial numbers for a larger amount', () => {
    expect(guard.checkSentence('28年老店', { facts: ['28元'] }).map((h) => h.reason)).toContain(
      'unsupported_number',
    )
    expect(guard.checkSentence('128元', { facts: ['28元'] }).map((h) => h.reason)).toContain(
      'unsupported_number',
    )
    expect(guard.checkSentence('百分之三十回购', { facts: ['30%回购'] })).toEqual([])
  })
})

describe('rules and evidence', () => {
  it.each([
    '得过奖的配方',
    '通过权威检测',
    '产地直接运来',
    '远渡重洋的原料',
    '高原牧场牛奶',
    '星级酒店出身',
    '天天都卖到断货',
    '人气持续居高不下',
    '全市顾客在排队',
  ])('requires evidence for paraphrased factual claim %s', (sentence) => {
    expect(guard.checkSentence(sentence, { facts: [] }).length).toBeGreaterThan(0)
    expect(guard.checkSentence(sentence, { facts: [sentence] })).toEqual([])
  })
  it('never lets merchant facts authorize absolute terms or sharing inducement', () => {
    for (const text of ['最佳口感', '全城第一', '100%纯手工', '转发领取', '关注后领取']) {
      expect(guard.checkSentence(text, { facts: [text] }).length).toBeGreaterThan(0)
    }
  })
  it('requires the whole unsupported claim, and rejects negated evidence', () => {
    expect(
      guard.checkSentence('无糖蛋糕', { facts: ['少糖', '不是无糖蛋糕'] }).length,
    ).toBeGreaterThan(0)
    expect(guard.checkSentence('新西兰黄油', { facts: ['新西兰黄油'] })).toEqual([])
    expect(guard.checkSentence('进口黄油', { facts: ['新西兰黄油'] }).length).toBeGreaterThan(0)
  })
  it('allows food process claims only when grounded, and merges custom rules', () => {
    const rules = guard.mergeRules(guard.defaultRules, guard.rulePacks.food)
    expect(guard.checkSentence('手工现烤', { facts: [] }, rules).length).toBeGreaterThan(0)
    expect(guard.checkSentence('手工现烤', { facts: ['手工现烤'] }, rules)).toEqual([])
    const custom = guard.mergeRules(rules, {
      rules: [
        {
          id: 'custom',
          reason: 'unsupported_claim',
          terms: ['闪亮认证'],
          whitelist: ['无需闪亮认证'],
        },
      ],
    })
    expect(guard.checkSentence('闪亮认证', { facts: [] }, custom).length).toBeGreaterThan(0)
    expect(
      guard.checkSentence(
        '无需闪亮认证',
        { facts: [] },
        { rules: [custom.rules.find((r) => r.id === 'custom')!] },
      ),
    ).toEqual([])
  })
  it('keeps contribution YAML and executable rules identical', () => {
    // JSON-form documents are a lossless subset of YAML 1.2; no parser dependency.
    expect(
      JSON.parse(
        readFileSync(new URL('../../../rules/packs/base.zh.yaml', import.meta.url), 'utf8'),
      ),
    ).toEqual(guard.defaultRules)
    expect(
      JSON.parse(
        readFileSync(new URL('../../../rules/packs/food.zh.yaml', import.meta.url), 'utf8'),
      ),
    ).toEqual(guard.rulePacks.food)
  })
})

describe('hand-labelled Chinese rule evaluation', () => {
  const rules = () => guard.mergeRules(guard.defaultRules, guard.rulePacks.food)
  it.each(cases)('$expect: $sentence', ({ sentence, facts, expect: expected }) => {
    expect(guard.checkSentence(sentence, { facts }, rules()).length > 0).toBe(expected === 'block')
  })
  it('prints recall and false positives with acceptance thresholds', () => {
    const blocked = cases.filter((c) => c.expect === 'block')
    const allowed = cases.filter((c) => c.expect === 'pass')
    const detected = blocked.filter(
      (c) => guard.checkSentence(c.sentence, { facts: c.facts }, rules()).length > 0,
    )
    const falsePositives = allowed.filter(
      (c) => guard.checkSentence(c.sentence, { facts: c.facts }, rules()).length > 0,
    )
    writeSync(
      1,
      `Chinese rules: ${detected.length}/${blocked.length} blocked (${((100 * detected.length) / blocked.length).toFixed(2)}%); ${falsePositives.length}/${allowed.length} false positives\n`,
    )
    expect(blocked.length).toBeGreaterThanOrEqual(30)
    expect(allowed.length).toBeGreaterThanOrEqual(20)
    expect(detected.length / blocked.length).toBeGreaterThanOrEqual(0.8)
    expect(falsePositives).toEqual([])
  })
})
