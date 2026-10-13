import { describe, expect, it } from 'vitest'
import { compareExtraction, sumFieldCounts } from '@/eval/lib/extract-compare'
import type { GoldSheet } from '@/eval/lib/samples'

type Item = GoldSheet['items'][number]
const item = (name: string, amount?: number, spec?: string): Item => ({
  id: name,
  name,
  ...(amount !== undefined ? { price: { amount, currency: 'CNY' as const, unit: '个' } } : {}),
  ...(spec ? { spec } : {}),
  tags: [],
  imageAssetIds: [],
  sources: {},
})

const gold1: GoldSheet = {
  shop: { name: '麦香小铺', phone: '021-6123 4567', address: '上海市徐汇区漕溪北路 88 号' },
  items: [item('可颂', 12, '约 80g'), item('蛋挞', 8)],
  extraClaims: [],
}
const extracted1: GoldSheet = {
  shop: { name: '麦香小铺', phone: '02161234567', address: '上海市徐汇区漕溪北路88号' },
  items: [item('可颂', 12, '约80g'), item('葡式蛋挞', 8), item('拿铁', 20)],
  extraClaims: [],
}

const gold2: GoldSheet = {
  shop: { name: '转角咖啡', phone: '13800138000' },
  items: [item('拿铁', 22, '中杯'), item('美式', 18)],
  extraClaims: [],
}
const extracted2: GoldSheet = {
  shop: { name: '转角咖啡', address: '幸福路 1 号' },
  items: [item('拿 铁', 20, '大杯'), item('美式', 18)],
  extraClaims: [],
}

describe('compareExtraction', () => {
  it('example 1: an unmatched renamed item and an invented item', () => {
    const r = compareExtraction(gold1, extracted1)
    // Hand count. name: gold 2, predicted 3, correct 1 (可颂). price: correct only for matched
    // items → 1 of gold 2 / predicted 3. spec: 约 80g = 约80g once spaces go → 1/1/1.
    // phone digits equal, address equal without spaces.
    expect(r.counts).toEqual({
      name: { gold: 2, predicted: 3, correct: 1 },
      price: { gold: 2, predicted: 3, correct: 1 },
      spec: { gold: 1, predicted: 1, correct: 1 },
      phone: { gold: 1, predicted: 1, correct: 1 },
      address: { gold: 1, predicted: 1, correct: 1 },
    })
    expect(r.diffs).toEqual([
      { field: 'name', gold: '蛋挞', predicted: null },
      { field: 'name', gold: null, predicted: '葡式蛋挞' },
      { field: 'name', gold: null, predicted: '拿铁' },
    ])
  })

  it('example 2: wrong price and spec, missing phone, invented address', () => {
    const r = compareExtraction(gold2, extracted2)
    // 拿 铁 matches 拿铁; its price 20 ≠ 22 and spec 大杯 ≠ 中杯. 美式 18 is right.
    expect(r.counts).toEqual({
      name: { gold: 2, predicted: 2, correct: 2 },
      price: { gold: 2, predicted: 2, correct: 1 },
      spec: { gold: 1, predicted: 1, correct: 0 },
      phone: { gold: 1, predicted: 0, correct: 0 },
      address: { gold: 0, predicted: 1, correct: 0 },
    })
    expect(r.diffs).toEqual([
      { field: 'price', item: '拿铁', gold: '22', predicted: '20' },
      { field: 'spec', item: '拿铁', gold: '中杯', predicted: '大杯' },
      { field: 'phone', gold: '13800138000', predicted: null },
      { field: 'address', gold: null, predicted: '幸福路 1 号' },
    ])
  })

  it('sums counts over samples and derives precision and recall', () => {
    const total = sumFieldCounts([
      compareExtraction(gold1, extracted1).counts,
      compareExtraction(gold2, extracted2).counts,
    ])
    // name: correct 1+2=3, predicted 3+2=5, gold 2+2=4 → precision 0.6, recall 0.75
    expect(total.name).toEqual({ gold: 4, predicted: 5, correct: 3, precision: 0.6, recall: 0.75 })
    // address: gold 1, predicted 2, correct 1 → 0.5 / 1
    expect(total.address).toEqual({ gold: 1, predicted: 2, correct: 1, precision: 0.5, recall: 1 })
    // spec: gold 2, predicted 2, correct 1
    expect(total.spec).toEqual({ gold: 2, predicted: 2, correct: 1, precision: 0.5, recall: 0.5 })
  })

  it('reports precision as null when nothing was predicted', () => {
    const total = sumFieldCounts([compareExtraction(gold2, extracted2).counts])
    expect(total.phone).toEqual({ gold: 1, predicted: 0, correct: 0, precision: null, recall: 0 })
  })
})
