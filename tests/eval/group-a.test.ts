import { describe, expect, it } from 'vitest'
import { describeFacts } from '@/eval/lib/group-a'
import { GoldSheet } from '@/eval/lib/samples'

const gold = GoldSheet.parse({
  shop: { name: '午后小店' },
  items: [
    { id: 'a', name: '拿铁', price: { amount: 22, currency: 'CNY' }, tags: [], imageAssetIds: [], sources: {} },
    { id: 'b', name: '可颂', price: { amount: 12, currency: 'CNY', unit: '个' }, tags: [], imageAssetIds: [], sources: {} },
  ],
  extraClaims: [],
})

describe('describeFacts', () => {
  it('writes 22 元 for a price without a unit and 12 元/个 for one with', () => {
    const text = describeFacts(gold)
    expect(text).toContain('1. 拿铁，22 元\n')
    expect(text).toContain('2. 可颂，12 元/个')
    expect(text).not.toContain('undefined')
  })
})
