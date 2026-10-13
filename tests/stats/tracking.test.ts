import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { POST } from '@/app/api/track/route'
import { DELETE } from '@/app/api/projects/[id]/route'
import { getDb, runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { projects, visitEvents } from '@/lib/db/schema'
import { newId } from '@/lib/core/ids'
import { publishVersion, unpublishProject } from '@/lib/publish'
import { resetEnvCache } from '@/lib/env'
import { TrackingLimiter, clientHash } from '@/lib/stats/limiter'
import { seedVersion } from '../publish/fixtures'

beforeAll(runMigrations)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  resetEnvCache()
})
const setup = () => {
  const p = insertProject({ type: 'single', title: '事件测试' })
  const versionId = seedVersion(p.id, '<h1>测试页</h1>')
  publishVersion(p.id, versionId)
  return { ...p, versionId }
}
const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost:6688/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
const payload = (p: ReturnType<typeof setup>) => ({
  slug: p.slug,
  versionId: p.versionId,
  source: 'qr',
  action: 'view',
})
const events = (id: string) =>
  getDb().select().from(visitEvents).where(eq(visitEvents.projectId, id)).all()

it('records one anonymous event, deduplicates concurrently across sources and ignores spoofed forwarding headers', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'))
  const p = setup()
  const body = payload(p)
  const replies = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      send(
        { ...body, source: i % 2 ? 'link' : 'qr' },
        { 'x-forwarded-for': `192.0.2.${i}`, 'x-real-ip': `192.0.2.${i}` },
      ),
    ),
  )
  expect(replies.every((r) => r.status === 204)).toBe(true)
  expect(events(p.id)).toEqual([
    {
      id: expect.any(String),
      projectId: p.id,
      versionId: p.versionId,
      action: 'view',
      source: 'qr',
      createdAt: '2026-10-13T12:00:00.000Z',
    },
  ])
  vi.setSystemTime(new Date('2026-10-13T12:00:09.999Z'))
  await send(body)
  expect(events(p.id)).toHaveLength(1)
  vi.setSystemTime(new Date('2026-10-13T12:00:10Z'))
  await send(body)
  expect(events(p.id)).toHaveLength(2)
})

it('rejects malformed/oversized/extra fields and invalid enums or IDs without logging or disclosure', async () => {
  const p = setup()
  const error = vi.spyOn(console, 'error')
  try {
    for (const patch of [
      { slug: '' },
      { slug: '../xxx' },
      { action: 'purchase' },
      { source: 'evil' },
      { versionId: newId() },
      { versionId: '' },
      { ip: '192.0.2.1' },
      { userAgent: 'private' },
      { padding: 'x'.repeat(4000) },
    ]) {
      const res = await send({ ...payload(p), ...patch })
      expect(res.status).toBe(204)
      expect(await res.text()).toBe('')
    }
    for (const body of ['{', '', 'null', '[]', 'x'.repeat(4000)]) {
      expect(
        (await POST(new Request('http://localhost/api/track', { method: 'POST', body }))).status,
      ).toBe(204)
    }
    expect(events(p.id)).toHaveLength(0)
    expect(error).not.toHaveBeenCalled()
  } finally {
    error.mockRestore()
  }
})

it('accepts only the live current version, including a publication change during body reading', async () => {
  const p = setup(),
    other = setup()
  const v2 = seedVersion(p.id, 'v2')
  await send({ ...payload(p), versionId: other.versionId })
  await send({ ...payload(p), versionId: v2 })
  let release!: () => void
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      release = () => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(payload(p))))
        controller.close()
      }
    },
  })
  const req = new Request('http://localhost/api/track', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit)
  const pending = POST(req)
  publishVersion(p.id, v2)
  release()
  expect((await pending).status).toBe(204)
  expect(events(p.id)).toHaveLength(0)
  await send({ ...payload(p), versionId: v2 })
  expect(events(p.id)).toHaveLength(1)
  unpublishProject(p.id)
  await send({ ...payload(p), versionId: v2, action: 'call' })
  publishVersion(p.id, v2)
  getDb()
    .update(projects)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(projects.id, p.id))
    .run()
  await send({ ...payload(p), versionId: v2, action: 'navigate' })
  expect(events(p.id)).toHaveLength(1)
})

it('counts duplicate attempts toward the per-key minute budget; resets at exactly 60 seconds', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-13T13:00:00Z'))
  const p = setup()
  for (let i = 0; i < 30; i++) await send(payload(p))
  vi.setSystemTime(new Date('2026-10-13T13:00:10Z'))
  await send(payload(p))
  expect(events(p.id)).toHaveLength(1)
  await send({ ...payload(p), action: 'call' })
  expect(events(p.id)).toHaveLength(2)
  vi.setSystemTime(new Date('2026-10-13T13:01:00Z'))
  await send(payload(p))
  expect(events(p.id)).toHaveLength(3)
})

it('does not evict active dedup/budget state when the bounded limiter is full', () => {
  const limiter = new TrackingLimiter(2)
  expect(limiter.accept('a', 0)).toBe(true)
  expect(limiter.accept('b', 0)).toBe(true)
  expect(limiter.accept('c', 1)).toBe(false)
  expect(limiter.accept('a', 2)).toBe(false)
  for (let i = 0; i < 28; i++) limiter.accept('a', 3)
  expect(limiter.accept('a', 10_000)).toBe(false)
  expect(limiter.accept('c', 60_000)).toBe(true)
})

it('uses salted canonical IP hashes only with explicit trusted proxy configuration', () => {
  const req = (ip: string) =>
    new Request('http://localhost/api/track', { headers: { 'x-real-ip': ip } })
  expect(clientHash(req('192.0.2.1'))).toBe(clientHash(req('192.0.2.2')))
  vi.stubEnv('TRACK_TRUST_PROXY', 'true')
  resetEnvCache()
  expect(clientHash(req('192.0.2.1'))).not.toBe(clientHash(req('192.0.2.2')))
  expect(clientHash(req('2001:db8::1'))).toBe(clientHash(req('2001:0db8:0:0:0:0:0:1')))
  expect(clientHash(req('::ffff:192.0.2.1'))).toBe(clientHash(req('192.0.2.1')))
  expect(clientHash(req('192.0.2.1, 192.0.2.2'))).toBe(clientHash(req('invalid')))
  expect(clientHash(req('192.0.2.1'))).not.toContain('192.0.2.1')
})

it('keeps only contract columns and deletes all events when the project is deleted', async () => {
  const columns = getDb().all<{ name: string }>(sql`pragma table_info(visit_events)`)
  expect(columns.map((c) => c.name).sort()).toEqual([
    'action',
    'created_at',
    'id',
    'project_id',
    'source',
    'version_id',
  ])
  const p = setup()
  await send(payload(p), { 'user-agent': 'private UA', cookie: 'private=cookie' })
  expect(events(p.id)).toHaveLength(1)
  const res = await DELETE(
    new Request(`http://localhost:6688/api/projects/${p.id}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-admin-token-0123' },
    }),
    { params: Promise.resolve({ id: p.id }) },
  )
  expect(res.status).toBe(204)
  expect(events(p.id)).toHaveLength(0)
})
