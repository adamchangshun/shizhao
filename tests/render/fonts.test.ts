import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'
import type { FontId } from '@/lib/core/schemas'
import { renderPage } from '@/lib/render'
import { designFor, menuCopy, menuFacts } from './fixtures'

const FONT_IDS: FontId[] = ['noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai', 'zcool-xiaowei', 'zcool-kuaile']

interface Face {
  family: string
  weight: string
  bytes: number
  ranges: Array<[number, number]>
}

function faces(html: string): Face[] {
  const css = parse(html).querySelector('style')?.textContent ?? ''
  return [...css.matchAll(/@font-face\{([^}]*)\}/g)].map(m => {
    const body = m[1] ?? ''
    const b64 = /src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\) format\("woff2"\)/.exec(body)?.[1]
    if (!b64) throw new Error(`face without inline woff2: ${body.slice(0, 80)}`)
    const ranges = (/unicode-range:([^;}]+)/.exec(body)?.[1] ?? '').split(',').map(part => {
      const [a, b] = part.replace('U+', '').split('-')
      return [parseInt(a ?? '', 16), parseInt(b ?? a ?? '', 16)] as [number, number]
    })
    return {
      family: /font-family:"([^"]+)"/.exec(body)?.[1] ?? '',
      weight: /font-weight:(\d+)/.exec(body)?.[1] ?? '',
      bytes: Buffer.from(b64, 'base64').length,
      ranges,
    }
  })
}

function covered(fs: Face[], family: string, cp: number): boolean {
  return fs.some(f => f.family === family && f.ranges.some(([a, b]) => cp >= a && cp <= b))
}

describe.each(FONT_IDS)('font %s', fontId => {
  it('inlines woff2 subsets that cover every CJK character on the page', async () => {
    const design = designFor('card-stack', { fontPair: { heading: fontId, body: fontId } })
    const { html, fontBytes } = await renderPage({ factSheet: menuFacts, design, copy: menuCopy, versionId: 'v', slug: 's', trackingBase: '' })
    const fs = faces(html)
    expect(fs.length).toBeGreaterThan(0)
    for (const f of fs) {
      expect(f.bytes).toBeGreaterThan(100)
      expect(['SZ Heading', 'SZ Body']).toContain(f.family)
    }
    expect(new Set(fs.map(f => f.family)).size).toBeLessThanOrEqual(2)
    expect(fs.reduce((n, f) => n + f.bytes, 0)).toBe(fontBytes)
    expect(fontBytes).toBeLessThan(300 * 1024)

    const bodyText = parse(html).querySelector('body')?.text ?? ''
    const cjk = [...new Set(Array.from(bodyText).filter(ch => /\p{Script=Han}/u.test(ch)))]
    expect(cjk.length).toBeGreaterThan(50)
    for (const ch of cjk) expect(covered(fs, 'SZ Body', ch.codePointAt(0)!), ch).toBe(true)
    // Headings use the heading face; their characters must be in it too.
    const headingFamily = fs.some(f => f.family === 'SZ Heading') ? 'SZ Heading' : 'SZ Body'
    for (const ch of '巷口咖啡美式拿铁') expect(covered(fs, headingFamily, ch.codePointAt(0)!), ch).toBe(true)
  })
})

describe('mixed heading and body fonts', () => {
  it.each([
    ['zcool-kuaile', 'noto-sans-sc'],
    ['noto-serif-sc', 'lxgw-wenkai'],
  ] as const)('subsets %s for headings and %s for body separately', async (heading, body) => {
    const design = designFor('menu-board', { fontPair: { heading, body } })
    const { html } = await renderPage({ factSheet: menuFacts, design, copy: menuCopy, versionId: 'v', slug: 's', trackingBase: '' })
    const fs = faces(html)
    expect(new Set(fs.map(f => f.family))).toEqual(new Set(['SZ Heading', 'SZ Body']))
    // Heading-font text in menu-board: shop name, headline, item names.
    const headingChars = '巷口咖啡巷口的第一杯美式咖啡拿铁燕麦柠檬气泡可颂肉桂卷芒果千层巧克力布朗尼'
    for (const ch of headingChars) expect(covered(fs, 'SZ Heading', ch.codePointAt(0)!), ch).toBe(true)
    // Body-only text must not be pulled into the heading subset.
    for (const ch of '营业时间本页由辅助设计') expect(covered(fs, 'SZ Heading', ch.codePointAt(0)!), ch).toBe(false)
    for (const ch of '营业时间本页由辅助设计') expect(covered(fs, 'SZ Body', ch.codePointAt(0)!), ch).toBe(true)
  })
})
