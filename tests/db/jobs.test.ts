import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { getDb, runMigrations } from '@/lib/db/client'
import { createJobIfIdle } from '@/lib/db/repo/jobs'
import { insertProject } from '@/lib/db/repo/projects'
import * as schema from '@/lib/db/schema'
import { getEnv } from '@/lib/env'

beforeAll(() => runMigrations())

describe('createJobIfIdle', () => {
  it('lets exactly 1 of 10 concurrent calls through', async () => {
    const { id } = insertProject({ type: 'single', title: '并发测试' })
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() => createJobIfIdle(id, { factRevision: 1, seed: i })),
      ),
    )
    expect(results.filter((r) => r !== null)).toHaveLength(1)
  })

  it('lets exactly 1 of 10 separate connections through', () => {
    const { id } = insertProject({ type: 'single', title: '多连接测试' })
    const file = path.join(getEnv().DATA_DIR, 'db.sqlite')
    const conns = Array.from({ length: 10 }, () => {
      const sqlite = new Database(file)
      sqlite.pragma('busy_timeout = 5000')
      return sqlite
    })
    const results = conns.map((sqlite, i) =>
      createJobIfIdle(id, { factRevision: 1, seed: i }, drizzle(sqlite, { schema })),
    )
    conns.forEach((c) => c.close())
    expect(results.filter((r) => r !== null)).toHaveLength(1)
  })

  it('allows a new job once the previous one is terminal', () => {
    const { id } = insertProject({ type: 'menu', title: '终态后重建' })
    const first = createJobIfIdle(id, { factRevision: 1, seed: 1 })
    expect(first).not.toBeNull()
    getDb().update(schema.jobs).set({ status: 'failed' }).where(eq(schema.jobs.id, first!.id)).run()
    expect(createJobIfIdle(id, { factRevision: 1, seed: 2 })).not.toBeNull()
  })

  it('is enforced by the partial unique index even when bypassing the repo', () => {
    const { id } = insertProject({ type: 'single', title: '索引兜底' })
    const now = new Date().toISOString()
    const row = {
      projectId: id,
      factRevision: 1,
      status: 'writing' as const,
      stage: 'writing',
      seed: 0,
      startedAt: now,
      createdAt: now,
    }
    getDb()
      .insert(schema.jobs)
      .values({ ...row, id: 'jobAAAAAAAAA' })
      .run()
    expect(() =>
      getDb()
        .insert(schema.jobs)
        .values({ ...row, id: 'jobBBBBBBBBB' })
        .run(),
    ).toThrow(/UNIQUE/)
  })
})

describe('insertProject', () => {
  it('retries on slug collision and gives up after 5 attempts', () => {
    insertProject({ type: 'single', title: 'A' }, () => 'aaaaaa')
    const seq = ['aaaaaa', 'aaaaaa', 'bbbbbb']
    const second = insertProject({ type: 'single', title: 'B' }, () => seq.shift()!)
    expect(second.slug).toBe('bbbbbb')
    expect(() => insertProject({ type: 'single', title: 'C' }, () => 'aaaaaa')).toThrow(
      /unique slug after 5 attempts/,
    )
  })
})
