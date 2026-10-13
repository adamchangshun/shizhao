import { describe, expect, it } from 'vitest'
import { pageFactErrors, unsupportedClaims } from '@/eval/lib/page-metrics'
import type { GoldSheet } from '@/eval/lib/samples'

const cafe: GoldSheet = {
  shop: { name: '转角咖啡', phone: '138 0013 8000' },
  items: [
    {
      id: 'latte',
      name: '拿铁',
      price: { amount: 20, currency: 'CNY', unit: '杯' },
      tags: [],
      imageAssetIds: [],
      sources: {},
    },
    {
      id: 'americano',
      name: '美式',
      price: { amount: 15, currency: 'CNY', unit: '杯' },
      tags: [],
      imageAssetIds: [],
      sources: {},
    },
  ],
  extraClaims: [],
}

const bakery: GoldSheet = {
  shop: { name: '麦香小铺' },
  items: [
    {
      id: 'c',
      name: '可颂',
      price: { amount: 12.5, currency: 'CNY', unit: '个' },
      tags: [],
      imageAssetIds: [],
      sources: {},
    },
  ],
  extraClaims: [],
}

describe('pageFactErrors', () => {
  it('example 1: changed price, invented discount price and an extra phone number', () => {
    const text =
      '转角咖啡\n拿铁 ¥20杯\n美 式 只要 ¥ 12\n第二杯半价 10元\n电话 138-0013-8000\n热线 13900000000'
    // Hand count: page prices 20, 12, 10 → 12 and 10 are not gold prices (2); gold 美式 15 is
    // absent (1); both names present ("美 式" counts once spaces are removed); gold phone
    // present, 13900000000 is extra (1). Total 4, of which price/name errors 3.
    expect(pageFactErrors(text, cafe)).toMatchObject({
      fabricatedPrices: 2,
      missingPrices: 1,
      missingNames: 0,
      missingPhone: 0,
      wrongPhones: 1,
      priceNameErrors: 3,
      total: 4,
    })
  })

  it('example 2: rewritten product name and a phone the merchant never gave', () => {
    const text = '全城第一的可頌 ¥12.50\n订购 13800138000'
    // 可頌 (traditional form) is not the gold name 可颂 (1); 12.50 equals 12.5 (0);
    // no gold phone, one page phone (1). Total 2.
    expect(pageFactErrors(text, bakery)).toMatchObject({
      fabricatedPrices: 0,
      missingPrices: 0,
      missingNames: 1,
      missingPhone: 0,
      wrongPhones: 1,
      priceNameErrors: 1,
      total: 2,
    })
  })

  it('reports a missing gold phone', () => {
    expect(pageFactErrors('拿铁 ¥20 美式 ¥15', cafe)).toMatchObject({ missingPhone: 1, total: 1 })
  })
})

describe('unsupportedClaims', () => {
  it('counts sentences the rule layer flags after the gold facts are removed', () => {
    // 「全城销量第一」 is a hand-labelled "block" case; the shop name, the gold price ¥20 and the
    // mood line carry no unsupported claim.
    const text = '转角咖啡\n全城销量第一！拿铁 ¥20杯。\n来小店坐坐。'
    const result = unsupportedClaims(text, cafe)
    expect(result.count).toBe(1)
    expect(result.sentences.map((s) => s.sentence)).toEqual(['全城销量第一！'])
  })

  it('does not flag the gold phone number in another format', () => {
    expect(unsupportedClaims('电话：138-0013-8000', cafe).count).toBe(0)
  })
})
