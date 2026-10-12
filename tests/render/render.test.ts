import { createHash } from 'node:crypto'
import { parse, type HTMLElement } from 'node-html-parser'
import { describe, expect, it } from 'vitest'
import type { CopyDraft, FactSheet, TemplateId } from '@/lib/core/schemas'
import { INLINE_SCRIPT_SHA256, renderPage, type RenderInput } from '@/lib/render'
import { INLINE_SCRIPT } from '@/lib/render/inline-script'
import { designFor, menuCopy, menuFacts, singleCopy, singleFacts } from './fixtures'

const TEMPLATES: TemplateId[] = ['poster', 'card-stack']

function input(templateId: TemplateId, facts: FactSheet, copy: CopyDraft, extra: Partial<RenderInput> = {}): RenderInput {
  return {
    factSheet: facts,
    design: designFor(templateId),
    copy,
    versionId: 'ver_0001',
    slug: 'k7m2xq',
    trackingBase: '/api/track',
    pageUrl: 'https://shizhao.example/p/k7m2xq/',
    ...extra,
  }
}

async function dom(i: RenderInput): Promise<HTMLElement> {
  return parse((await renderPage(i)).html)
}

// Price strings written by hand from the fixture amounts (not via the formatter under test).
const PRICE_TEXT: Record<number, string> = { 128: '¥128', 18: '¥18', 22.5: '¥22.50', 25: '¥25', 26: '¥26', 12.5: '¥12.50', 16: '¥16', 32: '¥32', 18.8: '¥18.80' }

function expectedFacts(facts: FactSheet): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const shop = facts.shop
  for (const field of ['name', 'phone', 'wechat', 'address', 'hours'] as const) {
    const v = shop[field]
    if (v) out.push([`shop.${field}`, v])
  }
  for (const item of facts.items) {
    out.push([`items.${item.id}.name`, item.name])
    if (item.price) {
      const text = PRICE_TEXT[item.price.amount]
      if (!text) throw new Error(`no hand-written price for ${item.price.amount}`)
      out.push([`items.${item.id}.price`, text])
      out.push([`items.${item.id}.price.unit`, item.price.unit])
    }
    if (item.spec) out.push([`items.${item.id}.spec`, item.spec])
    if (item.description) out.push([`items.${item.id}.description`, item.description])
    item.tags.forEach((tag, i) => out.push([`items.${item.id}.tags.${i}`, tag]))
  }
  facts.extraClaims.forEach((claim, i) => out.push([`extraClaims.${i}`, claim]))
  return out
}

/** Font data replaced by a short digest so snapshots stay readable but still pin the bytes. */
function stableForSnapshot(html: string): string {
  return html.replace(/base64,[A-Za-z0-9+/=]+/g, m => `base64,<${createHash('sha256').update(m).digest('hex').slice(0, 16)}>`)
}

describe.each(TEMPLATES)('template %s', templateId => {
  const cases = [
    ['single', singleFacts, singleCopy],
    ['menu', menuFacts, menuCopy],
  ] as const

  it.each(cases)('matches snapshot (%s)', async (_name, facts, copy) => {
    const { html } = await renderPage(input(templateId, facts, copy))
    expect(stableForSnapshot(html)).toMatchSnapshot()
  })

  it.each(cases)('prints every fact with exact text in data-fact elements (%s)', async (_name, facts, copy) => {
    const root = await dom(input(templateId, facts, copy))
    for (const [path, value] of expectedFacts(facts)) {
      const nodes = root.querySelectorAll(`[data-fact="${path}"]`)
      expect(nodes.length, path).toBeGreaterThan(0)
      for (const node of nodes) expect(node.text, path).toBe(value)
    }
  })

  it('renders identical output for identical input', async () => {
    const a = await renderPage(input(templateId, menuFacts, menuCopy))
    const b = await renderPage(input(templateId, menuFacts, menuCopy))
    expect(a.html).toBe(b.html)
    expect(a.media).toEqual(b.media)
  })

  it('escapes hostile copy and facts', async () => {
    const hostileCopy: CopyDraft = {
      headline: '<script>alert(1)</script>',
      subhead: '"><img src=x onerror=alert(2)>',
      itemBlurbs: { ab12cd34: '</style><script>alert(3)</script>' },
      closing: "'><svg onload=alert(4)>",
    }
    const hostileFacts: FactSheet = {
      ...singleFacts,
      shop: { ...singleFacts.shop, name: '<b onclick=alert(5)>店</b>' },
    }
    const { html } = await renderPage(input(templateId, hostileFacts, hostileCopy))
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<svg onload')
    expect(html).not.toContain('<b onclick')
    const root = parse(html)
    expect(root.querySelectorAll('script')).toHaveLength(1)
    expect(root.querySelector('h1')?.text).toBe('<script>alert(1)</script>')
  })

  it('omits the WeChat button when there is no wechat', async () => {
    const shop = { ...singleFacts.shop, wechat: undefined }
    const root = await dom(input(templateId, { ...singleFacts, shop }, singleCopy))
    expect(root.querySelector('[data-act="wechat_copy"]')).toBeNull()
    expect(root.querySelector('[data-act="call"]')).not.toBeNull()
  })

  it('hides navigation for a javascript: mapUrl', async () => {
    const shop = { ...singleFacts.shop, mapUrl: 'javascript:alert(1)' }
    const { html } = await renderPage(input(templateId, { ...singleFacts, shop }, singleCopy))
    expect(parse(html).querySelector('[data-act="navigate"]')).toBeNull()
    expect(html).not.toContain('javascript:')
  })

  it('references no external stylesheet, script or font', async () => {
    const { html } = await renderPage(input(templateId, menuFacts, menuCopy))
    const root = parse(html)
    for (const link of root.querySelectorAll('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i)
    }
    const scripts = root.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.getAttribute('src')).toBeUndefined()
    expect(html).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i)
    expect(html).not.toMatch(/@import/i)
  })
})

describe('renderPage shared behavior', () => {
  it('embeds the inline script byte-for-byte so the exported CSP hash matches', async () => {
    const { html } = await renderPage(input('poster', singleFacts, singleCopy))
    const script = parse(html).querySelector('script')?.textContent ?? ''
    expect(script).toBe(INLINE_SCRIPT)
    expect(createHash('sha256').update(script, 'utf8').digest('base64')).toBe(INLINE_SCRIPT_SHA256)
    expect(Buffer.byteLength(script, 'utf8')).toBeLessThanOrEqual(2048)
  })

  it('puts tracking configuration in body data attributes', async () => {
    const body = (await dom(input('poster', singleFacts, singleCopy))).querySelector('body')
    expect(body?.getAttribute('data-track')).toBe('/api/track')
    expect(body?.getAttribute('data-slug')).toBe('k7m2xq')
    expect(body?.getAttribute('data-version')).toBe('ver_0001')
  })

  it('builds call, copy and navigation buttons from shop facts', async () => {
    const root = await dom(input('poster', singleFacts, singleCopy))
    expect(root.querySelector('[data-act="call"]')?.getAttribute('href')).toBe('tel:021-64881234')
    expect(root.querySelector('[data-act="wechat_copy"]')?.getAttribute('data-copy')).toBe('tianxin_bake')
    expect(root.querySelector('[data-act="navigate"]')?.getAttribute('href')).toBe(
      'https://uri.amap.com/search?keyword=%E7%94%9C%E5%BF%83%E7%83%98%E7%84%99%E5%9D%8A%20%E4%B8%8A%E6%B5%B7%E5%B8%82%E5%BE%90%E6%B1%87%E5%8C%BA%E6%BC%95%E6%BA%AA%E5%8C%97%E8%B7%AF%2088%20%E5%8F%B7&src=shizhao&callnative=1',
    )
  })

  it('uses a valid https mapUrl directly', async () => {
    const root = await dom(input('poster', menuFacts, menuCopy))
    expect(root.querySelector('[data-act="navigate"]')?.getAttribute('href')).toBe('https://surl.amap.com/abc123')
  })

  it('writes title and share tags from the shop name and hero image', async () => {
    const root = await dom(input('poster', singleFacts, singleCopy))
    expect(root.querySelector('title')?.text).toBe('甜心烘焙坊')
    expect(root.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('甜心烘焙坊')
    expect(root.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      'https://shizhao.example/p/k7m2xq/media/img_cake01-display.webp',
    )
    expect(root.querySelector('meta[name="viewport"]')).not.toBeNull()
  })

  it('lists referenced images for copying and marks exactly one as high priority', async () => {
    const { html, media } = await renderPage(input('poster', menuFacts, menuCopy))
    expect(media.map(m => m.file)).toEqual(['img_menu01-display.webp', 'img_menu02-thumb.webp', 'img_menu03-thumb.webp'])
    const imgs = parse(html).querySelectorAll('img')
    expect(imgs.filter(img => img.getAttribute('fetchpriority') === 'high')).toHaveLength(1)
    for (const img of imgs) {
      expect(img.getAttribute('width')).toMatch(/^\d+$/)
      expect(img.getAttribute('height')).toMatch(/^\d+$/)
      if (img.getAttribute('fetchpriority') !== 'high') expect(img.getAttribute('loading')).toBe('lazy')
    }
  })

  it('disables tracking when trackingBase is empty', async () => {
    const body = (await dom(input('poster', singleFacts, singleCopy, { trackingBase: '' }))).querySelector('body')
    expect(body?.getAttribute('data-track')).toBe('')
  })

  it('rejects asset ids that are not safe file names', async () => {
    const facts: FactSheet = { ...singleFacts, items: [{ ...singleFacts.items[0]!, imageAssetIds: ['../../etc/passwd'] }] }
    await expect(renderPage(input('poster', facts, singleCopy))).rejects.toThrow('invalid asset id')
  })

  it('keeps inlined fonts under 300KB for an 8-item menu', async () => {
    const { fontBytes } = await renderPage(input('poster', menuFacts, menuCopy))
    expect(fontBytes).toBeGreaterThan(0)
    expect(fontBytes).toBeLessThan(300 * 1024)
  })
})
