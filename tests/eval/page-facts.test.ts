import { describe, expect, it } from 'vitest'
import { extractPagePrices, extractPhones } from '@/eval/lib/page-facts'

describe('extractPagePrices', () => {
  it('reads numbers next to ¥, ￥ and 元 in the written forms pages use', () => {
    expect(extractPagePrices('拿铁 ¥ 12.50')).toEqual([12.5])
    expect(extractPagePrices('美式12.5元/杯')).toEqual([12.5])
    expect(extractPagePrices('小份￥8')).toEqual([8])
    expect(extractPagePrices('价格：20 元')).toEqual([20])
    expect(extractPagePrices('¥28个')).toEqual([28])
  })

  it('counts "¥12元" once and keeps every occurrence in reading order', () => {
    // Hand-computed: ¥12元 → 12; 满50元减5元 → 50, 5; ¥ 12.50 → 12.5
    expect(extractPagePrices('今日¥12元，满50元减5元，另售 ¥ 12.50')).toEqual([12, 50, 5, 12.5])
  })

  it('handles full-width digits and the full-width yen sign', () => {
    expect(extractPagePrices('套餐￥３８')).toEqual([38])
  })

  it('ignores numbers that are not next to a currency mark, and 元 words like 元旦', () => {
    expect(extractPagePrices('营业 8:00-20:00，约 80g，2024元旦快乐，电话 13800138000')).toEqual([])
  })

  it('does not treat the tail of a longer number as a price', () => {
    // Reading only "1.5" or "5" out of "21.5元" would be wrong; the whole 21.5 is the price.
    expect(extractPagePrices('特价21.5元')).toEqual([21.5])
  })
})

describe('extractPhones', () => {
  it('normalizes mobile and landline numbers to digits', () => {
    expect(extractPhones('电话 138-0013-8000，座机 021-6123 4567')).toEqual([
      '13800138000',
      '02161234567',
    ])
  })

  it('drops the +86 country code and ignores prices and times', () => {
    expect(extractPhones('+86 139 0000 0000 ¥28 8:00-20:00')).toEqual(['13900000000'])
  })
})
