import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { chromium, type Browser } from '@playwright/test'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET as publicPage } from '@/app/p/[slug]/route'
import { GET as preview } from '@/app/api/versions/[id]/route'
import { POST as track } from '@/app/api/track/route'
import { getDb, runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { visitEvents } from '@/lib/db/schema'
import { renderPage } from '@/lib/render'
import { INLINE_SCRIPT } from '@/lib/render/inline-script'
import { versionDir } from '@/lib/jobs/files'
import { publishVersion } from '@/lib/publish'
import { seedVersion } from '../publish/fixtures'
import { designFor, singleCopy, singleFacts } from '../render/fixtures'

let browser: Browser, server: http.Server, base: string
let trackingRequests = 0,
  externalScriptRequests = 0

beforeAll(async () => {
  runMigrations()
  browser = await chromium.launch()
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, base)
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    })
    let response: Response
    if (url.pathname === '/api/track') {
      trackingRequests++
      response = await track(request)
    } else if (url.pathname === '/evil.js') {
      externalScriptRequests++
      response = new Response('window.externalRan=true', {
        headers: { 'content-type': 'text/javascript' },
      })
    } else if (url.pathname.startsWith('/p/')) {
      response = await publicPage(request, {
        params: Promise.resolve({ slug: url.pathname.split('/')[2]! }),
      })
    } else if (url.pathname.startsWith('/api/versions/')) {
      response = await preview(request, {
        params: Promise.resolve({ id: url.pathname.split('/')[3]! }),
      })
    } else response = new Response(null, { status: 404 })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
})
afterAll(async () => {
  await browser?.close()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function fixture() {
  const p = insertProject({ type: 'single', title: '浏览器验证' })
  const id = seedVersion(p.id, '')
  const facts = {
    ...singleFacts,
    projectId: p.id,
    items: singleFacts.items.map((item) => ({ ...item, imageAssetIds: [] })),
  }
  const { html } = await renderPage({
    factSheet: facts,
    design: designFor('poster'),
    copy: singleCopy,
    versionId: id,
    slug: p.slug,
    trackingBase: '/api/track',
  })
  fs.writeFileSync(path.join(versionDir(p.id, id), 'index.html'), html)
  publishVersion(p.id, id)
  return { ...p, versionId: id, html }
}
const events = (id: string) =>
  getDb().select().from(visitEvents).where(eq(visitEvents.projectId, id)).all()

it.each(['beacon', 'missing-beacon', 'rejected-beacon'] as const)(
  'runs the hash-authorized rendered script with %s and tracks view and call',
  { timeout: 30_000 },
  async (mode) => {
    const p = await fixture()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      if (mode !== 'beacon')
        await page.addInitScript((mode) => {
          Object.defineProperty(navigator, 'sendBeacon', {
            value: mode === 'missing-beacon' ? undefined : () => false,
          })
        }, mode)
      await page.goto(`${base}/p/${p.slug}?src=qr`)
      expect(page.url()).toBe(`${base}/p/${p.slug}/?src=qr`)
      await expect
        .poll(() => events(p.id).map((e) => [e.action, e.source]))
        .toEqual([['view', 'qr']])
      await page.locator('[data-act="call"]').click()
      await expect.poll(() => events(p.id).map((e) => e.action)).toEqual(['view', 'call'])
      expect(await page.locator('body').innerText()).toContain('甜心烘焙坊')
    } finally {
      await page.close()
    }
  },
)

it(
  'blocks injected inline, external and event-handler scripts while allowing the renderer script',
  { timeout: 30_000 },
  async () => {
    const p = await fixture()
    const injected = p.html.replace(
      '</body>',
      '<script>window.inlineRan=true</script><script src="/evil.js"></script><button id="bad" onclick="window.handlerRan=true">测试</button></body>',
    )
    fs.writeFileSync(path.join(versionDir(p.id, p.versionId), 'index.html'), injected)
    const page = await browser.newPage()
    try {
      await page.goto(`${base}/p/${p.slug}/`)
      await expect.poll(() => events(p.id).length).toBe(1)
      await page.locator('#bad').click()
      expect(
        await page.evaluate(() =>
          ['inlineRan', 'externalRan', 'handlerRan'].some((k) => k in window),
        ),
      ).toBe(false)
      expect(externalScriptRequests).toBe(0)
      const script = await page.locator('script').first().textContent()
      expect(script).toBe(INLINE_SCRIPT)
    } finally {
      await page.close()
    }
  },
)

it(
  'does not issue tracking requests for an authenticated preview of a live page, even on clicks',
  { timeout: 30_000 },
  async () => {
    const p = await fixture()
    const page = await browser.newPage({
      extraHTTPHeaders: { authorization: 'Bearer test-admin-token-0123' },
    })
    const before = trackingRequests
    try {
      await page.goto(`${base}/api/versions/${p.versionId}/`)
      await page.locator('[data-act="call"]').click()
      await page.locator('[data-act="wechat_copy"]').click()
      // The copy toast proves the same inline script actually executed with tracking disabled.
      await page.locator('#sz-toast:not([hidden])').waitFor()
      expect(await page.locator('body').getAttribute('data-track')).toBe('')
      expect(trackingRequests).toBe(before)
      expect(events(p.id)).toEqual([])
    } finally {
      await page.close()
    }
  },
)
