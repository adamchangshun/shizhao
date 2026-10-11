import { describe, expect, it } from 'vitest'
import { DesignSpec, FactItem, FactSheet, Price, Shop } from '@/lib/core/schemas'

const validSheet = {
  projectId: 'p1',
  revision: 1,
  shop: { name: '阿芳面包' },
  items: [{ id: 'ab12cd34', name: '可颂', price: { amount: 12.5, currency: 'CNY', unit: '个' } }],
  confirmedAt: null,
}

const validDesign = {
  templateId: 'poster',
  palette: {
    bg: '#FFF8F0',
    surface: '#ffffff',
    primary: '#8A3B12',
    accent: '#E9A23B',
    text: '#222222',
  },
  fontPair: { heading: 'zcool-xiaowei', body: 'noto-sans-sc' },
  decoration: 'paper',
  heroLayout: 'stacked',
  motion: 'subtle',
  moodKeywords: ['温暖'],
  seed: 7,
}

describe('Price', () => {
  it('accepts two decimal places', () => {
    expect(Price.safeParse({ amount: 12.5, currency: 'CNY', unit: '个' }).success).toBe(true)
    expect(Price.safeParse({ amount: 0.01, currency: 'CNY', unit: '个' }).success).toBe(true)
  })

  it('rejects amount 12.345', () => {
    expect(Price.safeParse({ amount: 12.345, currency: 'CNY', unit: '个' }).success).toBe(false)
  })

  it('rejects non-CNY currency and unit longer than 8', () => {
    expect(Price.safeParse({ amount: 1, currency: 'USD', unit: '个' }).success).toBe(false)
    expect(
      Price.safeParse({ amount: 1, currency: 'CNY', unit: '一二三四五六七八九' }).success,
    ).toBe(false)
  })
})

describe('FactSheet', () => {
  it('accepts a minimal valid sheet and fills defaults', () => {
    const parsed = FactSheet.parse(validSheet)
    expect(parsed.extraClaims).toEqual([])
    expect(parsed.items[0]?.tags).toEqual([])
    expect(parsed.items[0]?.sources).toEqual({})
  })

  it('rejects an empty items array', () => {
    expect(FactSheet.safeParse({ ...validSheet, items: [] }).success).toBe(false)
  })

  it('rejects a non-datetime confirmedAt', () => {
    expect(FactSheet.safeParse({ ...validSheet, confirmedAt: '昨天' }).success).toBe(false)
  })
})

describe('FactItem', () => {
  it('accepts a partial sources record', () => {
    const r = FactItem.safeParse({ id: 'x', name: '可颂', sources: { price: 'image_ocr' } })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown sources key', () => {
    expect(
      FactItem.safeParse({ id: 'x', name: '可颂', sources: { color: 'image_ocr' } }).success,
    ).toBe(false)
  })
})

describe('Shop.mapUrl', () => {
  it('allows https and rejects http / javascript urls', () => {
    expect(Shop.safeParse({ name: '店', mapUrl: 'https://map.example.com/x' }).success).toBe(true)
    expect(Shop.safeParse({ name: '店', mapUrl: 'http://map.example.com/x' }).success).toBe(false)
    expect(Shop.safeParse({ name: '店', mapUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
})

describe('DesignSpec', () => {
  it('accepts a valid spec', () => {
    expect(DesignSpec.safeParse(validDesign).success).toBe(true)
  })

  it("rejects palette.bg: 'red'", () => {
    const bad = { ...validDesign, palette: { ...validDesign.palette, bg: 'red' } }
    expect(DesignSpec.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown font id', () => {
    const bad = { ...validDesign, fontPair: { heading: 'comic-sans', body: 'noto-sans-sc' } }
    expect(DesignSpec.safeParse(bad).success).toBe(false)
  })
})
