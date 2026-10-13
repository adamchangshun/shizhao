import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { GET as preview } from '@/app/api/versions/[id]/preview/route'
import { runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { versionDir } from '@/lib/jobs/files'
import { INLINE_SCRIPT } from '@/lib/render/inline-script'
import { seedVersion } from '../publish/fixtures'

beforeAll(runMigrations)

it('disables tracking in preview HTML even for a currently published version without mutating the stored script', async () => {
  const p = insertProject({ type: 'single', title: '预览' })
  const html = `<html><body data-track="/api/track" data-slug="${p.slug}"><script>${INLINE_SCRIPT}</script></body></html>`
  const id = seedVersion(p.id, html)
  const res = await preview(
    new Request(`http://localhost:6688/api/versions/${id}/preview`, {
      headers: { authorization: 'Bearer test-admin-token-0123' },
    }),
    { params: Promise.resolve({ id }) },
  )
  expect(res.status).toBe(200)
  expect(await res.text()).toBe(html.replace('data-track="/api/track"', 'data-track=""'))
  expect(res.headers.get('content-security-policy')).toContain("connect-src 'none'")
  expect(fs.readFileSync(path.join(versionDir(p.id, id), 'index.html'), 'utf8')).toBe(html)
})

it('serves the R2 slash preview endpoint with authentication and preserves relative media paths', async () => {
  const { GET } = await import('@/app/api/versions/[id]/route')
  const p = insertProject({ type: 'single', title: '预览地址' })
  const id = seedVersion(
    p.id,
    '<body data-track="/api/track"><img src="media/fixture-display.webp"></body>',
  )
  const params = { params: Promise.resolve({ id }) }
  expect((await GET(new Request(`http://localhost:6688/api/versions/${id}/`), params)).status).toBe(
    401,
  )
  const headers = { authorization: 'Bearer test-admin-token-0123' }
  const redirect = await GET(
    new Request(`http://localhost:6688/api/versions/${id}?x=1`, { headers }),
    params,
  )
  expect(redirect.status).toBe(308)
  expect(redirect.headers.get('location')).toBe(`/api/versions/${id}/?x=1`)
  const res = await GET(
    new Request(`http://localhost:6688/api/versions/${id}/`, { headers }),
    params,
  )
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('data-track=""')
})
