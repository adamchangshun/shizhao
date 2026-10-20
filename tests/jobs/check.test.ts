import os from 'node:os'
import { describe, expect, it } from 'vitest'
import type { FactSheet } from '@/lib/core/schemas'
import { checkPage, expectedFactTexts, PageCheckError } from '@/lib/jobs/check'

const facts: FactSheet = {
  projectId: 'p1',
  revision: 1,
  shop: { name: '午后小店' },
  items: [
    {
      id: 'lattE001',
      name: '拿铁',
      price: { amount: 22, currency: 'CNY' },
      tags: [],
      imageAssetIds: [],
      sources: {},
    },
  ],
  extraClaims: [],
  confirmedAt: '2026-10-20T00:00:00.000Z',
}

const page = (priceHtml: string) =>
  `<p data-fact="shop.name">午后小店</p><h2 data-fact="items.lattE001.name">拿铁</h2>${priceHtml}`

describe('checkPage with a price that has no unit', () => {
  it('expects ¥22 and no unit element', () => {
    const expected = expectedFactTexts(facts)
    expect(expected.get('items.lattE001.price')).toBe('¥22')
    expect(expected.has('items.lattE001.price.unit')).toBe(false)
  })

  it('accepts the page the renderer prints: ¥22 alone', async () => {
    const html = page('<span class="price"><span data-fact="items.lattE001.price">¥22</span></span>')
    await expect(checkPage(html, facts, os.tmpdir(), [])).resolves.toBeUndefined()
  })

  it('rejects a page that prints a unit the facts do not have', async () => {
    const html = page(
      '<span data-fact="items.lattE001.price">¥22</span><span data-fact="items.lattE001.price.unit">undefined</span>',
    )
    await expect(checkPage(html, facts, os.tmpdir(), [])).rejects.toBeInstanceOf(PageCheckError)
  })
})
