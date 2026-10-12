import { describe, expect, it } from 'vitest'
import { formatPriceAmount, navigationHref, safeMapUrl, telHref } from '@/lib/render/format'
import { inkOn } from '@/lib/render/css'

const yuan = (amount: number) => ({ amount, currency: 'CNY' as const, unit: '个' })

describe('formatPriceAmount', () => {
  it.each([
    [28, '¥28'],
    [12.5, '¥12.50'],
    [0.1, '¥0.10'],
    [0, '¥0'],
    [9.99, '¥9.99'],
    [1999.05, '¥1999.05'],
  ])('%s → %s', (amount, text) => {
    expect(formatPriceAmount(yuan(amount))).toBe(text)
  })
})

describe('telHref', () => {
  it('keeps only digits, plus and hyphen', () => {
    expect(telHref('+86 138-0000 1234')).toBe('tel:+86138-00001234')
    expect(telHref('021-6488 1234')).toBe('tel:021-64881234')
  })

  it('drops injection attempts down to digits', () => {
    expect(telHref('1380000"><script>')).toBe('tel:1380000')
    expect(telHref('javascript:alert(1)')).toBe('tel:1')
  })

  it('returns null when nothing dialable remains', () => {
    expect(telHref('无')).toBeNull()
    expect(telHref(undefined)).toBeNull()
    expect(telHref('+-')).toBeNull()
  })
})

describe('safeMapUrl', () => {
  it('accepts https links', () => {
    expect(safeMapUrl('https://surl.amap.com/abc123')).toBe('https://surl.amap.com/abc123')
  })

  it.each(['javascript:alert(1)', 'http://map.example/x', 'data:text/html,hi', ' https://a.example/', 'https://a.example/\nx', 'https://'])(
    'rejects %j',
    url => {
      expect(safeMapUrl(url)).toBeNull()
    },
  )
})

describe('navigationHref', () => {
  const shop = { name: '巷口咖啡', address: '文三路 12 号' }

  it('falls back to an AMap search when no link is given', () => {
    expect(navigationHref(shop, undefined)).toBe(
      'https://uri.amap.com/search?keyword=%E5%B7%B7%E5%8F%A3%E5%92%96%E5%95%A1%20%E6%96%87%E4%B8%89%E8%B7%AF%2012%20%E5%8F%B7&src=shizhao&callnative=1',
    )
  })

  it('hides navigation when a given link fails validation, even with an address', () => {
    expect(navigationHref(shop, 'javascript:alert(1)')).toBeNull()
  })

  it('hides navigation without link or address', () => {
    expect(navigationHref({ name: '巷口咖啡' }, undefined)).toBeNull()
  })
})

describe('inkOn', () => {
  it('picks white on dark and dark on light backgrounds', () => {
    expect(inkOn('#2f6b4f')).toBe('#ffffff')
    expect(inkOn('#f3d27a')).toBe('#1a1a1a')
    expect(inkOn('#000000')).toBe('#ffffff')
    expect(inkOn('#ffffff')).toBe('#1a1a1a')
  })
})
