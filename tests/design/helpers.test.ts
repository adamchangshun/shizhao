import { describe, expect, it } from 'vitest'
import type { DesignSpec } from '@/lib/core/schemas'
import { hexToHsl, hslToHex, relativeLuminance, contrastRatio } from '@/lib/design/color'
import { ensureContrast } from '@/lib/design/contrast'
import { normalizeFontPair } from '@/lib/design/fonts'
import { isTooSimilar } from '@/lib/design/similarity'

const palette: DesignSpec['palette'] = {
  bg: '#f5e6c8',
  surface: '#ffffff',
  primary: '#d0453a',
  accent: '#d9a441',
  text: '#c9b38a',
}
function spec(primary: string, templateId: DesignSpec['templateId'] = 'poster'): DesignSpec {
  return {
    templateId,
    palette: { ...palette, primary },
    fontPair: { heading: 'noto-serif-sc', body: 'noto-sans-sc' },
    decoration: 'none',
    heroLayout: 'stacked',
    motion: 'none',
    moodKeywords: ['复古'],
    seed: 0,
  }
}

describe('WCAG color arithmetic', () => {
  it.each([
    ['#000000', '#ffffff', 21],
    ['#777777', '#ffffff', 4.4780894536],
    ['#767676', '#ffffff', 4.5422249596],
    ['#ff0000', '#ffffff', 3.9984767708],
  ])('computes the independently known contrast %s / %s', (a, b, ratio) => {
    expect(contrastRatio(a, b)).toBeCloseTo(ratio, 8)
    expect(contrastRatio(b, a)).toBeCloseTo(ratio, 8)
  })
  it('keeps the AA threshold on the correct side of gray rounding', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it.each([
    ['#000000', 0],
    ['#ffffff', 1],
    ['#ff0000', 0.2126],
    ['#00ff00', 0.7152],
    ['#0000ff', 0.0722],
  ] as const)('computes luminance for %s', (hex, want) => {
    expect(relativeLuminance(hex)).toBeCloseTo(want, 10)
  })
  it.each([
    ['#000000', { h: 0, s: 0, l: 0 }],
    ['#ffffff', { h: 0, s: 0, l: 1 }],
    ['#808080', { h: 0, s: 0, l: 128 / 255 }],
    ['#ff0000', { h: 0, s: 1, l: 0.5 }],
    ['#00ff00', { h: 120, s: 1, l: 0.5 }],
    ['#0000ff', { h: 240, s: 1, l: 0.5 }],
    ['#ffff00', { h: 60, s: 1, l: 0.5 }],
  ])('converts known HSL and back for %s', (hex, hsl) => {
    expect(hexToHsl(hex)).toEqual(hsl)
    expect(hslToHex(hsl)).toBe(hex)
  })
  it('normalizes hue across the circle', () => {
    expect(hslToHex({ h: 360, s: 1, l: 0.5 })).toBe('#ff0000')
    expect(hslToHex({ h: -120, s: 1, l: 0.5 })).toBe('#0000ff')
  })
  it('rejects malformed colors and nonfinite HSL', () => {
    expect(() => contrastRatio('#fff', '#ffffff')).toThrow()
    expect(() => hslToHex({ h: NaN, s: 1, l: 0.5 })).toThrow()
    expect(() => hslToHex({ h: 0, s: 2, l: 0.5 })).toThrow()
  })
})

describe('readable palette repair', () => {
  it('repairs beige text on both surfaces without changing hue or other palette fields', () => {
    const before = structuredClone(palette)
    const { palette: fixed, onPrimary } = ensureContrast(palette)
    expect(contrastRatio(fixed.text, fixed.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(fixed.text, fixed.surface)).toBeGreaterThanOrEqual(4.5)
    expect(Math.abs(hexToHsl(fixed.text).h - hexToHsl(palette.text).h)).toBeLessThanOrEqual(5)
    expect({ ...fixed, text: palette.text }).toEqual(palette)
    expect(palette).toEqual(before)
    // Hand-calculated: black 4.59432577 > white 4.57085567 on #d0453a.
    expect(onPrimary).toBe('#000000')
  })
  it('keeps already readable text unchanged', () => {
    expect(ensureContrast({ ...palette, text: '#342716' }).palette.text).toBe('#342716')
  })
  it('can lighten text for dark backgrounds', () => {
    const result = ensureContrast({
      ...palette,
      bg: '#101010',
      surface: '#202020',
      text: '#303030',
      primary: '#ffff00',
    })
    expect(contrastRatio(result.palette.text, '#101010')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(result.palette.text, '#202020')).toBeGreaterThanOrEqual(4.5)
    expect(result.onPrimary).toBe('#000000')
  })
  it('finds the narrow valid text band on black and white', () => {
    const result = ensureContrast({
      ...palette,
      bg: '#000000',
      surface: '#ffffff',
      text: '#cccccc',
    })
    expect(contrastRatio(result.palette.text, '#000000')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(result.palette.text, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('terminates with an explicit error when both backgrounds have no common AA text', () => {
    expect(() => ensureContrast({ ...palette, bg: '#000000', surface: '#777777' })).toThrow(
      /对比度/,
    )
  })
})

describe('font whitelist', () => {
  it('repairs the required double decorative combination to a nearby serif body', () => {
    expect(normalizeFontPair({ heading: 'zcool-kuaile', body: 'zcool-xiaowei' })).toEqual({
      heading: 'zcool-kuaile',
      body: 'noto-serif-sc',
    })
  })
  it('maps the playful decorative body to sans and unknown fonts to the default', () => {
    expect(normalizeFontPair({ heading: 'unknown', body: 'zcool-kuaile' })).toEqual({
      heading: 'noto-sans-sc',
      body: 'noto-sans-sc',
    })
    expect(normalizeFontPair({ heading: 'zcool-xiaowei', body: 'unknown' })).toEqual({
      heading: 'zcool-xiaowei',
      body: 'noto-sans-sc',
    })
  })
  it.each(['noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai'] as const)(
    'preserves the legal body %s',
    (body) => {
      expect(normalizeFontPair({ heading: 'zcool-xiaowei', body })).toEqual({
        heading: 'zcool-xiaowei',
        body,
      })
    },
  )
})

describe('adjacent design similarity', () => {
  it('recognizes the specified red pair and rejects red versus blue', () => {
    expect(isTooSimilar(spec('#d0453a'), spec('#d8553f'))).toBe(true)
    expect(isTooSimilar(spec('#d0453a'), spec('#3a7bd0'))).toBe(false)
  })
  it('requires the same template and wraps 0/360 degrees', () => {
    expect(isTooSimilar(spec('#ff0010'), spec('#ff1000'))).toBe(true)
    expect(isTooSimilar(spec('#ff0000'), spec('#ff0000', 'menu-board'))).toBe(false)
  })
  it('uses a strict 30 degree cutoff', () => {
    expect(isTooSimilar(spec('#ff0000'), spec('#ff8000'))).toBe(false)
    expect(isTooSimilar(spec('#ff0000'), spec('#ff7f00'))).toBe(true)
  })
})
