import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/projects/[id]/stats/route'
import { GET as list } from '@/app/api/projects/route'
import { getDb, runMigrations } from '@/lib/db/client'
import { insertProject } from '@/lib/db/repo/projects'
import { visitEvents } from '@/lib/db/schema'
import { newId } from '@/lib/core/ids'
import { getStats } from '@/lib/stats/summary'
import { exportStatsCsv } from '@/lib/stats/export'
import { seedVersion } from '../publish/fixtures'

beforeAll(runMigrations)
afterEach(() => vi.useRealTimers())
const at = '2026-10-13T18:00:00.000Z' // Beijing Oct 14 02:00
const setup = () => {
  const p = insertProject({ type: 'single', title: '跨日统计' })
  const v = seedVersion(p.id, 'one')
  for (const [createdAt, action, source] of [
    ['2026-10-06T15:59:59.999Z', 'view', 'link'], // outside seven Beijing days
    ['2026-10-07T16:00:00.000Z', 'view', 'link'], // first instant of Oct 8
    ['2026-10-13T15:59:00.000Z', 'view', 'qr'],
    ['2026-10-13T16:01:00.000Z', 'call', 'qr'],
    ['2026-10-13T17:00:00.000Z', 'wechat_copy', 'link'],
    ['2026-10-13T18:00:00.000Z', 'navigate', 'qr'], // inclusive now
    ['2026-10-13T18:00:00.001Z', 'view', 'qr'], // future, excluded
  ] as const)
    getDb()
      .insert(visitEvents)
      .values({ id: newId(), projectId: p.id, versionId: v, createdAt, action, source })
      .run()
  return p
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const request = (id: string, query = '', auth = true) =>
  new Request(`http://localhost:6688/api/projects/${id}/stats${query}`, {
    headers: auth ? { authorization: 'Bearer test-admin-token-0123' } : {},
  })

it('groups UTC 15:59/16:01 into adjacent Beijing dates with zero-filled days and scoped totals', () => {
  const p = setup()
  setup() // other project does not affect totals
  expect(getStats(p.id, 3, Date.parse(at))).toEqual({
    totals: { view: 1, call: 1, wechat_copy: 1, navigate: 1 },
    bySource: { qr: 3, link: 1 },
    daily: [
      { date: '2026-10-12', view: 0, call: 0, wechat_copy: 0, navigate: 0 },
      { date: '2026-10-13', view: 1, call: 0, wechat_copy: 0, navigate: 0 },
      { date: '2026-10-14', view: 0, call: 1, wechat_copy: 1, navigate: 1 },
    ],
  })
})

it('requires admin, validates days, and uses seven calendar days for stats and views7d', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(at))
  const p = setup()
  expect((await GET(request(p.id, '', false), ctx(p.id))).status).toBe(401)
  for (const q of [
    '?days=0',
    '?days=-1',
    '?days=366',
    '?days=1.2',
    '?days=',
    '?days=1e2',
    '?days=7&days=8',
  ]) {
    expect((await GET(request(p.id, q), ctx(p.id))).status).toBe(400)
  }
  const res = await GET(request(p.id), ctx(p.id))
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  const data = await res.json()
  expect(data.totals).toEqual({ view: 2, call: 1, wechat_copy: 1, navigate: 1 })
  expect(data.daily).toHaveLength(7)
  expect(data.daily[0].date).toBe('2026-10-08')
  const projects = await (await list(request(p.id))).json()
  expect(projects.find((row: { id: string }) => row.id === p.id).views7d).toBe(2)
  expect((await GET(request(newId()), ctx(newId()))).status).toBe(404)
})

it('handles Beijing midnight, year changes, and leap days independently of host timezone', () => {
  const p = insertProject({ type: 'single', title: '边界' })
  expect(getStats(p.id, 2, Date.parse('2025-12-31T16:00:00Z')).daily.map((d) => d.date)).toEqual([
    '2025-12-31',
    '2026-01-01',
  ])
  expect(getStats(p.id, 3, Date.parse('2024-02-29T16:00:00Z')).daily.map((d) => d.date)).toEqual([
    '2024-02-28',
    '2024-02-29',
    '2024-03-01',
  ])
})

it('exports deterministic daily CSV with all historical events and no personal data', () => {
  const p = setup()
  expect(exportStatsCsv(p.id)).toBe(
    'date,view,call,wechat_copy,navigate,qr,link\r\n2026-10-06,1,0,0,0,0,1\r\n2026-10-08,1,0,0,0,0,1\r\n2026-10-13,1,0,0,0,1,0\r\n2026-10-14,1,1,1,1,3,1\r\n',
  )
})
