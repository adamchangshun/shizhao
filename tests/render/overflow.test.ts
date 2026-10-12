// Real-browser layout check: no horizontal scrolling at 360px and 430px, with every
// fact at its maximum allowed length.
import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CopyDraft, FactSheet } from '@/lib/core/schemas'
import { renderPage } from '@/lib/render'
import { ALL_TEMPLATES, designFor, menuCopy, menuFacts, singleCopy, singleFacts } from './fixtures'

const longest: FactSheet = {
  projectId: 'proj_long',
  revision: 1,
  shop: {
    name: '超长店名测试'.repeat(5),
    phone: '+86-021-6488-1234-99',
    wechat: 'a_very_long_wechat_id_without_any_break_',
    address: '上海市徐汇区漕溪北路八十八号附近的特别长的地址'.repeat(4).slice(0, 80),
    hours: '周一至周五 8:00-21:00，周末及法定节假日 9:00-22:00 营业',
  },
  items: [
    {
      id: 'long0001',
      name: 'Supercalifragilisticexpialido',
      price: { amount: 99999999.99, currency: 'CNY', unit: '八个字的计量单位' },
      spec: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN',
      description: '描述'.repeat(60),
      tags: ['十个字的标签标签标签', '十个字的标签标签标签', '十个字的标签标签标签', '十个字的标签标签标签', '十个字的标签标签标签'],
      imageAssetIds: ['img_long01'],
      sources: {},
    },
    ...menuFacts.items.slice(0, 3).map(item => ({ ...item, price: { amount: 88888888.88, currency: 'CNY' as const, unit: '八个字的计量单位' } })),
  ],
  extraClaims: ['三十个字的商家声明三十个字的商家声明三十个字的商家声明'],
  confirmedAt: null,
}

const longCopy: CopyDraft = {
  headline: '二十个字的标题二十个字的标题二十个字的标',
  subhead: 'NoSpacesNoSpacesNoSpacesNoSpacesNoSpaces',
  itemBlurbs: { long0001: 'x'.repeat(60) },
  closing: '四十个字的结束语'.repeat(5),
}

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
})

const datasets: Array<[string, FactSheet, CopyDraft]> = [
  ['single', singleFacts, singleCopy],
  ['menu', menuFacts, menuCopy],
  ['longest', longest, longCopy],
]

describe.each(ALL_TEMPLATES)('template %s in a phone browser', templateId => {
  it.each(datasets)('has no horizontal overflow at 360px and 430px (%s)', { timeout: 60_000 }, async (_name, facts, copy) => {
    for (const heroLayout of ['full-bleed', 'split', 'stacked'] as const) {
      const { html } = await renderPage({
        factSheet: facts,
        design: designFor(templateId, { heroLayout }),
        copy,
        versionId: 'v',
        slug: 's',
        trackingBase: '',
      })
      for (const width of [360, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 800 } })
        await page.setContent(html)
        await page.evaluate(() => document.fonts.ready)
        const result = await page.evaluate(() => {
          // .page clips with overflow-x:hidden, so also look for content pushed past the viewport.
          const vw = window.innerWidth
          const clipped = [...document.querySelectorAll('.page *')]
            .filter(el => !el.closest('[hidden]') && el.getClientRects().length > 0)
            .filter(el => {
              const r = el.getBoundingClientRect()
              return r.right > vw + 0.5 || r.left < -0.5
            })
            .map(el => `${el.tagName.toLowerCase()}.${el.className}`)
          const pageEl = document.querySelector('.page') as HTMLElement
          const minButton = Math.min(...[...document.querySelectorAll('.act')].map(el => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)))
          const smallText = [...document.querySelectorAll('body *')]
            .filter(el => el.children.length === 0 && (el.textContent ?? '').trim() !== '' && !el.closest('.footer, .tag, [hidden]'))
            .map(el => parseFloat(getComputedStyle(el).fontSize))
          return {
            overflow: document.documentElement.scrollWidth - vw,
            pageOverflow: pageEl.scrollWidth - pageEl.clientWidth,
            clipped,
            minButton,
            minFont: Math.min(...smallText),
          }
        })
        await page.close()
        expect(result.overflow, `${heroLayout} @${width}px`).toBeLessThanOrEqual(0)
        expect(result.pageOverflow, `${heroLayout} @${width}px`).toBeLessThanOrEqual(0)
        expect(result.clipped, `${heroLayout} @${width}px`).toEqual([])
        expect(result.minButton, `${heroLayout} @${width}px`).toBeGreaterThanOrEqual(44)
        expect(result.minFont, `${heroLayout} @${width}px`).toBeGreaterThanOrEqual(15)
      }
    }
  })
})
