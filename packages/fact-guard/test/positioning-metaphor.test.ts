import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, mergeRules, rulePacks } from '../src/index'
const rules = mergeRules(defaultRules, rulePacks.food)
const corpus = { facts: ['黄油可颂'] }

describe('M8: positioning metaphors must remain independent atmosphere clauses', () => {
  it.each(['本周限定的温柔可颂', '今天供应限定的温柔蛋糕', '限定的温柔款今日供应'])(
    'requires evidence for %s', (sentence) => {
      expect(checkSentence(sentence, corpus, rules)).toContainEqual(expect.objectContaining({ ruleId: 'positioning' }))
      expect(checkSentence(sentence, { facts: [sentence] }, rules)).toEqual([])
    },
  )
  it.each(['限定的温柔', '把限定的温柔留给你', '午后来坐坐，限定的温柔。'])(
    'retains standalone mood: %s', (sentence) => expect(checkSentence(sentence, corpus, rules)).toEqual([]),
  )
  it('retains the earlier slow-process and promotional-clock fixes', () => {
    expect(checkSentence('经过慢烤的时光才出炉', corpus, rules)).toContainEqual(expect.objectContaining({ ruleId: 'process' }))
    expect(checkSentence('7:30开抢，19:00秒杀结束', { ...corpus, spanFacts: ['7:30-19:00'] }, rules)).toContainEqual(expect.objectContaining({ reason: 'unsupported_number' }))
  })
})
