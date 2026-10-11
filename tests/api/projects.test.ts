import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildSessionCookie, resetAuthFailures, SESSION_MAX_AGE_S } from '@/lib/auth'
import { createJobIfIdle } from '@/lib/db/repo/jobs'
import { POST as login } from '@/app/api/auth/login/route'
import { GET as health } from '@/app/api/health/route'
import { DELETE as deleteProject, GET as getProject } from '@/app/api/projects/[id]/route'
import { GET as listProjects, POST as createProject } from '@/app/api/projects/route'
import { runMigrations } from '@/lib/db/client'
import { getEnv } from '@/lib/env'

const BASE = 'http://localhost:6688'
const TOKEN = 'test-admin-token-0123'
const bearer = { authorization: `Bearer ${TOKEN}` }

beforeAll(() => runMigrations())
beforeEach(() => resetAuthFailures())

function json(method: string, url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${BASE}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function create(headers: Record<string, string> = bearer) {
  const res = await createProject(
    json('POST', '/api/projects', { type: 'single', title: '阿芳面包' }, headers),
  )
  return { res, body: (await res.json()) as { id: string; slug: string } }
}

describe('POST /api/projects', () => {
  it('returns 401 with the contract error envelope when no token is sent', async () => {
    const res = await createProject(json('POST', '/api/projects', { type: 'single', title: 'x' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: '请先输入管理口令' },
    })
  })

  it('returns 401 for a wrong bearer token', async () => {
    const { res } = await create({ authorization: 'Bearer wrong-token-value' })
    expect(res.status).toBe(401)
  })

  it('returns { id, slug } with the admin token', async () => {
    const { res, body } = await create()
    expect(res.status).toBe(201)
    expect(Object.keys(body).sort()).toEqual(['id', 'slug'])
    expect(body.id).toMatch(/^[A-Za-z0-9_-]{12}$/)
    expect(body.slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/)
  })

  it('rejects an invalid body with 400', async () => {
    const res = await createProject(
      json('POST', '/api/projects', { type: 'shop', title: '' }, bearer),
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_input')
  })
})

describe('session cookie login', () => {
  async function loginCookie(): Promise<string> {
    const res = await login(json('POST', '/api/auth/login', { token: TOKEN }))
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')!
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).not.toContain(TOKEN)
    return setCookie.split(';')[0]!
  }

  it('rejects a wrong token with 401 and sets no cookie', async () => {
    const res = await login(
      json(
        'POST',
        '/api/auth/login',
        { token: 'nope-nope-nope' },
        { 'x-forwarded-for': '10.0.0.9' },
      ),
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('caps 50 concurrent wrong guesses at the 30-failure budget, whatever X-Forwarded-For says', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        login(
          json(
            'POST',
            '/api/auth/login',
            { token: `guess-${i}-xxxxxx` },
            {
              'x-forwarded-for': `10.0.${i}.1`,
            },
          ),
        ),
      ),
    )
    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 401)).toHaveLength(30)
    expect(statuses.filter((s) => s === 429)).toHaveLength(20)
    // The Bearer header shares the same budget.
    const { res } = await create({ authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(429)
  })

  it('returns 413 for a login body over 1 KiB, even without Content-Length', async () => {
    const big = JSON.stringify({ token: 'x'.repeat(4096) })
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big))
        c.close()
      },
    })
    const req = new Request(`${BASE}/api/auth/login`, {
      method: 'POST',
      body: stream,
      // @ts-expect-error undici needs duplex for streamed bodies
      duplex: 'half',
    })
    expect((await login(req)).status).toBe(413)
  })

  it('rejects an expired session cookie', async () => {
    const longAgo = Date.now() - (SESSION_MAX_AGE_S + 60) * 1000
    const expired = buildSessionCookie(longAgo).split(';')[0]!
    const { res } = await create({ cookie: expired })
    expect(res.status).toBe(401)
  })

  it('rejects a cookie whose expiry was pushed out without re-signing', async () => {
    const cookie = await loginCookie()
    const [, mac] = cookie.split('=')[1]!.split('.')
    const { res } = await create({ cookie: `shizhao_admin=9999999999.${mac}` })
    expect(res.status).toBe(401)
  })

  it('authorizes same-origin requests with the cookie', async () => {
    const cookie = await loginCookie()
    const { res } = await create({ cookie, origin: BASE })
    expect(res.status).toBe(201)
  })

  it('rejects cross-origin state changes that rely on the cookie', async () => {
    const cookie = await loginCookie()
    const { res } = await create({ cookie, origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })

  it('rejects a forged cookie value', async () => {
    const { res } = await create({ cookie: 'shizhao_admin=deadbeef' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/projects and /api/projects/:id', () => {
  it('lists the created project with a derived state', async () => {
    const { body } = await create()
    const res = await listProjects(new Request(`${BASE}/api/projects`, { headers: bearer }))
    const list = (await res.json()) as Array<{ id: string; state: unknown; views7d: number }>
    const item = list.find((p) => p.id === body.id)
    expect(item).toMatchObject({ id: body.id, state: null, views7d: 0 })
  })

  it('returns detail and 404 for unknown ids', async () => {
    const { body } = await create()
    const ok = await getProject(
      new Request(`${BASE}/api/projects/${body.id}`, { headers: bearer }),
      ctx(body.id),
    )
    expect(await ok.json()).toMatchObject({
      id: body.id,
      slug: body.slug,
      facts: null,
      publishedVersionId: null,
    })
    const missing = await getProject(
      new Request(`${BASE}/api/projects/x`, { headers: bearer }),
      ctx('zzzzzzzzzzzz'),
    )
    expect(missing.status).toBe(404)
  })
})

describe('DELETE /api/projects/:id', () => {
  it('removes the project directories under DATA_DIR', async () => {
    const { body } = await create()
    const dataDir = getEnv().DATA_DIR
    const uploads = path.join(dataDir, 'uploads', body.id)
    const pages = path.join(dataDir, 'pages', body.id, 'v1')
    fs.mkdirSync(uploads, { recursive: true })
    fs.mkdirSync(pages, { recursive: true })
    fs.writeFileSync(path.join(uploads, 'a.display.webp'), 'x')
    fs.writeFileSync(path.join(pages, 'index.html'), '<p>x</p>')

    const res = await deleteProject(
      new Request(`${BASE}/api/projects/${body.id}`, { method: 'DELETE', headers: bearer }),
      ctx(body.id),
    )
    expect(res.status).toBe(204)
    expect(fs.existsSync(path.join(dataDir, 'uploads', body.id))).toBe(false)
    expect(fs.existsSync(path.join(dataDir, 'pages', body.id))).toBe(false)

    const again = await getProject(
      new Request(`${BASE}/api/projects/${body.id}`, { headers: bearer }),
      ctx(body.id),
    )
    expect(again.status).toBe(404)
  })

  it('refuses crafted ids and leaves sibling data intact', async () => {
    const dataDir = getEnv().DATA_DIR
    const sentinel = path.join(dataDir, 'uploads', 'keep.txt')
    fs.writeFileSync(sentinel, 'keep')
    for (const id of ['..', '../uploads', '%2e%2e', 'abcdefghijkl/..']) {
      const res = await deleteProject(
        new Request(`${BASE}/api/projects/x`, { method: 'DELETE', headers: bearer }),
        ctx(id),
      )
      expect(res.status).toBe(404)
    }
    expect(fs.existsSync(sentinel)).toBe(true)
    expect(fs.existsSync(path.join(dataDir, 'uploads'))).toBe(true)
  })

  it('is idempotent: a repeated DELETE retries cleanup and still returns 204', async () => {
    const { body } = await create()
    const del = () =>
      deleteProject(
        new Request(`${BASE}/api/projects/${body.id}`, { method: 'DELETE', headers: bearer }),
        ctx(body.id),
      )
    expect((await del()).status).toBe(204)
    const leftover = path.join(getEnv().DATA_DIR, 'uploads', body.id)
    fs.mkdirSync(leftover, { recursive: true })
    expect((await del()).status).toBe(204)
    expect(fs.existsSync(leftover)).toBe(false)
    // No new job can start on a deleted project.
    expect(createJobIfIdle(body.id, { factRevision: 1, seed: 9 })).toBeNull()
  })

  it('returns 409 and keeps files while a job is running', async () => {
    const { body } = await create()
    const uploads = path.join(getEnv().DATA_DIR, 'uploads', body.id)
    fs.mkdirSync(uploads, { recursive: true })
    expect(createJobIfIdle(body.id, { factRevision: 1, seed: 1 })).not.toBeNull()
    const res = await deleteProject(
      new Request(`${BASE}/api/projects/${body.id}`, { method: 'DELETE', headers: bearer }),
      ctx(body.id),
    )
    expect(res.status).toBe(409)
    expect(fs.existsSync(uploads)).toBe(true)
  })

  it('removes a symlinked project dir without touching its target', async () => {
    const { body } = await create()
    const outside = fs.mkdtempSync(path.join(path.dirname(getEnv().DATA_DIR), 'outside-'))
    fs.writeFileSync(path.join(outside, 'precious.txt'), 'keep')
    const link = path.join(getEnv().DATA_DIR, 'pages', body.id)
    fs.symlinkSync(outside, link)
    const res = await deleteProject(
      new Request(`${BASE}/api/projects/${body.id}`, { method: 'DELETE', headers: bearer }),
      ctx(body.id),
    )
    expect(res.status).toBe(204)
    expect(fs.existsSync(link)).toBe(false)
    expect(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8')).toBe('keep')
    fs.rmSync(outside, { recursive: true, force: true })
  })
})

describe('GET /api/health', () => {
  it('returns only { ok: true }', async () => {
    expect(await health().json()).toEqual({ ok: true })
  })
})
