import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET as page } from '@/app/p/[slug]/route'
import { GET as media } from '@/app/p/[slug]/media/[file]/route'
import { GET as health } from '@/app/api/health/route'
import { getDb, runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { projects } from '@/lib/db/schema'
import { versionDir } from '@/lib/jobs/files'
import { publishVersion, unpublishProject } from '@/lib/publish'
import { INLINE_SCRIPT, INLINE_SCRIPT_SHA256 } from '@/lib/render/inline-script'
import { seedVersion } from '../publish/fixtures'

beforeAll(runMigrations)
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) })
const request = (slug: string, suffix = '/') =>
  new Request(`http://localhost:6690/p/${slug}${suffix}`)

it('redirects once to the slash URL, preserving the exact query', async () => {
  const res = await page(request('abc234', '?src=qr&x=%2F&x=2'), ctx('abc234'))
  expect(res.status).toBe(308)
  expect(res.headers.get('location')).toBe('/p/abc234/?src=qr&x=%2F&x=2')
})

it('serves the current immutable version with hash-only script policy and switches with the pointer', async () => {
  const p = insertProject({ type: 'single', title: '公开测试' })
  const html = `<html><body>固定内容<script>${INLINE_SCRIPT}</script></body></html>`
  const v1 = seedVersion(p.id, html)
  publishVersion(p.id, v1)
  const res = await page(request(p.slug), ctx(p.slug))
  expect(res.status).toBe(200)
  expect(await res.text()).toBe(html)
  expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=600')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  const csp = res.headers.get('content-security-policy')!
  expect(csp).toContain(`script-src 'sha256-${INLINE_SCRIPT_SHA256}'`)
  expect(csp).toContain("style-src 'unsafe-inline'")
  expect(csp).toContain("img-src 'self' data:")
  expect(csp).toContain("font-src 'self' data:")
  expect(csp).toContain("connect-src 'self'")
  const v2 = seedVersion(p.id, '<h1>第二版</h1>')
  publishVersion(p.id, v2)
  expect(await (await page(request(p.slug), ctx(p.slug))).text()).toBe('<h1>第二版</h1>')
})

it('returns safe Chinese, uncached errors for missing, never published, offline, deleted and missing files', async () => {
  const p = insertProject({ type: 'single', title: '状态测试' })
  const check = async (slug: string, status: number, text: string) => {
    const res = await page(request(slug), ctx(slug))
    expect(res.status).toBe(status)
    const body = await res.text()
    expect(body).toContain(text)
    expect(body).not.toContain(process.env.DATA_DIR)
    expect(body).not.toContain('Error:')
    expect(res.headers.get('cache-control')).toBe('no-store')
  }
  await check(p.slug, 404, '页面尚未发布')
  await check('bad<script>', 404, '页面不存在')
  const v = seedVersion(p.id, 'ok')
  publishVersion(p.id, v)
  unpublishProject(p.id)
  await check(p.slug, 410, '该页面已下线')
  publishVersion(p.id, v)
  fs.unlinkSync(path.join(versionDir(p.id, v), 'index.html'))
  await check(p.slug, 404, '页面不存在')
  getDb()
    .update(projects)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(projects.id, p.id))
    .run()
  await check(p.slug, 404, '页面不存在')
})

it('serves media only from the current pointer and refuses traversal and symlinks', async () => {
  const p = insertProject({ type: 'single', title: '图片测试' })
  const v1 = seedVersion(p.id, 'first')
  const v2 = seedVersion(p.id, 'second')
  const get = (file: string) =>
    media(request(p.slug, `/media/${file}`), { params: Promise.resolve({ slug: p.slug, file }) })
  publishVersion(p.id, v1)
  expect(await (await get('fixture-display.webp')).text()).toBe('fixed media bytes')
  fs.writeFileSync(path.join(versionDir(p.id, v2), 'media/fixture-display.webp'), 'second media')
  publishVersion(p.id, v2)
  const res = await get('fixture-display.webp')
  expect(await res.text()).toBe('second media')
  expect(res.headers.get('content-type')).toBe('image/webp')
  expect(res.headers.get('cache-control')).toBe('no-store')
  for (const file of ['../index.html', 'x.svg', 'long.png', '%2e%2e', 'missing-display.webp']) {
    expect((await get(file)).status).toBe(404)
  }
  const dir = path.join(versionDir(p.id, v2), 'media')
  fs.symlinkSync(
    path.join(versionDir(p.id, v1), 'media/fixture-display.webp'),
    path.join(dir, 'link-display.webp'),
  )
  expect((await get('link-display.webp')).status).toBe(404)
  fs.renameSync(dir, `${dir}-saved`)
  fs.symlinkSync(path.join(versionDir(p.id, v1), 'media'), dir)
  expect((await get('fixture-display.webp')).status).toBe(404)
  unpublishProject(p.id)
  expect((await get('fixture-display.webp')).status).toBe(410)
})

it('health is anonymous and exposes only the fixed body', async () => {
  expect(await health().json()).toEqual({ ok: true })
})
