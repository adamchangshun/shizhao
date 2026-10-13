import fs from 'node:fs'
import path from 'node:path'
import jsQR from 'jsqr'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POST as publish } from '@/app/api/projects/[id]/publish/route'
import { POST as unpublish } from '@/app/api/projects/[id]/unpublish/route'
import { GET as qr } from '@/app/api/projects/[id]/qr/route'
import { buildSessionCookie, resetAuthFailures } from '@/lib/auth'
import { newId } from '@/lib/core/ids'
import { getDb, runMigrations } from '@/lib/db/client'
import { findActiveProject, insertProject } from '@/lib/db/repo/projects'
import { projects } from '@/lib/db/schema'
import { getEnv } from '@/lib/env'
import { versionDir } from '@/lib/jobs/files'
import { getPublishedHtmlPath } from '@/lib/publish'
import { seedVersion } from './fixtures'

const BASE = 'http://localhost:6688'
const headers = {
  authorization: 'Bearer test-admin-token-0123',
  'content-type': 'application/json',
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (id: string, action: string, body?: unknown) =>
  new Request(`${BASE}/api/projects/${id}/${action}`, {
    method: action.startsWith('qr') ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
const setup = () => {
  const p = insertProject({ type: 'single', title: '发布测试' })
  return { ...p, versionId: seedVersion(p.id, '<h1>已生成的页面</h1>') }
}
beforeAll(runMigrations)
beforeEach(resetAuthFailures)

async function decode(response: Response, width: number) {
  expect(response.status).toBe(200)
  const bytes = Buffer.from(await response.arrayBuffer())
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  expect(info.width).toBe(width)
  expect(info.height).toBe(width)
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  expect(result).not.toBeNull()
  return result!.data
}

describe('publication routes', () => {
  it('publishes with long images disabled, returns stable links and preserves files after unpublish', async () => {
    const p = setup()
    expect(getEnv().LONG_IMAGE_ENABLED).toBe(false)
    const res = await publish(
      req(p.id, 'publish', { versionId: p.versionId, factsConfirmed: true }),
      ctx(p.id),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      url: `${BASE}/p/${p.slug}/`,
      qrPngUrl: `/api/projects/${p.id}/qr?format=png`,
      qrSvgUrl: `/api/projects/${p.id}/qr?format=svg`,
    })
    expect(fs.readdirSync(versionDir(p.id, p.versionId)).sort()).toEqual(['index.html', 'media'])
    expect((await unpublish(req(p.id, 'unpublish'), ctx(p.id))).status).toBe(200)
    expect(getPublishedHtmlPath(p.slug)).toEqual({ status: 'unpublished' })
    expect(fs.existsSync(path.join(versionDir(p.id, p.versionId), 'index.html'))).toBe(true)
    expect(
      (
        await publish(
          req(p.id, 'publish', { versionId: p.versionId, factsConfirmed: true }),
          ctx(p.id),
        )
      ).status,
    ).toBe(200)
    expect(getPublishedHtmlPath(p.slug).status).toBe('ok')
  })

  it.each([undefined, false, 'true', 1, null])(
    'requires literal factsConfirmed=true (received %s)',
    async (factsConfirmed) => {
      const p = setup()
      const res = await publish(
        req(p.id, 'publish', { versionId: p.versionId, factsConfirmed }),
        ctx(p.id),
      )
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('invalid_input')
      expect(findActiveProject(p.id)?.publishedVersionId).toBeNull()
    },
  )

  it('rejects malformed/oversized JSON and invalid or missing version IDs', async () => {
    const p = setup()
    for (const body of [
      '{',
      JSON.stringify({ factsConfirmed: true }),
      JSON.stringify({ versionId: '', factsConfirmed: true }),
    ]) {
      const res = await publish(
        new Request(`${BASE}/api/projects/${p.id}/publish`, { method: 'POST', headers, body }),
        ctx(p.id),
      )
      expect(res.status).toBe(400)
    }
    const oversized = await publish(
      req(p.id, 'publish', {
        versionId: p.versionId,
        factsConfirmed: true,
        padding: 'x'.repeat(5000),
      }),
      ctx(p.id),
    )
    expect(oversized.status).toBe(413)
    const other = setup()
    for (const versionId of [newId(), other.versionId]) {
      expect(
        (await publish(req(p.id, 'publish', { versionId, factsConfirmed: true }), ctx(p.id)))
          .status,
      ).toBe(404)
    }
    expect(findActiveProject(p.id)?.publishedVersionId).toBeNull()
  })

  it('requires admin on all three routes and prevents cross-origin cookie writes', async () => {
    const p = setup()
    for (const [name, handler] of [
      ['publish', publish],
      ['unpublish', unpublish],
      ['qr', qr],
    ] as const) {
      const request = new Request(`${BASE}/api/projects/${p.id}/${name}`, {
        method: name === 'qr' ? 'GET' : 'POST',
      })
      expect((await handler(request, ctx(p.id))).status).toBe(401)
    }
    for (const [name, handler] of [
      ['publish', publish],
      ['unpublish', unpublish],
    ] as const) {
      const request = new Request(`${BASE}/api/projects/${p.id}/${name}`, {
        method: 'POST',
        headers: {
          cookie: buildSessionCookie(),
          origin: 'https://foreign.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ versionId: p.versionId, factsConfirmed: true }),
      })
      expect((await handler(request, ctx(p.id))).status).toBe(403)
    }
    expect(findActiveProject(p.id)?.publishedVersionId).toBeNull()
    expect(findActiveProject(p.id)?.unpublishedAt).toBeNull()
  })

  it('returns 404 for deleted/missing projects on all routes', async () => {
    const p = setup()
    getDb()
      .update(projects)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(projects.id, p.id))
      .run()
    for (const id of [p.id, newId(), '../outside']) {
      expect(
        (
          await publish(
            req(id, 'publish', { versionId: p.versionId, factsConfirmed: true }),
            ctx(id),
          )
        ).status,
      ).toBe(404)
      expect((await unpublish(req(id, 'unpublish'), ctx(id))).status).toBe(404)
      expect((await qr(req(id, 'qr'), ctx(id))).status).toBe(404)
    }
  })

  it('serializes concurrent publish/unpublish requests without mixed publication state', async () => {
    const p = setup()
    const v2 = seedVersion(p.id, 'second')
    const results = await Promise.all([
      publish(req(p.id, 'publish', { versionId: p.versionId, factsConfirmed: true }), ctx(p.id)),
      unpublish(req(p.id, 'unpublish'), ctx(p.id)),
      publish(req(p.id, 'publish', { versionId: v2, factsConfirmed: true }), ctx(p.id)),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    const row = findActiveProject(p.id)!
    expect([p.versionId, v2]).toContain(row.publishedVersionId)
    if (row.unpublishedAt === null) {
      const resolved = getPublishedHtmlPath(p.slug)
      expect(resolved).toMatchObject({ status: 'ok', versionId: row.publishedVersionId })
    } else expect(getPublishedHtmlPath(p.slug).status).toBe('unpublished')
  })
})

describe('real QR encodings', () => {
  it('decodes the default 512px PNG to the stable trailing-slash URL before and after republishing', async () => {
    const p = setup()
    const first = await qr(req(p.id, 'qr'), ctx(p.id))
    expect(first.headers.get('content-type')).toBe('image/png')
    expect(first.headers.get('cache-control')).toBe('private, no-store')
    expect(await decode(first, 512)).toBe(`${BASE}/p/${p.slug}/?src=qr`)
    await publish(req(p.id, 'publish', { versionId: p.versionId, factsConfirmed: true }), ctx(p.id))
    const v2 = seedVersion(p.id, 'new')
    await publish(req(p.id, 'publish', { versionId: v2, factsConfirmed: true }), ctx(p.id))
    expect(await decode(await qr(req(p.id, 'qr'), ctx(p.id)), 512)).toBe(
      `${BASE}/p/${p.slug}/?src=qr`,
    )
  })

  it.each([256, 2048])('accepts PNG size boundary %i', async (size) => {
    const p = setup()
    expect(await decode(await qr(req(p.id, `qr?format=png&size=${size}`), ctx(p.id)), size)).toBe(
      `${BASE}/p/${p.slug}/?src=qr`,
    )
  })

  it('returns a decodable SVG at the requested size', async () => {
    const p = setup()
    const res = await qr(req(p.id, 'qr?format=svg&size=768'), ctx(p.id))
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(await decode(res, 768)).toBe(`${BASE}/p/${p.slug}/?src=qr`)
  })

  it.each([
    'size=4000',
    'size=255',
    'size=0',
    'size=-1',
    'size=256.5',
    'size=NaN',
    'size=Infinity',
    'size=512px',
    'size=',
    'size=5e2',
    'format=gif',
    'format=',
    'size=512&size=4000',
    'format=png&format=svg',
  ])('rejects invalid or ambiguous query %s', async (query) => {
    const p = setup()
    const res = await qr(req(p.id, `qr?${query}`), ctx(p.id))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_input')
  })
})
